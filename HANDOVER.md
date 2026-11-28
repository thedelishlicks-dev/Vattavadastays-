# stayidom.in — Handover v11.0

**Date:** 25 Nov 2026 (v10.4 was 15 Nov 2026)
**Code baseline:** repository HEAD `43f5736` plus the 25 Nov pilot-readiness changes (§9, last rows). On 25 Nov the lint, build, typecheck, test (629), `npm run check` and database suites all passed (§12). v11.0 is a **pilot-readiness refresh**: it adds §13–§17 and corrects §2, §4, §7, §9–§12, which were stale for Property Score, Revenue Intelligence, Money Intelligence, Guest identity, source editing, Expenses and Education. It describes what exists; nothing here is a plan.
**Supersedes:** v10.4 (15 Nov 2026), v10.3 (8 Nov 2026), v10.2 (3 Nov 2026), v10.1 (29 Oct 2026), v10 (25 Oct 2026) and v9.7 (11–12 Oct 2026). The v8 archive and v9.x change history are in git history; this document describes the app **as the code is now**. The guest page has its own reference: **`docs/GUEST_PAGE.md`**.

> **Read order:** §1 → §3 (rules) → §4 (admin map) → §13–§17 (current product, auth, data/RLS, money definitions, limitations) → §10 (known issues) → §11 (what's left). Read `AGENTS.md` before writing code. Working on the guest page? Read `docs/GUEST_PAGE.md` too.

---

## 1. What this is

stayidom.in is a commission-free booking and property-management platform for homestays in Kerala's hills, piloted in **Vattavada** (weak Jio/BSNL signal — the connectivity stress test).

| Surface | URL | Who | Code entry |
|---|---|---|---|
| Marketing landing page | `stayidom.in` (root) | Prospective owners | `src/components/LandingPage.tsx` |
| Guest booking page | `{subdomain}.stayidom.in` | Guests | `GuestPage` in `src/routes/index.tsx` |
| Owner admin | `/admin/*` | Property owners | `src/admin/AdminLayout.tsx`, `src/routes/admin.*.tsx` |
| Owner Help | `/help` (public, no login, `noindex`) | Owners, and prospects sent the link | `src/routes/help.tsx`, `src/content/ownerGuide.ts`, `public/help/*.webp` — see `docs/OWNER_HELP.md` |
| Superadmin | `/superadmin` | Platform operator | `src/routes/superadmin*.tsx` |

Owners collect money directly (UPI / bank / cash). stayidom never touches payments.

---

## 2. Orientation

**Stack:** Vite 7 + React 19 + TypeScript + TanStack Router **1.166.7 (pinned)** + TanStack Query 5 + Supabase (`supabase-js` 2) + Tailwind CSS 4.

**Hosting:** Vercel. The app is a static SPA, plus **Vercel Edge Functions in `api/`** (see below). `vercel.json` rewrites `/` to `api/og`, `/robots.txt` and `/sitemap.xml` to `api/seo`, and everything else (except `/api/*` and `/assets/*`) to `/_shell.html`. `scripts/post-build.mjs` renames `dist/index.html` to `_shell.html` on purpose — see `docs/POLISH_FIVE.md` §2 before changing it.

**Server-side code in the repo (correction to older docs):**
- `api/og.ts` — link-preview HTML per property (WhatsApp / Instagram / Google).
- `api/seo.ts` + `api/_lib/seo.ts` — per-host `robots.txt` and `sitemap.xml`.
- `api/manifest.ts` — dynamic web manifest.
- `api/ical.ts` — public export of a room's occupied nights ("Reserved" only, no guest data).
- `api/ical-sync.ts` + `api/_lib/ical.ts` — iCal import (owner-triggered; optional cron). Parked, see §8.
- `api/weather.ts` + `api/_lib/forecast.ts` — today's temperature range for the guest hero (MET Norway; rule 33).
- `api/directions.ts` + `api/_lib/directions.ts` — short link that redirects to Google directions from the guest's location (rule 32).
- `supabase/functions/invite-owner/index.ts` — Supabase Edge Function (Deno) for superadmin owner invites. Moved here from `src/` in Oct 2026.
- No `createServerFn`, no SSR, no `@supabase/ssr`. Business logic still runs in the browser or in Postgres triggers/RPCs.

**Env vars:**
- Vercel / local `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PROPERTY_SUBDOMAIN` (dev fallback). `VITE_SUPERADMIN_EMAIL` was removed; it is no longer read.
- Edge functions only: `ICAL_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (optional, for background iCal sync), `WEATHER_USER_AGENT` (optional; the contact sent to MET Norway, rule 33).
- The superadmin email lives in `src/lib/superadmin.ts` (UI), `supabase/functions/invite-owner/index.ts` and the database policies/triggers (the last two are the security boundary). `src/lib/superadmin.test.ts` fails if they disagree. See `docs/superadmin-authorization.md`, §10 item 6.

**Commands:** `npm run dev` · `npm run build` (= `vite build` + `post-build`) · `npm run typecheck` (run **after** build) · `npm test` · `npm run check` · `npm run lint`.

**Tests and CI:** `.github/workflows/ci.yml` runs on every PR and push to `main`/`Dev`: `npm ci`, build, typecheck, `npm run lint`, `npm test` (`src/lib/*.test.ts`, `tests/api/*.test.ts`), `npm run check` (`scripts/*.check.ts`), and a throw-away Postgres job that applies the migrations twice and runs `supabase/tests/` (`migrations`, `seasons`, `guests`; locally: `PGHOST=localhost PGUSER=postgres PGPASSWORD=… bash supabase/tests/run.sh`). `npm run lint` currently reports 0 errors and 15 warnings (hook dependency arrays, fast-refresh). The build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set (any placeholder values work for a local build). Real-device checks are still manual (§12).

**Generated file:** `src/routeTree.gen.ts` is regenerated by every build. The committed copy is stale. Never hand-edit it. A type-check before a build reports false route errors.

**How changes are made:** Claude chat produces files; the owner pastes them into GitHub's web editor (often on an iPad), commits to a branch, Vercel builds. That is why §3 has authoring rules.

---

## 3. Rules — do not violate

**Stack**
- Never use `createServerFn`, `@tanstack/react-start`, `@supabase/ssr`; never add `shellComponent`/`HeadContent`/`Scripts` to `__root.tsx`; never upgrade `@tanstack/react-router`.
- No Google Maps JS SDK (deep links only, built by `src/lib/location.ts`; see rule 32). No video embeds.
- Auth is client-side. `beforeLoad` is used only to redirect old URLs, never for auth.
- Read `?property=` from `window.location.search`, not TanStack `useSearch`. In-app links under `/admin` must carry it forward.

**Authoring (paste-into-GitHub workflow)**
- Every JSX `<a …>` opening tag stays on **one line**.

**Architecture**
1. **One thing, one home (§5).** Don't add a second editor for the same data.
2. **All writes to `properties.shared_amenities` go through `src/lib/propertyConfig.ts`** (`updateSharedAmenities` / `fetchSharedAmenities` / `withSentinel`). Never `update({ shared_amenities })` from cached data.
3. **Room price fields live in `src/components/RoomPricingFields.tsx`.** Seasons (room prices and add-on use) live only in `SeasonsPanel.tsx` (Rooms & Pricing → Seasons); `RoomSeasonPrices.tsx` shows a room's season prices read-only. Don't create price inputs elsewhere.
4. **One booking-creation component:** `src/components/AddBookingModal.tsx`.
5. **One price calculator:** `priceRoomStay()` in `src/lib/quoteBuilder.ts`. It reads room rates via `src/lib/roomRates.ts` (`pickRate`).
6. **Navigation is data:** `src/admin/navConfig.ts`.
7. **Never claim a feature the app can't back up** on the landing page or in checklist copy.
8. **Every modal must stay reachable on a phone/iPad:** card = `flex flex-col max-h-[calc(100dvh-2rem)]`, body = `overflow-y-auto`, footer outside the scrolling part. Use `dvh`, not `vh`.
9. **Owner Calendar labels come only from `src/lib/calendarState.ts`.**
10. **Guest-side code must not read the `bookings` table.** Guests (role `anon`) have no SELECT on it, so the query silently returns nothing. Guests get booked dates from `room_booked_ranges(p_room_ids, p_from, p_to)` (migration `20261025000000_room_booked_range.sql`), which returns only id, room, check-in and check-out, and from the public `availability` table. `getBlockedDatesForRooms` and `getConflictingDates` in `src/lib/bookingAvailability.ts` use the function. Owner-only screens may still read `bookings` directly (e.g. `releaseDatesIfUnblocked`).
11. **`availability` is a mirror kept in sync by the database,** not by the browser. Trigger `trg_mark_booking_nights` marks nights for every non-cancelled booking. Guests can't write `availability`.
12. **All money maths lives in `src/lib/balance.ts`** (`computeBalance`, `chargesSum`, `advanceAmount`, `fractionOf`, `paymentDueAmount`). Never write `total + extras - discount - advance` or `Math.max(0, …)` in a screen: the clamp hides overpayment. Show `refundDue` when > 0.
13. **Every guest tracking link carries a secret token and the property id:** `guestTrackingUrl(origin, trackingToken, propertyId)` builds `/booking-status?t=<token>&property=<id>`. The browser generates the token for each booking submission (`src/lib/trackingToken.ts`), and every room in a group shares the group's token. Never build a link from a phone number.
14. **"Paid" is derived, never trusted from `bookings.is_paid`.** Use `computeBalance(...).isPaid`.
15. **Wait for the first fetch, not just `isLoading`.** Pages must also check `isFetched` once `property?.id` exists. On a query that uses `keepPreviousData` (the history windows, rule 35) gate skeletons on `isPending` instead: `isFetched` stays true across a key change and the page flashes empty.
16. **Modal sizing:** `dvh`. A panel with no height cap needs `max-h-[92dvh] overflow-y-auto overscroll-contain`; flex-col sheets need `min-h-0` on the scrolling body.
17. **Security:** never expose a `SECURITY DEFINER` function to `anon` unless it validates the caller itself; run `docs/DB_CHECKS.sql` query 14 (SECURITY DEFINER functions the `anon` role can execute) after any DB change that adds a function (the older `01_audit_queries.sql` named here is not in the repo); image uploads are scoped to the `<property_id>/` folder; the superadmin email must never own a property (trigger); owners must not edit billing columns (trigger).
18. **Superadmin logic lives in `src/lib/onboarding.ts`** (statuses, renewal, setup checklist, filters, validation, WhatsApp numbers/messages). Add a test when adding a rule.
19. **Guest bookings are priced by the database.** BEFORE INSERT triggers (`enforce_guest_booking_terms`, `enforce_guest_group_terms`, `sync_guest_group_total`) recompute price with `stay_room_price()` for every insert not made by the property's owner, and force `pending`, unpaid, `source='direct'`, a capped hold. Since migration `20261101000000` the same trigger also refuses a guest booking above the room's guest limit (rule 29). `stay_room_price()` (SQL) and `priceRoomStay()` (TS) must stay identical. `scripts/pricing.check.ts` and `supabase/tests/` check this.
20. **Room rate rules are identical in two places:** `src/lib/roomRates.ts` `pickRate` and SQL `stay_room_price()`. Overlap order: room-specific beats all-rooms, then later start, then newest created.
21. **iCal sync only deletes rows carrying its own feed's note** (`ical:<feed id>:…`). A failed or non-iCal response is an error, never "calendar is empty". Bookings and manual blocks are never touched.
22. **Parked features are switched off with flags, not deleted.** Channel sync: master `CHANNEL_SYNC_ENABLED` in `src/lib/features.ts` plus the per-property `properties.channel_sync_enabled` (default false, platform admin only). Don't remove the code or the `room_ical_feeds` table.
23. **Sentinel keys** in `shared_amenities`: filter `__` entries before showing tags to guests (§7).
24. **Stay dates use one picker.** Every stay-date picker uses `RoomAvailabilityCalendar` (availability-aware, same as Add Booking). A plain `<input type="date">` shows no availability, which is why Edit Stay conflicts (§10 item 21).
25. **Guests see their booking through the token, never the table.** `useGuestBookingStatus` polls `lookup_booking_by_token` every 60 s; `src/lib/guestBookingStatus.ts` turns the result into the card text. The confirmation snapshot in `localStorage` (`stayidom:last-booking`, 24 h, `bookingConfirmation.ts`) is only a fallback for the first view. A new booking shows **"Request sent — to be confirmed by the owner"** until the owner confirms.
26. **Every `wa.me` / `tel:` link builds its number with `waDigits()` from `src/lib/phone.ts`.** Never `phone.replace(/\D/g, "")`: a number saved as `98765 43210` becomes `wa.me/9876543210`, which opens no chat. Settings saves owner numbers as `+91 XXXXXXXXXX` when they are valid Indian mobiles.
27. **A guest booking keeps the same ids and token across retries.** `src/lib/bookingSubmission.ts` holds them for an unchanged request; on a retry `useCreateBooking` looks the token up first and, if the booking was already saved (reply lost on weak signal), goes on to the confirmation instead of inserting again. Don't generate ids inside `mutationFn` any more.
28. **Confirming by money uses `meetsConfirmationAdvance()`** (`balance.ts`, `ADVANCE_FRACTION` = 0.25 of the net total). Recording a payment on a *pending* booking confirms it only once the cumulative advance reaches that. A smaller part payment stays pending; the owner can still confirm by hand.
29. **One guest limit per room.** `maxGuestsFor(included, maxOccupancy)` in `src/lib/guestCount.ts` is the only definition: the owner's `rooms.max_occupancy`, or `max_guests + 4` when empty. `max_guests` is the guests *included* in the nightly price, not a cap. The steppers, `partyAllocation.ts`, `useCreateBooking` and the database check in `enforce_guest_booking_terms` all use it; change them together. Owner-created bookings are exempt.
30. **Group booking logic lives in `src/lib/partyAllocation.ts`** (pure, tested): `allocateGuests` shares guests over the chosen rooms (an adult in each room, included places first, then the cheapest extra guest; rooms set by hand are pinned) and `suggestOptions` prices every feasible set of rooms for real (Best value / More space). On the guest page the booking lines are *derived* from `selectedIds` + `party` + `pinned` (`GuestPage`); `BookingDetails` and `buildBookingDetails` live in `src/lib/roomSelection.ts`. Never price options from `base_price`, and never keep a second copy of the chosen rooms in state.
31. **Guest photos stay light.** Property gallery: up to 12 photos, each a ≤ 140 KB photo plus a ≤ 30 KB thumbnail stored beside it as `…-t.webp` (`thumbUrl()`, `src/lib/gallery.ts`); the grid loads thumbnails lazily (the large first tile uses its full photo), the other full photos only when opened. Room photos: up to 6 per room (800 px, no thumbnail); the card loads only the first. One shared viewer, `PhotoViewer.tsx`. Instagram is a link-out button (`properties.instagram_handle`, `normalizeInstagram` / `instagramUrl`). **No reels or other embeds** (see Stack rules).
32. **A map location is a pair.** Every maps link and the Settings check go through `src/lib/location.ts` (`hasCoordinates`, `directionsUrl`, `validateCoordinates`). One coordinate alone is never used or saved; the directions SMS falls back to a Google Maps search for the name and area. Never write `lat && lng` (0 is a valid value). **Links that go into message text (SMS, WhatsApp) must be the short link** `directionsShortLink()` → `/api/directions`, which has no `&`, comma, `#`, `%` or space: the Android SMS app ends a link at a comma, and a Xiaomi SMS app ends the whole message at the first `&` (found 4–5 Nov 2026). The server route redirects to Google's directions link with **no `origin`**, so the route starts where the guest stands. Buttons (hrefs) use `directionsUrl()` directly. `api/_lib/directions.ts` and `src/lib/location.ts` build the same link; `tests/api/directions.test.ts` keeps them identical. SMS text goes through `smsLink()` (`src/lib/sms.ts`), which cleans `&` and `#` from the body.
33. **Weather only through `/api/weather`.** MET Norway Locationforecast: free, CC BY 4.0, commercial use allowed **with credit**, so the footer shows "Weather data from MET Norway" whenever a temperature is shown. The server route sets the identifying User-Agent, rounds coordinates, caches for an hour; the browser never calls the provider. Don't swap in a service that is non-commercial only (the free Open-Meteo tier was rejected for this). Date and time are shown in India time (`liveInfo.ts`).
34. **Packages and add-ons are information only for guests.** Active items are readable by guests (policies `addons_public_read`, `packages_public_read`) and listed in `Packages.tsx`; the guest ticks items and sends one WhatsApp enquiry (`catalogEnquiryLink`). Nothing is booked or charged online; the owner adds the extras (`CatalogExtrasPicker`).
35. **History windows must never hide unsettled money.** Bookings, Payments and Agents load stays from the last 6 months by check-in (`src/lib/historyWindow.ts`, `useHistoryWindow`, `HistoryWindowBar`: "Load 6 more months" / "Load all history"). Dates are local-date strings, never `toISOString()`. Older rows that still matter come back through `alsoKeep` (`KEEP_UNPAID_*`, `KEEP_OPEN_*`, `KEEP_OWED_COMMISSION_*` in `useBookings.ts`); the booking keep-rules require `group_id` null so group members are never orphaned. Bookings by month loads back via `windowStartForMonth` and uses `keepPrevious`; a deep link to an older booking or group fetches that one row (`openOlderBooking/openOlderGroup`). Agents delete preview and CSV export fetch everything (`fetchAgentRows`) when more history exists. Stats say "since …" except Outstanding (all loaded).
36. **A failed load is never shown as "nothing here".** Use `LoadFailed` (`src/components/LoadFailed.tsx`, with Try again) for a failed property, bookings, groups, quotes or guest-page query; PGRST116 means "no property linked / not found". Every query error is logged through `QueryCache.onError` (`queryClient.ts`, source `"query"`, visible in `/superadmin` → Errors).
37. **Owner-side pricing waits for the seasonal rates.** Add booking, Quote builder and Edit Stay stay disabled until `useRoomRates` succeeds (`RatesNotice`: "Checking seasonal prices…" / "Couldn't load…" + Try again), so a total is never computed at base rates by mistake. Guest bookings are still re-priced by the DB trigger (rule 19).
38. **The admin layout must not remount on a tab switch.** `__root.tsx` keys the page transition by `"admin"` for every `/admin/*` path (`transitionKey`). Owner links to Bookings use `<Link to="/admin/bookings" search=…>`, never a plain `<a href>` (full reload). `/admin/login` only redirects to `/login`.
39. **Fonts and viewport height.** `index.html` loads only Fraunces + Inter, non-blocking (`media="print"` swap). The landing page injects Playfair Display and Noto Sans Malayalam itself (`LandingPage.tsx`). Full-height heroes use `svh`, not `vh`.

---

## 4. Admin app map

Seven sections (`src/admin/navConfig.ts`); tabs appear under the header when a section has 2+ tabs (`SectionTabs.tsx`).

| Section | Group | Tabs → route | Notes |
|---|---|---|---|
| **Home** | Daily | Home → `/admin/dashboard` | Property Score card, up to 3 current Opportunities, Business Snapshot (this vs last month), first-run checklist, quick actions, WhatsApp reminder picker (last month onward). See §13 |
| **Calendar** | Daily | `/admin/calendar` | **All rooms** (default with 2+ rooms): one dot per room per day + a day panel under the grid + a Today strip; many rooms (7+) show `N free` and a bar, with a drop-down room picker. **Single room**: each stay is one bar with the guest's name. Block dates; "Sync with other sites" **hidden** (flag off). See `docs/CALENDAR_UI.md` |
| **Bookings** | Daily | Bookings `/admin/bookings` · Quotes `/admin/quotes` | |
| **Money** | Daily | Overview `/admin/money` · Monthly report `/admin/report` · Payments `/admin/payments` · Agents & Commissions `/admin/agents` · Expenses `/admin/expenses` | Overview opens first. Agent delete also clears that agent's commission records (migration `20261020…`). Definitions: §16 |
| **Rooms & Pricing** | Setup | `/admin/rooms` | Room editor includes **Seasonal rates** |
| **Property** | Setup | Settings · Amenities · Meals · Add-ons · Policies | Add-ons holds Seasons (add-on/package pricing) |
| **Education** | Learn | `/admin/education` (lessons at `/admin/education/<slug>`) | Business-improvement lessons, not app help. See §13 |

- **Mobile bottom bar:** Home, Calendar, Bookings, Money, More (`BOTTOM_NAV` in `AdminLayout.tsx`).
- **Retired URLs (redirect, keep `?property=`):** `/admin/pricing` → `/admin/rooms`; `/admin/commissions` → `/admin/agents`.
- **Not in the nav, still routed:** `/admin` index, `/admin/login`, `/superadmin`, `/login`, `/reset-password`, `/booking-status` (guest tracking: token links, plus legacy `?phone=` links until the 30-day revoke). `/setup` and `/test-booking` were removed in Oct 2026.
- **Add a page:** create `src/routes/admin.<name>.tsx`, then add a tab or section in `navConfig.ts`.
- **Help:** a **Help** item sits above Log out in the sidebar and the mobile More menu (`AdminLayout.tsx`). It opens `/help` in a **new tab/sheet** (`target="_blank"`). `/help` is outside the `/admin` PWA scope on purpose, so on a home-screen app it opens over the app instead of replacing the screen. "?" links in Settings (pending hold) and the room editor (Seasonal rates) deep-link to `/help#setup-settings` and `/help#seasonal-rates`.

---

## 5. One thing, one home

| Data / action | Edited in | Notes |
|---|---|---|
| Room name, type, bed, guests included, **most guests allowed**, room amenities | Rooms & Pricing → room editor | Most guests allowed = `rooms.max_occupancy` (rule 29) |
| **Room photos** (up to 6; first = card photo) | Rooms & Pricing → room editor | `RoomPhotosManager`; saved as each photo uploads |
| Room base prices (base, extra guest, weekend multiplier) | Rooms & Pricing → tap the price block | `RoomPricingFields` |
| **Seasons** (name, dates, repeats yearly, priority) with **Room prices** (fixed ₹ or ±% of base; all rooms or one room) and **Add-ons & packages** use | Rooms & Pricing → Seasons (top) | `SeasonsPanel`, tables `price_seasons` + `season_room_rules` |
| **Per-add-on season prices** (exact ₹ per item per season) | Property → Add-ons → each item | `season_prices` on the item's variants |
| Add-ons & packages | Property → Add-ons | Power the Quote Builder |
| Shared amenities (tags) | Property → Amenities | Preserves `__` sentinels |
| Meals (informational) | Property → Meals | `__meals:` |
| Check-in/out, cancellation, house rules | Property → Policies | `__cancel:` `__rules:`. Shown to guests (booking form, confirmation, tracking page, invoice) |
| UPI ID + payment methods | Property → Settings → Payment setup | `__upi:` `__pmethods:` |
| Branding, owner info, location, pending-hold hours | Property → Settings | `__theme:` |
| Block / unblock dates | `BlockDatesModal` on Home and Calendar | |
| Create a booking | `AddBookingModal` on Home, Bookings, Quotes→convert | Extra charges supported |
| Extras on a booking (free-text or **from the add-on / package catalog**) | `AddBookingModal` and the booking's Extras tab | `CatalogExtrasPicker`, `catalogExtras.ts`. Same prices as the Quote Builder (`priceLine`); stored as `booking_charges` rows; a **snapshot** at the dates and guest count when added (does not reprice if the stay changes) |
| Record a payment | Bookings → booking → Record payment | Confirms a pending booking at ≥ 25 % (rule 28) |
| Tell the guest a booking is confirmed | Pop-up after any confirm (`SendConfirmationPrompt`) | Opens a `wa.me` link the owner taps to send; guest tracking link inside |
| Mark fully paid / correct collected amount | Money → Payments (`PaymentActionModal`) | |
| Agents, commission owed / paid / CSV | Money → Agents & Commissions | |
| **Property gallery** (up to 12) and **Instagram handle** | Property → Settings → Photos | `GalleryManager`, `InstagramField`; saved at once, not with the Save button |
| Location (latitude + longitude) | Property → Settings → Location | Both or neither (rule 32) |
| "My property is listed on Google Maps" + **Test directions link** | Property → Settings → Location | `properties.directions_by_name`; saved at once. Off = route to the pin; on = Google finds the listing by name and area |

---

## 6. Domain rules

**Money.** `advance_amount` = cumulative amount received; `is_paid` must agree with it. Gross = `total_amount` + charges − discount. Balance = gross − `advance_amount`. "Mark fully paid" records the remaining balance as a payment. "Correct collected amount" sets `advance_amount` directly. A stay shortened after payment shows **Refund due** (not hidden). Discount and advance are **not** auto-adjusted when a stay changes; the owner edits them by hand.

**Commission.** Stored per booking, or once on the `booking_groups` row for multi-room agent bookings. Cancelled bookings never count as owed. Owed = all-time unpaid. Editing a stay scales a percentage agent's commission by the new/old room rate, unless already paid.

**Pricing (guest and owner paths alike).** Per night: base price, replaced by the matching **season room price** for that night (or, on a property not yet switched, the matching **seasonal rate**), then × `weekend_multiplier` on Fri and Sat nights, plus extra-guest charge × nights. Season overlaps: higher priority, then the shorter window; inside a season a one-room price beats an all-rooms price. A season with no room price never changes room prices. Guest bookings are re-priced by the database (§3 rule 19), so a browser can't submit a cheap total. Owner bookings and quote conversions keep the price the owner set.

**Owner Calendar states** (`src/lib/calendarState.ts`, pure and tested): every room/date is **Open · Booked · Pending · Check-out · Blocked**. A booked night is Booked (Pending if unconfirmed). An unavailable row on a booking's check-out day is Check-out. Unavailable with no booking behind it is Blocked. All-rooms view shows `N free` / **Full** / **Blocked**. Month window uses local date parts (never `toISOString()`). If bookings can't be loaded, the page shows a warning banner.

**Availability and conflicts.** Booking inserts and date changes mark nights in `availability` via `trg_mark_booking_nights`. Freeing happens on cancellation from any status (`free_nights_on_any_cancel`), on the status trigger, and on the 15-minute job `expire_stale_pending_bookings()` (pending holds last `pending_hold_hours`, default 24). A DB exclusion constraint `bookings_no_overlap` (migration `20261008…`, in the 16 Oct baseline) blocks overlapping active stays; the app maps SQLSTATE 23P01 to "Those dates were just booked for this room." Same-day turnover is allowed.

---

**Guest booking journey (as built, 29 Oct 2026).** Guest submits → booking is `pending` with a 24 h hold (`pending_hold_hours`) → the owner's WhatsApp opens with the request (a `wa.me` link, not an API: the guest must tap Send) → the guest card says "Request sent" and follows the status live → the owner confirms (or records ≥ 25 %) → the owner is prompted to send the confirmation on WhatsApp → the card turns "Confirmed". The cron cancels unconfirmed holds silently and frees the dates.

**Guest booking flow on the page (as built, 3 Nov 2026).** Three steps after the property details and photos: (1) dates and guests, (2) rooms (only the free ones, one Add button each, a bottom bar with the running total and "x of y guests placed"), (3) details and send. Guests state the party first and the rooms are filled automatically; a group no single room covers sees **Best value** and **More space** with real totals. Changing dates keeps the chosen rooms and re-prices them. Full description: `docs/GUEST_PAGE.md`.

---

## 7. Data notes

Full schema, triggers, RPCs and RLS: `supabase/baseline/` (snapshot of the live DB on 16 Oct 2026; `README.md` there gives the rebuild order). Migrations are in `supabase/migrations/` and are run by hand in the Supabase SQL editor, in filename order. The duplicate spaced copy of `20261020000000_delete_agent_with_commissions.sql` was deleted in Oct 2026.

`properties.shared_amenities` is `text[]` holding real amenity tags **and** `__prefix:` entries:

| Prefix | Stores | Written by |
|---|---|---|
| `__meals:` | JSON `MealsConfig` | Meals |
| `__cancel:` / `__rules:` | Cancellation text / house rules | Policies |
| `__upi:` / `__pmethods:` | UPI ID / JSON array of methods | Settings → Payment setup |
| `__theme:` | Theme choice | Settings |

Rules: filter `__` entries before showing tags to guests; value = `encodeURIComponent(…)`; write only via `propertyConfig.ts`.

**Columns and policies added since the 16 Oct baseline** (migrations are run by hand; the repo can't tell which are applied; check queries are in `docs/GUEST_PAGE.md` §9):

| Migration | Adds |
|---|---|
| `20261029000000_public_read_catalog.sql` | Guests can read **active** add-ons and packages of a live property (`addons_public_read`, `packages_public_read`) |
| `20261030000000_property_gallery_instagram.sql` | `properties.gallery_images text[]` (max 12), `properties.instagram_handle` (handle only) |
| `20261031000000_room_photos_limit.sql` | `rooms.images` at most 8 photos |
| `20261101000000_room_max_occupancy.sql` | `rooms.max_occupancy` (null = `max_guests + 4`) and the guest-limit check in `enforce_guest_booking_terms` |
| `20261104000000_directions_by_name.sql` | `properties.directions_by_name boolean default false` |
| `20261119000000_expenses.sql` | `expenses` table (property-scoped, RLS: owner of the property + superadmin, no `anon`) |
| `20261119000100_booking_source_detail.sql` | Nullable `booking_source_detail` (≤ 40 chars) on `bookings` and `booking_groups`. Guest bookings never set it |
| `20261121000000_guests.sql` | Property-scoped `guests` table, nullable `guest_id` on `bookings` / `booking_groups`, `normalize_phone_key()`, trigger that links a booking to its guest by phone (§15), one-time backfill |

**Before a pilot, run `docs/DB_CHECKS.sql` queries 12, 13 and 14 on the live project.** Query 13 lists whether the three Nov migrations above are applied and secured (every row must read `true`).

`availability.price_override` still **exists** in the baseline. Nothing reads or writes it. Drop it only after `docs/DB_CHECKS.sql` query 2 returns 0.

---

## 8. Public surfaces and parked features

**Routing (`src/routes/index.tsx`):** `?slug=` → guest page; root domains (`stayidom.in`, `www`, `*.vercel.app`, `localhost`) → landing page (lazy-loaded); any other host → guest page for `getSubdomain()`. `lib/prefetch.ts` must mirror this decision (`guestSlugForThisPage()`).

**Guest page (3 Nov 2026):** order is Hero → About → Amenities → Gallery → Dates and guests → Rooms → Your details → Packages → Map → Footer (`docs/GUEST_PAGE.md`). Sections with nothing to show are hidden. Reels / video embeds were considered and **not** built: they add third-party scripts and layout shifts on weak connections. If owners ask, the lightest option is a tap-to-load thumbnail; that needs a decision because it changes the no-embeds rule.

**Landing page — status:** the rewritten landing page described in earlier handovers (`PLATFORM_WHATSAPP`, `CONTENT`, `TESTIMONIAL` constants) is **not on `main`**. `main` has the old 973-line inline-styles version. Do not remove the Playfair Display `<link>` in `index.html` until the rewrite lands. The copy on `main` shows an invented example booking with a personal name and a sample Malayalam pricing grid; check before it goes live.

**Owner Help (`/help`, 7–8 Nov 2026).** A public, lightweight guide for owners: scenarios ("what to do when…"), setup steps and troubleshooting, with 30 annotated phone screenshots. Content is plain data in `src/content/ownerGuide.ts` (no markdown library); images are 720 px WebP in `public/help/`. Edit the text there; keep screenshots in step with the UI (`docs/OWNER_HELP.md` has the rules, the image list and the screenshot backlog). `SUPPORT_CONTACT` in that file is **empty** — set it to show the "Still stuck?" box.

**Parked: channel sync (iCal).** Built and tested (`docs/PARKED_FEATURES.md`). Off for every property until the platform admin ticks "Sync with other sites" in Superadmin → Manage (`properties.channel_sync_enabled`; master switch `CHANNEL_SYNC_ENABLED` in `features.ts`). The export `/api/ical?room=` is live and harmless (own nights only). The import (`/api/ical-sync`) and the pop-up work only for switched-on properties; the background cron is not scheduled yet (snippet in the room_ical_feeds migration). Turn on only where owners sell on other sites too.

**Service worker: deliberately not added** (v9.3). Static assets are cached for a year (`vercel.json`), and guests need live availability. Revisit only with measured evidence.

---

## 9. Change log since v9.7 (what is now in `main`)

| Area | Change | Where |
|---|---|---|
| Rates | Seasonal / date-range room rates, live | `room_rates` migration (20261015000000), `RoomRatesEditor`, `roomRates.ts` |
| Pricing | Guest bookings priced and forced to pending server-side | migration 20261015000100 (in baseline) |
| Double-booking | Exclusion constraint live; older duplicate index removed | `bookings_no_overlap` |
| Errors | Client error log on `/superadmin` → Errors | migration 20261009…, `errorLog.ts` |
| Admin speed | Windowed fetches, `fetchAllRows()` pagination, indexes | migration 20261010…, `paginate.ts` |
| Agents | Delete agent clears its commission records in one transaction | migration 20261020… |
| Link previews | `/` → `api/og`; `robots.txt` / `sitemap.xml` per host; dynamic manifest | `api/*`, `vercel.json`, `post-build.mjs` |
| iCal | Export live; import built and parked | `api/ical*`, `features.ts` |
| Superadmin | Invite-owner Edge Function, setup checklist, renewal states, search/filter | `invite-owner`, `onboarding.ts` |
| Guest status | Live "Request sent → Confirmed" card via token lookup | PR #439: `guestBookingStatus.ts`, `useGuestBookingStatus.ts`, `BookingForm.tsx`, `booking-status.tsx` |
| Owner confirm | WhatsApp send prompt on every confirm path; 25 % advance gate; Munnar/room-label fix in messages | PR #439: `SendConfirmationPrompt.tsx`, `balance.ts`, `whatsapp.ts`, `admin.bookings.tsx`, `admin.payments.tsx` |
| Extras | Pick catalog add-ons / packages as booking extras | PR #440: `CatalogExtrasPicker.tsx`, `catalogExtras.ts`, `useCatalogItems.ts`, `useAddChargeRows` |
| Phone links | `waDigits()` for every WhatsApp / call link; owner numbers normalised on save | PR #442 (in `Dev`) |
| Retry safety | Stable ids / token on a retried guest booking | `fix/booking-retry-ids` (pending merge into `Dev`): `bookingSubmission.ts`, `useCreateBooking.ts` |
| CI | GitHub Actions: build, typecheck, tests, checks, DB migration tests | `.github/workflows/ci.yml` |
| Guest flow | Three steps: dates + guests, rooms (one Add button, running bar), details. Guests shared over rooms automatically; date change keeps rooms | `index.tsx` (`GuestPage`), `Availability`, `Rooms`, `CartBar`, `BookingForm`, `partyAllocation.ts`, `roomSelection.ts`, `useUnavailableRoomIds.ts`. `RoomDetail.tsx` removed |
| Group options | Best value / More space, priced with the real stay total | `suggestOptions` in `partyAllocation.ts`, `Rooms.tsx` |
| Guest limit | Owner-set "Most guests allowed" per room; the database refuses guest bookings above it | migration 20261101…, `guestCount.ts`, `admin.rooms.tsx`, `useCreateBooking.ts` |
| Packages | Active packages and add-ons on the guest page; tick and send one WhatsApp enquiry | migration 20261029…, `Packages.tsx`, `usePublicCatalog.ts`, `guestCatalog.ts`, `whatsapp.ts` |
| Hero | Live date, time (India) and today's temperature range; placeholder text removed (default "Vattavada", fake 12–18 °C, "Your host", broken fallback image) | `Hero.tsx`, `About.tsx`, `liveInfo.ts`, `api/weather.ts`, `api/_lib/forecast.ts`, `useNow.ts`, `useLiveWeather.ts` |
| Gallery | Property gallery with thumbnails, Instagram button, owner manager | migration 20261030…, `Gallery.tsx`, `PhotoViewer.tsx`, `GalleryManager.tsx`, `gallery.ts`, `imageUtils.ts` |
| Room photos | Several photos per room; swipe, arrows, dots and a full-screen viewer on the card | migration 20261031…, `RoomPhotosManager.tsx`, `Rooms.tsx` |
| Page order | Details and photos first, then the booking steps | `index.tsx`, `Header.tsx` |
| Directions | Map links need both coordinates; Settings checks the pair. Directions open a **route from where the guest stands**; messages carry a short link (`/api/directions`), SMS text is cleaned of `&` and `#`; owner option to send guests to their Google listing, with a Test link | `location.ts`, `sms.ts`, `api/directions.ts`, `api/_lib/directions.ts`, `MapSection.tsx`, `Footer.tsx`, `booking-status.tsx`, `WhatsAppReminderModal.tsx`, `admin.settings.tsx`, migration 20261104… |
| Owner Help | Public `/help` page, dashboard Help link (new tab), "?" links, 30 screenshots, three guide groups (situations, setup, troubleshooting) | `help.tsx`, `ownerGuide.ts`, `AdminLayout.tsx`, `admin.settings.tsx`, `RoomRatesEditor.tsx`, `public/help/` |
| Calendar (All rooms) | One dot per room (hollow ring = free), tap a day for an in-page panel, Today strip (free / arriving / leaving / pending), 7+ rooms: `N free` + stacked bar + drop-down picker (>5 rooms), >8 rooms: attention rooms first, free rooms folded | `admin.calendar.tsx` (helpers `DOT_MAX`, `RoomDots`, `OccupancyBar`, `DayPanel`) |
| Calendar (single room) | Each stay is one bar with the name once; bars run to the middle of the check-out day (extra half cell for the name); half bar when check-out is on a Sunday or the 1st; same-day handover starts the new bar mid-cell; bars let taps through | `admin.calendar.tsx` (`singleDays`, `BAR`) |
| Edit Stay | New total / balance due now shows whenever the stay changes (it was hidden unless the booking had an advance or discount) | `admin.bookings.tsx` (`EditStayModal`) |
| Rooms | "Apply to all rooms" label no longer breaks into columns | `RoomRatesEditor.tsx` |
| Settings | Pending-hold help text now says it applies to guest requests too and that expiry is silent | `admin.settings.tsx` |
| Home | The hold countdown on pending requests was added (4 Nov) and **removed again** (5 Nov, `f523308`); Home shows the request and dates only | `admin.dashboard.tsx` |
| Admin speed | Admin layout no longer remounts on tab switch; fonts reduced and non-blocking; heroes use `svh` | #492, `__root.tsx`, `index.html`, `Hero.tsx` |
| Auth | Reset-password link no longer shows "expired" early (20 s wait, `ready` flag); `/admin/login` redirects to `/login` | #493 |
| Admin links | Dashboard / Payments / Quotes links to Bookings are router links, not full reloads | #493 |
| History | Payments, Agents (#494) and Bookings (#495) load 6 months with "Load more"; unsettled rows kept | rule 35 |
| Quote calendar | Partly booked days show amber ("Some rooms booked"); load failure shows an alert | #496, `RoomAvailabilityCalendar.tsx` |
| Pricing | Add booking, Quote builder, Edit Stay wait for seasonal rates | #497, rule 37 |
| Errors | Explicit load-failure screens on admin pages and the guest page; query errors logged | #499, rule 36 |
| Reports | **Monthly Business Report** (Money → Monthly report, `/admin/report`): default = last completed month, step back up to 24. Composes Money Intelligence, `businessMetrics`, guest identity, Property Score and Revenue Intelligence; no new migration. Score and opportunities are current-state and labelled so. Period loading is shared with Money (`usePeriodData`); guest history is one chunked `guest_id IN (…)` query per table (`guestHistory.ts`) | Sprint 7, `monthlyReport.ts`, `useMonthlyReport.ts`, `MonthlyReport.tsx` |
| Money Intelligence | Money → Overview (`/admin/money`): This month / Last month / This year, revenue, collected, outstanding, expenses, estimated operating profit, revenue by source, comparison with the previous period. Definitions in §16 | `moneySummary.ts`, `businessMetrics.ts`, `useMoneyOverview.ts`, `usePeriodData.ts`, `MoneyOverview.tsx` |
| Expenses | Owner-entered expenses (12 categories; Cash / UPI / Bank transfer / Card) | migration 20261119000000, `expenses.ts`, `useExpenses.ts`, `admin.expenses.tsx` |
| Source editing | A booking's source can be changed after creation (`source` + `booking_source_detail` only) | migration 20261119000100, `bookingSourceEdit.ts`, `EditSourceModal.tsx` |
| Guest identity | Guests recognised across bookings by normalised phone, within one property; guest history and "Returning guest" on the booking | migration 20261121000000, `guestIdentity.ts`, `guestHistory.ts`, `useGuestStays.ts`, `GuestPanel.tsx` |
| Property Score | 0–100 readiness score, six categories, top-3 recommendations | `propertyScore.ts`, `usePropertyScore.ts`, `PropertyScoreCard.tsx` |
| Revenue Intelligence | Rule-based "Current opportunities" (§13) | `revenueIntelligence.ts`, `useRevenueIntelligence.ts`, `RevenueOpportunities.tsx` |
| Education | In-app lessons (Learn → Do → Measure), 12 lessons in 5 categories, per-browser progress | `educationLessons.ts`, `education.ts`, `educationDestinations.ts`, `useEducationProgress.ts`, `admin.education.*.tsx` |
| Superadmin email | One app-side definition; a test guards the DB/Edge copies (24 Nov) | `superadmin.ts`, `docs/superadmin-authorization.md` |
| CI | `npm run lint` added to CI | `.github/workflows/ci.yml` |
| Pilot review (25 Nov) | `EditSourceModal` now treats a zero-row update as a failure (`NotSavedError`); `RevenueOpportunities` shows a notice when its data did not load instead of an empty or shorter list; `docs/DB_CHECKS.sql` queries 13 and 14 | `EditSourceModal.tsx`, `RevenueOpportunities.tsx`, `admin.dashboard.tsx`, `admin.report.tsx`, `docs/DB_CHECKS.sql` |

---

## 10. Known issues (found in the 25 Oct 2026 audit)

Items marked **[verified]** were checked in the code. The build and typecheck could **not** be run in the audit sandbox (npm registry unreachable), so §12 must be run locally.

1. **[DONE 25 Oct 2026] Guest paths read `bookings`.** Fixed (see rule 10). `getBlockedDatesForRooms` / `getConflictingDates` (`src/lib/bookingAvailability.ts`) query `bookings`, and guest-facing `Rooms.tsx`, `Availability.tsx`, `useAvailability.ts`, `useCreateBooking.ts`, `stayAvailability.ts` call them. For `anon` that part returns nothing, silently. Correct behaviour depends only on `availability`. Fix: have guest paths use only `availability` (plus an RPC if needed) and keep the `bookings` read for owner screens.
2. **[DONE 25 Oct 2026] Duplicate migration.** `supabase/migrations/20261020000000 delete agent with commissions` is byte-identical to `…_delete_agent_with_commissions.sql`. Delete the spaced one.
3. **[DONE 25 Oct 2026] Dead code:** `src/hooks/useBookingStatus.ts` has no importers and reads `bookings` directly. Delete it.
4. **[DONE 25 Oct 2026] Test route in production:** `src/routes/test-booking.tsx` runs test bookings against the live database. Remove it, or gate it to `import.meta.env.DEV`.
5. **[PARTLY DONE 25 Oct 2026] Unused `/setup` route** removed. **Still open:** drop the unused DB functions `get_invite_by_token`, `create_owner_auth_user`, `consume_invite_token` in the live project, after confirming nothing calls them.
6. **[DONE 24 Nov 2026] Superadmin email duplication.** App code has one definition (`src/lib/superadmin.ts`); `VITE_SUPERADMIN_EMAIL` removed. DB policies/triggers and `invite-owner` intentionally keep their own copy (security boundary, see `docs/superadmin-authorization.md`); a test guards against drift. **Still open (optional):** a `superadmins` table + `is_superadmin()` function to make the DB the single source.
7. **[DONE 25 Oct 2026] Two lockfiles:** `bun.lockb` deleted; `package-lock.json` is the only lockfile.
8. **`recharts` in `package.json`: not removed, not bundled.** Unused by the app and not in the build. Removing it needs `npm uninstall recharts`, which the current workflow can't run; leave it until a terminal is available.
9. **[DONE 25 Oct 2026] Invite function location:** moved to `supabase/functions/invite-owner/`; the old `src/` copy was deleted.
10. **[DONE 25 Oct 2026] Security headers** added to `vercel.json` (`nosniff`, referrer policy, `X-Frame-Options: SAMEORIGIN`, permissions policy, HSTS). **No CSP yet** — needs testing against Google Fonts, Supabase and inline styles first.
11. **[done, 26 Oct 2026] Guest tracking link:** random token per booking/group (`tracking_token`; migrations `20261025020000_tracking_token.sql` and `20261025030000_tracking_token_group_members.sql`). `lookup_booking_by_token` is the guest lookup. Phone lookups remain only for legacy `?phone=` links until the revoke (see §11).
12. **Public pricing:** the DB now re-prices guest bookings (§3 rule 19). Confirm on the live project that `enforce_guest_booking_terms` is installed (it is in the 16 Oct baseline). Close v9.6 open item 4 after a test booking.
13. **Landing page on `main` is the old version** (§8). Don't remove the Playfair font until it is replaced.
14. **Stale `src/routeTree.gen.ts`.** It is regenerated by the build. Consider not committing it, or add it to CI's check.
15. **Plan tiers not enforced.** The landing page sells Starter / Growth / Pro (₹5,000 / ₹10,000 / ₹25,000 setup). The DB `subscription_tier` allows `'small' | 'large'` only. The app enforces nothing by tier. Decide: enforce, simplify the matrix, or align the DB.
16. **No optimistic updates** anywhere (`onMutate` absent), despite PRD §3.
17. **`/superadmin` still has the slide-in load animation** removed from `/admin` in v9.6 (rule 16).
18. **A booking's room can't be changed in the UI** (Edit Stay for a room inside a group does not update the group total). No UI path reaches it today.
19. **No "record refund" button.** Lower "Collected so far" on the Payments page instead.
20. **Supabase Free tier pauses on inactivity.** The first request can fail. The older note here said the superadmin cannot write to another owner's tables; the baseline and the Nov migrations now contain `superadmin_manage_*` policies (ALL) on bookings, booking groups, expenses and guests, so that note is probably out of date. **Unverified on the live project.** Test write flows as the real owner either way.
21. **[APPEARS DONE, check] Edit Stay date picker.** `admin.bookings.tsx` no longer contains `<input type="date">`, and an 8 Nov screenshot shows "Edit Stay Details" using the app calendar. Retest a stay change on the demo property, then close this item.

---

**Guest / owner flow audit, 29 Oct 2026** (code read; build and live DB not run):
22. **[DONE, PR #442] WhatsApp / call links broke for numbers saved without `91`** (rule 26).
23. **[DONE on branch `fix/booking-retry-ids`, merge pending] Retry after a lost reply** collided with the guest's own pending booking and the guest never got the token (rule 27). Needs the manual weak-signal test in §12.
24. **[OPEN, known risk] A guest who pays by UPI but isn't recorded by the owner within the hold window** has the booking cancelled silently by the 15-minute job. Consider an owner alert before expiry, or a longer hold once a payment screenshot is sent. **8 Nov 2026:** the Home countdown that would have warned the owner was removed again (change log), so the risk stands; the Help guide tells owners to check Home often.
25. **[DONE 3 Nov 2026] Guest form started with adults = the room's `max_guests`.** The guest now states the party first (default 2 adults) and rooms are filled from it (rule 30).
26. **[WON'T FIX for now] `eachDate()` (`bookingAvailability.ts`) repeats a date in daylight-saving timezones** (checked: Europe/London, 29 Mar 2026). No effect in India (no DST); use `setUTCDate` if guests outside India are ever supported.
27. **[OPEN, minor]** a stale `blocked-dates` query key; `getDateState` mutates its argument.
28. **[NOT AUDITED]** the owner dashboard, calendar, Block dates, invoice and WhatsApp reminder screens were not read in this audit. The cancel, status-change and record-payment paths were, and report failures instead of closing silently.

**Guest page work, 3 Nov 2026** (build, type-check, unit tests and the throw-away Postgres tests were run; checked by the owner on Vercel previews, not yet on a range of real phones):
29. **[BY DESIGN] Packages and add-ons are information only** for guests; they can't pick or pay for them online (rule 34). Letting guests select them needs server-side pricing (rule 19) and is a larger change.
30. **[OPEN] Owner-side `AddBookingModal` does not apply `max_occupancy`.** Owners can enter a larger party than the room limit; this is intended, but it is not shown to them.
31. **[OPEN, minor] Room photos have no thumbnails;** the card loads the 800 px first photo. The property gallery does (rule 31).
32. **[OPEN] The temperature is a forecast for a ~1 km point, not a measurement,** and needs the property's location pair. MET Norway asks for a contact in the User-Agent; the default names `stayidom.in`. Set `WEATHER_USER_AGENT` to an email if you want to be reachable.
33. **[OPEN] Properties saved before 3 Nov 2026 may have only one coordinate.** The guest page copes (rule 32), but the owner should fix it; list them with the query in `docs/GUEST_PAGE.md` §9. No database rule requires both, because an old one-coordinate row would then make unrelated updates to that property fail.
34. **[UNVERIFIED] The SMS Directions link uses `sms:?body=`.** `sms:?&body=` is reported to work on both iPhone and Android; not tested here. Check on an iPhone. (The `&` cut-off seen on a Xiaomi phone is fixed: rule 32.)
36. **[UNVERIFIED] "Listed on Google Maps" finds the listing by name and area,** which depends on Google matching the name. If a guest lands on the wrong place, the owner switches the option off (the route then ends at the pin). A Google Place ID would be exact but is too technical for owners to find. Check the Test link for every property that turns it on.
37. **[UNVERIFIED] The route starts from the guest's location** because the link has no `origin`; Google asks the guest for location permission, and without it asks them to choose a start. Tried on an Android phone's SMS app only.
35. **[OPEN] The owner onboarding checklist does not ask for the new content** (hero photo, 3+ gallery photos, Instagram handle, location pair, "Most guests allowed" per room). A site without photos looks like a template; this is the next suggested step (§11 item 16).

---

**Owner Help and calendar session, 7–8 Nov 2026** (build, typecheck and the 207 unit tests passed; the calendar was also run in a headless phone-sized Chromium with sample data; not yet checked on a range of real phones):
38. **[DONE 8 Nov] Edit Stay hid the new balance** when the booking had no advance and no discount (extras alone did not trigger it). Fixed in `EditStayModal`.
39. **[DONE 7 Nov] "Apply to all rooms" label** in the seasonal-rate form split into columns (text and `<strong>` were separate flex items). Fixed.
40. **[OPEN, to verify] WhatsApp confirmation shows "�" where ✅ / 📋 should be** in an owner screenshot (a Xiaomi/Android phone, sent via a `wa.me` link). The source text in `src/lib/whatsapp.ts` (~line 124) is valid. Send a confirmation to a second phone. If it repeats, remove emoji from the templates. Dates in the messages are ISO (`2026-11-12`); a friendlier `12 Nov 2026` would help guests.
41. **[OPEN, minor] Single-room calendar:** a one-night **blocked** day shows "Bl…" (narrow bar; tapping reopens it), and a one-night stay that starts on a Saturday on the same day another guest leaves gets a short bar (the bar cannot cross into the next week row).
42. **[OPEN, minor] Select boxes truncate on narrow phones:** the seasonal rate "Price type" ("% change on…") and the add-on "Charged" ("per person /…").
49. **[BUILT 10 Nov] Section identity (admin).** Each admin section has its own accent via `data-section` (`styles.css`, `navConfig.ts` `bold` flag, `admin/sectionContext.ts`; `PageHeader`/`Section` in `formKit.tsx` pick it up). Calendar and Money go bolder (tinted page, month bar / ledger strip). Home, Bookings, Rooms & Pricing and Property stay subtle. See AGENTS.md design exception. (Superseded in look by item 50: the bold tinted page and month bar are gone; the accent now shows in the round icon, nav pill and tabs.)
43. **[BUILT 10 Nov; rollout in progress] Unified seasons.** One season (`price_seasons`) now carries room price rules (`season_room_rules`) and add-on prices; one overlap rule (priority, then shorter window). Migration `20261109000000_unified_seasons.sql` is additive; `room_rates` is untouched. Old screens (`RoomRatesEditor`, `SeasonsEditor`) are removed. `20261110000000_seasons_always_on.sql` switches every property and makes new ones start on seasons. Steps, price check, backups and rollback: `docs/SEASONS_ROLLOUT.md`. **Still to do:** run the migrations in order, retake screenshots (`docs/OWNER_HELP.md`), then delete `room_rates`, `season_pricing_v2` and the legacy SQL/TS path in a later cleanup.
50. **[BUILT 11 Nov] Owner-side UI refresh (Google Pay-style).** Flat, soft, rounded: one `Modal` (centred card / phone bottom sheet; header, tabs, sticky one-row footer) for every dialog; `Button`, `Field`, `FieldGroup`, `StatusChip`, `EmptyState` in `src/components/ds`; Payments is a big "Collected" number, two soft cards and an avatar list (sort is a dropdown; CSV unchanged); Calendar is a flat white month with a big title and round arrows (cell and bar logic untouched); Bookings, Home, nav (pill items, no left bar), top bar, tabs and login follow. 28px bold page titles everywhere; serif only for brand names. Rules: AGENTS.md "UI building blocks". PRs: #477 to #485 and the owner sweep. **Not done:** the guest site keeps the old look; `BookingInvoice` untouched; no browser/phone check of the sweep was possible in the build sandbox (files only syntax-checked), so test the pages below on a phone. **Help screenshots are now out of date** (chrome, modals, Payments list, Calendar): retake all (`docs/OWNER_HELP.md`).
51. **[OPEN] Guest page: hero image arrives late; a failed availability or release-dates fetch shows no notice** (it quietly looks free). Add a notice like rule 36.
52. **[OPEN] Leftovers from the 15 Nov audit:** `select("*")` on wide tables; room photos not resized in the owner lists (FIXED on branch feat/room-photo-thumbs: new room photos get a `-t.webp` thumbnail used in the owner lists; older photos fall back to the full image until re-uploaded); login form labels; unused `src/data/rooms.ts` and `AuthGuard.tsx`; `WhatsAppReminderModal` computes "today" with `toISOString()` (UTC, a day off before 5:30 am; rule 35 style fix); a stale `is_paid` edge case.
53. **[UNVERIFIED] The `alsoKeep` PostgREST `.or(...)` filters** are unit-tested only as strings; confirm on the live project that Bookings, Payments and Agents still show an old unpaid stay and an old group. Build and typecheck were never run for #492–#499 (sandbox); CI passed.
54. **[SUGGESTED] A Playwright smoke test** (login, each admin tab, guest page) would catch blank or flashing screens before merge.
44. **[OPEN] `SUPPORT_CONTACT` is empty** in `src/content/ownerGuide.ts`, so the Help page hides its "Still stuck?" box. The page is public: use a number you are happy to publish.
45. **[OPEN, now due after item 50] Help screenshots go stale** when a screen or label changes. Keep them in step (`docs/OWNER_HELP.md`). The guide quotes button names exactly.
46. **[OPEN] Home "arriving" count (Today strip)** counts bookings with `check_in` = today and a status other than cancelled; how a multi-room booking is counted is unchecked.
47. **[UNVERIFIED] Help new-tab behaviour on a home-screen app** (Android and iPhone). `/help` is outside the `/admin` manifest scope, so it should open in an in-app browser sheet. Test both.
48. **[OPEN] Screenshot backlog:** Settings location pair and pending hold field, the "Send WhatsApp reminder" picker (the guide has no section on it yet), an agent opened showing **Mark paid**, the Edit Stay overpaid warning on a fully paid booking, the seasonal rate form's price section after the label fix, and the Invoice tab.

55. **[FIXED 25 Nov 2026] Source edit could report success without saving.** `EditSourceModal` did not ask for the changed row back, so an expired login changed nothing and showed no error. It now throws `NotSavedError` on an empty answer (same convention as `bookingActions.ts`).
56. **[FIXED 25 Nov 2026] Opportunities disappeared silently when a query failed.** On Home and the Monthly report a failed rates, availability or expenses load removed the affected rules with no sign. `RevenueOpportunities` now shows "Some data couldn't load, so this list may be incomplete" (`loadFailed`). There is no component-test harness in the repo, so this and item 55 are covered by typecheck and lint, not by a unit test.
57. **[VERIFY BEFORE PILOT] The three Nov migrations on the live project** (expenses, source detail, guests). Migrations are run by hand; run `docs/DB_CHECKS.sql` query 13 (all rows `true`) and queries 12 and 14.
58. **[OPEN, acceptable] Education progress is per browser.** It is stored in `localStorage` under `stayidom:education:v1` plus user and property, so it does not follow the owner to another phone, and clearing site data resets it. Moving it to Supabase is future work.
59. **[OPEN, acceptable] No link from an app screen into Education** other than the nav item. Lessons link out to app screens (and to Help sections), not the other way round.
60. **[OPEN, acceptable] Home Business Snapshot window.** It loads stays from the start of last month; a stay of more than about a month that began earlier can be missed there. The Money and Monthly report screens load by overlap and do not have this gap.
61. **[OPEN, acceptable] Logout does not clear the React Query cache.** Keys are property-scoped, so no cross-owner leak was found; clearing it on logout would still be tidier.
62. **[UNVERIFIED] One owner, one property is assumed.** `useOwnerProperty` reads one row by `owner_id`; zero rows (or, if the schema allows it, more than one) shows "No property is linked". The schema was not checked for a uniqueness rule on `properties.owner_id`.
63. **[OPEN, acceptable] A group booking's source edit is two writes** (the group, then its rooms). If the second fails the rooms keep the old source. Money screens read the group row, so the figures stay right.
64. **[OPEN] Help covers none of:** recording an expense, walking through the Monthly report, reading Property Score / Opportunities. Education is not mentioned in Help. Screenshot status is in `docs/OWNER_HELP.md` §5.
65. **[UNREVIEWED] `npm install` reports dependency audit findings.** Not triaged.

---

## 11. What's left (suggested order)

**P. Pilot gate (25 Nov 2026 review) — 5 to 10 properties**

*BLOCKER:* none found in the code. The one external dependency is item 57 below.

*SHOULD FIX BEFORE PILOT*
- Run `docs/DB_CHECKS.sql` queries 12, 13, 14 on the live project (§10 item 57). If a row in query 13 is `false`, run that migration (they are idempotent).
- Walk the money flows once as a real owner (not superadmin; §10 item 20) on a pilot property: login, add booking, record a part payment, mark fully paid, add an expense, change a booking's source, open Money → Overview and the Monthly report, mark one Education lesson done.
- Retake Help screenshots 01, 02, 07, 11, 28 (`docs/OWNER_HELP.md` §5).
- Set `SUPPORT_CONTACT` (§10 item 44) so pilot owners can reach you from Help.
- Check the landing page copy before it is shown to prospects (§8).

*ACCEPTABLE FOR PILOT:* §10 items 58–63; the payment, room-history and Property Score limits in §17.

*FUTURE PRODUCT WORK:* payment-date ledger, room-history snapshots, Education progress in Supabase, CSP, plan-tier enforcement.

**A. Make `main` match this document (cleanup, no new features)**
1. Run the build, typecheck and tests locally (§12). Fix anything they report.
2. Still open from §10: items 51–54 (15 Nov audit leftovers) and item 8 (`recharts`: not removed, not bundled). Item 5 is done: DB functions dropped, `/setup` removed.
3. Commit the migrations and DB objects that are live but missing from `supabase/migrations/`: `lookup_*`, `create_property_with_invite`, `link_property_owner`, booking triggers, base-table policies, `trg_mark_booking_nights`, `sync_availability_on_booking` (the 5 Oct file). The baseline holds the text; the migrations folder must hold the history.
4. ~~Fix §10 item 1~~ — done (rule 10).

**B. Security**
5. Revoke the phone lookups (`lookup_bookings_by_phone`, `lookup_booking_groups_by_phone`) and remove the legacy `?phone=` branch from `booking-status.tsx`. The SQL is ready in `docs/REVOKE_PHONE_LOOKUPS.sql` — **do not run it before 25 Nov 2026** (old links in guests' hands stop working).
6. Security headers: done (§10 item 10). CSP still to do.
7. Superadmin email in one place (§10 item 6).
8. Confirm the server-side pricing trigger on the live project with one guest test booking (§10 item 12).

**C. Product**
9. Land the landing-page rewrite (`PLATFORM_WHATSAPP`, `TESTIMONIAL`, Malayalam review, remove Playfair). Set `PLATFORM_WHATSAPP` to the real number.
10. Decide plan-tier enforcement (§10 item 15).
11. Turn on channel sync for Munnar / Alleppey / Varkala (`docs/PARKED_FEATURES.md`), with the cron and secrets, once an owner needs it.
12. Drop `availability.price_override` after `docs/DB_CHECKS.sql` query 2 returns 0.
14. **Owner alerts that don't depend on the guest tapping Send** (the owner's WhatsApp message is a `wa.me` link; if the guest closes it, the owner isn't told). Options: an in-app "new request" badge, or WhatsApp Business API later.
15. Landing page: remove or prove the "seconds" claim (rule 7).
13. **Fix the Edit Stay date picker** (§10 item 21), then retest a stay change on the demo property.
16. **Owner onboarding checklist for the guest page** (§10 item 35): ask for a hero photo, 3+ gallery photos, an Instagram handle, a location pair and "Most guests allowed" per room, with a preview of what guests see.
17. Thumbnails for room photos (§10 item 31).
18. Tap-to-load Instagram reel (§8) only if owners ask; it revisits the no-embeds rule.

19. **Roll out unified seasons** (§10 item 43): follow `docs/SEASONS_ROLLOUT.md`, demo property first.
20. Verify the WhatsApp emoji problem (§10 item 40) on a second phone; fix or remove emoji and use readable dates.
21. Fill `SUPPORT_CONTACT`; take the screenshot backlog (§10 item 48); test Help on a home-screen app (§10 item 47).
22. Consider bringing back an owner warning for expiring holds (§10 item 24): a countdown on Home, or an alert before expiry.

**D. Later (from the v8 roadmap)**
13. Agent self-service portal; WhatsApp Business API; billing (Razorpay); central listing page (PRD Phase 5).

---

## 12. How to verify a change

1. `npm ci`, then `npm run build` (must pass; regenerates `routeTree.gen.ts`).
2. `npm run typecheck` — expect 0 errors. Run it after the build. (The build rewrites `src/routeTree.gen.ts`; do not commit that churn unless you mean to.)
3. `npm run lint`, `npm test` and `npm run check`. For database changes also `bash supabase/tests/run.sh` against a local Postgres (applies the migrations twice, then runs the three suites).
4. Walk the relevant checklist on a real device (iPad Safari + a phone). Highest-risk flows: Mark fully paid (single and group), seasonal rate on a guest booking (total equals the dialog total), Payment setup survives saving Meals/Policies/Amenities/Settings in a row, superadmin "manage property", guest booking lands as pending and unpaid.
5. Landing changes: view at 375 px, check every CTA with and without `PLATFORM_WHATSAPP`, submit the form and confirm a row in `leads`.
6. Link previews: `https://<property>.stayidom.in/?_ogdebug=1` shows each step.
7. Owner Help changes: open `/help` and `/help#seasonal-rates` on a phone, check every image loads and the Close button works; walk the changed scenario on the demo property. Calendar changes: `docs/CALENDAR_UI.md` §7.
8. Guest page changes: follow `docs/GUEST_PAGE.md` §10 (throttled phone, a group of 6, the guest limit, `/api/weather`, the directions SMS, the packages enquiry) in a private tab.

---

## 13. Current product modules (as built, 25 Nov 2026)

All of these are owner-side, read the owner's own property only, and ship with no new server code: the logic is pure TypeScript in `src/lib/` with tests, fed by React Query hooks.

**Home** (`admin.dashboard.tsx`): Property Score card, up to 3 Opportunities, Business Snapshot (this month vs last month), checklist, quick actions.

**Property Score** (`propertyScore.ts`). A 0–100 *readiness* score: Listing 20, Rooms 20, Pricing 15, Booking readiness 15, Operations 15, Growth 15. Each item has a fixed weight and earns whole points (`floor(weight × share)` when done for only some rooms/photos). An item that cannot be judged from the data given (bookings failed to load, no booking yet, no seasonal prices) is **unavailable**: it earns nothing *and* is removed from the maximum, so the score is `earned ÷ measurable × 100`. Bands: ≥ 90 excellent, ≥ 75 good, ≥ 50 fair, ≥ 25 starting, else new. The three highest-value incomplete items are the recommendations. Deliberately **not scored** (`NOT_MEASURED`): repeat guests, direct booking usage (guest- and owner-made bookings are both `direct`), reviews (none stored), whether the calendar is up to date. The score is **current state only**: nothing is stored, so there is no score history.

**Revenue Intelligence** (`revenueIntelligence.ts`). Rule-based "Current opportunities", never a forecast and never a market comparison. Rules: outstanding payment; empty upcoming dates (next 30 days); missing booking source (3 or more stays without a useful source); missing expenses (this month has revenue but no expense recorded); pricing gap (open nights with no price, or open Fri/Sat nights on the standard rate while another active room has weekend pricing). A rule whose inputs did not load returns nothing, and the screens now say so (§10 item 56). No amount is invented for the pricing gap.

**Money Intelligence** (Money → Overview, `moneySummary.ts` + `businessMetrics.ts`). Periods: This month, Last month, This year, each compared with the period before. Shows revenue, collected, outstanding, expenses, estimated operating profit, revenue by booking source. Definitions: §16.

**Expenses** (Money → Expenses). Owner-entered, per property: 12 categories (electricity, cleaning, staff, maintenance, supplies, food, OTA commission, property tax, internet, marketing, transport, other) and four payment methods (Cash, UPI, Bank transfer, Card).

**Source editing** (Bookings → a booking → Change source; `bookingSourceEdit.ts`, `EditSourceModal.tsx`). Writes only `source` and `booking_source_detail`. Source groups on the money screens: WhatsApp, Instagram, Google, Website, Phone, Walk-in, Agent, Airbnb, Booking.com, MakeMyTrip, Agoda, Repeat guest, Other, Unknown. A plain `direct` booking with no detail is **Unknown**, never silently "Direct" or "Website".

**Guest identity** (§15). Guest panel on a booking: name, phone, total stays, total revenue, first and last stay, and a "Returning guest" label when the guest has **more than one confirmed or completed stay** (a future confirmed stay counts).

**Monthly Business Report** (Money → Monthly report, `/admin/report`; `monthlyReport.ts`, `useMonthlyReport.ts`, `MonthlyReport.tsx`). Default is the last completed month; the owner can step back up to 24 months. It shows a summary in words, performance (occupancy, ADR, RevPAR, room nights available / occupied), revenue, collected, outstanding, expenses and expenses by category, revenue by source, guests (identified guests, repeat guests and repeat-guest stays, counted up to the end of that month), and the current Property Score and Opportunities. Occupancy, ADR and RevPAR use the rooms that are active today. A month with no previous-month data shows "No previous-month baseline" instead of a made-up change. Month boundaries are calendar days, end-exclusive. **Property Score and Opportunities in the report are today's state, not that month's end state**, and the report says so.

**Education** (`/admin/education`, `/admin/education/<slug>`). Business-improvement lessons, **distinct from Help**: Help (`/help`, public) says how to *use the app*; Education says how to *run the business better*. Each lesson follows **Learn → Do → Measure**: Learn = `objectives`, `body` and `whyItMatters`; Do = `actionSteps` and an action button to a real app screen (`destination`, resolved by `educationDestinations.ts`, keeping the `?property=` param); Measure = a `measure` line saying how to tell whether it helped. 12 published lessons in 5 categories, in a suggested path; `prerequisite` is a soft hint, never a lock; `relatedHelp` links to a Help section. Progress (done / not done) is per browser (§10 item 58). Content is plain data in `src/content/educationLessons.ts`; `education.test.ts` checks that every destination, Help id and prerequisite exists.

---

## 14. Authentication model

- **Login:** `/login` (email + password, Supabase Auth). `/admin/login` redirects to `/login`. After login `postLoginPath` sends the superadmin to `/superadmin` and an owner to `/admin/dashboard`.
- **Session:** `supabase-js` keeps the session in the browser and refreshes it; `useAuth` reads `getSession()` and listens to `onAuthStateChange`. Password reset: `/reset-password` (20 s wait before showing "expired").
- **Logout:** `supabase.auth.signOut()` and the remembered property (`sessionStorage` key `adminPropertySubdomain`) is cleared. The React Query cache is not cleared (§10 item 61).
- **Route protection (client side, UX only):** `/admin/*` is wrapped by `AdminGuard`: not signed in → `/login`; signed in as owner → their property via `useOwnerProperty` (`owner_id = auth user`); a signed-in user with no property sees "No property is linked". `/superadmin` shows *Access Denied* to anyone who is not the superadmin. `src/components/AuthGuard.tsx` is unused.
- **Superadmin:** identified by email (`src/lib/superadmin.ts`; the DB policies, triggers and `invite-owner` hold their own copy, kept in sync by `src/lib/superadmin.test.ts`). A superadmin who opens `/admin` without `?property=` is sent to `/superadmin`; with `?property=` they manage that property. **The database, not the UI, decides what is allowed:** RLS gives the superadmin (by JWT email) `superadmin_manage_*` policies on the owner tables, including bookings, booking groups, expenses and guests, and a trigger stops the superadmin email from owning a property. Still test write flows as the real owner, because that is the session your pilot users will have (§10 item 20).
- **Supabase Auth settings** (dashboard, not in the repo; carried over from the README, not re-verified): Site URL `https://stayidom.in`; redirect URLs `https://stayidom.in/reset-password` and `https://*.stayidom.in/**`; a customised "Invite user" email.
- **The client-side guards are not the security boundary.** Row-level security is (§15).

---

## 15. Data and RLS model

- **Isolation is per property.** Every owner table carries `property_id` (or reaches it through a parent). Owner policies: `property_id` belongs to a property whose `owner_id = auth.uid()`; superadmin policies by JWT email; guests (`anon`) can only insert bookings and read what the public catalog policies expose; tracking goes through `lookup_booking_by_token` (rule 25).
- **Tables newer than the 16 Oct baseline** (`supabase/baseline/` does not contain them; the migrations do):
  - `expenses` — RLS on; `owners_manage_expenses` and `superadmin_manage_expenses`; `anon` revoked.
  - `guests` — RLS on; `owners_manage_guests` and `superadmin_manage_guests`; `anon` revoked; `UNIQUE (property_id, phone_key)`, so a phone is one guest per property, even under concurrent inserts.
  - `bookings.guest_id`, `booking_groups.guest_id` — nullable; `on delete set null`.
  - `bookings.booking_source_detail`, `booking_groups.booking_source_detail` — nullable text, ≤ 40 characters.
- **Guest identity is by normalised phone only.** `normalize_phone_key()` (SQL) mirrors `nationalDigits()` in `src/lib/phone.ts` (parity cases shared in `supabase/tests/phone_parity_cases.json`): digits only, a leading `0091`, a `91` (only when written with a `+` or when more than 10 digits are present) and a leading `0` are dropped; fewer than 7 or more than 15 digits means *no usable phone*. **There is no name matching.** No usable phone means no guest record (the booking keeps `guest_id = NULL`).
- **Linking:** a `BEFORE` trigger (`link_booking_guest`, `SECURITY DEFINER`, not callable through the API) resolves or creates the guest **inside the booking's own property**. A guest-made booking cannot choose its `guest_id` (forced empty, then resolved). An owner cannot link a booking to another property's guest (rejected). A multi-room stay is one group plus its rooms; they share one phone, so one guest, and the stay is counted once (`dedupeStays`).
- **Cross-property isolation** is asserted by `supabase/tests/guests.test.sql` (including `anon` access, forged `guest_id`, same phone in two properties giving two guests). Expenses and bookings isolation rest on the same RLS pattern; the expenses policy is created by the migration, and its presence is checked live by `DB_CHECKS.sql` query 13.
- **Education progress** is not in the database (§13).
- **Migrations are run by hand** in the Supabase SQL editor, in filename order. The repo cannot tell which are applied: use `docs/DB_CHECKS.sql`.

---

## 16. Financial definitions

All money is whole rupees from the booking rows; nothing is estimated except where a line says so. A stay is a booking, or a booking group counted once with its rooms (never twice). Cancelled bookings do not count. A stay counts if its status is confirmed or completed (`countsAsStay`).

| Term | Definition |
|---|---|
| **Revenue** | The net stay total (after discount, including extras), **split by nights** across the calendar periods the stay overlaps: a stay with 3 of 5 nights in November puts 3/5 of its total in November. Check-out day is not a night. |
| **Collected** | The booking's stored `advance_amount` (the running "collected so far" total that every payment action updates), split by nights in the same way. **It is not cash received in the selected period.** The booking model has no payment-date ledger, so a payment cannot be placed in the month it was received. Never call it cash accounting or cash-in-hand. |
| **Outstanding** | Per stay `max(0, net total − collected)`, split by nights. An overpayment is **not** netted off other stays' balances: it is reported separately as *refund due* (`balance.ts`). Outstanding is never compared with the previous period. |
| **Expenses** | Owner-entered rows whose `expense_date` falls in the period. |
| **Estimated operating profit** | Revenue − Expenses for the period. *Estimated* because Revenue is not cash and expenses are only what the owner entered. Its change versus the previous period is shown only when expenses were recorded in **both** periods and the previous profit was above zero (`compareMoney`); otherwise no change is shown. |
| **Source reconciliation** | Revenue by source adds up exactly to total revenue; every stay lands in exactly one source group (§13). Reconciliation is unit-tested in `moneySummary.test.ts` and `sourceEditing.test.ts`. |
| **Multi-room stay** | One group row governs status, total and source; its rooms supply nights only. A room whose group was not loaded falls back to the room row (rare; needs differing dates). |
| **Month boundary** | Calendar months, `[start, next month start)`. A stay overlapping two months is split by nights. Loading uses an inclusive overlap filter (`check_in <= last day`, `check_out >= first day`) and rows with zero nights in the period are dropped. |
| **Previous-period comparison** | Same definitions on the period before, for Revenue, Collected, Expenses and (conditionally) Profit. A previous period with nothing in it, or one that is partial because the property was set up part-way through it, is compared neutrally ("No previous-month baseline" in the report) instead of as a percentage against zero or a part-month. A failed load of either period fails visibly. |
| **Failed query** | Money, Monthly report, Expenses, Payments, Bookings and the guest panel show an explicit failure state (`LoadFailed`) and never ₹0, zero bookings or an empty list (rule 36). Property Score and Opportunities disclose a partial load. |

---

## 17. Known limitations (honest list)

1. **No payment-date ledger.** Collected is a running total on the booking, not cash received during a period (§16). Do not describe the Money screens as cash accounting.
2. **No room-history snapshots.** Occupancy for a past month uses today's room configuration (active rooms now): rooms added, removed or deactivated since then change the "available nights" of old months. The report notes when the property was set up part-way through a month (from the rooms' `created_at`).
3. **Guest identity is by phone only.** Two people sharing a phone are one guest; one person with two numbers is two guests; a booking with no usable phone has no guest. No name matching, no merging tool.
4. **Monthly report is partly current-state.** The Property Score and Opportunities in a past month's report are today's, labelled as such. There is no score history.
5. **Property Score is a readiness score, not a quality or revenue score**, and is blind to the items in `NOT_MEASURED` (§13).
6. **Education progress is per browser** and has no app-to-Education contextual links (§10 items 58–59).
7. **Help** has no section for expenses, the Monthly report or Property Score, and five screenshots are stale (`docs/OWNER_HELP.md` §5).
8. **Guest-made vs owner-made bookings both have `source = direct`**; guest bookings carry no `booking_source_detail`, so they appear as *Unknown* until the owner sets a source.
9. **One owner per property is assumed** (§10 item 62); the Free Supabase tier pauses on inactivity (§10 item 20); no CSP; plan tiers not enforced (§10 item 15).

---

*Branches and merging:* the integration branch is `Dev` (capital D). Work on a branch, merge into `Dev`, test on the Vercel preview in a **private tab** (a signed-in owner can read rows a guest can't), then merge `Dev` into `main`.

*Audit method (25 Oct 2026):* repo cloned at `ce9325f`; every doc claim in v9.7, AGENTS.md, README.md and PRD.md was checked against the code, `vercel.json`, the migrations and the 16 Oct baseline. Build and typecheck were not run (npm registry unreachable from the audit sandbox).
