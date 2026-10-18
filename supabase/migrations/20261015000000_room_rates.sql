-- Seasonal / date-range room rates.
--
-- Until now a room had ONE nightly price (+ a Fri/Sat multiplier) all year.
-- A rate period overrides the room's base price for the nights it covers:
--   kind = 'fixed'    -> value is the nightly price in rupees
--   kind = 'percent'  -> value is a whole-number % change on the room's base
--                        price (+30 = peak surcharge, -20 = off-season offer)
-- The Fri/Sat weekend multiplier still applies on top of whichever base wins.
--
-- room_id NULL = applies to every room of the property.
-- If periods overlap, the winner for a night is (same order as
-- src/lib/roomRates.ts pickRate, keep them identical):
--   1. a room-specific period beats an all-rooms period
--   2. then the one that starts later (the more recent / more specific one)
--   3. then the newest created.
--
-- Safe to run more than once.

create table if not exists public.room_rates (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  room_id     uuid references public.rooms(id) on delete cascade,
  label       text not null default '',
  start_date  date not null,
  end_date    date not null,                  -- last NIGHT covered (inclusive)
  kind        text not null default 'fixed',
  value       numeric not null,
  created_at  timestamptz not null default now(),
  constraint room_rates_dates_ok   check (end_date >= start_date),
  constraint room_rates_span_ok    check (end_date - start_date <= 400),
  constraint room_rates_kind_ok    check (kind in ('fixed', 'percent')),
  constraint room_rates_value_ok   check (
    (kind = 'fixed'   and value > 0 and value <= 1000000 and value = round(value)) or
    (kind = 'percent' and value > -90 and value <= 500   and value = round(value))
  ),
  constraint room_rates_label_len  check (char_length(label) <= 60)
);

create index if not exists room_rates_property_idx on public.room_rates (property_id, start_date);
create index if not exists room_rates_room_idx     on public.room_rates (room_id);

-- A rate's room must belong to the same property (stops one owner pricing
-- another owner's room).
create or replace function public.room_rates_room_matches_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.property_id = new.property_id
  ) then
    raise exception 'room does not belong to this property' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_room_rates_room_matches_property on public.room_rates;
create trigger trg_room_rates_room_matches_property
  before insert or update on public.room_rates
  for each row execute function public.room_rates_room_matches_property();

alter table public.room_rates enable row level security;

-- Owners manage their own property's rates.
drop policy if exists room_rates_owner_all on public.room_rates;
create policy room_rates_owner_all on public.room_rates
  for all to authenticated
  using      (exists (select 1 from public.properties p where p.id = room_rates.property_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.properties p where p.id = room_rates.property_id and p.owner_id = (select auth.uid())));

-- Guests need to read rates to see the right price (same visibility as rooms).
drop policy if exists room_rates_public_read on public.room_rates;
create policy room_rates_public_read on public.room_rates
  for select to anon, authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = room_rates.property_id and p.subscription_status in ('trial', 'active')
  ));

grant select on public.room_rates to anon;
grant select, insert, update, delete on public.room_rates to authenticated;
