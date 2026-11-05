-- "My property is listed on Google Maps": when on, the Directions links find the property by its
-- name and area (so guests land on its Google listing) instead of dropping a pin at its coordinates.
-- Off by default, so every existing property keeps using its pin. Owners set it in Settings → Location
-- and can test the link there. No policy change: guests already read active properties and owners
-- already update their own.
--
-- Safe to run more than once.

alter table public.properties add column if not exists directions_by_name boolean not null default false;
