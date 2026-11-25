# Production handover report: pilot readiness (25 Nov 2026)

Scope: refresh of the production documentation and a final pilot-readiness review for 5–10 properties. Reviewed from the repository at `43f5736`. **Not tested:** the live Supabase project, real devices, browsers. Everything below is from code, tests and the local database suite. The full reference is `HANDOVER.md` v11.0 (§13–§17 are new).

## 1. Current architecture
Vite + React 19 + TypeScript SPA (TanStack Router pinned at 1.166.7, TanStack Query 5, Tailwind 4) on Vercel, with Edge Functions in `api/` (link previews, SEO, manifest, iCal, weather, directions). Backend is Supabase: Postgres with RLS and triggers, Auth, Storage, one Deno Edge Function (`invite-owner`). No SSR. Business logic is pure TypeScript in `src/lib/` (tested) or Postgres triggers; screens only load, compose and display.

## 2. Current product modules
Guest booking page; owner admin in seven sections (Home, Calendar, Bookings, Money, Rooms & Pricing, Property, Education); Superadmin; public Help. Money has five tabs: Overview, Monthly report, Payments, Agents & Commissions, Expenses. New in Nov 2026: Property Score, Revenue Intelligence, Money Intelligence, Expenses, Guest identity, Source editing, Monthly Business Report, Education (Learn → Do → Measure; 12 lessons, 5 categories; distinct from Help).

## 3. Authentication model
Supabase email + password at `/login`; session kept by `supabase-js`; `AdminGuard` sends signed-out users to `/login`; owner resolved by `owner_id = auth.uid()`; superadmin identified by email and sent to `/superadmin` (non-superadmins see Access Denied there). Logout signs out and clears the remembered property (React Query cache is not cleared; keys are property-scoped, no leak found). Client guards are UX only; RLS is the boundary.

## 4. Data / RLS model
Isolation per property (`property_id`); owner policies by `owner_id`; superadmin by JWT email (`superadmin_manage_*`); guests (`anon`) insert bookings (server re-prices, forced pending) and read only public catalog data; tracking via token RPC. `expenses` and `guests`: RLS on, anon revoked, owner + superadmin policies. Guest identity: normalised phone, one guest per phone per property (unique index), linked by a trigger, never by name, never across properties. Cross-property isolation of guests, forged `guest_id` and anon access are asserted in `supabase/tests/guests.test.sql`.

## 5. Financial definitions
Revenue = net stay total split by nights across the period; Collected = the booking's stored running total (`advance_amount`) split by nights, **not cash received in the period** (no payment-date ledger); Outstanding = per-stay `max(0, net − collected)` split by nights, overpayment shown separately as refund due; Expenses = owner-entered rows by date; Estimated operating profit = Revenue − Expenses (change shown only when expenses exist in both periods and previous profit > 0). A multi-room booking is billed once from its group row. Full table: `HANDOVER.md` §16.

## 6. Known limitations
No payment-date ledger; no room-history snapshots (past occupancy uses today's rooms); guest identity is phone-only; the Monthly report's Property Score and Opportunities are current state; the score has no history; Education progress is per browser and has no links in from app screens; Help lacks sections for expenses / Monthly report / score; five screenshots are stale; guest bookings have source `direct` with no detail (shown as Unknown); Home snapshot can miss a stay over about a month that began before last month. Full list: `HANDOVER.md` §17 and §10 items 55–65.

## 7. Test coverage / results
| Suite | Result |
|---|---|
| `npm test` (`src/lib/*.test.ts`, `tests/api`) | 629 / 629 pass |
| `npm run check` (behaviour checks) | pass |
| Database (`supabase/tests/run.sh`, Postgres 16): migrations applied twice, migrations, seasons, guests suites | all pass |

Covered well: money maths, period splitting, source reconciliation, score, opportunities, report composition, guest identity and phone parity (TS and SQL), education content integrity, RLS for guests. **Not covered:** any React component or screen (the repo has no component-test harness), mobile layout, end-to-end flows, the live database. The two 25 Nov UI fixes are covered by typecheck and lint only.

## 8. Build / typecheck / lint
`npm run build` pass · `npm run typecheck` pass · `npm run lint` 0 errors, 15 warnings (hook dependency arrays, fast-refresh; unchanged by this work). The build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (placeholders were used).

## 9. Pilot readiness
**No blocker was found in the code.** The system fails visibly on the money, report, expense, bookings and guest screens (explicit `LoadFailed`, never ₹0 or an empty list). Two real silent-failure paths were found and fixed (§ below). Readiness is **conditional** on the items marked SHOULD FIX, chiefly confirming the live database.

Changes made in this review (code): `EditSourceModal` now treats a zero-row update as a failure (`NotSavedError`); `RevenueOpportunities` shows "Some data couldn't load, so this list may be incomplete" instead of vanishing or shrinking silently (Home and Monthly report). Docs: HANDOVER v11.0, README, AGENTS.md, `docs/OWNER_HELP.md`, `docs/DB_CHECKS.sql` (new queries 13 and 14; the "audit query 4" that HANDOVER rule 17 cited did not exist).

## 10. Remaining items

**BLOCKER:** none found.

**SHOULD FIX BEFORE PILOT**
- Run `docs/DB_CHECKS.sql` queries 12, 13, 14 on the live project (confirms the expenses, source-detail and guests migrations are applied and secured). Migrations are applied by hand, so this is unverified.
- Walk the money flows once as a real owner on a pilot property (login, booking, part payment, mark fully paid, expense, change source, Money → Overview, Monthly report, one lesson), on a phone. The superadmin note in HANDOVER §10 item 20 conflicts with the policies and is unverified.
- Retake Help screenshot `11` (Money now opens on Overview), then `02`, `28`, `01`, `07` (all still accurate in their steps).
- Set `SUPPORT_CONTACT` so pilot owners can reach you from Help.
- Check landing-page copy before showing it to prospects (carried over, not re-verified).

**ACCEPTABLE FOR PILOT**
Education progress per browser; no app-to-Education links; logout not clearing the query cache; Home snapshot long-stay gap; two-step group source edit; one-owner-one-property assumption (schema uniqueness unchecked); 15 lint warnings; unreviewed `npm audit` findings; the limitations in §6; missing Help sections.

**FUTURE PRODUCT WORK**
Payment-date ledger; room-history snapshots; Education progress in Supabase; score history; CSP; plan-tier enforcement; component and end-to-end tests (a Playwright smoke test was already suggested in §10 item 54).

## 11. Recommended next step
Merge these changes, run DB_CHECKS 12–14 on the live project, then do the one real-owner walk-through on a phone. If both are clean, onboard the first two properties and watch them for a week before the rest. The phone-lookup revoke (`docs/REVOKE_PHONE_LOOKUPS.sql`) becomes allowed on 25 Nov: decide separately whether any old `?phone=` links are still in guests' hands.
