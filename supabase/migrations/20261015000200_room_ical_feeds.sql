-- Channel sync (iCal) — IMPORT side.
--
-- EXPORT needs no table: /api/ical?room=<id> publishes a room's occupied
-- nights from the public `availability` table (no guest data).
--
-- IMPORT: an owner pastes the iCal link Booking.com / Airbnb / Agoda / MMT
-- gives them. /api/ical-sync fetches it and keeps `availability` rows
-- (is_available = false, note = 'ical:<feed id>:<name>') in step with it, so
-- the guest site, the owner calendar and the double-booking checks all see
-- those nights as taken. Only rows carrying that feed's own note are ever
-- removed by a sync — bookings and manual blocks are never touched.
--
-- The link itself can contain a secret token, so this table is owner-only
-- (no public read). Safe to run more than once.

create table if not exists public.room_ical_feeds (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id) on delete cascade,
  room_id        uuid not null references public.rooms(id) on delete cascade,
  name           text not null,
  url            text not null,
  created_at     timestamptz not null default now(),
  last_synced_at timestamptz,
  last_status    text,                 -- 'ok' | 'error'
  last_message   text,
  last_nights    integer,
  last_conflicts integer,
  constraint room_ical_feeds_name_len check (char_length(name) between 1 and 60),
  constraint room_ical_feeds_url_ok   check (url ~* '^(https|webcal)://' and char_length(url) <= 2000),
  constraint room_ical_feeds_status_ok check (last_status is null or last_status in ('ok', 'error'))
);

create index if not exists room_ical_feeds_property_idx on public.room_ical_feeds (property_id);
create index if not exists room_ical_feeds_room_idx     on public.room_ical_feeds (room_id);

create or replace function public.room_ical_feeds_room_matches_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.rooms r where r.id = new.room_id and r.property_id = new.property_id) then
    raise exception 'room does not belong to this property' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_room_ical_feeds_room_matches_property on public.room_ical_feeds;
create trigger trg_room_ical_feeds_room_matches_property
  before insert or update of room_id, property_id on public.room_ical_feeds
  for each row execute function public.room_ical_feeds_room_matches_property();

alter table public.room_ical_feeds enable row level security;

drop policy if exists room_ical_feeds_owner_all on public.room_ical_feeds;
create policy room_ical_feeds_owner_all on public.room_ical_feeds
  for all to authenticated
  using      (exists (select 1 from public.properties p where p.id = room_ical_feeds.property_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.properties p where p.id = room_ical_feeds.property_id and p.owner_id = (select auth.uid())));

revoke all on public.room_ical_feeds from anon;
grant select, insert, update, delete on public.room_ical_feeds to authenticated;

-- ── OPTIONAL: background sync every 15 minutes ──────────────────────────────
-- Without this, feeds sync when the owner opens the app (and on "Sync now"),
-- which can leave Booking.com bookings invisible to your guest site for hours.
-- You already use pg_cron. Needs the pg_net extension (Database → Extensions)
-- and two Vercel env vars: ICAL_CRON_SECRET (any long random string) and
-- SUPABASE_SERVICE_ROLE_KEY. Replace the two placeholders, then run:
--
--   select cron.schedule('ical-sync-all', '*/15 * * * *', $$
--     select net.http_post(
--       url     := 'https://stayidom.in/api/ical-sync',
--       headers := jsonb_build_object('Authorization', 'Bearer <ICAL_CRON_SECRET>', 'Content-Type', 'application/json'),
--       body    := '{"all": true}'::jsonb
--     );
--   $$);
--
-- Stop it with:  select cron.unschedule('ical-sync-all');
