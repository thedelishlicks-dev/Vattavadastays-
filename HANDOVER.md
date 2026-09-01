# stayidom.in — Session Handover v7

**Date:** August 2026
**Handover from:** Claude (AI pair-programming session)
**Branch:** main (active, deployed to Vercel) — agent booking tracking merged via PR #319

---

## Project Summary

stayidom.in is a white-label, commission-free booking and property management SaaS for vacation rentals and homestays across Kerala's tourism belt — mountains, backwaters, and beaches. Currently piloting in Vattavada (Idukki), a remote mountain village with weak 2G-grade BSNL/Jio signal, used as the platform's connectivity stress-test market before wider rollout.

- Guest side: `{subdomain}.stayidom.in` — public booking page
- Owner side: `/admin` — protected dashboard
- Superadmin side: `/superadmin` — platform management
- Stack: Vite + React + TypeScript + TanStack Router 1.166.7 + Supabase + Tailwind CSS v4
- Hosting: Vercel (static SPA)
- Repo: `github.com/thedelishlicks-dev/Vattavadastays-`

---

## Environment Variables (Vercel)

| Key                       | Value                                           |
| ------------------------- | ----------------------------------------------- |
| `VITE_SUPABASE_URL`       | `https://vzzfqgqxnodlrvnaxpbw.supabase.co`      |
| `VITE_SUPABASE_ANON_KEY`  | See Supabase → Settings → API Keys              |
| `VITE_PROPERTY_SUBDOMAIN` | `bleafmudhouse` (dev fallback)                  |
| `VITE_SUPERADMIN_EMAIL`   | Superadmin email address                        |

---

## Round 6 Changes — June 2026

### Added
- **Onboarding Checklist** — Added a dynamic checklist on the admin dashboard to guide owners through property setup (logo, hero image, rooms, availability, UPI, policies).
- **Link Owner Functionality** — Superadmin can now explicitly link a Supabase user account to a property via the `Link Owner` button in the superadmin dashboard.
- **Marketing Leads** — Documented and confirmed the `leads` table for capturing demo requests from the landing page.
- **Enhanced Property Schema** — Included billing fields (setup fee, monthly fee) and additional branding fields (logo_url, static maps).

### Fixed
- **Revenue Calculation** — Monthly revenue in the dashboard now correctly filters by `check_in` month.
- **Payment Method Consistency** — Standardized payment methods to "UPI", "Bank Transfer", and "Cash on Arrival".

### Attempted but reverted
- `create_booking_atomic` Postgres RPC — built, tested in SQL Editor, but Supabase Free tier PostgREST schema cache returns 404 on RPC calls. Reverted to direct insert in `useCreateBooking.ts`. Re-enable on Pro upgrade.

---

## Round 7 Changes — August 2026

Owner-entered agent/commission tracking on bookings (agent self-service is a
future phase, not built). Built in 3 stages: schema + Agents screen →
booking form → commission ledger, then several follow-up fixes discovered
during testing on the dev-branch preview.

### Added
- **`agents` table** — name, phone, default commission type
  (percentage/flat) + value, notes. Scoped by `property_id` (not global) so
  RLS keeps each owner's agents and commission rates isolated from other
  owners on the platform, same as every other owner-data table.
- **`bookings` / `booking_groups` columns** — `source`
  (`direct`/`agent`/`walk_in`), `agent_id`, `commission_amount`,
  `commission_paid`, `commission_paid_date`. `commission_amount` is
  calculated once at booking creation from the agent's rate at that moment
  and stored — it is never recalculated from the agent's live rate later,
  so changing an agent's default rate doesn't retroactively change past
  bookings' commission.
- **Agents screen** (`/admin/agents`) — add/edit/list agents.
- **Booking form** — "How did this booking come in?" (Direct/Agent/Walk-in).
  Selecting Agent shows a dropdown (with inline "+ Add new agent") and
  auto-fills commission from that agent's default rate against the room-rate
  total; the amount stays editable for one-off negotiated rates.
- **Commission ledger** (`/admin/commissions`) — per-agent bookings-this-month
  count and all-time unpaid commission owed, expandable to individual
  bookings, a mark-as-paid toggle, and a CSV export (there was no
  pre-existing CSV export anywhere in the app to "extend" — this was built
  from scratch).
- **Multi-room bookings**: commission is calculated once on the *summed*
  room rate across all rooms in the group and stored only on
  `booking_groups.commission_amount`, not split across the individual
  `bookings` rows — mirrors how `total_amount` already works for groups,
  and avoids double-counting when the ledger sums totals. Member `bookings`
  rows still carry `source`/`agent_id` for traceability.
- **Visual availability calendar in the owner booking form**
  (`RoomAvailabilityCalendar.tsx`) — month-grid date picker showing
  booked/blocked dates for the currently selected room(s), same
  click-a-range interaction as the guest-facing site. A date is shown
  blocked if *any* currently-selected room is unavailable, since a
  multi-room booking needs every selected room free at once.

### Fixed
- **Two divergent "Add Booking" modals, unified into one.** The Dashboard
  had `AddBookingModal.tsx`; the Bookings page had its own separate inline
  `AddGroupBookingModal` inside `admin.bookings.tsx`. They'd drifted apart —
  the Bookings-page version had availability-conflict checking and correct
  `max_guests`-based extra-guest pricing that the Dashboard version lacked
  (it used a hardcoded "2 guests included" assumption). Merged into one
  `src/components/AddBookingModal.tsx`, used by both pages. **If a third
  booking-creation entry point is ever added, it should import this
  component rather than growing another copy** — that's exactly how this
  drift happened the first time.
- **Owner-created bookings could be double-booked by a guest.** Root cause:
  `trg_booking_status_change` (see Database Triggers below) only fires on
  `UPDATE of status`, not `INSERT` — but the owner-side booking form inserts
  new bookings with `status` already set to `'confirmed'` or `'pending'`, so
  the trigger never fires for them and the `availability` table was never
  told about them. Meanwhile the *guest*-facing booking flow's own conflict
  check reads `availability`, not `bookings`. Net effect: a guest could book
  straight over a room an owner had just added by hand, with no warning.
  Fixed two ways — see `src/lib/bookingAvailability.ts`:
  - The conflict check (`getUnavailableDates`) now queries the `bookings`
    table directly rather than relying on `availability` being in sync —
    matches the approach the guest-facing calendar (`Availability.tsx`)
    already correctly used for its own display.
  - `AddBookingModal.tsx` now explicitly upserts `availability` after every
    save (`markDatesUnavailable`), mirroring what `useCreateBooking.ts`
    already does for guest bookings, so it doesn't depend on the trigger.
  - **Not covered**: editing an existing booking's room/dates
    (`EditStayModal` in `admin.bookings.tsx`) has the same gap and was left
    alone — flagged in "What Needs Doing Next" below rather than
    scope-creeping into it.
- **`AgentFormModal.tsx` commission-value input** snapped back to `0` on
  every empty keystroke, making it impossible to clear and retype — and
  could feed `NaN`/`null` into the insert (the column is `NOT NULL`),
  causing Add Agent to fail. Fixed by letting the field hold an empty string
  while mid-edit and only coercing to a number right before saving.
- **`useAgents.ts` swallowed the real Supabase error.** `if (error) throw
  error` was throwing Supabase's `PostgrestError`, which isn't a native
  `Error`, so the UI's `e instanceof Error` check always fell through to a
  generic "Save failed" — hiding RLS violations, constraint failures, etc.
  Wrapped Supabase errors in a real `Error` before throwing.

### Notes for next session
- The RLS violation encountered while testing Add Agent ("new row violates
  row-level security policy") was **not a bug** — it was testing as the
  superadmin account via `?property=<slug>`. Viewing works because
  properties have a public read policy, but *writing* to any owner-scoped
  table (agents, bookings, rooms, availability — all of them) requires the
  logged-in `auth.uid()` to literally equal that property's `owner_id`.
  Logging in directly as the property's actual owner account resolved it.
  Worth remembering for any future testing on someone else's property via
  superadmin.

---

## Current Properties in Production

| Property          | Subdomain     | Status        |
| ----------------- | ------------- | ------------- |
| Bleaf Mud House   | bleafmudhouse | active        |
| Mist Valley       | demo          | trial (demo)  |
| MistyMountain     | mistymountain | pending       |
| Greenforest       | greenforest   | pending       |
| Green Valley      | greenvalley   | pending       |

---

## CRITICAL Architecture Rules — Do NOT Violate

- **NEVER** use `createServerFn()`, `@tanstack/react-start`, or `@supabase/ssr`
- **NEVER** add `shellComponent`, `HeadContent`, or `Scripts` to `__root.tsx`
- **NEVER** install `@tanstack/router-devtools`
- **NEVER** upgrade `@tanstack/react-router` — pinned at 1.166.7
- **NEVER** use Google Maps JS SDK — use `maps.google.com/?q=lat,lng` deep links only
- **NEVER** use video embeds — too heavy for Vattavada's 2G network
- Auth is client-side only via `supabase.auth` and `onAuthStateChange`
- Login is at `/login` (standalone, outside admin tree)
- All `<a>` tags in JSX must be on a single line — GitHub web editor corrupts multi-line JSX attributes
- For `?property=` param in admin routes: ALWAYS use `window.location.search` directly, NOT TanStack `useSearch` — it does not propagate to child routes

---

## Key Files

| File                                | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `src/routes/__root.tsx`             | Root — QueryClientProvider + Outlet only                         |
| `src/routes/index.tsx`              | Guest booking page                                               |
| `src/routes/login.tsx`              | Standalone login at `/login`                                     |
| `src/routes/setup.tsx`              | DEPRECATED — no longer used. Safe to delete.                     |
| `src/routes/admin.tsx`              | Auth guard — reads ?property= from window.location.search        |
| `src/routes/superadmin.tsx`         | Superadmin layout + auth guard                                   |
| `src/routes/superadmin.index.tsx`   | Superadmin dashboard — all properties + Manage button            |
| `src/admin/AdminLayout.tsx`         | Admin shell with sidebar                                         |
| `src/lib/supabase.ts`               | Single Supabase client instance                                  |
| `src/lib/subdomain.ts`              | `getSubdomain()` + `isSuperAdminEmail()`                         |
| `src/lib/whatsapp.ts`               | WhatsApp deep link helpers (wa.me only)                          |
| `src/hooks/useAuth.ts`              | `onAuthStateChange` pattern                                      |
| `src/hooks/useProperty.ts`          | Guest property + rooms query                                     |
| `src/hooks/useOwnerProperty.ts`     | Owner property query — fetches by subdomain when superadmin      |
| `src/hooks/useBookings.ts`          | Bookings query                                                   |
| `src/hooks/useCreateBooking.ts`     | Guest booking mutation — direct insert (no RPC)                  |
| `src/hooks/useSuperAdmin.ts`        | `useAllProperties`, `useCreateProperty`, `useUpdateSubscription` |
| `src/components/BookingForm.tsx`    | Guest booking form + booking reference + WhatsApp CTA            |
| `src/components/UPIPaymentSection.tsx` | UPI deep link + WhatsApp screenshot prompt                    |
| `src/components/AddBookingModal.tsx` | **Owner booking-creation modal — the ONLY one.** Used by both the Dashboard and the Bookings page. Includes agent/commission UI and the availability calendar. Don't create a second copy of this. |
| `src/components/RoomAvailabilityCalendar.tsx` | Month-grid availability picker embedded in `AddBookingModal.tsx` |
| `src/lib/bookingAvailability.ts`    | `getUnavailableDates`, `getBlockedDatesForRooms`, `markDatesUnavailable` — shared conflict-checking + availability-sync helpers, read the file header comments before changing |
| `src/hooks/useAgents.ts`            | Agents CRUD (list/create/update/delete)                          |
| `src/components/AgentFormModal.tsx` | Shared add/edit agent form — used by both `admin.agents.tsx` and the inline "+ Add new agent" flow in the booking form |
| `src/routes/admin.agents.tsx`       | Agents management screen                                         |
| `src/routes/admin.commissions.tsx`  | Commission ledger — per-agent totals, mark-as-paid, CSV export   |

---

## Database Schema

### properties

```
id, owner_id, name, name_ml, subdomain, area, location_lat, location_lng,
shared_amenities (text[]), description, description_ml, hero_image,
logo_url, hero_tagline, about_image, static_map_image_url, landmark_description,
owner_name, owner_phone, owner_whatsapp, check_in_time, check_out_time,
is_active, theme, heading_font, created_at,
subscription_status ('pending_setup'|'active'|'suspended'),
subscription_tier ('small'|'large'),
monthly_fee, setup_fee_paid, setup_fee_amount, billing_notes, subscription_end_date
```

### rooms

```
id, property_id, name, name_ml, room_type, max_guests, bed_type,
base_price, extra_guest_price, weekend_multiplier,
room_amenities (text[]), images (text[]), is_active, created_at
```

### bookings

```
id, property_id, room_id, guest_name, guest_phone, guest_email,
guest_count, check_in, check_out, nights (generated),
room_price, extra_guest_charge, total_amount, advance_amount,
discount_amount, discount_reason, group_id,
status ('pending'|'confirmed'|'cancelled'|'completed'),
payment_method, payment_reference, is_paid,
checked_in_at, checked_out_at, invoice_notes,
source ('direct'|'agent'|'walk_in'), agent_id,
commission_amount, commission_paid, commission_paid_date,
created_at
```

### booking_groups

Multi-room bookings. Member `bookings` rows point back via `group_id`.

```
id, property_id, group_reference, guest_name, guest_phone, guest_email,
guest_count, check_in, check_out, total_amount, advance_amount,
discount_amount, status, payment_method, payment_reference, is_paid,
source ('direct'|'agent'|'walk_in'), agent_id,
commission_amount, commission_paid, commission_paid_date,
created_at
```

commission_amount here is the sum across the group's member bookings,
calculated once at creation — see Round 7 notes above for why it isn't
split across the member rows.

### agents

```
id, property_id, name, phone,
default_commission_type ('percentage'|'flat'), default_commission_value,
notes, created_at
```

Added Round 7. Scoped by `property_id`, same isolation pattern as every
other owner-data table.

### availability

```
room_id, date, is_available, price_override, note
PRIMARY KEY (room_id, date)
```

### invite_tokens

```
id, token, email, property_id, used_at, expires_at, created_at
```

---

## Database Triggers

### trg_booking_status_change

Fires AFTER UPDATE of status on bookings table.

- Booking confirmed → upserts availability rows to is_available = false for all dates in range
- Booking cancelled/pending (from confirmed) → sets is_available = true for dates not covered by another confirmed booking

This is the primary double-booking protection for status **changes**. Do not remove.

**Important caveat (found in Round 7):** this trigger fires on `UPDATE`
only — it does **not** fire when a booking is freshly `INSERT`ed with
status already set to `'confirmed'` or `'pending'`, which is exactly what
both `useCreateBooking.ts` (guest) and `AddBookingModal.tsx` (owner) do.
Neither of those paths can rely on this trigger for the initial insert —
both now explicitly upsert `availability` themselves right after the insert
(`useCreateBooking.ts` Step 5, and `markDatesUnavailable()` in
`AddBookingModal.tsx` via `src/lib/bookingAvailability.ts`), rather than
waiting on this trigger. The trigger still matters for what happens when a
booking's status is *changed* later — e.g. cancelling should still free up
the dates it covered, so it's the mechanism for that case.

**Known gap**: `EditStayModal` (in `admin.bookings.tsx`, used to change an
existing booking's room or dates) does not sync `availability` at all —
neither via this trigger (it only edits room_id/check_in/check_out, not
status, so this trigger doesn't fire either) nor via an explicit upsert.
Not yet fixed — see "What Needs Doing Next".

---

## CRITICAL: Sentinel Key Pattern in shared_amenities

`properties.shared_amenities` is a `text[]` column used for TWO purposes:

1. Real amenity tags like `"parking"`, `"wifi"`, `"bonfire"` — shown to guests
2. Sentinel keys prefixed with `__` — used to store config without new DB columns

| Prefix        | Stores                        | Used by            |
| ------------- | ----------------------------- | ------------------ |
| `__meals:`    | JSON-encoded MealsConfig      | admin.meals.tsx    |
| `__cancel:`   | Cancellation policy text      | admin.policies.tsx |
| `__rules:`    | House rules text              | admin.policies.tsx |
| `__upi:`      | UPI ID string                 | admin.payments.tsx |
| `__pmethods:` | JSON array of payment methods | admin.payments.tsx |

**Rules:**
- Filter sentinels before showing to guests: `.filter(a => !a.startsWith('__'))`
- Preserve sentinels when saving amenities — never overwrite the whole array
- Values encoded: `encodeURIComponent(JSON.stringify(value))`

---

## Superadmin Flow

### Adding a new property

1. /superadmin → Add property (fills name, subdomain, owner details)
2. Click **Manage** on the new row → navigates to `/admin/dashboard?property={subdomain}`
3. Set up rooms, availability, pricing, UPI ID, policies
4. Supabase → Authentication → Users → **Invite user** → enter owner email
5. Owner receives email, sets password, logs in at stayidom.in/login
6. Back in /superadmin → click **Activate** once setup fee paid

### Manage button

- Navigates via `window.location.href = /admin/dashboard?property={subdomain}`
- `admin.tsx` reads property param from `window.location.search`
- `useOwnerProperty` detects superadmin mode and fetches by subdomain

---

## Supabase Functions (RPC)

### `create_property_with_invite` — still used by superadmin dashboard to create properties

### `create_booking_atomic` — EXISTS in DB but NOT CALLED by app

Was built to prevent double-booking race conditions atomically.
Removed from app due to Supabase Free tier PostgREST schema cache 404 issue.
The function is still in the DB. To re-enable:
1. Upgrade to Supabase Pro (prevents schema cache issues)
2. Update `useCreateBooking.ts` to call `supabase.rpc('create_booking_atomic', {...})`
3. Remove the direct insert + availability update code

### `get_invite_by_token` — still used by /setup (deprecated but functional)

---

## RLS Policies

| Table        | Policy                        | Rule                                                              |
| ------------ | ----------------------------- | ----------------------------------------------------------------- |
| properties   | public_read_active_properties | `is_active = true AND subscription_status IN ('trial', 'active')` |
| properties   | owners_manage_property        | `owner_id = auth.uid()`                                           |
| rooms        | public_read_active_rooms      | property must be active                                           |
| rooms        | owners_manage_rooms           | via property `owner_id = auth.uid()`                              |
| bookings     | public_insert_booking         | `WITH CHECK (true)`                                               |
| bookings     | owners_manage_bookings        | via property `owner_id = auth.uid()`                              |
| booking_groups | (same owner-scoped pattern as bookings, presumed — not formally re-audited this round) | |
| availability | public_read_availability      | `true`                                                            |
| availability | owners_manage_availability    | via rooms → property `owner_id = auth.uid()`                      |
| agents       | owners_manage_agents          | `property_id in (select id from properties where owner_id = auth.uid())` — added Round 7 |

**Reminder from Round 7 testing**: every one of these owner-scoped policies
means the *logged-in* `auth.uid()` must equal the property's real
`owner_id` for writes to succeed. Viewing a property as superadmin via
`?property=<slug>` works fine (public read policy), but writing anything —
agents, bookings, rooms — as superadmin will fail with an RLS violation
unless you're actually logged in as that property's owner account. This
cost real debugging time before we figured it out; worth knowing up front
next time.

---

## What Needs Doing Next

### High priority
- [ ] Payment guard — prevent owner recording more than total_amount
- [ ] First-time owner onboarding checklist (empty dashboard state)
- [ ] Confirm status change dialog on mobile (prevent accidental taps)
- [ ] **`EditStayModal` doesn't sync `availability`** when an owner changes
      an existing booking's room or dates — same class of gap as the one
      fixed on booking *creation* this round (see Round 7 notes), just not
      yet fixed for edits. Give it the same treatment: query `bookings`
      directly for conflict-checking, and upsert `availability` after a
      successful edit.
- [ ] `booking_groups` RLS policies were not formally re-audited this
      round — confirm they actually match the `bookings` pattern rather
      than assuming from behavior.

### Phase 1.5 — Agent self-service (deferred from Round 7)
- [ ] Agent-facing login/portal so agents can see their own bookings and
      commission status without going through the owner
- [ ] Agent-initiated bookings (currently owner-entered only)

### Phase 2 — Guest Experience & SEO
- [ ] Static map image + directions deep links on guest page
- [ ] SEO meta tags + Open Graph per property
- [ ] `schema.org/LodgingBusiness` structured data JSON-LD
- [ ] PWA manifest + Service Worker (shell caching for 2G)
- [ ] Performance audit: guest page on simulated 2G

### Phase 3 — WhatsApp Business (Future)
- [ ] Meta Business verification
- [ ] WhatsApp Business API for server-initiated messages

### Phase 4 — Billing
- [ ] Trial → active flow UI
- [ ] Razorpay subscription API

### Phase 5 — Central Listing
- [ ] stayidom.in landing with property cards
- [ ] Filter by dates, guests, price

### Cleanup
- [ ] Delete /setup route (deprecated)
- [ ] Upgrade Supabase to Pro → re-enable create_booking_atomic RPC
- [ ] Bundle size warning on build (~1MB main chunk) — consider code
      splitting/lazy-loading admin routes if it becomes a real problem on
      2G; not urgent, just noted from Round 7's build output

---

## Known Issues / Watch Points

- `useOwnerProperty` queryKey is `['ownerProperty', user?.id, propertySubdomain]` — invalidation must use exact key
- GitHub web editor corrupts multi-line JSX `<a>` tag attributes — always single line
- `@tanstack/react-router` must stay at 1.166.7
- Supabase Free tier pauses after inactivity — cold start may cause first request to fail
- `shared_amenities` array contains sentinel keys — NEVER overwrite the whole array without preserving `__` prefixed items
- Superadmin `?property=` param must be read via `window.location.search`, NOT TanStack `useSearch`
- Superadmin can *view* any property (public read policy) but cannot *write* to owner-scoped tables (agents, bookings, rooms, availability) for a property it doesn't own — RLS requires `auth.uid()` to equal that property's real `owner_id`. Log in as the actual owner account to test any write flow.
- `EditStayModal` (booking edit) doesn't sync the `availability` table — see "What Needs Doing Next"
- There is exactly one booking-creation component now (`src/components/AddBookingModal.tsx`), used by both the Dashboard and Bookings page. If a change only seems to show up on one of those pages, check you're not accidentally back to two copies.

---

## Network Reality

Vattavada has weak Jio and BSNL only. Every feature must pass:

- Guest page must load under 8 seconds on 2G
- No heavy JS SDKs on guest page
- Images via Supabase Storage with compression
- Native maps deep links only
- PWA shell caching after first load
- Admin uses optimistic updates

---

## Supabase Project Details

- Project URL: `https://vzzfqgqxnodlrvnaxpbw.supabase.co`
- Edge Function base URL: `https://vzzfqgqxnodlrvnaxpbw.supabase.co/functions/v1/`
- Deployed Edge Functions: `create-owner` (used by deprecated /setup only)
- pgcrypto extension: enabled
