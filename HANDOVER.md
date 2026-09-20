# stayidom.in — Session Handover v8

**Date:** September 2026
**Handover from:** Claude (AI pair-programming session)
**Branch:** main (active, deployed to Vercel) — Round 8 security hardening + booking/meals/availability fixes applied directly via Supabase SQL editor (not a PR — see Round 8 below)

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

## Round 8 Changes — September 2026

Started as two reported bugs (booking card total ignoring extras; guest
tracking page missing a greeting), expanded into a full pass through
booking/availability/meals logic, then into a from-scratch RLS + RPC
security audit after tracing how the app actually authorizes its
Supabase calls. That audit found and fixed a **critical, live**
vulnerability — see below. Everything in this round was verified against
actual app behavior (real bookings, real owner logins, real superadmin
re-links) before being called done, not just read for correctness.

### Fixed — booking totals & extras
- **Booking card / dashboard totals ignored Extras-tab charges.** The
  front-of-card total on `admin.bookings.tsx` (both single and group
  cards) and the dashboard's "Monthly revenue" stat / "Recent bookings"
  list all computed `total_amount - discount`, silently dropping any
  charge added via the Extras tab. Discounts showed instantly; extras
  never did. Fixed in both places to include `chargesSum(booking_charges)`.

### Fixed — guest tracking page
- **No guest name / greeting on `/booking-status`.** `guest_name` was
  fetched but never rendered. Added a status-aware greeting ("Hi
  {name} 👋" + a one-line message that varies by pending/confirmed/
  completed/cancelled).
- **`lookup_bookings_by_phone` returned every field nested one level too
  deep** (see Round 8 security section below) — this shipped as a bug
  *during* the security fix itself (my mistake mid-session, not a
  pre-existing issue), caused `₹NaN` / `undefined` guest name & dates on
  the tracking page, caught via user testing and fixed same-session. If
  you ever touch this function again: it must `jsonb_agg` the merged
  object directly, NOT wrap it in a subquery column and `row_to_json()`
  that — the latter produces `{"row_data": {...}}` instead of a flat
  object.

### Redesigned — meal plan feature (was fully disconnected)
The owner's meal settings page (`admin.meals.tsx`) saved a config that
**nothing else in the app ever read** — not the guest site, not
pricing, not bookings. Separately, the guest-facing room detail screen
had its own hardcoded, unrelated meal dropdown (fixed ₹200/450/700
prices) whose selected cost was quoted to the guest but silently
dropped when the booking was actually created — quoted price ≠ charged
price. Redesigned around how these properties actually operate
(complimentary breakfast common, lunch/dinner via owner's own kitchen or
arranged delivery, priced case-by-case rather than fixed):
- New `src/lib/meals.ts` — shared `MealsConfig` type + parse/encode,
  informational only (breakfast included/paid/unavailable + free-text
  notes for kitchen/delivery). Backward-compatible: `parseMealsConfig`
  migrates the old `breakfast_included`/`packages` shape automatically,
  no data migration needed.
- `admin.meals.tsx` rewritten around three simple toggles instead of a
  packages builder. Explicitly tells the owner: this is informational
  only — actual meal charges go on the booking's **Extras tab**, same
  mechanism as any other add-on. No parallel pricing system.
- `RoomDetail.tsx` — removed the old hardcoded meal dropdown/pricing
  entirely. Now shows an informational panel driven by the real
  `MealsConfig` (via `propertyAmenities` passed down from `index.tsx`).
- `About.tsx` — the "Meals" badge was using a broken heuristic
  (`!a.startsWith('__')` filtering out the very sentinel key it needed
  to read) that could never detect the real config. Fixed to use
  `parseMealsConfig`.

### Fixed — extra beds (same bug class as meals, opposite fix)
`RoomDetail.tsx` also had an extra-bed stepper that quoted a charge to
the guest but never actually charged it (same "quoted ≠ charged" bug as
meals). Unlike meals, extra-guest pricing already correctly covers
"one more person including where they sleep" — a separate fixed
extra-bed charge would double-charge for the same thing. Removed the
stepper and its pricing from the guest flow entirely; an actual extra
bed request (rare, ad hoc) is now purely an owner-added Extras-tab
charge, same as meals.

### Fixed — booking edit had zero conflict checking
`EditStayModal` (admin.bookings.tsx — the only place a booking's
room/dates get changed after creation) had **no availability conflict
check at all**, unlike `AddBookingModal.tsx` which correctly validates
via `getConflictingDates` before saving. An owner could silently move a
booking onto dates already occupied by a different guest. Fixed:
- `getConflictingDates` (bookingAvailability.ts) gained an optional
  `excludeBookingId` param so checking a booking's *new* dates doesn't
  false-positive against its own *current* (pre-edit) row.
- `EditStayModal` now calls it before saving and blocks with an error
  listing the conflicting dates if any exist.
- Also releases the booking's *old* dates from `availability` after a
  successful room/date change (previously left stale forever). Does
  **not** explicitly `markDatesUnavailable` for the *new* dates — not
  needed, since `getConflictingDates`/`getBlockedDatesForRooms` both
  read the `bookings` table directly as the real source of truth, not
  `availability`. This closes the "Known gap" flagged at the end of
  Round 7.

### Fixed — guest-facing calendar ignored manually blocked dates
`Availability.tsx` (the guest-facing "pick your dates" calendar on the
landing page) only ever queried `bookings`, never `availability` —
meaning a date an owner explicitly blocked (via `BlockDatesModal`)
still showed as fully available to guests. The actual booking
submission still correctly rejected it later (`useCreateBooking.ts`
does check manual blocks), so no double-booking could happen, but a
guest could fill in the whole form before hitting a confusing
late rejection. Rewired to use `getBlockedDatesForRooms` — the same
helper the owner's own calendar already uses — instead of a separate,
incomplete query.

### Fixed — BlockDatesModal
- No cache invalidation for the guest calendar's or admin calendar's
  own query keys after blocking — a newly blocked date could sit stale
  until a hard reload. Added `["blocked-dates"]` /
  `["availability-range"]` invalidation.
- No warning when blocking a date that already has an active booking on
  it. Added an amber-dot marker + warning banner + explicit "Block
  anyway" acknowledgment before the save button becomes clickable.

### Fixed — misc smaller bugs found during the pass
- **`useAvailability.ts`** was dead code (unused anywhere) with its own
  hand-rolled, turnover-unaware conflict query, separate from
  `getConflictingDates`. Rewritten to delegate to it instead, so it
  can't silently drift out of sync if ever wired up later.
- **`admin.pricing.tsx`** hardcoded "Applied per guest beyond 2" in
  three places — the real threshold is each room's own `max_guests`
  (1–20, owner-configurable), so this was actively wrong for any room
  not set to exactly 2. Fixed to reference the room's actual value.
- **Deleting a room had no check for upcoming bookings.** Once deleted,
  any booking referencing it (past OR upcoming) falls back to "Unknown
  room" everywhere — booking cards, invoices, WhatsApp messages.
  `DeleteRoomModal` now checks for non-cancelled bookings with
  checkout ≥ today first and blocks the delete if any exist, suggesting
  the existing "Inactive" toggle instead.
- **Duplicate, conflicting check-in/out time editors.** `admin.settings.tsx`
  had its own `<input type="time">` fields for `check_in_time`/
  `check_out_time` — the exact same two columns `admin.policies.tsx`
  already managed via free-text. Since Settings resubmits its whole form
  on every save, saving Settings for something unrelated could silently
  clobber a time just set on Policies, and the two pages used
  incompatible formats. Removed the duplicate from Settings; Policies is
  now the only place these are edited, with a proper `<input
  type="time">` picker (added `parseTimeToHHMM`/`formatTimeInput` in
  `bookingAvailability.ts` so the picker round-trips through the same
  friendly "2:00 PM" string format everything else already expects —
  `parseTimeToMinutes` already accepted either format). Also had a CSS
  overflow bug on iPadOS Safari (native time input didn't respect grid
  shrink even with `min-w-0`) — switched that row to flexbox, which
  Safari handles correctly for form control shrinking.

### Security — RLS + RPC audit (the big one)

Traced every Supabase RLS policy and every SECURITY DEFINER function the
app actually depends on (via `pg_policies`, `information_schema.role_
routine_grants`, and `pg_get_functiondef`) rather than assuming from
behavior. Found one **critical, live** hole and several real-but-lower
ones. All fixed in one migration, applied directly via the Supabase SQL
editor (not committed as a repo migration file initially — copy it into
`supabase/migrations/` if you want it tracked; the working copy used
this session is `20260919000000_security_hardening.sql`, plus a same-day
hotfix `20260919000001_fix_lookup_bookings_by_phone.sql` for the nesting
bug above).

**🔴 Critical — `create_property_with_invite()` and
`link_property_owner()` had no internal caller check AND their `EXECUTE`
grant included `anon`.** Confirmed via
`information_schema.role_routine_grants` before touching anything.
`link_property_owner(property_id, email)` reassigns any property's
`owner_id` to whatever user matches that email — with the grant as
found, **any registered user could have called it directly and taken
over any property on the platform**, no bug in the app's own UI required
since RLS/grants are the real boundary, not the client. Fixed two ways:
narrowed the grant (`anon` removed, `authenticated` kept since the
real superadmin calls it while logged in) AND added an internal
`auth.jwt() ->> 'email'` check inside both functions, matching the
hardcoded-superadmin-email pattern every other `superadmin_*` RLS policy
in this project already uses — so even if a grant is ever loosened again
by accident, the function itself still refuses anyone else.

**Other findings, all fixed in the same migration:**
- `expire_stale_pending_bookings()` (meant for a cron job only) also had
  public execute grants — tightened to `postgres`/`service_role` only.
- `lookup_bookings_by_phone`/`lookup_booking_groups_by_phone` were
  correctly scoped by property+phone (a previous, deliberate fix — see
  the comment in `booking-status.tsx` referencing an earlier
  `fix_public_booking_lookup` migration), but had no server-side
  minimum-digit-count check (a direct caller could pass a 1-digit
  fragment and get every booking at that property ending in that
  digit), and returned every column verbatim including `agent_id`,
  `commission_amount`, `commission_paid(_date)`, `payment_reference`,
  `invoice_notes` — none of which a guest has any business seeing for
  their own booking. Both fixed (length guard + jsonb column
  subtraction, keeping every other/future column automatically rather
  than hand-listing a "safe" set).
- `bookings`/`booking_groups` had exactly one INSERT policy each, fully
  unconditional (`with_check: true`) — the SAME policy both the public
  guest flow and the owner's own Add Booking flow relied on, since
  there was no owner-scoped insert policy at all. Anyone with the anon
  key could insert a booking for **any** property, already `confirmed`/
  `is_paid`, with a forged `agent_id`/`commission_amount`. Split into an
  owner-scoped policy (unrestricted, matching how UPDATE/DELETE already
  trust owners) + a public policy tightened to the exact shape
  `useCreateBooking.ts` actually sends (verified line-by-line against
  its source first).
- `booking_groups` had **no** public DELETE policy at all, but
  `useCreateBooking.ts`'s own rollback path (group insert succeeds,
  per-room bookings insert then fails) tries to delete the orphaned
  group — that delete was silently matching zero rows under RLS,
  leaving phantom empty groups (real guest name, zero rooms) in the
  dashboard after any partial-failure multi-room booking. Fixed with a
  policy scoped to exactly that case: `status = 'pending'` AND zero
  attached bookings — can't touch a real reservation.
- `availability`'s SELECT policy was `using (true)` — fully public,
  unscoped, across every property including inactive ones, exposing the
  free-text `note` field owners type into `BlockDatesModal` (e.g.
  "family visiting"). Scoped to match `rooms`' own visibility rule.
- `rooms`' public SELECT only checked the *property's* `is_active`,
  never the room's own — the "Inactive" toggle (now relied on by the
  room-delete fix above) was only enforced client-side. Fixed.
- `properties` had **two independent** self-insert loopholes, not one:
  `owners_manage_property` (`ALL`, `with_check (owner_id = auth.uid())`
  — trivially satisfiable on a new row) AND, less obviously,
  `superadmin_read_all` — despite its name, also an `ALL` policy with no
  explicit `WITH CHECK`, which in Postgres means its `USING` clause
  (`owner_id = auth.uid() OR <superadmin email>`) gets reused as the
  check too, independently permitting the same self-insert. Neither
  path is used anywhere in the app — every property creation goes
  through `create_property_with_invite()` (subdomain uniqueness, invite
  token, trial status, none of which a raw self-insert would get). Both
  dropped; `properties` now has separate `owners_select/update/
  delete_property` policies (no INSERT) plus the pre-existing
  `superadmin_manage_properties` (`ALL`, already correctly
  superadmin-only) which made `superadmin_read_all` fully redundant
  once the loophole was closed.
- `leads`' superadmin policy used `current_setting('app.superadmin_
  email', true)` instead of the hardcoded email literal every other
  `superadmin_*` policy uses — if that custom Postgres setting was
  never explicitly configured at the database level, this fails closed
  (nobody can read leads, including the real superadmin) rather than
  open. Aligned to the working pattern.

**Verified live, not just applied:** real guest booking end-to-end →
recorded correctly on owner dashboard; owner "Add booking" with
agent/commission → works; guest tracking page by phone → works (after
the same-session nesting-bug hotfix), commission/agent fields confirmed
absent from the response; superadmin "Re-link" → used for an actual
production owner handover mid-session (Bleaf Mud House's owner email
was changed and re-linked to a new account, confirmed working via
login) — this doubles as the live test of `link_property_owner` under
its new, tightened grant.

**Left alone / needs a decision:**
- `get_invite_by_token()` — reviewed, left as-is. Correctly gated by the
  token itself (two concatenated `gen_random_uuid()`s, unguessable), and
  `anon` access is required by design (a brand-new owner following an
  invite link isn't logged in yet).
- The `create-owner` **Edge Function** (`/functions/v1/create-owner`,
  used by the deprecated `/setup` route) was **not audited** — Edge
  Functions live outside this repo and I had no visibility into its
  source. Turns out to be moot for current operations: the real
  onboarding process (documented below in "Superadmin Flow") doesn't use
  `/setup`, invite tokens, or this function at all — the superadmin
  creates the Supabase Auth user manually and uses "Link Owner"
  directly. Still technically reachable if deployed and its own
  permissions are loose, just no longer urgent since nothing depends on
  it. Candidate for actual deletion, not just doc'd-as-deprecated — see
  Cleanup.

### Notes for next session
- If you ever touch `lookup_bookings_by_phone` or
  `lookup_booking_groups_by_phone` again: aggregate the merged jsonb
  object directly with `jsonb_agg(...)`, never wrap it in a subquery
  column and call `row_to_json()` on the subquery — see the bug/fix
  above.
- Section-by-section SQL for this whole round lives in
  `supabase/migrations/20260919000000_security_hardening.sql` (+ the
  `...000001_fix...` hotfix) if you want the exact statements rather
  than this summary.
- Multiple permissive RLS policies for the same command on the same
  table are OR'd together in Postgres — that's the mechanism the
  owner-scoped + tightened-public INSERT split above relies on. Worth
  remembering before "simplifying" back down to one policy.



---

## Current Properties in Production

As of Round 8 (Sept 2026) — 4 properties, all owner-linked:

| Property            | Subdomain               | Area                     | Status              | Setup Fee |
| -------------------- | ------------------------ | -------------------------- | -------------------- | --------- |
| Bleaf Mud House      | bleafmudhouse             | Vattavada                  | **active**, paying  | Paid ✓    |
| Misty Colina         | mistycolina               | Kottakamboor                | trial                | Pending   |
| OriginSoil           | originsoil                 | Kottakamboor, Vattavada     | trial                | Pending   |
| Mist Valley Homestay | demo (demo.stayidom.in)   | Vattavada                  | trial                | Pending (demo property) |

Bleaf Mud House's owner account was changed mid-Round-8 (new email,
re-linked via superadmin "Re-link", confirmed working) — if the old
email's Supabase Auth user is still sitting around unused, it's safe to
delete (re-linking only repoints `owner_id`, it doesn't disable the old
login).

The property list that was here as of v7 (MistyMountain, Greenforest,
Green Valley) no longer matches what's live — trust the table above, or
re-check `/superadmin` directly, over anything earlier in this doc's
history.

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
| `src/routes/setup.tsx`              | DEPRECATED — confirmed in Round 8 the real onboarding process (see "Superadmin Flow" below) doesn't use this route, invite tokens, or the `create-owner` Edge Function at all. Safe to delete along with that Edge Function — see Cleanup. |
| `src/routes/admin.tsx`              | Auth guard — reads ?property= from window.location.search        |
| `src/routes/superadmin.tsx`         | Superadmin layout + auth guard                                   |
| `src/routes/superadmin.index.tsx`   | Superadmin dashboard — all properties + Manage/Re-link/Activate buttons |
| `src/admin/AdminLayout.tsx`         | Admin shell with sidebar                                         |
| `src/lib/supabase.ts`               | Single Supabase client instance                                  |
| `src/lib/subdomain.ts`              | `getSubdomain()` + `isSuperAdminEmail()`                         |
| `src/lib/whatsapp.ts`               | WhatsApp deep link helpers (wa.me only)                          |
| `src/lib/meals.ts`                  | **Added Round 8.** Shared `MealsConfig` type + `parseMealsConfig`/`encodeMealsConfig`/`hasMealInfo` — informational meal info only, no pricing. Used by `admin.meals.tsx`, `RoomDetail.tsx`, `About.tsx`. |
| `src/hooks/useAuth.ts`              | `onAuthStateChange` pattern                                      |
| `src/hooks/useProperty.ts`          | Guest property + rooms query                                     |
| `src/hooks/useOwnerProperty.ts`     | Owner property query — fetches by subdomain when superadmin      |
| `src/hooks/useBookings.ts`          | Bookings query                                                   |
| `src/hooks/useCreateBooking.ts`     | Guest booking mutation — direct insert (no RPC); RLS now enforces the same field shape server-side (Round 8) |
| `src/hooks/useSuperAdmin.ts`        | `useAllProperties`, `useCreateProperty`, `useUpdateSubscription` |
| `src/components/BookingForm.tsx`    | Guest booking form + booking reference + WhatsApp CTA            |
| `src/components/UPIPaymentSection.tsx` | UPI deep link + WhatsApp screenshot prompt                    |
| `src/components/Availability.tsx`   | Guest-facing "pick your dates" calendar on the landing page. Round 8: now factors in manually blocked dates too (`getBlockedDatesForRooms`), not just real bookings. |
| `src/components/BlockDatesModal.tsx` | Owner's "block dates" dashboard modal. Round 8: warns before blocking an already-booked date; invalidates the guest/owner calendar caches on save. |
| `src/routes/admin.bookings.tsx`     | Bookings list + detail modal + `EditStayModal`. Round 8: card totals now include Extras-tab charges; `EditStayModal` now conflict-checks before saving (previously didn't at all). |
| `src/routes/admin.meals.tsx`        | Rewritten Round 8 — informational breakfast/kitchen/delivery toggles, no pricing. See Round 8 notes. |
| `src/components/AddBookingModal.tsx` | **Owner booking-creation modal — the ONLY one.** Used by both the Dashboard and the Bookings page. Includes agent/commission UI and the availability calendar. Don't create a second copy of this. |
| `src/components/RoomAvailabilityCalendar.tsx` | Month-grid availability picker embedded in `AddBookingModal.tsx` |
| `src/lib/bookingAvailability.ts`    | `getUnavailableDates`, `getBlockedDatesForRooms`, `markDatesUnavailable`, `getConflictingDates` (Round 8: gained optional `excludeBookingId` param), `parseTimeToHHMM`/`formatTimeInput` (Round 8: for the check-in/out time picker) — shared conflict-checking + availability-sync + time helpers, read the file header comments before changing |
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

### Onboarding a new property — the REAL process (confirmed Round 8)

The app's `/setup?token=...` invite-email flow described in earlier
versions of this doc **is not what actually gets used**. This is the
real 7-step process, confirmed directly by the person running it:

1. **`/superadmin` → Add Property** — name, subdomain, owner name,
   manager's WhatsApp, area. Calls `create_property_with_invite` (this
   still generates an invite token/link as a side effect, but it's
   ignored — see step 3).
2. **Click Manage on the new row** — add rooms, pricing, availability,
   UPI ID, policies, photos. Everything is ready before the manager
   ever touches the app.
3. **Supabase → Authentication → Users → Add user** (NOT "Invite user").
   Enter the manager's email + a temp password directly. User exists
   immediately with a UUID, no email round-trip.
4. **`/superadmin` → Link Owner** (shown as "Re-link" once already
   linked) on the property's row → type the manager's email → confirms.
   Calls `link_property_owner`, which sets `properties.owner_id` to that
   user. This is the step Round 8's security fix directly hardened
   (was callable by anyone with the anon key before — see Round 8) and
   the one this doc most needs re-verifying if the RPC's auth check is
   ever touched again.
5. **Send credentials via WhatsApp** — site URL, email, temp password,
   with a note to go to Settings → Change Password.
6. **Manager logs in** at stayidom.in/login, sees their fully-set-up
   dashboard, changes their password.
7. **`/superadmin` → Activate** once the setup fee is paid.

No invite emails, no `/setup` page, no waiting on email delivery, no
manual UUID copying. This means:
- `/setup`, `get_invite_by_token`, and the `create-owner` Edge Function
  are **not used by current operations at all** — see Cleanup.
- If you're debugging an onboarding issue and find yourself looking at
  the invite-token flow, you're probably in the wrong place — the real
  process is entirely superadmin-driven through steps 1–7 above.

### Manage button

- Navigates via `window.location.href = /admin/dashboard?property={subdomain}`
- `admin.tsx` reads property param from `window.location.search`
- `useOwnerProperty` detects superadmin mode and fetches by subdomain

### Changing a property's owner (handover / correcting a typo'd email)

Same as steps 3–5 above, run again: create the new email as a Supabase
Auth user first if it doesn't already exist, then **Re-link** with that
email. Re-linking only repoints `owner_id` — it does **not** disable the
previous email's login. If ownership is genuinely changing hands (not
just fixing a typo), go delete the old email's Supabase Auth user
afterward if it shouldn't retain access to anything.

---

## Supabase Functions (RPC)

All `SECURITY DEFINER` — bypass RLS entirely, so their grants + internal
checks (not RLS) are the real security boundary. Fully re-audited
Round 8; see that section above for the reasoning behind each fix.

### `create_property_with_invite` — used by superadmin "Add Property"
Still generates an invite token/link as a side effect, but the real
onboarding process (see "Superadmin Flow") doesn't use it — token flow
is effectively vestigial. **Round 8**: added an internal check that the
caller's JWT email matches the hardcoded superadmin email, and revoked
`EXECUTE` from `anon`/`PUBLIC` (was previously callable by anyone,
logged in or not).

### `link_property_owner` — used by superadmin "Link Owner"/"Re-link"
**Round 8**: same fix as above — internal superadmin-email check added,
`anon`/`PUBLIC` execute revoked. This was the critical finding: as
found, any registered user could call this directly and reassign any
property's ownership to themselves. Verified working post-fix via a
real production re-link (Bleaf Mud House).

### `lookup_bookings_by_phone` / `lookup_booking_groups_by_phone` — guest tracking page (`/booking-status`)
Pre-existing fix (property+phone scoping) confirmed correct. **Round 8**
added a server-side minimum-digit-count guard and stopped returning
`agent_id`/commission/`payment_reference`/`invoice_notes` to the guest.
**Watch point**: `lookup_bookings_by_phone`'s structure must
`jsonb_agg()` the merged object directly — a same-session regression
during this fix (subquery-column + `row_to_json()`) briefly broke the
tracking page (NaN amounts, undefined guest name/dates) before being
caught and fixed. See Round 8 notes if touching this again.

### `expire_stale_pending_bookings` — scheduled job only (pg_cron / service_role)
Not meant to be callable by the app or any user. **Round 8**: revoked
`EXECUTE` from `anon`/`authenticated`/`PUBLIC` — previously had all
three, though low-severity since it only ever expires holds already
past due.

### `get_invite_by_token` — used by `/setup` (deprecated, unused by real ops — see "Superadmin Flow")
Reviewed Round 8, left as-is — correctly gated by the token's own
unguessability, and `anon` access is required by its design (a
brand-new owner isn't logged in yet). Low priority now that the real
onboarding process doesn't route through it at all.

### `create_booking_atomic` — EXISTS in DB but NOT CALLED by app
Was built to prevent double-booking race conditions atomically.
Removed from app due to Supabase Free tier PostgREST schema cache 404 issue.
The function is still in the DB. To re-enable:
1. Upgrade to Supabase Pro (prevents schema cache issues)
2. Update `useCreateBooking.ts` to call `supabase.rpc('create_booking_atomic', {...})`
3. Remove the direct insert + availability update code

---

## RLS Policies

Fully re-audited and hardened Round 8 (previous versions of this table
were partly aspirational — several rows below describe the fix, not
what was actually enforced before it). Full SQL:
`supabase/migrations/20260919000000_security_hardening.sql`.

| Table            | Policy                              | Rule                                                                 |
| ----------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| properties        | `public_read_active_properties`      | `is_active = true AND subscription_status IN ('trial', 'active')`       |
| properties        | `owners_select_property`             | `owner_id = auth.uid()`                                                 |
| properties        | `owners_update_property`             | `owner_id = auth.uid()`                                                 |
| properties        | `owners_delete_property`             | `owner_id = auth.uid()`                                                 |
| properties        | `superadmin_manage_properties`       | hardcoded superadmin email, ALL commands — **no owner-scoped INSERT policy exists**; property creation is INSERT-only-via-RPC by design (Round 8) |
| rooms             | `public_read_active_rooms`           | room `is_active = true` AND property `is_active = true` (Round 8: room's own flag wasn't checked before) |
| rooms              | `owners_manage_rooms`                | via property `owner_id = auth.uid()`                                    |
| bookings           | `public_insert_booking`              | Round 8: tightened to `status='pending', is_paid=false, advance/discount=0, no agent/commission, not checked in/out, property active` — was unconditional before |
| bookings           | `owners_insert_bookings`             | **Added Round 8.** `property_id` owned by caller — previously bookings had no owner-scoped insert policy at all, only the (unconditional) public one |
| bookings           | `owners_read/update/delete_bookings` | via property `owner_id = auth.uid()`                                    |
| booking_groups     | `public_insert_booking_group`        | Round 8: same tightening as `bookings`                                  |
| booking_groups     | `owners_insert_booking_groups`       | **Added Round 8.**                                                     |
| booking_groups     | `public_delete_orphaned_pending_group` | **Added Round 8.** `status='pending' AND zero attached bookings` — fixes the rollback-orphan bug; previously no public DELETE policy existed at all |
| booking_groups     | `owners_manage_booking_groups`       | via property `owner_id = auth.uid()`, ALL commands                      |
| availability       | `public_read_availability`           | Round 8: scoped to active properties' rooms — was `using (true)`, fully public/unscoped, before |
| availability       | `owners_manage_availability`         | via rooms → property `owner_id = auth.uid()`                            |
| agents             | `owners_manage_agents`               | `property_id in (select id from properties where owner_id = auth.uid())` |
| leads              | `superadmin_read_leads`              | Round 8: aligned to hardcoded superadmin email — was using a Postgres custom setting that may never have been configured, which fails closed |

**Reminder from Round 7/8 testing**: every owner-scoped policy above
means the *logged-in* `auth.uid()` must equal the property's real
`owner_id` for writes to succeed. Viewing a property as superadmin via
`?property=<slug>` works fine (public read policy), but writing anything
— agents, bookings, rooms — as superadmin will fail with an RLS
violation unless you're actually logged in as that property's owner
account.

**Function grants** (not RLS, but the equivalent boundary for
`SECURITY DEFINER` functions) — see "Supabase Functions (RPC)" above for
the full Round 8 writeup. Check `information_schema.role_routine_grants`
directly if you ever need to re-verify these rather than trusting this
doc.

---

## What Needs Doing Next

### High priority
- [ ] Payment guard — prevent owner recording more than total_amount
- [ ] First-time owner onboarding checklist (empty dashboard state)
- [ ] Confirm status change dialog on mobile (prevent accidental taps)
- [ ] **Audit the `create-owner` Edge Function**, or delete it. Round 8
      confirmed the real onboarding process doesn't use it (or `/setup`,
      or invite tokens) at all — see "Superadmin Flow" — but it's still
      deployed and reachable if `/setup` still exists. It handles
      account creation with `service_role`-level privileges and was
      never reviewed (Edge Functions live outside this repo). Either
      pull its source and audit it properly, or remove it + `/setup`
      together and close the gap by deletion instead.
- [ ] Re-verify `booking_groups`' RLS after any future schema change to
      that table — Round 8 audited and fixed it properly (previous
      versions of this doc had marked it "not formally re-audited,
      presumed to match bookings" — that's now actually confirmed, not
      presumed, but worth re-checking again if the table changes).

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
- [ ] Delete `/setup` route — Round 8 confirmed with the person running
      onboarding that the real process never uses it (see "Superadmin
      Flow"). Delete together with the `create-owner` Edge Function and
      `get_invite_by_token` RPC once you're confident nothing else
      references them (grep the repo for `get_invite_by_token` and
      `/setup` first).
- [ ] Upgrade Supabase to Pro → re-enable create_booking_atomic RPC
- [ ] Bundle size warning on build (~1MB main chunk) — consider code
      splitting/lazy-loading admin routes if it becomes a real problem on
      2G; not urgent, just noted from Round 7's build output
- [ ] Commit `supabase/migrations/20260919000000_security_hardening.sql`
      and its hotfix to the repo properly if you want Round 8's DB
      changes tracked in version control — they were applied directly
      via the Supabase SQL editor this round, not through a normal PR.

---

## Known Issues / Watch Points

- `useOwnerProperty` queryKey is `['ownerProperty', user?.id, propertySubdomain]` — invalidation must use exact key
- GitHub web editor corrupts multi-line JSX `<a>` tag attributes — always single line
- `@tanstack/react-router` must stay at 1.166.7
- Supabase Free tier pauses after inactivity — cold start may cause first request to fail
- `shared_amenities` array contains sentinel keys — NEVER overwrite the whole array without preserving `__` prefixed items
- Superadmin `?property=` param must be read via `window.location.search`, NOT TanStack `useSearch`
- Superadmin can *view* any property (public read policy) but cannot *write* to owner-scoped tables (agents, bookings, rooms, availability) for a property it doesn't own — RLS requires `auth.uid()` to equal that property's real `owner_id`. Log in as the actual owner account to test any write flow.
- `EditStayModal` (booking edit) now conflict-checks before saving and releases old dates from `availability` on a room/date change (Round 8) — it does NOT explicitly mark the *new* dates unavailable, which is fine (conflict checks read `bookings` directly, not `availability`) but means `availability` won't perfectly mirror every booking-based block if you're inspecting it directly for some other reason.
- There is exactly one booking-creation component now (`src/components/AddBookingModal.tsx`), used by both the Dashboard and Bookings page. If a change only seems to show up on one of those pages, check you're not accidentally back to two copies.
- **RLS policies and RPC function grants are the real security boundary, not the client code.** Round 8 found a critical hole (`link_property_owner` callable by anyone with the anon key) purely by tracing `pg_policies` + `information_schema.role_routine_grants` — the app's own UI looked completely fine. Any new `SECURITY DEFINER` function needs its own internal caller check; don't rely on grants alone, and don't assume the app's UI gating means anything for direct API/RPC access.
- Multiple permissive RLS policies for the same command on the same table are OR'd together in Postgres (used deliberately in Round 8 to split owner-scoped vs. tightened-public INSERT policies on `bookings`/`booking_groups`) — worth knowing before "cleaning up" what looks like a redundant extra policy.
- If touching `lookup_bookings_by_phone`/`lookup_booking_groups_by_phone`: must `jsonb_agg()` the merged jsonb object directly, not wrap it in a subquery column + `row_to_json()` — see Round 8 notes for the exact bug this caused (broke the guest tracking page for one session).

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
- Deployed Edge Functions: `create-owner` (used by deprecated `/setup` only — Round 8 confirmed real onboarding doesn't route through it at all; not audited, candidate for deletion, see Cleanup)
- pgcrypto extension: enabled
