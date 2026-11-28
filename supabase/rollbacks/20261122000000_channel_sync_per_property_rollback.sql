-- Rollback for 20261122000000_channel_sync_per_property.sql.
-- Removes the three guards and the per-property switch. room_ical_feeds and its rows are
-- NOT touched. After this, only the global flag CHANNEL_SYNC_ENABLED in src/lib/features.ts
-- decides whether the feature shows (keep it false), and api/ical-sync.ts would refuse every
-- property (it reads channel_sync_enabled) — so roll the app back first.

begin;
drop trigger if exists trg_room_ical_feeds_refuse_own_link on public.room_ical_feeds;
drop function if exists public.room_ical_feeds_refuse_own_link();
drop trigger if exists trg_room_ical_feeds_require_switch on public.room_ical_feeds;
drop function if exists public.room_ical_feeds_require_switch();
drop trigger if exists trg_protect_channel_sync_switch on public.properties;
drop function if exists public.protect_channel_sync_switch();
alter table public.properties drop column if exists channel_sync_enabled;
commit;
