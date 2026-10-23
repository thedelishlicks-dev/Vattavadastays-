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
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $$;

create table public.properties (id uuid primary key, owner_id uuid, subscription_status text default 'trial', pending_hold_hours int default 24);
create table public.rooms (id uuid primary key, property_id uuid references public.properties, base_price numeric, extra_guest_price numeric default 0,
  weekend_multiplier numeric default 1, max_guests int, is_active boolean default true);
create table public.agents (id uuid primary key, property_id uuid, name text);
create table public.bookings (id uuid primary key default gen_random_uuid(), property_id uuid, room_id uuid, group_id uuid, guest_name text, guest_phone text,
  guest_count int, check_in date, check_out date, room_price numeric, extra_guest_charge numeric, total_amount numeric, advance_amount numeric default 0,
  discount_amount numeric default 0, discount_reason text, status text, is_paid boolean default false, payment_method text, source text default 'direct',
  agent_id uuid, commission_amount numeric, commission_paid boolean default false, commission_paid_date date, hold_expires_at timestamptz);
create table public.booking_groups (id uuid primary key default gen_random_uuid(), property_id uuid, group_reference text, guest_name text, guest_phone text,
  guest_count int, check_in date, check_out date, total_amount numeric, advance_amount numeric default 0, discount_amount numeric default 0, discount_reason text,
  status text, is_paid boolean default false, source text default 'direct', agent_id uuid, commission_amount numeric, commission_paid boolean default false,
  commission_paid_date date, hold_expires_at timestamptz);

grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create function public.t_assert(ok boolean, msg text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;
grant execute on function public.t_assert(boolean, text) to anon, authenticated, service_role;
