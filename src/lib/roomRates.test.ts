import test from "node:test";
import assert from "node:assert/strict";
import { pickRate, rateBasePrice, parseRate, type RoomRate } from "./roomRates";
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
