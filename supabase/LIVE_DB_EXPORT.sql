-- LIVE DATABASE EXPORT — read-only. Every query below is a SELECT.
--
-- Supabase's SQL editor shows only the LAST query's result when you run
-- several at once, so run these ONE AT A TIME:
--   1. Paste a single query (from its "-- Q#" line down to its ";") into the editor, tap Run.
--   2. The result is ONE cell. Tap it (or use "Copy" on the result) and copy the text.
--   3. Save it as the file named in the "-- Save as" line, in supabase/baseline/ in the repo.
--
-- Before you commit anything: search the saved text for  eyJ  Bearer  password  secret  key
-- — cron jobs (Q4) can contain keys. Remove them and leave a placeholder.
-- None of this contains row data (no guests, no bookings).

-- Q1 · Functions in `public` (triggers' functions, lookup_* RPCs, expiry jobs …)
-- Save as: supabase/baseline/1_functions.sql
select coalesce(string_agg(pg_get_functiondef(p.oid) || ';', E'\n\n' order by p.proname, p.oid), '-- none') as functions
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind in ('f', 'p')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');   -- skip extension-owned

-- Q2 · Triggers on public tables
-- Save as: supabase/baseline/2_triggers.sql
select coalesce(string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' order by c.relname, t.tgname), '-- none') as triggers
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal;

-- Q3 · Row-level security: which tables have it on, and every policy
-- Save as: supabase/baseline/3_rls_policies.sql
select
  coalesce((select string_agg(format('alter table %I.%I enable row level security;', n.nspname, c.relname), E'\n' order by c.relname)
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity), '-- no tables with RLS')
  || E'\n\n' ||
  coalesce((select string_agg(
              format('create policy %I on %I.%I as %s for %s to %s%s%s;',
                     policyname, schemaname, tablename, permissive, cmd, array_to_string(roles, ', '),
                     case when qual is not null then E'\n  using (' || qual || ')' else '' end,
                     case when with_check is not null then E'\n  with check (' || with_check || ')' else '' end),
              E'\n\n' order by tablename, policyname)
            from pg_policies where schemaname = 'public'), '-- no policies')
  as rls_and_policies;

-- Q4 · Scheduled jobs (pg_cron) — e.g. expiring pending holds.
-- If this says  relation "cron.job" does not exist  you have no scheduled jobs: save "-- none".
-- Save as: supabase/baseline/4_cron_jobs.sql   (CHECK FOR KEYS before committing)
select coalesce(string_agg(format('select cron.schedule(%L, %L, %L);', jobname, schedule, command), E'\n\n' order by jobname), '-- none') as cron_jobs
from cron.job;

-- Q5 · Extensions
-- Save as: supabase/baseline/5_extensions.sql
select coalesce(string_agg(format('create extension if not exists %I;', extname), E'\n' order by extname), '-- none') as extensions
from pg_extension;

-- Q6 · Tables and columns (types, not-null, defaults, generated columns)
-- Save as: supabase/baseline/6_tables.sql
select string_agg(def, E'\n\n' order by tbl) as tables
from (
  select c.relname as tbl,
         format('create table public.%I (%s);', c.relname,
           E'\n  ' || string_agg(
             format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                    case when a.attnotnull then ' not null' else '' end,
                    case when ad.adbin is null then ''
                         when a.attgenerated = 's' then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
                         else ' default ' || pg_get_expr(ad.adbin, ad.adrelid) end),
             E',\n  ' order by a.attnum) || E'\n') as def
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
  group by c.relname
) t;

-- Q7 · Constraints (incl. the no-overlap booking rule) and indexes
-- Save as: supabase/baseline/7_constraints_indexes.sql
select
  coalesce((select string_agg(format('alter table %s add constraint %I %s;', conrelid::regclass, conname, pg_get_constraintdef(oid)),
                              E'\n' order by conrelid::regclass::text, conname)
            from pg_constraint where connamespace = 'public'::regnamespace), '-- none')
  || E'\n\n' ||
  coalesce((select string_agg(indexdef || ';', E'\n' order by tablename, indexname)
            from pg_indexes i
            where schemaname = 'public'
              and not exists (select 1 from pg_constraint k where k.connamespace = 'public'::regnamespace and k.conname = i.indexname)), '-- none')
  as constraints_and_indexes;
