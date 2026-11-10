-- One Seasons model for rooms AND add-ons.
--
-- Plan: docs/SEASONS_UNIFICATION_PLAN.md.  Rollout/rollback: docs/SEASONS_ROLLOUT.md.
--
-- A season (price_seasons: name, dates, repeats yearly, priority) is defined ONCE.
-- It can carry
--   * room price rules  -> NEW table season_room_rules (fixed ₹ or % change, for one
--                          room or all rooms of the property)
--   * add-on prices     -> unchanged (add-on/package variants keep season_prices by season id)
--
-- ADDITIVE. room_rates is NOT touched. A property is priced by the new rules only when
-- properties.season_pricing_v2 = true (default false, operator-only). With it off,
-- stay_room_price() returns exactly what it returned before this migration.
--
-- Overlap rule for rooms (same as add-ons): the season with the higher priority wins, then
-- the SHORTER window, then name, then id. Only seasons that have a rule for the room compete
-- (an add-ons-only season never blocks a room price). Inside the chosen season a
-- room-specific rule beats an all-rooms rule. The Fri/Sat multiplier still applies on top.
-- Keep identical to src/lib/roomRates.ts (pickRate) — supabase/tests/season_parity_cases.json
-- is asserted by both.
--
-- Safe to run more than once.

-- ── 1. Switch + guards ──────────────────────────────────────────────────────
alter table public.properties add column if not exists season_pricing_v2 boolean not null default false;

-- Only the platform admin flips the switch (owners can't, even though they can edit the row).
create or replace function public.protect_season_pricing_switch()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.season_pricing_v2 is distinct from old.season_pricing_v2
     and auth.uid() is not null
     and coalesce(auth.jwt() ->> 'email', '') <> 'thedelishlicks@gmail.com' then
    raise exception 'Only the platform admin can change "season_pricing_v2" on a property' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_season_pricing_switch on public.properties;
create trigger trg_protect_season_pricing_switch
  before update on public.properties
  for each row execute function public.protect_season_pricing_switch();

-- A season may or may not price add-ons. Existing seasons do (default true) so add-on prices
-- do not change. Seasons copied from room_rates below start with false.
alter table public.price_seasons add column if not exists for_addons boolean not null default true;

-- ── 2. Room price rules per season ──────────────────────────────────────────
create table if not exists public.season_room_rules (
  id                  uuid primary key default gen_random_uuid(),
  property_id         uuid not null references public.properties(id) on delete cascade,
  season_id           uuid not null references public.price_seasons(id) on delete cascade,
  room_id             uuid references public.rooms(id) on delete cascade,   -- null = all rooms
  kind                text not null default 'percent',
  value               numeric not null,
  source_room_rate_id uuid unique,          -- set by the one-time copy from room_rates
  created_at          timestamptz not null default now(),
  constraint season_room_rules_kind_ok  check (kind in ('fixed', 'percent')),
  constraint season_room_rules_value_ok check (
    (kind = 'fixed'   and value > 0 and value <= 1000000 and value = round(value)) or
    (kind = 'percent' and value > -90 and value <= 500   and value = round(value))
  )
);

-- One rule per season per room (and one all-rooms rule per season).
create unique index if not exists season_room_rules_one_per_room
  on public.season_room_rules (season_id, coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists season_room_rules_property_idx on public.season_room_rules (property_id);

-- Season and room must belong to the rule's property (stops pricing another owner's room).
create or replace function public.season_room_rules_match_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.price_seasons s where s.id = new.season_id and s.property_id = new.property_id) then
    raise exception 'season does not belong to this property' using errcode = '23514';
  end if;
  if new.room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.property_id = new.property_id
  ) then
    raise exception 'room does not belong to this property' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_season_room_rules_match_property on public.season_room_rules;
create trigger trg_season_room_rules_match_property
  before insert or update on public.season_room_rules
  for each row execute function public.season_room_rules_match_property();

alter table public.season_room_rules enable row level security;

drop policy if exists season_room_rules_owner_all on public.season_room_rules;
create policy season_room_rules_owner_all on public.season_room_rules
  for all to authenticated
  using      (exists (select 1 from public.properties p where p.id = season_room_rules.property_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.properties p where p.id = season_room_rules.property_id and p.owner_id = (select auth.uid())));

drop policy if exists season_room_rules_public_read on public.season_room_rules;
create policy season_room_rules_public_read on public.season_room_rules
  for select to anon, authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = season_room_rules.property_id and p.subscription_status in ('trial', 'active')
  ));

grant select on public.season_room_rules to anon;
grant select, insert, update, delete on public.season_room_rules to authenticated;

-- Guests need the seasons (names + dates only) to show the right room price.
drop policy if exists price_seasons_public_read on public.price_seasons;
create policy price_seasons_public_read on public.price_seasons
  for select to anon, authenticated
  using (exists (
    select 1 from public.properties p
    where p.id = price_seasons.property_id and p.subscription_status in ('trial', 'active')
  ));
grant select on public.price_seasons to anon;

-- ── 3. Season helpers (same maths as src/lib/quotes.ts inSeason / seasonSpanDays) ──
create or replace function public.season_covers(p_date date, p_start date, p_end date, p_yearly boolean)
returns boolean language sql immutable as $$
  select case
    when not p_yearly then p_date between p_start and p_end
    when to_char(p_start, 'MMDD') <= to_char(p_end, 'MMDD')
      then to_char(p_date, 'MMDD') between to_char(p_start, 'MMDD') and to_char(p_end, 'MMDD')
    else to_char(p_date, 'MMDD') >= to_char(p_start, 'MMDD') or to_char(p_date, 'MMDD') <= to_char(p_end, 'MMDD')
  end;
$$;

create or replace function public.season_span_days(p_start date, p_end date, p_yearly boolean)
returns integer language sql immutable as $$
  select case
    when not p_yearly then (p_end - p_start) + 1
    else (
      select case when s <= 0 then s + 366 else s end
      from (select (make_date(2000, extract(month from p_end)::int, extract(day from p_end)::int)
                  - make_date(2000, extract(month from p_start)::int, extract(day from p_start)::int) + 1) as s) x
    )
  end;
$$;

-- ── 4. Nightly base price: the two rule sets, side by side ──────────────────
-- Legacy (room_rates). Body identical to the subquery in the previous stay_room_price().
create or replace function public.room_night_base_legacy(p_room_id uuid, p_date date)
returns numeric language sql stable security definer set search_path = public as $$
  select case when rr.kind = 'fixed' then rr.value
              else round(r.base_price * (100 + rr.value) / 100) end
    from public.rooms r
    join public.room_rates rr on rr.property_id = r.property_id
   where r.id = p_room_id
     and (rr.room_id = r.id or rr.room_id is null)
     and p_date between rr.start_date and rr.end_date
   order by (rr.room_id is not null) desc, rr.start_date desc, rr.created_at desc
   limit 1;
$$;

-- Unified (price_seasons + season_room_rules). NULL = no season prices this room that night.
create or replace function public.room_night_base_seasons(p_room_id uuid, p_date date)
returns numeric language sql stable security definer set search_path = public as $$
  select case when sr.kind = 'fixed' then sr.value
              else round(r.base_price * (100 + sr.value) / 100) end
    from public.rooms r
    join public.season_room_rules sr on sr.property_id = r.property_id and (sr.room_id = r.id or sr.room_id is null)
    join public.price_seasons s on s.id = sr.season_id
   where r.id = p_room_id
     and public.season_covers(p_date, s.start_date, s.end_date, s.recurs_yearly)
   order by s.priority desc,
            public.season_span_days(s.start_date, s.end_date, s.recurs_yearly) asc,
            s.name collate "C" asc,
            s.id asc,
            (sr.room_id is not null) desc
   limit 1;
$$;

revoke all on function public.room_night_base_legacy(uuid, date) from public, anon, authenticated;
revoke all on function public.room_night_base_seasons(uuid, date) from public, anon, authenticated;

-- ── 5. stay_room_price(): same shape, same maths; only the nightly base source switches ──
create or replace function public.stay_room_price(
  p_room_id uuid, p_check_in date, p_check_out date, p_guests integer
)
returns table (nights integer, room_price numeric, extra_guest_charge numeric, total numeric)
language sql stable security definer set search_path = public as $$
  with r as (
    select id, property_id, base_price, coalesce(extra_guest_price, 0) as extra_guest_price,
           coalesce(weekend_multiplier, 1) as weekend_multiplier, max_guests,
           coalesce((select p.season_pricing_v2 from public.properties p where p.id = rooms.property_id), false) as v2
    from public.rooms where id = p_room_id
  ),
  nights as (
    select g::date as d
    from generate_series(p_check_in::timestamp, (p_check_out - 1)::timestamp, interval '1 day') g
    where p_check_out > p_check_in
  ),
  priced as (
    select n.d,
      coalesce(
        case when r.v2 then public.room_night_base_seasons(r.id, n.d)
             else public.room_night_base_legacy(r.id, n.d) end,
        r.base_price
      ) as nightly,
      (extract(dow from n.d) in (5, 6)) as weekend,   -- Fri, Sat nights
      r.weekend_multiplier, r.extra_guest_price, r.max_guests
    from nights n cross join r
  ),
  sums as (
    select count(*)::int as nights,
           round(sum(nightly * case when weekend then weekend_multiplier else 1 end), 2) as room_price,
           max(extra_guest_price) as egp, max(max_guests) as mg
    from priced
  )
  select s.nights,
         s.room_price,
         round(greatest(0, p_guests - s.mg) * s.egp * s.nights, 2),
         s.room_price + round(greatest(0, p_guests - s.mg) * s.egp * s.nights, 2)
  from sums s
  where s.nights > 0;
$$;

revoke all on function public.stay_room_price(uuid, date, date, integer) from public, anon, authenticated;

-- ── 6. One-time copy: every room_rates row becomes a season + a room rule ───
-- Re-runnable: rows already copied (source_room_rate_id set) are skipped.
--  * A season is reused when the property already has one with the same name and the same
--    non-repeating dates (so "Christmas" made twice becomes ONE season); otherwise a new
--    season is created with for_addons = false (add-on prices stay exactly as they are).
--  * An unnamed rate is named from its dates.
--  * New seasons get priority = their rank under the OLD precedence (room-specific first, then
--    later start, then newest), so overlapping legacy rates keep winning in the same order.
--  * If two legacy rates land on the same season AND room (same name + dates), the newest wins,
--    as before.
do $$
declare
  rr record;
  v_name text;
  v_season uuid;
begin
  -- priority for the seasons we are about to create
  create temp table if not exists _season_rank on commit drop as
  select property_id, nm, start_date, end_date,
         row_number() over (partition by property_id order by room_specific, start_date, newest) as rank
  from (
    select property_id,
           coalesce(nullif(btrim(label), ''),
                    'Rates ' || to_char(start_date, 'FMDD Mon YYYY') || ' – ' || to_char(end_date, 'FMDD Mon YYYY')) as nm,
           start_date, end_date,
           bool_or(room_id is not null) as room_specific,
           max(created_at) as newest
    from public.room_rates
    where not exists (select 1 from public.season_room_rules x where x.source_room_rate_id = room_rates.id)
    group by 1, 2, 3, 4
  ) g;

  for rr in
    select * from public.room_rates r
    where not exists (select 1 from public.season_room_rules x where x.source_room_rate_id = r.id)
    order by r.created_at desc, r.id       -- newest first: an older duplicate loses the conflict below
  loop
    v_name := left(coalesce(nullif(btrim(rr.label), ''),
                  'Rates ' || to_char(rr.start_date, 'FMDD Mon YYYY') || ' – ' || to_char(rr.end_date, 'FMDD Mon YYYY')), 60);

    select id into v_season from public.price_seasons s
     where s.property_id = rr.property_id and lower(s.name) = lower(v_name)
       and s.start_date = rr.start_date and s.end_date = rr.end_date and not s.recurs_yearly
     order by s.created_at limit 1;

    if v_season is null then
      insert into public.price_seasons (property_id, name, start_date, end_date, recurs_yearly, priority, for_addons)
      values (rr.property_id, v_name, rr.start_date, rr.end_date, false,
              coalesce((select rank from _season_rank k
                         where k.property_id = rr.property_id and k.start_date = rr.start_date
                           and k.end_date = rr.end_date
                           and k.nm = coalesce(nullif(btrim(rr.label), ''),
                                 'Rates ' || to_char(rr.start_date, 'FMDD Mon YYYY') || ' – ' || to_char(rr.end_date, 'FMDD Mon YYYY'))
                         limit 1), 0)::int,
              false)
      returning id into v_season;
    end if;

    insert into public.season_room_rules (property_id, season_id, room_id, kind, value, source_room_rate_id, created_at)
    values (rr.property_id, v_season, rr.room_id, rr.kind, rr.value, rr.id, rr.created_at)
    on conflict (season_id, coalesce(room_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;
  end loop;
end $$;
