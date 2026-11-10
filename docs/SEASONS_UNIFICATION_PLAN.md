# Plan: one Seasons model for rooms and add-ons

*Written 8 Nov 2026. **Built 10 Nov 2026 (not yet rolled out): see `docs/SEASONS_ROLLOUT.md`.** The owner chose to do the full unification in one release, with safeguards (not a two-step rollout).*

## 1. The problem

Owners set seasons in two places that look similar and behave differently. The Help guide has a warning ("Seasons vs Seasonal rates") because of it.

| | Room seasonal rates | Add-on seasons |
|---|---|---|
| Table | `room_rates` (migration `20261015000000_room_rates.sql`) | `price_seasons` (see `supabase/baseline/6_tables.sql`) |
| Holds | A date range plus a rule: fixed ₹ or % change, for one room or all rooms | A name, dates, "repeats every year", priority |
| Repeats yearly | No (re-enter every year) | Yes |
| Overlap rule | Room-specific beats all-rooms, then the one that **starts later** wins | **Higher priority** wins, then the **shorter** window |
| Price rule | Fixed ₹ or % | An exact ₹ per item per season (no live percentages, by design) |
| Pricing code | TypeScript `src/lib/roomRates.ts` (`pickRate`) **and** SQL `stay_room_price()` (migration `20261015000100_server_side_booking_price.sql`; the TypeScript is documented as mirroring it) | `src/lib/quotes.ts` (season resolution) |
| UI | Room editor → Seasonal rates (`RoomRatesEditor.tsx`, `useRoomRates.ts`) | Property → Add-ons → Seasons (`SeasonsEditor.tsx`) |

Verify exact column names in the migration and baseline before writing SQL.

## 2. The target model

**One season = name, dates, repeats yearly, priority** (reuse `price_seasons`; add-ons already point at it, so add-ons do not change).

**Only room pricing moves:** a small new table of **room price rules per season**, either for all rooms or one room (fixed ₹ or % change). The old per-room date ranges (`room_rates`) are retired.

What the owner sees:
- One **Seasons** screen (top of Rooms & Pricing; the Add-ons page links to it). Create "Christmas, 20 Dec–3 Jan, repeats yearly" once.
- Each season has **Room prices** ("All rooms: +30%", optional per-room overrides) and **Add-on prices** (existing per-item prices).
- The room editor loses its own seasonal-rate form and shows read-only lines ("Christmas +30%") that link to Seasons.
- A season with no room rule never changes room prices.

One overlap rule for both: **priority, then shorter window**; inside the chosen season a room-specific rule beats an all-rooms rule. The weekend multiplier still applies on top.

Do **not** unify the price rules: rooms use fixed ₹ or %; add-ons use exact prices. The thing to unify is the season (name, dates, repeat, priority).

## 3. Safeguards (all in the same release)

1. **Additive migration.** Create the new rule table, copy every `room_rates` row into a season plus a rule (dedupe seasons with identical name and dates; name an unnamed one from its dates). **Leave `room_rates` untouched.**
2. **Per-property switch** (for example `season_pricing_v2 boolean default false`). With it off a property is priced exactly as today. Turn it on for the demo property first, then others one at a time. Rollback = switch off.
3. **Read-only price check.** One SELECT that prices every night of the next ~400 days under the old and the new rules for every room and reports any difference. It must return nothing before a property is switched. If a legacy overlap behaves differently under the new rule, set priorities to preserve the price or flag it for the owner.
4. **Parity.** Rooms are priced in two places (SQL function and TypeScript). Change both together and add a test that they agree, including yearly repeats across New Year and 29 February.
5. **Backup and rollback script.** Before running anything, export `room_rates` and `price_seasons` as CSV (the free Supabase plan may keep no automatic backups). Write a rollback script from the current function definitions in `supabase/migrations/`.

## 4. How to test without a test copy of the database

The owner has **no test Supabase project**. We agreed to avoid needing one:

- Test in a throwaway Postgres in the sandbox. `pip install pgserver --break-system-packages` gives an embedded Postgres that works there. Rebuild with `supabase/baseline/*.sql` and the migrations (the order and the stub are in `supabase/tests/run.sh` and `supabase/baseline/README.md`), then run the old-vs-new price comparison and the new tests.
- It is plain Postgres plus the repo's stand-in for Supabase, so **RLS and sign-in are only proven on the live demo property** (`demo.stayidom.in`). That test is mandatory.
- Optional extra safety: a second free Supabase project built from the baseline (run `5_extensions`, `6_tables`, `7_constraints_indexes` twice, `1_functions`, `2_triggers`, `3_rls_policies`, `4_cron_jobs`, then every migration dated `20261015` or later in filename order; point Vercel **Preview** variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PROPERTY_SUBDOMAIN` at it). Not required.

Residual risk: the migration replaces the shared pricing function on live. A bug there could affect every property even with the switch off, so test the old path first, apply at a quiet time, and keep the rollback script ready.

## 5. Files expected to change

Database: a migration (rule table, copy, switch column) and the room-pricing function. App: `roomRates.ts`, `quotes.ts`, `quoteBuilder.ts`, `useRoomRates.ts`, `useCatalog.ts`, `RoomRatesEditor.tsx`, `SeasonsEditor.tsx`, the rooms and add-ons pages, the guest booking page price display. Tests: `roomRates.test.ts`, a new SQL-vs-TypeScript parity test, migration tests under `supabase/tests/`. Docs: rewrite the Help sections `seasonal-rates`, `setup-addons`, `raise-prices` and retake screenshots `05`, `17`, `20`, `23`; update HANDOVER §4 and §10 item 43; AGENTS (`roomRates.ts` line).

## 6. Decisions already made (change only with the owner)

1. Room seasons can **repeat yearly** (off by default for migrated ones).
2. Overlaps follow the add-on rule (priority, then shorter window); a room-specific rule beats all-rooms inside a season.
3. Seasons live at the **top of Rooms & Pricing**, with a link from Add-ons.
4. **One release**, not two.

## 7. Not yet known

- The full body of the live pricing function (only that it reads `room_rates`). **Read it first.**
- Real properties' rates. The price check will reveal conflicts.
- Exact column names (check before writing SQL).

## 8. First steps for the new session

1. Read `AGENTS.md`, `HANDOVER.md` §3, §10 item 43, and this file.
2. Read the live pricing function and the TypeScript mirror. Write the **read-only price check** first.
3. Write the migration and the rollback script; test in an embedded Postgres.
4. Write the app changes and the parity test.
5. Hand the owner two scripts (migration, price check), the CSV backup steps, and the per-property switch steps. Test on the demo property before others.

*Starter prompt:* "Read `docs/SEASONS_UNIFICATION_PLAN.md`, `AGENTS.md` and `HANDOVER.md`. We are doing the one-release unification of room and add-on seasons. Start by reading the live room-pricing function and writing the read-only old-vs-new price check; test in an embedded Postgres; I have no test Supabase project."
