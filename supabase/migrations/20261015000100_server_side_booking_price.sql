-- Server-side pricing + safe defaults for GUEST-created bookings.
--
-- Problem (HANDOVER v9.6 open item 4): a guest's browser computes the booking
-- price and the public insert policy does not validate it, so anyone with the
-- public anon key could insert a booking for ₹1 — or one that already says
-- "confirmed / fully paid".
--
-- Fix: BEFORE INSERT triggers that, for every insert NOT made by the
-- property's owner (guests = anon, or any other signed-in user):
--   * recompute room_price / extra_guest_charge / total_amount from the
--     database's own rooms + room_rates (stay_room_price(), the SQL twin of
--     priceRoomStay() in src/lib/quoteBuilder.ts — keep them identical);
--   * force status 'pending', unpaid, no advance, no discount, no agent or
--     commission, source 'direct';
--   * give every such pending booking a hold expiry (default 24 h, capped at
--     max(property hours, 24) h) so a guest can't hold dates forever.
-- Booking groups follow: a guest-created group starts at total 0 and its
-- total is set to the sum of its bookings as they are inserted.
--
-- Owner-side inserts (AddBookingModal, quote conversion, negotiated prices)
-- are untouched: auth.uid() owns the property. SQL editor / service-role /
-- cron inserts are untouched: auth.role() is not anon/authenticated there.
--
-- Run AFTER 20261015000000_room_rates.sql. Safe to run more than once.

-- ── Pre-flight: refuse to install if the live tables lack a column the guest
-- triggers write. A trigger only discovers a missing column when someone
-- inserts — which would break guest bookings — so check up front instead.
do $$
declare
  missing text;
begin
  select string_agg(t.tbl || '.' || t.col, ', ') into missing
  from (values
    ('bookings','room_price'),('bookings','extra_guest_charge'),('bookings','total_amount'),('bookings','status'),
    ('bookings','is_paid'),('bookings','advance_amount'),('bookings','discount_amount'),('bookings','discount_reason'),
    ('bookings','agent_id'),('bookings','commission_amount'),('bookings','commission_paid'),('bookings','commission_paid_date'),
    ('bookings','source'),('bookings','hold_expires_at'),('bookings','guest_count'),('bookings','group_id'),
    ('booking_groups','total_amount'),('booking_groups','status'),('booking_groups','is_paid'),('booking_groups','advance_amount'),
    ('booking_groups','discount_amount'),('booking_groups','discount_reason'),('booking_groups','agent_id'),
    ('booking_groups','commission_amount'),('booking_groups','commission_paid'),('booking_groups','commission_paid_date'),
    ('booking_groups','source'),('booking_groups','hold_expires_at'),
    ('properties','pending_hold_hours'),('properties','owner_id'),
    ('rooms','weekend_multiplier'),('rooms','extra_guest_price'),('rooms','max_guests'),('rooms','is_active')
  ) as t(tbl, col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t.tbl and c.column_name = t.col
  );
  if missing is not null then
    raise exception 'Cannot install guest-booking triggers: missing columns: %. Nothing was changed.', missing;
  end if;
end $$;

-- ── Price of one room for a stay (whole stay, one room) ────────────────────
create or replace function public.stay_room_price(
  p_room_id uuid, p_check_in date, p_check_out date, p_guests integer
)
returns table (nights integer, room_price numeric, extra_guest_charge numeric, total numeric)
language sql stable security definer set search_path = public as $$
  with r as (
    select id, property_id, base_price, coalesce(extra_guest_price, 0) as extra_guest_price,
           coalesce(weekend_multiplier, 1) as weekend_multiplier, max_guests
    from public.rooms where id = p_room_id
  ),
  nights as (
    select g::date as d
    from generate_series(p_check_in::timestamp, (p_check_out - 1)::timestamp, interval '1 day') g
    where p_check_out > p_check_in
  ),
  priced as (
    select n.d,
      coalesce(
        (select case when rr.kind = 'fixed' then rr.value
                     else round(r.base_price * (100 + rr.value) / 100) end
           from public.room_rates rr
          where rr.property_id = r.property_id
            and (rr.room_id = r.id or rr.room_id is null)
            and n.d between rr.start_date and rr.end_date
          order by (rr.room_id is not null) desc, rr.start_date desc, rr.created_at desc
          limit 1),
        r.base_price
      ) as nightly,
      (extract(dow from n.d) in (5, 6)) as weekend,   -- Fri, Sat nights
      r.weekend_multiplier, r.extra_guest_price, r.max_guests
    from nights n cross join r
  ),
  sums as (
    select count(*)::int as nights,
           round(sum(nightly * case when weekend then weekend_multiplier else 1 end), 2) as room_price,
           max(extra_guest_price) as egp, max(max_guests) as mg
    from priced
  )
  select s.nights,
         s.room_price,
         round(greatest(0, p_guests - s.mg) * s.egp * s.nights, 2),
         s.room_price + round(greatest(0, p_guests - s.mg) * s.egp * s.nights, 2)
  from sums s
  where s.nights > 0;
$$;

-- Not callable by guests: the trigger below is the only intended user.
revoke all on function public.stay_room_price(uuid, date, date, integer) from public, anon, authenticated;

-- ── "Is this insert from a guest (not the property's owner)?" ───────────────
create or replace function public._is_guest_insert(p_property_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not exists (
       select 1 from public.properties p
       where p.id = p_property_id and p.owner_id = auth.uid()
     );
$$;
revoke all on function public._is_guest_insert(uuid) from public, anon, authenticated;

-- ── bookings: BEFORE INSERT ────────────────────────────────────────────────
create or replace function public.enforce_guest_booking_terms()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_price record;
  v_hours integer;
begin
  if not public._is_guest_insert(new.property_id) then
    return new;
  end if;

  if new.check_out is null or new.check_in is null or new.check_out <= new.check_in then
    raise exception 'check-out must be after check-in' using errcode = '23514';
  end if;
  if coalesce(new.guest_count, 0) < 1 then
    raise exception 'guest count must be at least 1' using errcode = '23514';
  end if;

  -- The room must belong to the property the guest is booking (the live DB
  -- has a similar trigger; this keeps pricing safe even without it).
  if not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.property_id = new.property_id and coalesce(r.is_active, true)
  ) then
    raise exception 'room not found for this property' using errcode = '23514';
  end if;

  select * into v_price from public.stay_room_price(new.room_id, new.check_in, new.check_out, new.guest_count);
  if not found then
    raise exception 'room not found or invalid dates' using errcode = '23514';
  end if;

  new.room_price         := v_price.room_price;
  new.extra_guest_charge := v_price.extra_guest_charge;
  new.total_amount       := v_price.total;

  new.status             := 'pending';
  new.is_paid            := false;
  new.advance_amount     := 0;
  new.discount_amount    := 0;
  new.discount_reason    := null;
  new.agent_id           := null;
  new.commission_amount  := null;
  new.commission_paid    := false;
  new.commission_paid_date := null;
  new.source             := 'direct';

  select greatest(coalesce(pending_hold_hours, 24), 24) into v_hours
    from public.properties where id = new.property_id;
  v_hours := coalesce(v_hours, 24);
  new.hold_expires_at := least(coalesce(new.hold_expires_at, now() + make_interval(hours => v_hours)),
                               now() + make_interval(hours => v_hours));
  return new;
end $$;

drop trigger if exists trg_enforce_guest_booking_terms on public.bookings;
create trigger trg_enforce_guest_booking_terms
  before insert on public.bookings
  for each row execute function public.enforce_guest_booking_terms();

-- ── booking_groups: BEFORE INSERT (total comes from the members) ───────────
create or replace function public.enforce_guest_group_terms()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hours integer;
begin
  if not public._is_guest_insert(new.property_id) then
    return new;
  end if;
  new.total_amount      := 0;           -- set from member bookings below
  new.status            := 'pending';
  new.is_paid           := false;
  new.advance_amount    := 0;
  new.discount_amount   := 0;
  new.discount_reason   := null;
  new.agent_id          := null;
  new.commission_amount := null;
  new.commission_paid   := false;
  new.commission_paid_date := null;
  new.source            := 'direct';
  select greatest(coalesce(pending_hold_hours, 24), 24) into v_hours
    from public.properties where id = new.property_id;
  v_hours := coalesce(v_hours, 24);
  new.hold_expires_at := least(coalesce(new.hold_expires_at, now() + make_interval(hours => v_hours)),
                               now() + make_interval(hours => v_hours));
  return new;
end $$;

drop trigger if exists trg_enforce_guest_group_terms on public.booking_groups;
create trigger trg_enforce_guest_group_terms
  before insert on public.booking_groups
  for each row execute function public.enforce_guest_group_terms();

-- ── bookings: AFTER INSERT — keep a guest group's total = sum of members ───
create or replace function public.sync_guest_group_total()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.group_id is not null and public._is_guest_insert(new.property_id) then
    update public.booking_groups g
       set total_amount = (select coalesce(sum(b.total_amount), 0) from public.bookings b where b.group_id = g.id)
     where g.id = new.group_id and g.property_id = new.property_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_guest_group_total on public.bookings;
create trigger trg_sync_guest_group_total
  after insert on public.bookings
  for each row execute function public.sync_guest_group_total();
