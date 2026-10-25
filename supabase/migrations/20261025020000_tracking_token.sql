-- Tracking-link token.
--
-- The guest booking-status page used to find bookings by phone number +
-- property id. Anyone who knew a property id and a guest's phone number could
-- read that guest's booking (name, dates, amounts). This migration adds an
-- unguessable per-booking token that the tracking link carries instead.
--
-- What this migration does:
--   1. Adds tracking_token to bookings and booking_groups.
--   2. Gives every existing row a random 64-hex-character token, so owners can
--      send links for old bookings.
--   3. Adds a trigger that fills the token on insert if the client didn't send
--      one (old app versions keep working), and a format check.
--   4. Adds lookup_booking_by_token(), the only lookup the new guest page uses.
--
-- What this migration does NOT do:
--   It does not remove lookup_bookings_by_phone / lookup_booking_groups_by_phone.
--   Old WhatsApp messages still contain phone-based links, so those functions
--   stay until the transition ends. A later migration revokes them (see the
--   note at the bottom). Until then the phone hole remains open.
--
-- Safe to run more than once.

-- 1. Columns ------------------------------------------------------------------

alter table public.bookings
  add column if not exists tracking_token text;

alter table public.booking_groups
  add column if not exists tracking_token text;

-- 2. Backfill existing rows ---------------------------------------------------
-- Two gen_random_uuid() values give 64 hex characters (244 random bits).

update public.bookings
   set tracking_token = replace(gen_random_uuid()::text, '-', '')
                     || replace(gen_random_uuid()::text, '-', '')
 where tracking_token is null;

update public.booking_groups
   set tracking_token = replace(gen_random_uuid()::text, '-', '')
                     || replace(gen_random_uuid()::text, '-', '')
 where tracking_token is null;

-- 3. Format, uniqueness and fill-on-insert ------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_tracking_token_format') then
    alter table public.bookings
      add constraint bookings_tracking_token_format
      check (tracking_token is null or tracking_token ~ '^[0-9a-f]{32,128}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'booking_groups_tracking_token_format') then
    alter table public.booking_groups
      add constraint booking_groups_tracking_token_format
      check (tracking_token is null or tracking_token ~ '^[0-9a-f]{32,128}$');
  end if;
end $$;

create unique index if not exists bookings_tracking_token_key
  on public.bookings (tracking_token) where tracking_token is not null;

create unique index if not exists booking_groups_tracking_token_key
  on public.booking_groups (tracking_token) where tracking_token is not null;

create or replace function public.fill_tracking_token()
returns trigger
language plpgsql
as $$
begin
  if new.tracking_token is null then
    new.tracking_token := replace(gen_random_uuid()::text, '-', '')
                       || replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_tracking_token on public.bookings;
create trigger trg_fill_tracking_token
  before insert on public.bookings
  for each row execute function public.fill_tracking_token();

drop trigger if exists trg_fill_tracking_token on public.booking_groups;
create trigger trg_fill_tracking_token
  before insert on public.booking_groups
  for each row execute function public.fill_tracking_token();

-- 4. Lookup by token ----------------------------------------------------------
-- Returns { "groups": [...], "bookings": [...] } for the one booking or group
-- the token belongs to. A group token returns the group row plus all of its
-- room bookings. Rows are stripped of commission and payment-reference fields,
-- the same as the phone lookups, and of tracking_token itself.
-- A token that is missing or malformed returns empty arrays, never an error,
-- so probing reveals nothing.

create or replace function public.lookup_booking_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_groups   jsonb;
  v_bookings jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32,128}$' then
    return jsonb_build_object('groups', '[]'::jsonb, 'bookings', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(
           to_jsonb(g) - 'agent_id' - 'commission_amount' - 'commission_paid'
                       - 'commission_paid_date' - 'payment_reference' - 'tracking_token'
         ), '[]'::jsonb)
    into v_groups
    from public.booking_groups g
   where g.tracking_token = p_token;

  select coalesce(jsonb_agg(
           (to_jsonb(b) - 'agent_id' - 'commission_amount' - 'commission_paid'
                        - 'commission_paid_date' - 'payment_reference'
                        - 'invoice_notes' - 'tracking_token')
           || jsonb_build_object(
                'booking_charges', (
                  select coalesce(jsonb_agg(bc), '[]'::jsonb)
                  from public.booking_charges bc
                  where bc.booking_id = b.id
                ),
                'rooms', (
                  select jsonb_build_object('name', r.name)
                  from public.rooms r
                  where r.id = b.room_id
                )
              )
           order by b.created_at desc
         ), '[]'::jsonb)
    into v_bookings
    from public.bookings b
   where b.tracking_token = p_token
      or (b.group_id is not null and b.group_id in (
            select g.id from public.booking_groups g where g.tracking_token = p_token
         ));

  return jsonb_build_object('groups', v_groups, 'bookings', v_bookings);
end;
$$;

revoke all on function public.lookup_booking_by_token(text) from public;
grant execute on function public.lookup_booking_by_token(text) to anon, authenticated;

-- Transition note (do NOT run yet):
--   When old phone-based links are no longer in use, run a later migration:
--     revoke execute on function public.lookup_bookings_by_phone(text, uuid) from anon, authenticated;
--     revoke execute on function public.lookup_booking_groups_by_phone(text, uuid) from anon, authenticated;
--   and remove the phone branch from the guest page.
