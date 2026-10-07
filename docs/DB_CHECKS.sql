-- Read-only diagnostics. Safe to run any time in the Supabase SQL editor.
-- (Run one query at a time; each starts with a number.)

-- 1. Overlapping non-cancelled bookings for the same room.
--    Must return ZERO rows before running 20261008000000_prevent_double_booking.sql
select r.name as room,
       a.id as booking_a, a.guest_name as guest_a, a.status as status_a, a.check_in as in_a, a.check_out as out_a,
       b.id as booking_b, b.guest_name as guest_b, b.status as status_b, b.check_in as in_b, b.check_out as out_b
  from public.bookings a
  join public.bookings b
    on a.room_id = b.room_id and a.id < b.id
   and a.status <> 'cancelled' and b.status <> 'cancelled'
   and a.check_in < b.check_out and b.check_in < a.check_out
  join public.rooms r on r.id = a.room_id
 order by a.check_in;

-- 2. Is availability.price_override still unused? (0 = safe to drop the column)
select count(*) as rows_with_price_override
  from public.availability
 where price_override is not null;
-- Then, only if the count above is 0 and the app version without per-date
-- price overrides is live:
--   alter table public.availability drop column price_override;

-- 3. Future dates marked unavailable with NO active booking behind them
--    (manual blocks or leftovers). Review before reopening any.
select r.name as room, a.date
  from public.availability a
  join public.rooms r on r.id = a.room_id
 where a.is_available = false
   and a.date >= current_date
   and not exists (
     select 1 from public.bookings b
      where b.room_id = a.room_id and b.status <> 'cancelled'
        and a.date >= b.check_in and a.date < b.check_out)
 order by a.date;

-- 4. Triggers on bookings (confirm the availability triggers exist).
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'public.bookings'::regclass and not tgisinternal
 order by tgname;

-- 5. Guest-visible policies written by owners (are owners filling them in?)
select name,
       (select count(*) from unnest(shared_amenities) x where x like '\_\_cancel:%') as has_cancellation,
       (select count(*) from unnest(shared_amenities) x where x like '\_\_rules:%')  as has_house_rules
  from public.properties
 order by name;
