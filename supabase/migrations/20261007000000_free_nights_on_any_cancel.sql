-- ============================================================================
-- Free a booking's nights in `availability` whenever it becomes 'cancelled',
-- from ANY previous status (HANDOVER §10 "Data hygiene").
--
-- Why: the existing status trigger only frees dates for confirmed → cancelled.
-- A *pending* request that is cancelled (or auto-cancelled when its hold
-- expires) left is_available = false rows behind, which the owner Calendar
-- correctly showed as "Blocked" with no booking behind them.
--
-- Safety:
--   * Additive — does NOT replace trg_booking_status_change (that function was
--     created in the SQL editor and is not in this repo, so it can't be
--     safely edited blind). Both triggers can run; freeing is idempotent.
--   * Only frees a night when no OTHER non-cancelled booking covers it.
--   * Never touches nights outside [check_in, check_out).
--
-- REVIEW BEFORE RUNNING: column names (availability.room_id / date /
-- is_available, bookings.room_id / check_in / check_out / status) are taken
-- from the app code (src/lib/calendarState.ts); confirm with:
--   select column_name from information_schema.columns
--   where table_name in ('availability','bookings') order by table_name;
-- Also confirm expire_stale_pending_bookings() sets status = 'cancelled'
-- (if it uses another value, add that value to the WHEN clause below).
-- ============================================================================

create or replace function public.free_nights_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.availability a
     set is_available = true
   where a.room_id = new.room_id
     and a.date >= new.check_in
     and a.date <  new.check_out
     and a.is_available = false
     and not exists (
       select 1
         from public.bookings b
        where b.room_id = a.room_id
          and b.id <> new.id
          and b.status <> 'cancelled'
          and a.date >= b.check_in
          and a.date <  b.check_out
     );
  return new;
end;
$$;

drop trigger if exists trg_free_nights_on_cancel on public.bookings;
create trigger trg_free_nights_on_cancel
  after update of status on public.bookings
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.free_nights_on_cancel();

-- ── Optional one-off: LIST (read-only) dates nothing explains ───────────────
-- Unavailable nights with no active booking behind them. Some are real manual
-- blocks — review before freeing anything.
--
-- select a.room_id, a.date
--   from public.availability a
--  where a.is_available = false
--    and not exists (
--      select 1 from public.bookings b
--       where b.room_id = a.room_id and b.status <> 'cancelled'
--         and a.date >= b.check_in and a.date < b.check_out)
--  order by a.room_id, a.date;
