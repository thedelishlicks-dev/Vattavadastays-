-- Guests can read the ACTIVE add-ons and packages of a live property (to show them on the
-- guest page as information only; nothing is booked or paid through them).
--
-- Same visibility as rooms and room_rates (see 20261015000000_room_rates.sql): the property
-- must be in trial or active. Inactive items stay hidden. Writes are unchanged: owners and the
-- superadmin only (owners_manage_* policies).
--
-- Safe to run more than once.

drop policy if exists addons_public_read on public.addons;
create policy addons_public_read on public.addons
  for select to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.properties p
      where p.id = addons.property_id and p.subscription_status in ('trial', 'active')
    )
  );

drop policy if exists packages_public_read on public.packages;
create policy packages_public_read on public.packages
  for select to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1 from public.properties p
      where p.id = packages.property_id and p.subscription_status in ('trial', 'active')
    )
  );

grant select on public.addons to anon;
grant select on public.packages to anon;
