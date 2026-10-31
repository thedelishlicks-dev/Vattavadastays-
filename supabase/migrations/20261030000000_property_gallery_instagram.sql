-- Property photo gallery and Instagram handle, shown on the guest page.
--
--   gallery_images    full-size photo URLs, in display order (at most 12). Each photo also has a
--                     small thumbnail stored next to it (see src/lib/gallery.ts), which is what
--                     the guest grid loads first.
--   instagram_handle  the handle only, no @ and no link ("hillview").
--
-- No new policy is needed: guests already read active properties (public_read_active_properties)
-- and owners already update their own (owners_update_property). Billing columns stay protected
-- by protect_property_billing_columns, which does not touch these two.
--
-- Safe to run more than once.

alter table public.properties add column if not exists gallery_images text[] not null default '{}';
alter table public.properties add column if not exists instagram_handle text;

alter table public.properties drop constraint if exists properties_gallery_max;
alter table public.properties add constraint properties_gallery_max
  check (cardinality(gallery_images) <= 12);

alter table public.properties drop constraint if exists properties_instagram_handle_ok;
alter table public.properties add constraint properties_instagram_handle_ok
  check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$');
