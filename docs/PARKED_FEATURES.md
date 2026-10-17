# Parked features

## Channel sync (iCal with Booking.com / Airbnb / Agoda / MakeMyTrip)

**Status:** built, tested and deployed, but switched OFF in the app
(`CHANNEL_SYNC_ENABLED = false` in `src/lib/features.ts`).

**Why parked (Oct 2026):** current owners get bookings from Instagram and phone
enquiries, not from booking sites, so the button would only confuse them.

**Turn it on when** owners list on other sites too — expected for Munnar,
Alleppey and Varkala.

### What stays in place while parked
- Tables `room_ical_feeds` (empty) and `room_rates` (in use) — do not drop.
- Public feed `/api/ical?room=<room id>`: shows only "Reserved" dates, no guest data. Harmless; nothing links to it.
- `/api/ical-sync` (needs a signed-in owner), the pop-up (`ChannelSyncModal`), and the tests.

### To switch it on
1. Set `CHANNEL_SYNC_ENABLED = true` in `src/lib/features.ts`, deploy. The "Sync with other sites" button returns on the Calendar page.
2. Apply the own-link safeguard if not already in `main`: refuses importing a room's own link
   (`isOwnExportUrl` in `api/_lib/ical.ts`, checked in `api/ical-sync.ts` and `ChannelSyncModal.tsx`).
3. Turn on **background sync** (otherwise other sites' bookings only reach the guest site when an owner opens the app):
   - Vercel env vars: `ICAL_CRON_SECRET` (long random string) and `SUPABASE_SERVICE_ROLE_KEY`; redeploy.
   - Supabase → Database → Extensions → enable `pg_net`.
   - Run the `cron.schedule('ical-sync-all', '*/15 * * * *', …)` snippet at the bottom of
     `supabase/migrations/20261015000200_room_ical_feeds.sql` with the real secret and domain.
   - Stop with `select cron.unschedule('ical-sync-all');`
4. Test on one property first, as in `docs/POLISH_FIVE.md`: export link opens as a calendar; importing
   room A's link into a test room B blocks the nights; reopening them on A and tapping *Sync now* frees them.
5. Teach owners: paste our link into *Import calendar* on each site, and paste each site's link into *Bring in what other sites have sold*.

### Known limits
- Other sites poll every few hours; same-day bookings need a manual block on the other site.
- Repeating events in a feed are skipped.
