-- Owner-set limit on how many guests one room can take, extra beds included.
--
--   rooms.max_guests      guests INCLUDED in the nightly price (unchanged)
--   rooms.max_occupancy   the most guests the room can hold; NULL = max_guests + 4, the old rule,
--                         so every existing room behaves exactly as before until its owner sets one.
--
-- The guest page, the booking form and this database check all use the same number
-- (src/lib/guestCount.ts maxGuestsFor): a guest booking above it is refused when it is saved.
-- Owner-created bookings are not affected (the check only runs for guest bookings).
--
-- The function below is enforce_guest_booking_terms exactly as in 20261015000100_server_side_booking_price.sql,
-- with one added check. Safe to run more than once.

alter table public.rooms add column if not exists max_occupancy integer;

alter table public.rooms drop constraint if exists rooms_max_occupancy_ok;
alter table public.rooms add constraint rooms_max_occupancy_ok
  check (max_occupancy is null or (max_occupancy >= max_guests and max_occupancy <= 30));

create or replace function public.enforce_guest_booking_terms()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_price record;
  v_hours integer;
  v_cap integer;
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

  -- Never more guests than the room's limit (the owner's, or included + 4 when none is set).
  select coalesce(r.max_occupancy, r.max_guests + 4) into v_cap from public.rooms r where r.id = new.room_id;
  if new.guest_count > v_cap then
    raise exception 'too many guests for this room (maximum %)', v_cap using errcode = '23514';
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
