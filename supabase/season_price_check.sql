-- READ-ONLY price check for the seasons switch (docs/SEASONS_ROLLOUT.md, step 3).
-- Prices every night of the next 400 days for every room under the OLD rules (room_rates)
-- and the NEW rules (seasons + room rules), and lists every night where they differ.
--
--   0 rows  = safe to switch this property on.
--   rows    = fix the season priorities (or the rule) and run this again, or tell the owner.
--
-- Change the property below, or delete the `where` line to check every property.
-- Changes nothing. Safe to run any time, as often as you like.
select p.subdomain,
       r.name                                                   as room,
       g::date                                                  as night,
       coalesce(public.room_night_base_legacy(r.id, g::date), r.base_price) as old_nightly_price,
       coalesce(public.room_night_base_seasons(r.id, g::date), r.base_price) as new_nightly_price
from public.properties p
join public.rooms r on r.property_id = p.id
cross join generate_series(current_date, current_date + 400, interval '1 day') g
where p.subdomain = 'demo'                      -- <- the property to check
  and coalesce(public.room_night_base_legacy(r.id, g::date), r.base_price)
      is distinct from coalesce(public.room_night_base_seasons(r.id, g::date), r.base_price)
order by p.subdomain, r.name, g;
