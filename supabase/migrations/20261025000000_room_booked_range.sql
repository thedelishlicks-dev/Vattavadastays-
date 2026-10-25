-- DRAFT — for review, not applied.
--
-- Guests (role anon) cannot read public.bookings, so the guest availability and
-- conflict checks in src/lib/bookingAvailability.ts silently got no booking rows.
-- This function gives them exactly what those checks need and nothing else:
-- booking id, room, check-in and check-out dates. No names, phones, emails,
-- amounts or sources.
--
-- It is SECURITY DEFINER, which HANDOVER rule 17 normally forbids for anon
-- without caller validation. The exception is deliberate: the data returned is
-- the same occupancy the public `availability` table already exposes, plus the
-- turnover dates it cannot express. Review this before applying.
--
-- Safe to run more than once.

create or replace function public.room_booked_ranges(
  p_room_ids uuid[],
  p_from date,
  p_to date
)
returns table (
  id uuid,
  room_id uuid,
  check_in date,
  check_out date
)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.room_id, b.check_in::date, b.check_out::date
  from public.bookings b
  join public.properties p on p.id = b.property_id
  where b.room_id = any (p_room_ids)
    and b.status <> 'cancelled'
    and p.is_active
    and b.check_out::date >= p_from
    and b.check_in::date <= p_to
$$;

revoke all on function public.room_booked_ranges(uuid[], date, date) from public;
grant execute on function public.room_booked_ranges(uuid[], date, date) to anon, authenticated;
