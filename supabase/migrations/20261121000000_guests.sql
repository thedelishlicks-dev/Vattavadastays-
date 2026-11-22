-- Guest identity (Sprint 6): who is this guest, and have they stayed before?
--
-- ADDITIVE. Nothing existing is changed or removed:
--   * a new property-scoped table `guests` (never a global directory: every row belongs to ONE property)
--   * nullable `guest_id` on bookings and booking_groups (old rows keep working with it empty)
--   * a BEFORE trigger that links a booking to its guest by NORMALIZED PHONE inside the same property,
--     creating the guest when none matches. No fuzzy name matching, no phone = no guest identity.
--   * a one-time, idempotent backfill of existing bookings that have a usable phone. It writes guest_id only;
--     no booking money, status, date or room column is touched.
--
-- Phone normalization mirrors src/lib/phone.ts `nationalDigits` exactly (shared cases are asserted by both
-- src/lib/guestIdentity.test.ts and supabase/tests/guests.test.sql via supabase/tests/phone_parity_cases.json).
--
-- Security (same conventions as expenses / bookings):
--   * RLS: owners manage only guests of properties they own; the superadmin (by JWT email, same literal the
--     other superadmin_manage_* policies use) manages all; anon has no access at all.
--   * Guests can never choose their own guest_id: on a guest insert the column is forced empty and then
--     resolved by the trigger. A client can never link a booking to another property's guest (rejected).
--   * resolve_guest / the trigger function are SECURITY DEFINER and NOT callable through the API.
--
-- Safe to run more than once.

-- ── 1. phone key ─────────────────────────────────────────────────────────────
-- National digits of a phone, or NULL when there is nothing usable (fewer than 7 or more than 15 digits).
create or replace function public.normalize_phone_key(raw text)
returns text language plpgsql immutable as $$
declare
  d text;
  has_plus boolean;
begin
  if raw is null then return null; end if;
  has_plus := left(btrim(raw), 1) = '+';
  d := regexp_replace(raw, '\D', '', 'g');
  if d like '0091%' then
    d := substr(d, 5);
  elsif d like '91%' and (has_plus or length(d) > 10) then
    d := substr(d, 3);
  end if;
  if d like '0%' then d := substr(d, 2); end if;
  if length(d) < 7 or length(d) > 15 then return null; end if;
  return d;
end $$;

-- ── 2. guests ────────────────────────────────────────────────────────────────
create table if not exists public.guests (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name        text not null,
  phone       text not null,
  phone_key   text generated always as (public.normalize_phone_key(phone)) stored not null,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One guest per phone per property: this is what makes duplicates impossible, even under concurrent inserts.
create unique index if not exists guests_property_phone_key_uidx on public.guests (property_id, phone_key);
create index if not exists guests_property_idx on public.guests (property_id);

create or replace function public.set_guests_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_guests_updated_at on public.guests;
create trigger trg_guests_updated_at
  before update on public.guests
  for each row execute function public.set_guests_updated_at();

alter table public.guests enable row level security;

revoke all on public.guests from anon;
grant select, insert, update, delete on public.guests to authenticated;

drop policy if exists owners_manage_guests on public.guests;
create policy owners_manage_guests on public.guests as permissive for all to authenticated
  using (property_id in (select properties.id from properties where properties.owner_id = auth.uid()))
  with check (property_id in (select properties.id from properties where properties.owner_id = auth.uid()));

drop policy if exists superadmin_manage_guests on public.guests;
create policy superadmin_manage_guests on public.guests as permissive for all to authenticated
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

-- ── 3. bookings.guest_id / booking_groups.guest_id ──────────────────────────
alter table public.bookings       add column if not exists guest_id uuid references public.guests(id) on delete set null;
alter table public.booking_groups add column if not exists guest_id uuid references public.guests(id) on delete set null;

create index if not exists bookings_guest_idx       on public.bookings (guest_id)       where guest_id is not null;
create index if not exists booking_groups_guest_idx on public.booking_groups (guest_id) where guest_id is not null;

-- ── 4. find or create the guest of a phone, inside one property ─────────────
create or replace function public.resolve_guest(p_property_id uuid, p_name text, p_phone text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_key text := public.normalize_phone_key(p_phone);
  v_id  uuid;
begin
  if p_property_id is null or v_key is null then return null; end if;   -- no phone, no identity

  select id into v_id from public.guests where property_id = p_property_id and phone_key = v_key;
  if v_id is null then
    insert into public.guests (property_id, name, phone, email)
    values (p_property_id, coalesce(nullif(btrim(p_name), ''), 'Guest'), btrim(p_phone), nullif(btrim(p_email), ''))
    on conflict (property_id, phone_key) do nothing
    returning id into v_id;
    if v_id is null then   -- lost a race with a concurrent insert: it exists now
      select id into v_id from public.guests where property_id = p_property_id and phone_key = v_key;
    end if;
  elsif nullif(btrim(p_email), '') is not null then
    -- only ever FILL a missing email; never overwrite what is recorded
    update public.guests set email = btrim(p_email) where id = v_id and email is null;
  end if;
  return v_id;
end $$;
revoke all on function public.resolve_guest(uuid, text, text, text) from public, anon, authenticated;

-- ── 5. keep bookings linked ─────────────────────────────────────────────────
-- Fires on INSERT and when the phone, the link or the property changes (never on money, status, dates, room
-- or SOURCE edits, so editing a booking's source can never touch its guest identity).
create or replace function public.link_booking_guest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- A guest filling in the public booking form cannot pick a guest record: it is always resolved here.
  if tg_op = 'INSERT' and public._is_guest_insert(new.property_id) then
    new.guest_id := null;
  end if;
  -- A changed phone means (possibly) a different guest: look again.
  if tg_op = 'UPDATE' and new.guest_phone is distinct from old.guest_phone then
    new.guest_id := null;
  end if;

  if new.guest_id is not null then
    -- Whatever supplied it, it must be a guest of THIS property.
    if new.property_id is null
       or not exists (select 1 from public.guests g where g.id = new.guest_id and g.property_id = new.property_id) then
      raise exception 'guest does not belong to this property' using errcode = '23514';
    end if;
  elsif new.property_id is not null then
    new.guest_id := public.resolve_guest(new.property_id, new.guest_name, new.guest_phone, new.guest_email);
  end if;
  return new;
end $$;
revoke all on function public.link_booking_guest() from public, anon, authenticated;

drop trigger if exists trg_link_booking_guest on public.bookings;
create trigger trg_link_booking_guest
  before insert or update of guest_phone, guest_id, property_id on public.bookings
  for each row execute function public.link_booking_guest();

drop trigger if exists trg_link_booking_group_guest on public.booking_groups;
create trigger trg_link_booking_group_guest
  before insert or update of guest_phone, guest_id, property_id on public.booking_groups
  for each row execute function public.link_booking_guest();

-- ── 6. backfill existing bookings (idempotent; guest_id only) ───────────────
-- One guest per (property, normalized phone); the name/email come from that phone's most recent booking.
insert into public.guests (property_id, name, phone, email)
select distinct on (s.property_id, s.phone_key) s.property_id, s.name, s.phone, s.email
from (
  select b.property_id, public.normalize_phone_key(b.guest_phone) as phone_key,
         coalesce(nullif(btrim(b.guest_name), ''), 'Guest') as name, btrim(b.guest_phone) as phone,
         nullif(btrim(b.guest_email), '') as email, b.created_at
  from public.bookings b
  where b.property_id is not null and b.guest_id is null
  union all
  select g.property_id, public.normalize_phone_key(g.guest_phone),
         coalesce(nullif(btrim(g.guest_name), ''), 'Guest'), btrim(g.guest_phone),
         nullif(btrim(g.guest_email), ''), g.created_at
  from public.booking_groups g
  where g.property_id is not null and g.guest_id is null
) s
where s.phone_key is not null
order by s.property_id, s.phone_key, s.created_at desc nulls last
on conflict (property_id, phone_key) do nothing;

update public.bookings b set guest_id = g.id
from public.guests g
where b.guest_id is null and g.property_id = b.property_id and g.phone_key = public.normalize_phone_key(b.guest_phone);

update public.booking_groups bg set guest_id = g.id
from public.guests g
where bg.guest_id is null and g.property_id = bg.property_id and g.phone_key = public.normalize_phone_key(bg.guest_phone);
