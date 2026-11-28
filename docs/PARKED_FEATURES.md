# Channel sync (iCal with Booking.com / Airbnb / Agoda / MakeMyTrip)

**Status:** built, tested, deployed and **switched on per property** (default OFF for every property).
Nobody sees the button until the platform admin ticks it for that property.

**Why it is off by default (Oct 2026):** current owners get bookings from Instagram and phone enquiries,
not from booking sites, so the button would only confuse them.

**Turn it on for a property when** its owner also sells on other sites — expected for Munnar, Alleppey, Varkala.

## How it is made hard to get wrong

| Safeguard                                                                                                                                                                                                                                        | Where                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Per-property switch `properties.channel_sync_enabled` (default false). Only the platform admin can change it; owners cannot.                                                                                                                     | DB trigger `protect_channel_sync_switch`, Superadmin → Manage                                                    |
| Master kill switch `CHANNEL_SYNC_ENABLED` in `src/lib/features.ts` (`false` hides it everywhere).                                                                                                                                                | App                                                                                                              |
| A switched-off property cannot save links, and the sync endpoint refuses it (owner gets 403; the scheduler skips it).                                                                                                                            | DB trigger `room_ical_feeds_require_switch`, `api/ical-sync.ts`                                                  |
| A room cannot import its **own** export link (it would block itself forever). A different room's link is allowed. Existing nights from such a link are released.                                                                                 | `isOwnExportUrl` in `api/_lib/ical.ts` → modal, `api/ical-sync.ts`, DB trigger `room_ical_feeds_refuse_own_link` |
| No echo loops: the plain export link carries only nights **we** own (our bookings + manual blocks), never nights imported from other sites. The per-site link `…&for=<feed id>` adds the room's _other_ sites' nights but never that site's own. | `exportNights` in `api/_lib/ical.ts`, `api/ical.ts`                                                              |
| A flaky response never frees nights: broken link, HTML page, timeout → error, nothing changes. A calendar that suddenly comes back **empty** keeps the blocks once; the next empty read (15 min later with cron) releases them.                  | `api/ical-sync.ts`                                                                                               |
| Bookings and manual blocks are never overwritten; overlaps with our own bookings are reported to the owner.                                                                                                                                      | `api/ical-sync.ts`                                                                                               |

## What stays in place

- Tables `room_ical_feeds` and `room_rates` — do not drop.
- Public feed `/api/ical?room=<room id>` — only "Reserved" dates, no guest data.
- `/api/ical-sync` (owner sign-in, or the scheduler secret), the pop-up (`ChannelSyncModal`), and the tests
  (`tests/api/ical*.test.ts`, `supabase/tests/channel_sync.test.sql`).

## One-time setup (do once, before the first property)

1. **Database first:** run `supabase/migrations/20261122000000_channel_sync_per_property.sql` in the Supabase SQL editor
   (safe to run twice). Then deploy the app. (If the app is deployed first, the sync endpoint answers
   "Could not check your property settings" until the migration is run; nothing breaks for owners.)
2. **Background sync** (otherwise other sites' bookings only reach the guest site when an owner opens the app):
   - Vercel env vars: `ICAL_CRON_SECRET` (long random string) and `SUPABASE_SERVICE_ROLE_KEY`; redeploy.
   - Supabase → Database → Extensions → enable `pg_net`.
   - Run the `cron.schedule('ical-sync-all', '*/15 * * * *', …)` snippet at the bottom of
     `supabase/migrations/20261015000200_room_ical_feeds.sql` with the real secret and domain.
   - The scheduler only syncs properties that are switched on, so it is safe to schedule it now.
   - Stop with `select cron.unschedule('ical-sync-all');`

## Per property: turning it on

1. **Superadmin → Manage on the property → tick "Sync with other sites (Booking.com, Airbnb…)".**
   The owner now sees **Calendar → Sync with other sites** (after a refresh).
2. **Pilot on one room first.** With the property switched on:
   - Open the pop-up, pick a room; the step 1 link opens as a calendar in a browser and shows only "Reserved".
   - Paste that room's _own_ link into step 2 → it must be **refused** ("that is this room's own link").
   - Paste room A's link into a test room B's step 2 → A's booked nights block on B. Reopen them on A, tap _Sync now_ → B frees them.
3. **Owner set-up on each site** (teach them, 5 minutes per room):
   1. In the pop-up, pick the room and copy the step 2 calendar link from **Booking.com / Airbnb / Agoda / MakeMyTrip**
      (_Calendar → Export / Sync calendar_) into _Add & sync_.
   2. Then give **that site** the link shown **under it** ("Give Booking.com this link…") into its _Import calendar_.
      Use the per-site link, not the one in step 1: it also closes nights sold on the owner's other sites.
   3. Repeat for every room that is also listed there.
4. Check **Calendar**: nights from other sites show "Synced from <site>". A red/amber line in the pop-up means a link needs attention.

## Switching off

- One property: untick it in Superadmin. Its links and blocked nights stay; nothing syncs; the button disappears.
- Everything: set `CHANNEL_SYNC_ENABLED = false` in `src/lib/features.ts`, deploy; and `select cron.unschedule('ical-sync-all');`.
- Removing the database objects: `supabase/rollbacks/20261122000000_channel_sync_per_property_rollback.sql` (roll the app back first).

## Known limits

- Other sites poll every few hours; same-day bookings need a manual block on the other site too.
- After a cancellation, a night can stay blocked for a few polling cycles while the sites catch up with each other.
  It frees by itself; the plain link never echoes imported nights, which is what prevents a permanent block.
- Repeating events in a feed are skipped (the owner sees a count).
- iCal carries dates only: no guest names, prices or payments come across.
