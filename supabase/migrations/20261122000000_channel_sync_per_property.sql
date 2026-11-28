-- Channel sync (iCal): per-property switch + database-level safeguards.
--
-- Why: the sync feature is built but parked (docs/PARKED_FEATURES.md). Instead of one
-- global on/off for every property, the platform admin switches it ON per property, only
-- for owners who really sell on Booking.com / Airbnb / Agoda / MakeMyTrip.
--
--  1. properties.channel_sync_enabled (default false). Only the platform admin changes it
--     (owners can edit their own row, but not this column).
--  2. An owner cannot save an import link for a property that is switched off (the app
--     hides the button, the sync endpoint refuses it, and now the database does too).
--  3. A room cannot import its OWN export link (…/api/ical?room=<this room>): it would
--     block itself and never free those nights. Same rule as api/_lib/ical.ts
--     isOwnExportUrl(); a link to a DIFFERENT room's feed is still allowed.
--
-- ADDITIVE and safe to run more than once. Existing feeds (the table is empty today) are
-- not touched. Rollback: supabase/rollbacks/20261122000000_channel_sync_per_property_rollback.sql.

-- ── 1. The switch ───────────────────────────────────────────────────────────
alter table public.properties add column if not exists channel_sync_enabled boolean not null default false;

create or replace function public.protect_channel_sync_switch()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.channel_sync_enabled is distinct from old.channel_sync_enabled
     and auth.uid() is not null
     and coalesce(auth.jwt() ->> 'email', '') <> 'thedelishlicks@gmail.com' then
    raise exception 'Only the platform admin can change "channel_sync_enabled" on a property' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_channel_sync_switch on public.properties;
create trigger trg_protect_channel_sync_switch
  before update on public.properties
  for each row execute function public.protect_channel_sync_switch();

-- ── 2. No import links for a property that is switched off ──────────────────
create or replace function public.room_ical_feeds_require_switch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.properties p where p.id = new.property_id and p.channel_sync_enabled
  ) then
    raise exception 'Syncing with other sites is not switched on for this property' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_room_ical_feeds_require_switch on public.room_ical_feeds;
create trigger trg_room_ical_feeds_require_switch
  before insert on public.room_ical_feeds
  for each row execute function public.room_ical_feeds_require_switch();

-- ── 3. A room may not import its own export link ────────────────────────────
create or replace function public.room_ical_feeds_refuse_own_link()
returns trigger language plpgsql set search_path = public as $$
declare
  linked text;
begin
  if new.url ~* '^(https|webcal)://[^/?#]+/api/ical(\.ics|\.ts)?/?\?' then
    linked := substring(lower(new.url) from '[?&]room=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})');
    if linked is not null and linked = lower(new.room_id::text) then
      raise exception 'That is this room''s own calendar link. Paste the link from the other site instead.' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_room_ical_feeds_refuse_own_link on public.room_ical_feeds;
create trigger trg_room_ical_feeds_refuse_own_link
  before insert or update of url, room_id on public.room_ical_feeds
  for each row execute function public.room_ical_feeds_refuse_own_link();
