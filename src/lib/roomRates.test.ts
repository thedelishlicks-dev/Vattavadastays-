import test from "node:test";
import assert from "node:assert/strict";
import { pickRate, rateBasePrice, parseRate, parseRule, seasonRulesToRates, type RoomRate, type SeasonRoomRule } from "./roomRates";
import { resolveSeason, coverageGaps, type PriceSeason } from "./quotes";
import { readFileSync } from "node:fs";
import { priceRoomStay } from "./quoteBuilder";

const room = { id: "r1", name: "Deluxe", base_price: 2000, extra_guest_price: 500, weekend_multiplier: 1.25, max_guests: 2 };
const peak: RoomRate = { id: "a", room_id: "r1", label: "Christmas", start_date: "2026-12-24", end_date: "2027-01-02", kind: "fixed", value: 4000, created_at: "2026-10-01T00:00:00Z" };

test("no rates = base price, weekend multiplier on Fri/Sat nights (unchanged behaviour)", () => {
  // Mon 12 Oct 2026 → Mon 19 Oct: Fri 16 + Sat 17 are weekend nights
  const l = priceRoomStay({ room, guests: 2, checkIn: "2026-10-12", checkOut: "2026-10-19" });
  assert.equal(l.room_price, 5 * 2000 + 2 * 2500);
  assert.equal(l.seasonal_nights, 0);
});

test("fixed seasonal rate replaces base for covered nights; weekend multiplier still applies", () => {
  // 25 Dec 2026 is Friday. Nights 25,26 (Fri,Sat) + 27 (Sun) at 4000 base.
  const l = priceRoomStay({ room, guests: 2, checkIn: "2026-12-25", checkOut: "2026-12-28", rates: [peak] });
  assert.equal(l.room_price, 4000 * 1.25 * 2 + 4000);
  assert.equal(l.seasonal_nights, 3);
  assert.deepEqual(l.rate_labels, ["Christmas"]);
});

test("stay straddling a period boundary: end_date is the LAST night (inclusive)", () => {
  // Nights 1 Jan (Fri, in period), 2 Jan (Sat, in period), 3 Jan (Sun, outside)
  const l = priceRoomStay({ room, guests: 2, checkIn: "2027-01-01", checkOut: "2027-01-04", rates: [peak] });
  assert.equal(l.seasonal_nights, 2);
  assert.equal(l.room_price, 4000 * 1.25 * 2 + 2000);
});

test("percent rate", () => {
  const off: RoomRate = { room_id: null, start_date: "2026-06-01", end_date: "2026-06-30", kind: "percent", value: -20 };
  assert.equal(rateBasePrice(off, 2000), 1600);
  assert.equal(rateBasePrice({ ...off, value: 30 }, 1999), 2599); // 2598.7 → 2599
  assert.equal(rateBasePrice({ ...off, value: 10 }, 1005), 1106); // 1105.5 rounds up, same as Postgres round()
});

test("precedence: room-specific beats all-rooms; then later start; then newest", () => {
  const all: RoomRate = { room_id: null, start_date: "2026-12-20", end_date: "2027-01-05", kind: "percent", value: 10, created_at: "2026-10-02T00:00:00Z" };
  assert.equal(pickRate("2026-12-25", "r1", [all, peak])?.id, "a");          // room-specific wins even though all-rooms is newer
  assert.equal(pickRate("2026-12-25", "r2", [all, peak])?.value, 10);        // other room only sees the all-rooms rate
  const narrow: RoomRate = { ...peak, id: "b", start_date: "2026-12-30", end_date: "2026-12-31", value: 6000, created_at: "2026-09-01T00:00:00Z" };
  assert.equal(pickRate("2026-12-30", "r1", [peak, narrow])?.id, "b");       // later start wins
  assert.equal(pickRate("2026-12-29", "r1", [peak, narrow])?.id, "a");
  assert.equal(pickRate("2027-02-01", "r1", [peak, narrow]), null);
});

test("parseRate validates like the table's CHECK constraints", () => {
  const ok = parseRate({ label: " Peak ", start_date: "2026-12-24", end_date: "2027-01-02", kind: "fixed", value: "4000" });
  assert.ok(ok.ok && ok.values.label === "Peak" && ok.values.value === 4000);
  assert.equal(parseRate({ label: "", start_date: "2026-12-24", end_date: "2026-12-20", kind: "fixed", value: "1" }).ok, false);
  assert.equal(parseRate({ label: "", start_date: "2026-12-24", end_date: "2026-12-25", kind: "percent", value: "-95" }).ok, false);
  assert.equal(parseRate({ label: "", start_date: "2026-12-24", end_date: "2026-12-25", kind: "fixed", value: "0" }).ok, false);
  assert.equal(parseRate({ label: "", start_date: "2026-01-01", end_date: "2027-03-01", kind: "fixed", value: "100" }).ok, false); // > 400 nights
});

// ── Unified seasons ─────────────────────────────────────────────────────────
// supabase/tests/season_parity_cases.json is asserted here AND by supabase/tests/seasons.test.sql
// against room_night_base_seasons(): the TypeScript and SQL pricers must give the same nightly base.

interface Fixture {
  rooms: { id: string; base_price: number }[];
  cases: {
    name: string;
    seasons: { id: string; name: string; start: string; end: string; yearly: boolean; priority: number }[];
    rules: { season: string; room: string | null; kind: "fixed" | "percent"; value: number }[];
    checks: { room: string; date: string; expect: number | null }[];
  }[];
}
const fx = JSON.parse(readFileSync(new URL("../../supabase/tests/season_parity_cases.json", import.meta.url), "utf8")) as Fixture;

for (const c of fx.cases) {
  test(`season parity: ${c.name}`, () => {
    const seasons: PriceSeason[] = c.seasons.map((s) => ({ id: s.id, name: s.name, start_date: s.start, end_date: s.end, recurs_yearly: s.yearly, priority: s.priority }));
    const rules: SeasonRoomRule[] = c.rules.map((r) => ({ season_id: r.season, room_id: r.room, kind: r.kind, value: r.value }));
    const rates = seasonRulesToRates(seasons, rules);
    for (const k of c.checks) {
      const base = fx.rooms.find((r) => r.id === k.room)!.base_price;
      const rate = pickRate(k.date, k.room, rates);
      const got = rate ? rateBasePrice(rate, base) : null;
      assert.equal(got, k.expect, `${k.room} on ${k.date}`);
    }
  });
}

test("seasons flow through priceRoomStay: label, seasonal nights, weekend multiplier on top", () => {
  const seasons: PriceSeason[] = [{ id: "s1", name: "Christmas", start_date: "2026-12-20", end_date: "2027-01-05", recurs_yearly: true, priority: 0 }];
  const rates = seasonRulesToRates(seasons, [{ season_id: "s1", room_id: null, kind: "percent", value: 30 }]);
  // Fri 25 Dec, Sat 26 Dec, Sun 27 Dec at 2000 × 1.3 = 2600 base
  const l = priceRoomStay({ room, guests: 2, checkIn: "2026-12-25", checkOut: "2026-12-28", rates });
  assert.equal(l.room_price, 2600 * 1.25 * 2 + 2600);
  assert.equal(l.seasonal_nights, 3);
  assert.deepEqual(l.rate_labels, ["Christmas"]);
  // next year, same season, nobody re-entered it
  const next = priceRoomStay({ room, guests: 2, checkIn: "2027-12-27", checkOut: "2027-12-28", rates });
  assert.equal(next.seasonal_nights, 1);
});

test("migrated legacy rates price exactly like the legacy rules (what the SQL copy promises)", () => {
  // Same data as the copy test in seasons.test.sql: a room rate + an all-rooms rate with the same name and dates,
  // and an unnamed all-rooms rate. After the copy: 2 seasons, 3 rules.
  const legacy: RoomRate[] = [
    { id: "1", room_id: "r1", label: "Christmas", start_date: "2026-12-24", end_date: "2027-01-02", kind: "fixed", value: 4000, created_at: "2026-10-01T00:00:00Z" },
    { id: "2", room_id: null, label: "Christmas", start_date: "2026-12-24", end_date: "2027-01-02", kind: "percent", value: 10, created_at: "2026-10-02T00:00:00Z" },
    { id: "3", room_id: null, label: "", start_date: "2027-03-01", end_date: "2027-03-05", kind: "percent", value: -20, created_at: "2026-10-03T00:00:00Z" },
  ];
  const seasons: PriceSeason[] = [
    { id: "xmas", name: "Christmas", start_date: "2026-12-24", end_date: "2027-01-02", recurs_yearly: false, priority: 2, for_addons: false },
    { id: "mar", name: "Rates 1 Mar 2027 – 5 Mar 2027", start_date: "2027-03-01", end_date: "2027-03-05", recurs_yearly: false, priority: 1, for_addons: false },
  ];
  const migrated = seasonRulesToRates(seasons, [
    { season_id: "xmas", room_id: "r1", kind: "fixed", value: 4000 },
    { season_id: "xmas", room_id: null, kind: "percent", value: 10 },
    { season_id: "mar", room_id: null, kind: "percent", value: -20 },
  ]);
  for (const day of ["2026-12-23", "2026-12-24", "2027-01-02", "2027-01-03", "2027-03-03", "2027-03-06"]) {
    for (const roomId of ["r1", "r2"]) {
      const a = pickRate(day, roomId, legacy);
      const b = pickRate(day, roomId, migrated);
      assert.equal(a ? rateBasePrice(a, 2000) : null, b ? rateBasePrice(b, 2000) : null, `${roomId} ${day}`);
    }
  }
});

test("a rooms-only season never changes an add-on season or its gap warnings", () => {
  const addonSeason: PriceSeason = { id: "peak", name: "Peak", start_date: "2026-12-01", end_date: "2027-01-31", recurs_yearly: false, priority: 0 };
  const roomsOnly: PriceSeason = { id: "xmas", name: "Christmas", start_date: "2026-12-24", end_date: "2027-01-02", recurs_yearly: false, priority: 9, for_addons: false };
  assert.equal(resolveSeason("2026-12-25", [addonSeason, roomsOnly])?.id, "peak");
  assert.equal(resolveSeason("2026-12-25", [roomsOnly]), null);
  const gaps = coverageGaps([{ variants: [{ key: "s", label: "Standard", base_price: 100, season_prices: {} }] }], [addonSeason, roomsOnly]);
  assert.equal(gaps.peak, 1);
  assert.equal(gaps.xmas, 0);
});

test("parseRule keeps the table's limits", () => {
  assert.equal(parseRule({ kind: "percent", value: "30" }).ok, true);
  assert.equal(parseRule({ kind: "percent", value: "-90" }).ok, false);
  assert.equal(parseRule({ kind: "percent", value: "501" }).ok, false);
  assert.equal(parseRule({ kind: "fixed", value: "0" }).ok, false);
  assert.equal(parseRule({ kind: "fixed", value: "" }).ok, false);
});
