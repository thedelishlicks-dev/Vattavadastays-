-- ============================================================================
-- Database-level double-booking guard (HANDOVER backlog #4).
--
-- Until now the app checked availability in the browser, so two guests
-- submitting the same room/dates within the same second could both succeed.
-- This adds an EXCLUSION CONSTRAINT: Postgres itself refuses a second
-- non-cancelled booking whose [check_in, check_out) overlaps an existing one
-- for the same room. Same-day turnover (one guest's check-out = the next
-- guest's check-in) is allowed because the date range is half-open.
--
-- The app maps the resulting error (SQLSTATE 23P01) to a friendly message
-- (src/lib/dbErrors.ts).
--
-- SAFE BY DEFAULT: the first block ABORTS (changes nothing) if overlapping
-- bookings already exist, and tells you how many. Fix or cancel those first —
-- see docs/DB_CHECKS.sql query 1 to list them.
--
-- REVIEW BEFORE RUNNING: assumes bookings.check_in / check_out are DATE
-- columns and bookings.status uses 'cancelled' for freed bookings.
-- ============================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
    from public.bookings a
    join public.bookings b
      on a.room_id = b.room_id
     and a.id < b.id
     and a.status <> 'cancelled'
     and b.status <> 'cancelled'
     and a.check_in < b.check_out
     and b.check_in < a.check_out;
  if n > 0 then
    raise exception 'Cannot add constraint: % overlapping booking pair(s) exist. Run docs/DB_CHECKS.sql query 1, resolve them, then re-run.', n;
  end if;
end $$;

create extension if not exists btree_gist;

alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    room_id with =,
    daterange(check_in, check_out, '[)') with &&
  )
  where (status <> 'cancelled');
