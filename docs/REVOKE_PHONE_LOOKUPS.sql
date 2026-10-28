-- REVOKE_PHONE_LOOKUPS.sql — close the last phone-number hole.
--
-- DO NOT RUN BEFORE 25 NOVEMBER 2026.
--
-- Why this is not in supabase/migrations/: the tracking-link token went live on
-- 25–26 Oct 2026. WhatsApp messages sent BEFORE that contain old links of the form
-- /booking-status?phone=…&property=…, and those links work only through the two
-- functions below. Revoking them earlier breaks every old link a guest still has.
-- 30 days after the token went live is when that window closes (see AGENTS.md,
-- "Tracking links").
--
-- Until this runs, anyone who knows a property's id (it is public) and a guest's
-- phone number can read that guest's booking: name, dates and amounts.
--
-- Steps, in this order:
--   1. Run this file in the Supabase SQL editor.
--   2. Delete the "LEGACY ?phone= links" branch and the `phone` search param from
--      src/routes/booking-status.tsx, then deploy.
--   3. Move this file into supabase/migrations/ with a timestamped name so the
--      CI database tests and any fresh database apply it too.
-- (Doing step 2 first would break old links early; doing it last leaves dead code
--  that calls a function the database now refuses.)
--
-- Safe to run more than once.

revoke execute on function public.lookup_bookings_by_phone(text, uuid) from public, anon, authenticated;
revoke execute on function public.lookup_booking_groups_by_phone(text, uuid) from public, anon, authenticated;

-- Check: both rows should show has_anon_execute = false.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as has_anon_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('lookup_bookings_by_phone', 'lookup_booking_groups_by_phone');
