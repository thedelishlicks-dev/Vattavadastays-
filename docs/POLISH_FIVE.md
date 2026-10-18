# Polish pass — five changes (reference)

All five are deployed. This file records how each works, how it is tested, and
how to check it. Parked work is in `docs/PARKED_FEATURES.md`.

## 1. Seasonal / date-range room rates
- **Owner:** Rooms → edit a room → *Seasonal rates* → *Add seasonal rate* (name, first/last night on the calendar,
  fixed ₹/night or ±% of base, optionally "all rooms"). Saves immediately.
- **Rules** (`src/lib/roomRates.ts` and SQL `stay_room_price()` — keep identical): a period replaces the base price for the nights it
  covers (`end_date` = last night, inclusive); the Fri/Sat multiplier still applies on top; overlaps resolve room-specific →
  all-rooms, then later start, then newest.
- Prices go through `priceRoomStay()` everywhere: guest booking, guest room dialog, Add Booking, Edit Stay, Quote Builder.
- Existing bookings keep their stored price; a quote converted to a booking keeps the quoted price.

## 2. Link previews, robots, sitemap
- `/` on every host is rewritten to `api/og.ts`, which serves the app shell with the property's own title, description,
  photo, canonical and JSON-LD already in the HTML (for WhatsApp / Instagram / Facebook / Google crawlers).
- **Why the build renames `index.html` to `_shell.html`** (`scripts/post-build.mjs`): Vercel serves a real file before it
  consults rewrites, so with `index.html` present the rewrite for `/` never ran. If you ever add a file named
  `index.html` to the build output, previews silently stop working.
- Fail-safe: if the function fails it 307s to `/?_og=skip`, which the rewrite skips, so visitors still get the app.
- **Diagnostic:** open `https://<property>.stayidom.in/?_ogdebug=1` — shows each step (shell loaded, property found,
  tags injected). No secrets.
- `/robots.txt` and `/sitemap.xml` per host (`api/seo.ts`). `SeoTags.tsx` shares the builder `api/_lib/seo.ts`.
- WhatsApp builds the card on the **sender's phone** and caches per link; "Disable link previews" in WhatsApp → Privacy →
  Advanced stops it. To refresh an already-shared link add `?v=2`.

## 3. Server-side price and safe defaults for guest bookings
Triggers re-price every booking not made by the property's owner (`enforce_guest_booking_terms`,
`enforce_guest_group_terms`, `sync_guest_group_total`): price from the database, `pending`, unpaid, no advance/discount/agent/
commission, `source='direct'`, capped hold. Owner inserts, SQL editor, service role and cron are untouched.
Migration pre-flight refuses to install if a column it writes is missing.

## 4. Calendar sync (iCal) — PARKED
Built and tested, switched off with `CHANNEL_SYNC_ENABLED = false` in `src/lib/features.ts`. See `docs/PARKED_FEATURES.md`.

## 5. CI and database baseline
- `.github/workflows/ci.yml` runs on every pull request and push to `main` / `Dev`: build, type check, unit tests, behaviour
  checks, and a throw-away-Postgres job that applies the new migrations twice and runs `supabase/tests/migrations.test.sql`.
- Locally: `npm test`, `npm run typecheck` (run `npm run build` first on a fresh checkout), `npm run check`.
- `supabase/baseline/` is a snapshot of the live database (README there has the rebuild order). Re-export with
  `supabase/LIVE_DB_EXPORT.sql` (run Q1–Q7 one at a time) after any change made in the Supabase dashboard.
- Note: the committed `src/routeTree.gen.ts` is stale vs the routes; the build regenerates it.

## Quick regression checklist (after any pricing / booking change)
Guest booking total equals the dialog total and lands as *pending*, unpaid · seasonal rate shows "Includes … rates" ·
Add Booking, Edit Stay and quote → booking work · `/?_ogdebug=1` shows `ok: property tags injected` ·
a WhatsApp link shows the property card (test from a phone with previews enabled).
