# AGENTS.md

# stayidom.in — Agent Instructions

Read this file fully before writing a single line of code. Then read `HANDOVER.md` §3 (rules) and §10 (known issues).

---

## What this project is

stayidom.in is a SaaS platform giving vacation rental and homestay owners across Kerala's tourism belt (mountains, backwaters, beaches) their own standalone booking website. It is piloted in Vattavada, a remote mountain village with weak 2G-grade signal — the platform's toughest connectivity test case, not its only market.

- Guest side: public booking website at `{subdomain}.stayidom.in`
- Owner side: protected dashboard at `/admin`
- Superadmin: `/superadmin` (platform operator only)
- No platform payments: owners collect money directly (UPI, cash, bank transfer)

---

## Tech stack — do not deviate from this

| Layer         | Tool                      | Notes                                                     |
| ------------- | ------------------------- | --------------------------------------------------------- |
| Framework     | Vite + React + TypeScript | SPA — NOT SSR, NOT TanStack Start                         |
| Routing       | TanStack Router 1.166.7   | File-based routing under `src/routes/`                    |
| Styling       | Tailwind CSS v4           | No CSS modules, no styled-components                      |
| Database      | Supabase (PostgreSQL)     | Schema in `supabase/baseline/` + `supabase/migrations/`   |
| Auth          | Supabase Auth             | Client-side, localStorage managed by Supabase SDK         |
| Data fetching | TanStack Query v5         | `useQuery` + `useMutation` only                           |
| Hosting       | Vercel                    | Static SPA + Vercel Edge Functions in `api/`              |
| Edge (Supabase) | Deno Edge Function      | `supabase/functions/invite-owner/` (see HANDOVER §10) |

---

## CRITICAL — This is a Vite SPA, not TanStack Start SSR

These mistakes will break the build immediately:

- NEVER use `createServerFn()`
- NEVER import from `@tanstack/react-start` — not installed
- NEVER import from `@supabase/ssr` — not installed
- NEVER use `createServerClient` or `createBrowserClient`
- NEVER write server-side loaders or `beforeLoad` auth guards
- NEVER use HTTP-only cookies for session management

The Supabase client is a standard browser singleton in `src/lib/supabase.ts`. Auth state is managed client-side via `onAuthStateChange`. Data fetching is done from the browser with the Supabase client.

**Vercel Edge Functions in `api/` are allowed** (they are plain request/response handlers, not TanStack server functions). Keep them small, self-contained, and covered by `tests/api/`.

---

## Supabase client pattern — always use this

```typescript
// src/lib/supabase.ts — single exported instance
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

Import `supabase` directly in hooks and components. Never instantiate a new client elsewhere.

---

## Auth pattern — always use this

```typescript
supabase.auth.signInWithPassword({ email, password })
supabase.auth.signOut()
supabase.auth.getSession()
supabase.auth.onAuthStateChange((event, session) => { ... })
```

`useAuth()` lives in `src/hooks/useAuth.ts` (`useState` + `useEffect` with `onAuthStateChange`).

---

## Data fetching pattern

Direct Supabase queries wrapped in TanStack Query hooks. Query keys for bookings must start with `"bookings"` or `"bookingGroups"` (every mutation invalidates by that prefix). Any unbounded list must go through `fetchAllRows()` (`src/lib/paginate.ts`) — Supabase silently caps one request at 1,000 rows.

```typescript
export function useProperty(subdomain: string) {
  return useQuery({
    queryKey: ["property", subdomain],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*, rooms(*)")
        .eq("subdomain", subdomain)
        .eq("is_active", true)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!subdomain,
  });
}
```

RLS enforces all security. Owners only see their own data because `auth.uid()` is checked by Postgres.

**Do not call `useBookings()` / `useBookingGroups()` unwindowed** on a screen that doesn't need all-time data (see HANDOVER v9.5 rules, still in force).

---

## File structure (current)

```
api/                    ← Vercel Edge Functions: og, seo, manifest, ical, ical-sync (+ api/_lib/)
src/
  lib/
    supabase.ts         ← single supabase client instance
    balance.ts          ← ALL money maths (computeBalance, advanceAmount, …)
    quoteBuilder.ts     ← priceRoomStay() — the one owner-side price calculator
    roomRates.ts        ← seasonal-rate rules (pickRate); mirrors SQL stay_room_price()
    calendarState.ts    ← owner Calendar labels (pure, tested)
    onboarding.ts       ← superadmin statuses, checklist, WhatsApp helpers
    propertyConfig.ts   ← the ONLY writer of shared_amenities
    bookingAvailability.ts, paginate.ts, errorLog*.ts, dbErrors.ts, features.ts, …
  hooks/                ← TanStack Query hooks (useBookings, useCreateBooking, useRoomRates, …)
  admin/                ← AdminLayout, navConfig.ts (navigation is data), SectionTabs
  components/           ← UI (see HANDOVER §3 for the "one home" components)
  routes/               ← TanStack file routes (admin.*, superadmin*, index, booking-status, …)
supabase/
  baseline/             ← live DB snapshot (16 Oct 2026) — the reference schema
  migrations/           ← changes since the baseline; run in order
  tests/                ← migration + RLS tests run by CI
scripts/                ← *.check.ts behaviour checks, typecheck.sh, run-checks.sh
tests/api/              ← tests for api/ handlers
docs/                   ← PARKED_FEATURES, POLISH_FIVE, CALENDAR_FIX, DB_CHECKS.sql
```

---

## Database

**The schema exists. Do NOT run `CREATE TABLE` for existing tables.** For the full current schema, triggers, RPCs and RLS, read `supabase/baseline/*.sql`. Changes go in a new file under `supabase/migrations/` that is safe to run twice (`create … if not exists`, `create or replace`).

Key tables (short form):

- `properties`: `id, owner_id, name, subdomain, area, location_lat/lng, shared_amenities (text[]), hero_image, theme, check_in_time, check_out_time, is_active, subscription_status, subscription_tier, monthly_fee, setup_fee_paid, setup_fee_amount, billing_notes, subscription_end_date, …`
  - `subscription_status`: `'trial' | 'active' | 'pending_setup' | 'suspended'` (`trial` and `pending_setup` are the same stage in the UI).
  - `subscription_tier`: DB allows `'small' | 'large'`; the UI sells Starter / Growth / Pro. Unresolved — see HANDOVER §10 item 15.
- `rooms`: `id, property_id, name, room_type, max_guests, base_price, extra_guest_price, weekend_multiplier, room_amenities, images, is_active`
- `room_rates`: seasonal rate periods — `room_id` (null = all rooms), `start_date`, `end_date` (last night, inclusive), `kind` (`fixed` | `percent`), `value`
- `availability`: `(room_id, date)` PK, `is_available`, `note`. `price_override` still exists and is **unused**.
- `bookings`: `id, property_id, room_id, group_id, guest_name, guest_phone, check_in, check_out, nights (generated), room_price, extra_guest_charge, total_amount, status, advance_amount, is_paid, hold_expires_at, agent_id, commission_amount, commission_paid, source, …`
  - Statuses: `pending`, `confirmed`, `cancelled`, `completed`.
  - Exclusion constraint `bookings_no_overlap` blocks overlapping active stays.
- `booking_groups`, `booking_charges`, `agents`, `quotes`, `leads`, `client_errors`, `room_ical_feeds`, `invite_tokens`: see baseline.

---

## Access rules (RLS and triggers)

- Public can read active properties and rooms (no auth). Guests **cannot** read `bookings` — they use `availability`, `room_booked_ranges()` and the phone-lookup RPCs.
- Anyone (anon) can insert a booking, but BEFORE INSERT triggers **re-price it and force `pending`/unpaid** (see Booking flow below).
- Public can insert `leads` (rate-limited by trigger).
- Owners manage only their own property's data (`owner_id = auth.uid()`).
- Only the superadmin email can read `client_errors`.
- Owners cannot change billing columns; a trigger enforces it.
- The superadmin email can never be set as a property's owner (trigger).
- Image uploads are limited to the owner's `<property_id>/` folder.

---

## Package versions — do not change these

- `@tanstack/react-router`: **1.166.7** (pinned — do not upgrade)
- `@tanstack/router-plugin`: **1.166.7** (pinned)
- `@tanstack/react-query`: `^5.83.0`
- `@supabase/supabase-js`: `^2.105.3`

Never install `@tanstack/react-start` or `@supabase/ssr`. Never upgrade `@tanstack` packages without explicit instruction.

Lockfile: `package-lock.json` (CI uses `npm ci`). Don't add `bun.lockb` back.

---

## Design system — do not change these values

| Token          | Value               |
| -------------- | ------------------- |
| Primary green  | `#166534`           |
| Light green    | `#dcfce7`           |
| Accent amber   | `#f59e0b`           |
| Background     | `#fafaf9` (stone-50) |
| Text primary   | `#1c1917` (stone-900) |
| Text secondary | `#78716c` (stone-500) |

The frontend UI was built on Lovable. Do not redesign, restyle, or restructure existing components. Only replace mock data with real Supabase data and add missing logic.

---

## Environment variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PROPERTY_SUBDOMAIN=        # dev fallback
VITE_SUPERADMIN_EMAIL=          # must match the superadmin email in HANDOVER §10 item 6
```

Set in Vercel project settings. Never hardcode. Never commit `.env` files (`.env.example` is the template).

Edge-only secrets (never in the browser): `ICAL_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## CRITICAL: Sentinel Key Pattern in `shared_amenities`

`properties.shared_amenities` is a `text[]` column used for TWO purposes:

1. Real amenity tags like `"parking"`, `"wifi"`, `"bonfire"` — shown to guests
2. Sentinel keys prefixed with `__` — config stored without new DB columns

| Prefix        | Stores                        | Used by                    |
| ------------- | ----------------------------- | -------------------------- |
| `__meals:`    | JSON-encoded `MealsConfig`    | Meals page                 |
| `__cancel:`   | Cancellation policy text      | Policies page              |
| `__rules:`    | House rules text              | Policies page              |
| `__upi:`      | UPI ID string                 | Settings → Payment setup   |
| `__pmethods:` | JSON array of payment methods | Settings → Payment setup   |
| `__theme:`    | Selected theme name           | ThemeProvider              |

**Rules:**

- Always filter sentinels out before displaying amenities to guests: `.filter(a => !a.startsWith('__'))`
- Always preserve sentinels when saving amenities: write through `src/lib/propertyConfig.ts` only
- Values are `encodeURIComponent(JSON.stringify(value))`-encoded

---

## Booking flow — current implementation

### Guest booking (`src/hooks/useCreateBooking.ts`)

No RPC. Direct client calls in sequence:

1. Load room details and seasonal rates (`fetchRoomRates`).
2. Check availability through `getBlockedDatesForRooms`, which gets booked dates from `room_booked_ranges()` (guests can't read `bookings` directly).
3. Price the stay with `priceRoomStay()` (`src/lib/quoteBuilder.ts`) — the same calculator as the owner side.
4. Insert the booking (and group, if multi-room) as `pending`.
5. Insert is re-checked by the database:
   - `enforce_guest_booking_terms` (BEFORE INSERT) recomputes price with `stay_room_price()`, forces `pending`, unpaid, `source='direct'`, a capped hold (default 24 h).
   - `bookings_no_overlap` rejects overlapping active stays (SQLSTATE 23P01 → "Those dates were just booked for this room.").
6. The mirror `availability` rows are written by `trg_mark_booking_nights` (not by the browser).

`stay_room_price()` (SQL) and `priceRoomStay()` (TS) must stay identical. `scripts/pricing.check.ts` covers this.

### Owner booking

`AddBookingModal` (Home, Bookings, Quotes → convert). Owner inserts are **not** re-priced by the trigger: the owner's price and any negotiated price stand.

### Availability triggers

- `trg_mark_booking_nights`: on insert or date change, marks the nights of every non-cancelled booking as `is_available = false`. Only marks, never frees.
- Freeing: on cancellation from **any** status (`free_nights_on_any_cancel`), on the status trigger, and on `expire_stale_pending_bookings()` (cron every 15 minutes).

### Booking reference

Guest sees `#XXXXXXXX` (first 8 chars of the booking UUID, uppercased) on the success screen. The same reference is in the WhatsApp message to the owner.

---

## Superadmin — managing a property

Superadmin can open any property's dashboard:

```
/admin/dashboard?property={subdomain}
```

- `admin.tsx` reads `?property=` from `window.location.search`. `useOwnerProperty` detects superadmin + `?property=` and fetches by subdomain.
- **Never** use TanStack Router's `useSearch` for this param.

### Onboarding flow (current)

1. Superadmin: **Add property** in `/superadmin` (name, subdomain, owner email, owner name/phone, area).
2. **Invite owner now** (or **Invite owner** on the row → **Send invite & link**). The `invite-owner` Edge Function emails the owner a set-password link and links the account in one step. If the owner already has a login, it just links it (**Link existing account**).
3. Superadmin: **Manage** on the row, then set up rooms, prices, UPI ID, policies and a hero photo. The row's checklist shows what's left.
4. Owner opens the invite on their own device, sets a password, signs in at `stayidom.in/login`. Test invites in a private window, never in the superadmin's browser (that replaces the superadmin session).
5. Superadmin: **Activate** once the setup fee is paid. Trial and legacy `pending_setup` both show Activate.

Supabase Auth must have: Site URL `https://stayidom.in`; Redirect URLs `https://stayidom.in/reset-password` and `https://*.stayidom.in/**`; a customised "Invite user" template. Details in HANDOVER §9 (v9.7).

The superadmin login is never a property owner (trigger). The `/setup` route is removed. Still to drop in the DB: `get_invite_by_token`, `create_owner_auth_user`, `consume_invite_token`.

---

## Payment & recording logic

- **`advance_amount`** = cumulative amount actually received. Recording a payment adds to it.
- **`is_paid`** can go stale. Derive "paid" with `computeBalance(...).isPaid` (`src/lib/balance.ts`).
- **Never** hand-roll `total + extras − discount − advance` or `Math.max(0, …)`. Overpayment must show as **Refund due**.
- **Methods:** "UPI", "Bank Transfer", "Cash on Arrival".
- **UPI flow:** guest taps Pay → `upi://` deep link → pays in their app → sends screenshot to owner on WhatsApp.
- **Tracking links** must include the property id: `guestTrackingUrl(origin, phone, propertyId)`.
- **Notifications:** guests notify the owner via WhatsApp deep link after booking. Owners send reminders via WhatsApp deep links from booking details.

---

## Agent rules for changes

- Ship a change as: new files first, then edited files, each as a full-file replacement (the owner pastes into GitHub's web editor).
- Keep every JSX `<a …>` opening tag on one line.
- Add a test when you add a rule to `balance.ts`, `onboarding.ts`, `roomRates.ts`, `calendarState.ts` or `ical.ts`.
- For any DB change: write a migration under `supabase/migrations/`, make it idempotent, and add a query to `docs/DB_CHECKS.sql` if it changes what the app reads.
- Never add a second editor for data that already has a home (HANDOVER §5).
- Never claim a feature on the landing page or in checklists that the app can't back up.
- Stay dates: always use `RoomAvailabilityCalendar` (the Add Booking picker). Never a plain `<input type="date">` for stay dates (HANDOVER rule 24).

---

## What is already done (as of 25 Oct 2026)

- [x] Supabase schema, RLS, baseline snapshot (16 Oct 2026)
- [x] Vercel deployment (Vite SPA) with Edge Functions for link previews, SEO and iCal
- [x] Multi-tenant subdomain routing; superadmin dashboard and "manage property"
- [x] Owner admin: rooms, seasonal rates, bookings, calendar, quotes, payments, agents, commissions, settings
- [x] Server-side pricing and forced-pending for guest bookings
- [x] Double-booking exclusion constraint
- [x] Auto-block on booking insert; auto-free on cancel from any status; 24 h pending holds
- [x] Money maths in one module, with overpayment shown as refund due
- [x] Superadmin invite-owner flow, setup checklist, renewal states
- [x] Client error log on `/superadmin`
- [x] CI: build, typecheck, unit tests, behaviour checks, DB migration tests
- [x] Guest paths read booked dates via `room_booked_ranges()`, not `bookings`
- [x] Cleanup: duplicate migration, dead hook, test route, `/setup`, lockfile, invite function location
- [ ] Cleanup: `recharts`, old DB functions
- [ ] Tracking-link token (replace phone-only lookup)
- [x] Security headers in `vercel.json` (no CSP yet)
- [ ] Landing page rewrite on `main`
- [ ] Edit Stay date picker matches the app calendar (HANDOVER §10 item 21)
- [ ] Plan-tier enforcement decision
- [ ] Channel sync (iCal import) — built, switched off (`CHANNEL_SYNC_ENABLED`)
- [ ] Agent self-service, WhatsApp Business API, billing, central listing
