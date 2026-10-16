# Baseline of the live database

Snapshot of the production Supabase database as it was on 16 Oct 2026, exported
with `supabase/LIVE_DB_EXPORT.sql` (queries Q1–Q7, run in the SQL editor).
Schema only — no guest or booking data.

It is a **reference and rebuild kit, not a migration to re-run on production.**
The files in `supabase/migrations/` dated after this snapshot are not included here.

| File | Contents |
|---|---|
| `5_extensions.sql` | extensions in use |
| `6_tables.sql` | 16 tables, columns, defaults |
| `7_constraints_indexes.sql` | primary/foreign keys, checks, the `bookings_no_overlap` rule, indexes |
| `1_functions.sql` | 25 functions (triggers' functions, lookup RPCs, expiry job) |
| `2_triggers.sql` | 13 triggers |
| `3_rls_policies.sql` | row-level security on 16 tables + 41 policies |
| `4_cron_jobs.sql` | scheduled jobs (pending-hold expiry, every 15 minutes) |

## Rebuilding a fresh Supabase project

Run in this order in the SQL editor:

1. `5_extensions.sql` (extensions Supabase already provides will just report "already exists")
2. `6_tables.sql`
3. `7_constraints_indexes.sql` — **run the file twice**: foreign keys listed before the
   table they point at has its primary key will fail the first time; the second run
   applies them (already-existing items report an error you can ignore).
4. `1_functions.sql`
5. `2_triggers.sql`
6. `3_rls_policies.sql`
7. `4_cron_jobs.sql`

This order was tested on an empty Postgres (stand-in for Supabase's `auth` schema):
every file applied, producing 16 tables, 13 triggers, 41 policies and 77 constraints,
and a second overlapping booking for the same room was rejected.

## Keeping it current

Re-export (Q1–Q7) and commit the difference after any change made in the Supabase
dashboard, so this folder never lags behind production again.
