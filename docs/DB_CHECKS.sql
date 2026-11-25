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

-- 6. Existing indexes on the booking tables (run BEFORE 20261010000000_admin_speed_indexes.sql;
--    skip any line of that file whose index you already have under another name).
select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('bookings','booking_groups','booking_charges','rooms','availability')
 order by tablename, indexname;

-- 7. How big are the tables? (Tells you whether speed work matters yet: tens of
--    thousands of rows = yes; hundreds = barely.)
select 'bookings' as tbl, count(*) as rows from public.bookings
union all select 'booking_groups', count(*) from public.booking_groups
union all select 'booking_charges', count(*) from public.booking_charges
union all select 'availability', count(*) from public.availability
union all select 'client_errors', count(*) from public.client_errors;

-- 8. RLS policies that call auth.uid()/auth.email()/auth.jwt() directly. Postgres
--    re-evaluates those once PER ROW; writing (select auth.uid()) evaluates it
--    once per query — Supabase's own performance advisor flags this. Send me the
--    result and I'll write the rewrite; I haven't changed any policy blind.
select schemaname, tablename, policyname, cmd,
       coalesce(qual, '') as using_expr, coalesce(with_check, '') as check_expr
  from pg_policies
 where schemaname = 'public'
   and (coalesce(qual,'') ~ 'auth\.(uid|email|jwt)\(\)' or coalesce(with_check,'') ~ 'auth\.(uid|email|jwt)\(\)')
   and not (coalesce(qual,'') ~ 'select auth\.' or coalesce(with_check,'') ~ 'select auth\.')
 order by tablename, policyname;

-- 9. Exclusion constraints on bookings (double-booking guards). If TWO rows come
--    back with the same definition, every booking write maintains two identical
--    indexes — drop one. Keep `bookings_no_overlap` (the app and docs refer to it):
--      alter table public.bookings drop constraint bookings_no_overlapping_active_stays;
--    (If the older one shows up in query 6 but NOT here, it is only a plain index
--    and enforces nothing: drop index public.bookings_no_overlapping_active_stays;)
select conname, contype, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.bookings'::regclass
   and contype = 'x'
 order by conname;

-- 10. Redundant plain indexes (identical columns to the primary key / another index).
--     availability_pkey already indexes (room_id, date), so idx_availability_room_date
--     only adds write cost on every availability upsert:
--       drop index if exists public.idx_availability_room_date;

-- 11. Unified seasons rollout (docs/SEASONS_ROLLOUT.md). Which properties are switched, and how
--     many seasons / room rules each has. Read-only.
select p.subdomain,
       p.season_pricing_v2 as switched,
       (select count(*) from public.room_rates rr where rr.property_id = p.id)         as old_room_rates,
       (select count(*) from public.price_seasons s where s.property_id = p.id)        as seasons,
       (select count(*) from public.season_room_rules r where r.property_id = p.id)    as room_rules
  from public.properties p
 order by p.subdomain;
-- The old-vs-new price comparison for one property is supabase/season_price_check.sql
-- (0 rows = safe to switch).

-- 12. Guest identity (Sprint 6, migration 20261121000000_guests.sql). Read-only.
--     a) Guests per property and how many of their bookings are linked.
select p.subdomain,
       (select count(*) from public.guests g where g.property_id = p.id)                         as guests,
       (select count(*) from public.bookings b where b.property_id = p.id)                       as bookings,
       (select count(*) from public.bookings b where b.property_id = p.id and b.guest_id is not null) as linked
  from public.properties p
 order by p.subdomain;
--     b) Must return 0 rows: a booking linked to a guest of ANOTHER property.
select b.id as booking_id
  from public.bookings b
  join public.guests g on g.id = b.guest_id
 where g.property_id <> b.property_id;
--     c) Must return 0 rows: bookings with a usable phone that are not linked yet (the trigger and the backfill
--        link every such booking; a row here means a write bypassed the trigger).
select b.id as booking_id, b.guest_phone
  from public.bookings b
 where b.guest_id is null
   and public.normalize_phone_key(b.guest_phone) is not null;

-- 13. Pilot check: are the Nov-2026 migrations applied on THIS database? Read-only. Run before a pilot (the repo
--     cannot tell which hand-run migrations are live). Migrations: 20261119000000_expenses.sql,
--     20261119000100_booking_source_detail.sql, 20261121000000_guests.sql.
--     Expect: every row has applied = true. A false row means run that migration (they are idempotent).
select * from (
  values
    ('expenses table',                       to_regclass('public.expenses') is not null),
    ('guests table',                         to_regclass('public.guests') is not null),
    ('bookings.booking_source_detail',       exists (select 1 from information_schema.columns
                                                      where table_schema = 'public' and table_name = 'bookings'
                                                        and column_name = 'booking_source_detail')),
    ('booking_groups.booking_source_detail', exists (select 1 from information_schema.columns
                                                      where table_schema = 'public' and table_name = 'booking_groups'
                                                        and column_name = 'booking_source_detail')),
    ('bookings.guest_id',                    exists (select 1 from information_schema.columns
                                                      where table_schema = 'public' and table_name = 'bookings'
                                                        and column_name = 'guest_id')),
    ('normalize_phone_key()',                to_regprocedure('public.normalize_phone_key(text)') is not null),
    ('expenses row level security on',       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.expenses')), false)),
    ('guests row level security on',         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.guests')), false)),
    ('expenses: no anon access',             to_regclass('public.expenses') is not null
                                              and not has_table_privilege('anon', 'public.expenses', 'select')),
    ('guests: no anon access',               to_regclass('public.guests') is not null
                                              and not has_table_privilege('anon', 'public.guests', 'select'))
) as t(item, applied);

-- 14. Security: SECURITY DEFINER functions that the public (anon) role can execute. Read-only.
--     Run after any DB change that adds a function (HANDOVER rule 17). Trigger functions are left out (they
--     cannot be called through the API). Every row here must be a function that
--     validates its caller itself (the guest booking / tracking-token lookups are the intended ones). Anything
--     else is a hole: `revoke execute on function ... from public, anon;`.
select n.nspname as schema,
       p.proname as function,
       pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and p.prorettype <> 'trigger'::regtype   -- trigger functions cannot be called through the API
   and has_function_privilege('anon', p.oid, 'execute')
 order by p.proname;
