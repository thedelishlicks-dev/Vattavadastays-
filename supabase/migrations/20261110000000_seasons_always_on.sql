-- Unified seasons for EVERY property. Run after 20261109000000_unified_seasons.sql, and BEFORE
-- deploying the app version that no longer has the old Seasonal rates / add-on Seasons screens.
--
-- * Every property is switched to season pricing (and new properties start that way), so the
--   database prices guest bookings with the same rules the app shows.
-- * room_rates, season_pricing_v2 and the legacy pricing path stay in place for now (rollback
--   safety). They are removed in a later cleanup once the new screens have run for a while.
--
-- Guard: refuses to switch a property that still has room_rates not yet copied into seasons
-- (copying is automatic: re-run 20261109000000_unified_seasons.sql, then this file).
-- Safe to run more than once.

begin;  -- all or nothing: if the guard below stops, nothing is switched

do $$
declare p record;
begin
  for p in
    select coalesce(to_jsonb(pr) ->> 'subdomain', pr.id::text) as subdomain
      from public.properties pr
     where not coalesce(pr.season_pricing_v2, false)
       and exists (
         select 1 from public.room_rates rr
          where rr.property_id = pr.id
            and not exists (select 1 from public.season_room_rules x where x.source_room_rate_id = rr.id)
            -- a rate that lost to a newer identical one is intentionally not copied
            and not exists (
              select 1 from public.season_room_rules y
                join public.price_seasons s on s.id = y.season_id
               where y.property_id = rr.property_id
                 and coalesce(y.room_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(rr.room_id, '00000000-0000-0000-0000-000000000000'::uuid)
                 and s.start_date = rr.start_date and s.end_date = rr.end_date and not s.recurs_yearly
            )
       )
  loop
    raise exception 'Property "%" has room_rates that are not copied into seasons yet. Re-run 20261109000000_unified_seasons.sql, then this file.', p.subdomain;
  end loop;
end $$;

alter table public.properties alter column season_pricing_v2 set default true;

-- The guard trigger blocks non-admin changes to the switch; this runs as the SQL-editor owner.
update public.properties set season_pricing_v2 = true where season_pricing_v2 is distinct from true;

commit;
