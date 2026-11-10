# Unified seasons — rollout, check and rollback

Built 10 Nov 2026 from `docs/SEASONS_UNIFICATION_PLAN.md`. **Nothing changes for any property until you switch it on.**

## What was built

- **One Seasons screen** at the top of **Rooms & Pricing**. A season = name, dates, repeats every year, priority. On the season you choose what changes: **Room prices** (all rooms or one room; % or fixed ₹) and **Add-ons & packages** (use this season for add-on prices).
- Room editor: the old *Seasonal rates* form becomes a read-only list of that room's season prices. Add-ons page: the old *Seasons* box becomes a link to the new screen.
- One overlap rule everywhere: higher priority wins, then the shorter window. Inside a season a one-room price beats "All rooms". A season with no room price never changes room prices; a season not used for add-ons never changes add-on prices.
- Per-property switch `properties.season_pricing_v2` (default **false**, only the platform admin can change it). Off = priced from `room_rates` exactly as today.

## Safety checks already run (in a throw-away Postgres)

- Switch off: 1,344 random stays priced by the new function and the previous one: **0 differences**.
- 40 deliberately overlapping legacy rates copied into seasons: **0 nights** price differently (3,208 room-nights).
- 29 shared SQL/TypeScript parity checks (yearly seasons across New Year and 29 Feb, priority, shorter-wins, name tie, one-room vs all-rooms).
- Migration applied twice; the copy is re-runnable and never duplicates.

**Not provable without the live database:** sign-in and RLS. Test on the demo property (step 4).

## Steps (the migration touches the pricing function every property uses — pick a quiet time)

1. **Back up.** Supabase → Table Editor → open `room_rates`, then `price_seasons`, then `properties` → *Export → CSV*. Keep the three files.
2. **Run** `supabase/migrations/20261109000000_unified_seasons.sql` in the SQL editor (safe to run twice). It adds the switch (off), the new table, and **copies every room rate into a season + rule**. Copied seasons are rooms-only, so add-on prices cannot change. Then run `docs/DB_CHECKS.sql` query 11 to see the counts.
3. **Price check, per property** — `supabase/season_price_check.sql` (set the subdomain on the `where` line). **0 rows = safe.** Rows mean an old overlap would price differently; change the season **priority** on the Seasons screen (or flag it to the owner) and run it again.
4. **Switch the demo property first:**
   `update public.properties set season_pricing_v2 = true where subdomain = 'demo';`
   On `demo.stayidom.in` check: Seasons appears at the top of Rooms & Pricing; a room editor shows season prices; the Add-ons page links to Seasons; a guest booking total equals the owner dialog total for a Christmas date and for a date outside any season; adding a season with "Room prices 30" changes a quote and a guest price; an owner cannot run the update above from their own login.
5. **Then other properties, one at a time**, each after its own price check. Tell the owner "Seasons is now at the top of Rooms & Pricing".

## Rollback

- **One property:** `update public.properties set season_pricing_v2 = false where subdomain = '…';` — instant; prices and screens go back. Nothing is lost (rules entered meanwhile stay stored; `room_rates` was never changed, so edits made under the new screen are not in it).
- **Everything:** `supabase/rollbacks/20261109000000_unified_seasons_rollback.sql` restores the previous pricing function and removes the new objects. Export `season_room_rules` to CSV first.

## When every property is switched (later cleanup)

Delete `room_rates`, the old form in `RoomRatesEditor.tsx`, `SeasonsEditor.tsx`, the switch, and the "Not seeing Seasons?" Help notes; retake the screenshots listed in `docs/OWNER_HELP.md`.

## Decisions to confirm with the owner

- Only seasons that have a price for a room compete for that room (a rooms-never-touched season doesn't block another). The plan's wording was ambiguous; this is the friendlier reading.
- Copied seasons keep the old "room-specific first, then later start" order by getting ranked priorities (1, 2, 3…). Owners will see a Priority number only when they edit an overlapping season.
