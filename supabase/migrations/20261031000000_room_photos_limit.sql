-- A room can show up to 6 photos on the guest page (the owner screen allows 6; this check
-- leaves a little headroom). rooms.images already exists as a list of photo URLs, in display order,
-- and the first one is the card photo. No policy change: owners already update their own rooms.
--
-- Safe to run more than once.

alter table public.rooms drop constraint if exists rooms_images_max;
alter table public.rooms add constraint rooms_images_max
  check (images is null or cardinality(images) <= 8);
