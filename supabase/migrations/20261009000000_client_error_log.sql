-- ============================================================================
-- Client error log — lets the app report crashes/failures so you find out
-- about them without waiting for a phone call.
--
-- Access model (same pattern as `leads`):
--   * ANYONE (guests, owners) may INSERT — errors happen before/without login.
--   * ONLY the superadmin may SELECT / DELETE (hardcoded email, like every
--     other superadmin_* policy in this project).
--
-- Because the table accepts writes from the public, it defends itself:
--   1. CHECK constraints cap every field's size.
--   2. A trigger refuses inserts once 1,000 rows arrived in the last hour, so
--      nobody can fill the free-tier database by scripting the public API.
--   3. purge_old_client_errors() deletes rows older than 30 days.
--
-- The app strips emails, phone numbers, tokens and URL query strings before
-- sending (src/lib/errorLogCore.ts) — this table is not meant to hold PII.
-- ============================================================================

create table if not exists public.client_errors (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  source       text        not null,   -- window | promise | route | booking | admin
  category     text        not null default 'app',   -- app | network
  message      text        not null,
  stack        text,
  url          text,                    -- path only, no query string
  hostname     text,
  user_agent   text,
  app_version  text,                    -- git commit of the deploy
  context      jsonb,
  constraint client_errors_source_len   check (char_length(source)   <= 30),
  constraint client_errors_category_len check (char_length(category) <= 20),
  constraint client_errors_message_len  check (char_length(message)  between 1 and 600),
  constraint client_errors_stack_len    check (stack is null or char_length(stack) <= 2500),
  constraint client_errors_url_len      check (url is null or char_length(url) <= 300),
  constraint client_errors_host_len     check (hostname is null or char_length(hostname) <= 120),
  constraint client_errors_ua_len       check (user_agent is null or char_length(user_agent) <= 300),
  constraint client_errors_ver_len      check (app_version is null or char_length(app_version) <= 40),
  constraint client_errors_ctx_len      check (context is null or char_length(context::text) <= 1500)
);

create index if not exists client_errors_created_at_idx
  on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists "anyone_can_log_error" on public.client_errors;
create policy "anyone_can_log_error" on public.client_errors
  for insert to anon, authenticated
  with check (true);

drop policy if exists "superadmin_read_client_errors" on public.client_errors;
create policy "superadmin_read_client_errors" on public.client_errors
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'thedelishlicks@gmail.com');

drop policy if exists "superadmin_delete_client_errors" on public.client_errors;
create policy "superadmin_delete_client_errors" on public.client_errors
  for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'thedelishlicks@gmail.com');

-- Table privileges: the public can only insert; RLS above limits reads/deletes.
revoke all on public.client_errors from anon, authenticated;
grant insert on public.client_errors to anon, authenticated;
grant select, delete on public.client_errors to authenticated;

-- ── Flood guard ─────────────────────────────────────────────────────────────
create or replace function public.client_errors_flood_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.client_errors
       where created_at > now() - interval '1 hour') >= 1000 then
    raise exception 'client_errors: hourly limit reached';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_client_errors_flood_guard on public.client_errors;
create trigger trg_client_errors_flood_guard
  before insert on public.client_errors
  for each row execute function public.client_errors_flood_guard();

-- ── Retention ───────────────────────────────────────────────────────────────
create or replace function public.purge_old_client_errors()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.client_errors where created_at < now() - interval '30 days';
$$;

revoke execute on function public.purge_old_client_errors() from public, anon, authenticated;

-- OPTIONAL: run the purge nightly (you already use pg_cron for booking expiry).
-- Run this once, separately, if you want it automatic:
--   select cron.schedule('purge-client-errors', '30 3 * * *',
--                        'select public.purge_old_client_errors()');
-- Without it, use the "Clear all" button on the Errors tab now and then.
