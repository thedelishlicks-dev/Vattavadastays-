# stayidom.in — Product Requirements Document v1.2

**Last updated:** 25 Oct 2026 (status reconciled with the code at `ce9325f`)
**Previous:** v1.1 (May 2026)
**Author:** stayidom.in team
**Technical detail:** see `HANDOVER.md` (current state) and `AGENTS.md` (rules). This document is about **what** the product must do and **what is done**.

**Status key:** ✅ done · 🟡 partly done · ⬜ not started · ⏸ built but switched off

---

## 1. Vision & goals

**Vision:** a white-label, commission-free booking engine for homestays — built for India's rural connectivity reality, not city assumptions. Each property gets its own branded booking website. No marketplace, no commissions, no OYO or Booking.com dependency.

**What this is:** a booking site and owner dashboard per property, on a subdomain.

**What this is not (V1):** not a listing page, not a marketplace, not an aggregator. Channel sync with other sites is built but parked (§4.6).

**Success metrics (V1):**

| Metric | Status |
| --- | --- |
| 5+ properties onboarded within 3 months | 🟡 four properties exist: Bleaf Mud House (paying), Misty Colina and OriginSoil (trial), Mist Valley (demo). Check `/superadmin` for live numbers. |
| Each property live at `{slug}.stayidom.in` within 10 minutes of setup | 🟡 The superadmin flow exists (add → invite → manage → activate). Not timed on a real onboarding yet. |
| Guest booking completes on 2G | 🟡 Data loads reduced (v9.3). Not measured on a real 2G device. |
| Zero data leaks between properties (RLS audit) | 🟡 Security review done 10–11 Oct 2026 and several fixes applied. Tracking-link token done 26 Oct 2026; legacy phone lookups to be revoked after 30 days (§4.1). |
| Owner manages bookings from mobile on slow connection | 🟡 Mobile layout done. No optimistic updates yet. |

---

## 2. User personas

**Property owner (primary).** Homestay in Vattavada or similar, 2–10 rooms, uses WhatsApp daily, basic Android. Pain: OYO and Booking.com take 15–25% per booking. Needs: own booking page shared via Instagram and WhatsApp, managed from a phone, weak Jio or BSNL signal.

**Guest.** Domestic traveller from Kerala, Karnataka or Tamil Nadu. Finds the property via Instagram, a WhatsApp forward or Google. Books before leaving home. Arrives with weak or no signal. Needs: directions that work offline, a booking confirmation on WhatsApp, to know the cancellation policy before paying.

**Superadmin (platform owner).** Onboards properties, monitors subscriptions and health, single point of support.

---

## 3. Network and performance constraints

**This is the most important section.** Every feature must pass this test.

| Rule | Status |
| --- | --- |
| Guest page loads in under 8 s on 2G | 🟡 Requests cut from 33 to 14 and vendor code split (v9.3). Not measured on a device. |
| No heavy dependencies on the guest page (no Maps JS SDK, no analytics SDK) | ✅ Maps are deep links. Landing page is lazy-loaded. |
| Images via Supabase Storage, compressed, never raw uploads | ✅ `browser-image-compression` on upload; lazy loading for room photos and the map. |
| Offline directions via a native Maps deep link | ✅ `maps.google.com/?q=lat,lng` and Apple Maps on iOS. |
| **PWA with a service worker that caches the shell** | ⏸ **Decided against** (v9.3). Static assets have a one-year immutable cache; a service worker would add a second cache layer to the stale-deploy problem. Revisit with measurements. The manifest exists (`/manifest.json`, dynamic per property). |
| Admin uses optimistic updates | ⬜ No `onMutate` anywhere. Mutations do invalidate queries. |
| No video embeds | ✅ |
| System fonts on the guest page, no Google Fonts import | 🟡 The app loads Fraunces, Inter and Noto Sans Malayalam from Google Fonts. Playfair is still loaded by `index.html`. The spec should be updated: the decision is a small web-font set, one request. |

---

## 4. Functional requirements

### 4.1 Guest booking page (`{slug}.stayidom.in`)

- ✅ Property info, rooms and photos from Supabase; room cards show real availability.
- ✅ Booking form with dates, guests and room choice; the price is the same calculator the owner uses, with seasonal rates.
- ✅ Database re-prices every guest booking and holds it as pending and unpaid.
- ✅ Confirmation screen with summary and booking reference (`#XXXXXXXX`), no PDF.
- ✅ "Notify owner" and "Book via WhatsApp" deep links with the booking details pre-filled.
- ✅ Cancellation policy and house rules shown on the booking form, confirmation, tracking page and printed invoice.
- ✅ Booking-status (tracking) page: guest opens the link from the confirmation card or WhatsApp. The link carries a secret token; there is no phone search. Legacy `?phone=` links work until the 30-day window closes.
- ✅ Static map image and "Get Directions" (Google and Apple deep links).
- ✅ SEO: per-property `<title>`, description, Open Graph, JSON-LD (`schema.org/LodgingBusiness`), `robots.txt` and `sitemap.xml` per host (`api/og.ts`, `api/seo.ts`).
- 🟡 **Prerendering** was planned (vite-plugin-prerender). Not used: link previews come from an Edge Function (`api/og.ts`) instead. Crawlers see the injected tags.
- ✅ **Tracking-link token:** random token per booking/group in the link (26 Oct 2026). ⬜ Revoke legacy phone lookups after 30 days.

**WhatsApp booking flow (guest-initiated):** unchanged. Guest taps "Book via WhatsApp" or submits the form, the owner confirms in WhatsApp and records the booking in the dashboard. No payment gateway. The owner collects UPI or cash directly.

### 4.2 Owner admin dashboard (`/admin`)

- ✅ Login, auth guard, password reset, six navigation sections (Home, Calendar, Bookings, Money, Rooms & Pricing, Property).
- ✅ Rooms CRUD with photos, room amenities, base prices and **seasonal rates** (fixed ₹ or ±%, per room or all rooms).
- ✅ Bookings: list, detail, Edit Stay (with refund and commission warnings), add booking with extra charges, quotes → booking.
- ✅ Owner calendar: all-rooms view with Full and Blocked; per-room view; block and unblock dates; labels Booked / Pending / Check-out / Blocked / Open.
- ✅ Payments: mark fully paid, correct collected amount, part-payments, derived paid status, refund due, CSV export.
- ✅ Agents and commissions: percentage or flat, per-booking or per-group, mark paid, CSV export, delete clears records.
- ✅ Dashboard: first-run checklist, "needs attention", revenue for the month, upcoming stays.
- ✅ Settings: branding, owner info, location, UPI and payment methods, password.
- ✅ Amenities, meals, add-ons and packages, seasons (for add-ons), policies.
- 🟡 **Dashboard fixes from v1.1:** room names shown ✅; upcoming count excludes cancelled ✅; monthly revenue excludes cancelled ✅; settings cache invalidation ✅.

**WhatsApp from the dashboard:** ✅ reminder modal (`WhatsAppReminderModal`) for booking confirmed, payment reminder and directions, with the owner's numbers and deep links. The day-before reminder template exists (`src/lib/whatsapp.ts`).

### 4.3 Offline maps and directions

- ✅ Static area image, uploaded by the owner.
- ✅ "Open in Google Maps" and "Open in Apple Maps" (iOS only) deep links.
- ✅ Directions message template from the dashboard with the coordinates and landmark text.
- The design rationale holds: native Maps caches route data, so the deep link needs no JS on the guest's device.

### 4.4 SEO and discoverability

- ✅ Per-property title, description, `og:image`, `og:title`, canonical, JSON-LD (served in the HTML by `api/og.ts`).
- ✅ `robots.txt` allows all; `sitemap.xml` per property host.
- ✅ No central listing page in V1 (each subdomain is its own SEO entity).
- 🟡 Google indexing depends on crawlers accepting the Edge-served HTML. Check Search Console after launch.

### 4.5 Multi-tenant architecture

- ✅ One Supabase project, isolation by `property_id` and RLS.
- ✅ Subdomain routing (`getSubdomain()`); localhost falls back to the dev env var.
- ✅ Wildcard domain `*.stayidom.in` on Vercel; no code changes per property.
- ✅ Superadmin reads any property (`?property=`), owners read only their own.
- 🟡 Superadmin's email is set in more than one place (HANDOVER §10 item 6). Move it to one place.

### 4.6 Channel sync with other booking sites (iCal) — parked ⏸

- ✅ Export: each room publishes its occupied nights as an iCal feed (`/api/ical?room=`), with no guest data.
- ⏸ Import: owners paste Booking.com, Airbnb, Agoda or MakeMyTrip links; nights are blocked. Built and tested, switched off because owners currently take bookings by Instagram and phone.
- Turn on when owners in Munnar, Alleppey or Varkala also list on other sites. Steps in `docs/PARKED_FEATURES.md`.

### 4.7 Superadmin

- ✅ Properties list with search and filter chips (All, Needs action, Trial, Active, Overdue, Suspended).
- ✅ Add property with subdomain validation (3–30 characters, not reserved, not in use) and owner email validation.
- ✅ One-click owner invite (`invite-owner` Edge Function) and link for an existing login.
- ✅ Per-property setup checklist (nine steps) and "needs action" reasons.
- ✅ Activate; Mark Renewed (adds 30 days to the later of today or the current end date; asks to confirm).
- ✅ Plan and billing form: tier, monthly fee, setup fee, private notes.
- ✅ WhatsApp owner messages (dashboard ready, renewal reminder) with correct phone numbers.
- ✅ Leads tab (landing-page enquiries).
- ✅ Errors tab: client error log, grouped, with a 30-day purge.
- ⬜ Revenue overview across tenants beyond the MRR card.
- ⬜ "Demo / internal" flag to exclude test properties from MRR.

---

## 5. Multi-tenant security model

- ✅ RLS on every table (verified in the 10–11 Oct 2026 security review).
- ✅ `anon` can't read `bookings`; guests use `availability` and phone-lookup RPCs.
- ✅ Guest bookings are re-priced and forced to pending by the database.
- ✅ Booking room must belong to its property (trigger).
- ✅ Owners can't change billing columns; the superadmin email can't own a property.
- ✅ Public lead inserts are size-limited and rate-limited.
- ⬜ Security headers in `vercel.json`.
- ✅ Tracking-link token (§4.1). ⬜ Revoke legacy phone lookups (30 days).
- ⬜ Pricing or RLS test in CI against the live policies — the CI DB job uses a stub, not the live project.

---

## 6. Subscription and billing

**Pricing on the landing page (current):**

| Plan | Rooms | Setup | Monthly |
| --- | --- | --- | --- |
| Starter | 1–5 | ₹5,000 | ₹1,000 |
| Growth | 6–10 | ₹10,000 | ₹1,500 |
| Pro | 10+ | ₹25,000 | ₹2,000 |

(v1.1 said ₹499/month and ₹2,999 setup. That is superseded.)

**Trial:** new properties start as `trial`. The v1.1 trial length (14 days) isn't enforced in the app; trial ends when the superadmin activates or leaves it.

**Current flow (manual):**
- ✅ Superadmin collects setup fee and monthly fee by UPI.
- ✅ Superadmin marks the setup fee paid and activates; renewal date set to 30 days out.
- ✅ Renewal states: overdue, due soon (under 7 days), active.

**Not enforced:**
- ⬜ Plan tiers. The app doesn't limit features by plan, and the DB tier values (`small`/`large`) don't match the sold plans (Starter/Growth/Pro). See HANDOVER §10 item 15.
- ⬜ Automatic suspension after a grace period.

**V2 (automated):** Razorpay subscriptions, webhook updates status, auto-suspend after the grace period. ⬜

---

## 7. WhatsApp integration

No WhatsApp Business API in V1. `wa.me` deep links only: free, instant, no approval.

| Trigger | Message | Status |
| --- | --- | --- |
| Booking confirmed | "Dear {name}, your booking at {property} is confirmed…" | ✅ |
| Directions | "Here's how to reach us: {maps link}…" | ✅ |
| Payment reminder | "payment of ₹{amount} is pending… UPI: {upi_id}" — correctly shows "settled" or "refund due" | ✅ |
| Day-before reminder | "looking forward to your arrival tomorrow…" | ✅ (`buildDayBeforeText`) |
| Guest booking request → owner | Deep link with the booking reference | ✅ |

**Rules:**
- Phone numbers: `+91…` and `0…` forms are normalised to `91…` (`waNumber()` / `src/lib/whatsapp.ts`).
- Tracking links carry a token and the property id. Links with a phone number (sent before 26 Oct 2026) keep working for 30 days, then the owner must resend them.

**V2:** WhatsApp Business API (Meta) for sending without the guest starting the chat. Needs Meta Business verification. ⬜

---

## 8. Tech stack

| Layer | Tool | Notes |
| --- | --- | --- |
| Framework | Vite 7 + React 19 + TypeScript | SPA, not SSR |
| Routing | TanStack Router 1.166.7 | Pinned |
| Styling | Tailwind CSS 4 | |
| Database | Supabase (Postgres, RLS) | Baseline + migrations in the repo |
| Auth | Supabase Auth | Client-side |
| Data | TanStack Query 5 | |
| Hosting | Vercel | Static SPA + Edge Functions in `api/` |
| Maps | Native deep links only | No Maps JS SDK |
| WhatsApp | `wa.me` deep links | No API in V1 |
| Images | Supabase Storage | Compressed on upload |
| Link previews and SEO | Vercel Edge Functions (`api/og`, `api/seo`) | Replaces the prerender plan |
| Invites | Supabase Edge Function (Deno) `invite-owner` | |
| Tests | `npm test`, `npm run check`, CI with migration tests | |

**Never install:** `@tanstack/react-start`, `@supabase/ssr`, a Google Maps JS SDK, any heavy mapping library.

---

## 9. Milestones and roadmap

### Phase 0 — Core foundation ✅
All items done (admin login and guard, rooms, bookings, calendar, add/edit rooms and bookings, settings, guest booking end to end, WhatsApp links, "Book via WhatsApp").

### Phase 1 — Multi-tenant and admin features ✅
All items done: `property_id` on every table, dynamic subdomain, superadmin invite and dashboard, wildcard domain, tenant isolation tested, pricing / meals / amenities / policies / payments pages, sentinel config, UPI / bank / cash, part-payments, "Notify owner" after booking.

### Phase 2 — Guest experience and SEO — 🟡 mostly done
- ✅ Static map image and directions deep links
- ✅ "Book via WhatsApp" CTA
- ✅ SEO meta tags, Open Graph, JSON-LD per property
- ✅ `schema.org/LodgingBusiness` structured data
- 🟡 PWA manifest ✅; service worker ⏸ deliberately not added (§3)
- 🟡 Performance audit on simulated 2G: request count and bundle reduced; **a device test is still needed**

### Phase 3 — WhatsApp dashboard messaging — 🟡
- ✅ Reminder modal with booking-level actions
- ✅ Payment reminder template
- ✅ Directions template
- ✅ Day-before template

### Phase 4 — Billing and onboarding — ✅ mostly done
- ✅ Trial → active flow in `/superadmin`
- ✅ Manual UPI collection with superadmin status toggle, renewal tracking
- ✅ Property onboarding checklist (in the superadmin row)
- 🟡 Pilot beta properties: Bleaf Mud House (paying) and Misty Colina, OriginSoil, Mist Valley on trial or demo

### Phase 5 — Central listing page — ⬜ Future, post-pilot
- ⬜ `stayidom.in` "Browse properties" page
- ⬜ Property cards with availability preview
- ⬜ Filter by dates, guests, price
- ⬜ Each card links to `{slug}.stayidom.in`
- Note: `stayidom.in` currently shows the owner-facing landing page, not a listing.

### Added since v1.1 (not in earlier roadmap)
- ✅ Seasonal and date-range room rates
- ✅ Server-side price and pending state for guest bookings
- ✅ Double-booking exclusion constraint
- ✅ Money maths in one module; refund due shown
- ✅ Client error log on `/superadmin`
- ✅ Admin speed: windowed fetches, pagination, indexes
- ✅ CI with build, typecheck, tests, migration tests
- ⏸ Channel sync (iCal import) — built, switched off

---

## 10. Open questions

| # | Question | Status |
| --- | --- | --- |
| 1 | ID proof collection: Supabase Storage or email to owner only? | ⬜ Open — no ID-proof feature exists in the code. |
| 2 | Cancellation policy: per property or platform standard? | ✅ Per property (owner writes it in Policies; shown to guests). |
| 3 | Language: English only or Malayalam in V1? | 🟡 Landing copy has Malayalam; the app UI is English. Native-speaker review pending. |
| 4 | Superadmin: env var or `is_superadmin` column? | 🟡 Both today (env var + hard-coded email). Decide: a `superadmins` table. |
| 5 | Static map image: owner uploads or auto-generate from lat/lng? | ✅ Owner uploads. |

---

## 11. Constraints and non-negotiables

- **No commissions.** The platform earns from subscriptions only, never per booking. ✅
- **No marketplace in V1.** No central listing, no compare-and-book. ✅
- **No heavy JS on the guest page.** No Maps SDK, analytics SDK or chat widget. ✅
- **RLS is the security model.** No property sees another's data. Must be re-tested before each production deploy; the last full review was 10–11 Oct 2026.
- **WhatsApp is the primary channel.** Every notification has a WhatsApp path. ✅
- **Mobile first.** Every UI designed for 375 px first, desktop second. Modal and sheet rules in HANDOVER §3.

---

*Update this document at the start of each phase. Keep it in the repo root as `PRD.md`.*
