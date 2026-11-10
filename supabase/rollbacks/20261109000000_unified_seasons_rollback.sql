-- Rollback for 20261109000000_unified_seasons.sql.  Read docs/SEASONS_ROLLOUT.md first.
--
-- LEVEL 1 (almost always enough, instant, loses nothing): switch the property back.
--   update public.properties set season_pricing_v2 = false where subdomain = 'THE-PROPERTY';
--   Prices go back to room_rates exactly as before. The app shows the old screens again.
--
-- LEVEL 2 (this file): put the previous pricing function back and remove the new objects.
-- Run only if the NEW function itself misbehaves for every property. Room price rules that
-- owners entered under the new screens are DELETED by the table drop below (export
-- season_room_rules to CSV first). room_rates was never changed, so old rates are intact.

begin;

-- The function exactly as in 20261015000100_server_side_booking_price.sql
create or replace function public.stay_room_price(
  p_room_id uuid, p_check_in date, p_check_out date, p_guests integer
)
returns table (nights integer, room_price numeric, extra_guest_charge numeric, total numeric)
language sql stable security definer set search_path = public as $$
  with r as (
    select id, property_id, base_price, coalesce(extra_guest_price, 0) as extra_guest_price,
           coalesce(weekend_multiplier, 1) as weekend_multiplier, max_guests
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
        (select case when rr.kind = 'fixed' then rr.value
                     else round(r.base_price * (100 + rr.value) / 100) end
           from public.room_rates rr
          where rr.property_id = r.property_id
            and (rr.room_id = r.id or rr.room_id is null)
            and n.d between rr.start_date and rr.end_date
          order by (rr.room_id is not null) desc, rr.start_date desc, rr.created_at desc
          limit 1),
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

drop function if exists public.room_night_base_seasons(uuid, date);
drop function if exists public.room_night_base_legacy(uuid, date);
drop function if exists public.season_span_days(date, date, boolean);
drop function if exists public.season_covers(date, date, date, boolean);
drop table if exists public.season_room_rules;
drop policy if exists price_seasons_public_read on public.price_seasons;
drop trigger if exists trg_protect_season_pricing_switch on public.properties;
drop function if exists public.protect_season_pricing_switch();
drop function if exists public.season_room_rules_match_property();
-- Seasons created by the copy are harmless (add-ons ignore them). The two columns stay:
--   properties.season_pricing_v2 and price_seasons.for_addons.

commit;
