-- Minimal Supabase-like environment so the NEW migrations can be tested on a
-- plain Postgres: roles, auth.uid()/auth.role() (read from request.jwt.claim.*
-- exactly like PostgREST sets them) and just the columns the migrations touch.
-- NOT the real schema — the live database has more. Test database only.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $$;

create table public.properties (id uuid primary key, owner_id uuid, subscription_status text default 'trial', pending_hold_hours int default 24);
create table public.rooms (id uuid primary key, property_id uuid references public.properties, base_price numeric, extra_guest_price numeric default 0,
  weekend_multiplier numeric default 1, max_guests int, is_active boolean default true, images text[] default '{}'::text[]);
create table public.agents (id uuid primary key, property_id uuid, name text);
create table public.bookings (id uuid primary key default gen_random_uuid(), property_id uuid, room_id uuid, group_id uuid, guest_name text, guest_phone text,
  guest_count int, check_in date, check_out date, room_price numeric, extra_guest_charge numeric, total_amount numeric, advance_amount numeric default 0,
  discount_amount numeric default 0, discount_reason text, status text, is_paid boolean default false, payment_method text, source text default 'direct',
  agent_id uuid, commission_amount numeric, commission_paid boolean default false, commission_paid_date date, hold_expires_at timestamptz);
create table public.booking_groups (id uuid primary key default gen_random_uuid(), property_id uuid, group_reference text, guest_name text, guest_phone text,
  guest_count int, check_in date, check_out date, total_amount numeric, advance_amount numeric default 0, discount_amount numeric default 0, discount_reason text,
  status text, is_paid boolean default false, source text default 'direct', agent_id uuid, commission_amount numeric, commission_paid boolean default false,
  commission_paid_date date, hold_expires_at timestamptz);

create table public.addons (id uuid primary key default gen_random_uuid(), property_id uuid references public.properties, name text not null, is_active boolean not null default true);
create table public.packages (id uuid primary key default gen_random_uuid(), property_id uuid references public.properties, name text not null, is_active boolean not null default true);
alter table public.addons enable row level security;
alter table public.packages enable row level security;
-- the owner policies exactly as in supabase/baseline/3_rls_policies.sql
create policy owners_manage_addons on public.addons for all to public
  using (property_id in (select id from public.properties where owner_id = auth.uid()))
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));
create policy owners_manage_packages on public.packages for all to public
  using (property_id in (select id from public.properties where owner_id = auth.uid()))
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));


-- price_seasons exactly as in supabase/baseline/6_tables.sql + 7_constraints_indexes.sql + owner policy
create table public.price_seasons (id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
  name text not null, start_date date not null, end_date date not null, recurs_yearly boolean not null default false, priority integer not null default 0,
  created_at timestamptz not null default now(), constraint price_seasons_dates_ok check (recurs_yearly or end_date >= start_date));
alter table public.price_seasons enable row level security;
create policy owners_manage_price_seasons on public.price_seasons for all to public
  using (property_id in (select id from public.properties where owner_id = auth.uid()))
  with check (property_id in (select id from public.properties where owner_id = auth.uid()));

grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

create function public.t_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;
grant execute on function public.t_assert(boolean, text) to anon, authenticated, service_role;
