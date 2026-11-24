/**
 * Unit tests for guestIdentity.ts (guest stats, repeat guest, phone key).
 *
 *   npx tsx --test src/lib/guestIdentity.test.ts
 *
 * Where each guest-identity requirement is tested:
 *  - The key two phone numbers share (formatting differences, missing phone): here, against the SAME cases
 *    as the database (supabase/tests/phone_parity_cases.json).
 *  - Find-or-create by normalized phone INSIDE one property (new guest, reused guest, same phone at another
 *    property = separate guest, no phone = no fake guest, backfill, RLS): supabase/tests/guests.test.sql,
 *    because that is where the matching really happens (run by supabase/tests/run.sh).
 *  - Stay count, first/last stay, revenue and repeat status of a guest: here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guestStats, phoneKey, returningLabel } from "./guestIdentity";
import { bookingRevenue, type BookingLike, type GroupLike, type Period } from "./businessMetrics";

// ── phone key ───────────────────────────────────────────────────────────────
const cases: { raw: string; key: string | null }[] = JSON.parse(
  readFileSync(new URL("../../supabase/tests/phone_parity_cases.json", import.meta.url), "utf8"),
);

test("phone key: every shared case agrees with the database function", () => {
  assert.ok(cases.length >= 15);
  for (const c of cases) assert.equal(phoneKey(c.raw), c.key, `phoneKey(${JSON.stringify(c.raw)})`);
});
test("phone key: formatting differences resolve to the same key", () => {
  const same = [
    "+91 98765 43210",
    "98765 43210",
    "919876543210",
    "09876543210",
    "0091 98765 43210",
    "98765-43210",
    "(+91) 98765.43210",
  ];
  assert.equal(new Set(same.map(phoneKey)).size, 1);
  assert.equal(phoneKey(same[0]), "9876543210");
});
test("phone key: different numbers differ; nothing usable gives null (no fake identity)", () => {
  assert.notEqual(phoneKey("98765 43210"), phoneKey("98765 43211"));
  for (const bad of [null, undefined, "", "   ", "abc", "12345", "+919"])
    assert.equal(phoneKey(bad), null);
});

// ── guest stats ─────────────────────────────────────────────────────────────
type B = BookingLike;
type G = GroupLike;
let n = 0;
const booking = (over: Partial<B> = {}): B => ({
  id: `b${++n}`,
  group_id: null,
  check_in: "2026-03-10",
  check_out: "2026-03-12",
  status: "completed",
  total_amount: 6000,
  discount_amount: 0,
  advance_amount: 0,
  booking_charges: [],
  ...over,
});
const group = (over: Partial<G> = {}): G => ({
  id: `g${++n}`,
  check_in: "2026-05-01",
  check_out: "2026-05-03",
  status: "completed",
  total_amount: 12000,
  discount_amount: 0,
  advance_amount: 0,
  booking_charges: [],
  ...over,
});

test("guest stats: a guest with no stays", () => {
  assert.deepEqual(guestStats([], []), {
    stays: 0,
    revenue: 0,
    firstStay: null,
    lastStay: null,
    isRepeat: false,
    repeatVisits: 0,
  });
});
test("guest stats: the same guest can have many bookings; stay count, first and last stay are right", () => {
  const s = guestStats(
    [
      booking({ check_in: "2026-07-01", check_out: "2026-07-03" }),
      booking({ check_in: "2026-01-15", check_out: "2026-01-17" }),
      booking({ check_in: "2026-11-02", check_out: "2026-11-04", status: "confirmed" }),
    ],
    [],
  );
  assert.equal(s.stays, 3);
  assert.equal(s.firstStay, "2026-01-15");
  assert.equal(s.lastStay, "2026-11-02");
});
test("guest stats: revenue is the canonical stay value (extras and discount included), not payments", () => {
  const s = guestStats(
    [
      booking({ total_amount: 6000, advance_amount: 1000 }), // paid only 1000 of 6000
      booking({
        total_amount: 5000,
        discount_amount: 500,
        booking_charges: [{ qty: 2, unit_price: 750 }],
        advance_amount: 0,
      }), // 5000 + 1500 − 500
    ],
    [],
  );
  assert.equal(s.revenue, 6000 + 6000);
});
test("guest stats: revenue agrees with Money's bookingRevenue over the same stays", () => {
  const bs = [
    booking({ total_amount: 4321.5, discount_amount: 21.5 }),
    booking({ total_amount: 1000, check_in: "2026-04-01", check_out: "2026-04-02" }),
  ];
  const all: Period = { start: "2026-01-01", endExclusive: "2027-01-01" };
  assert.equal(guestStats(bs, []).revenue, bookingRevenue(bs, [], all));
});
test("guest stats: cancelled and pending bookings count as no stay and add no revenue", () => {
  const s = guestStats(
    [
      booking({ status: "cancelled" }),
      booking({ status: "pending", total_amount: 99999 }),
      booking(),
    ],
    [],
  );
  assert.equal(s.stays, 1);
  assert.equal(s.revenue, 6000);
});
test("guest stats: a multi-room booking is ONE stay, not one per room", () => {
  const g = group({ id: "G1", total_amount: 12000 });
  const rooms = [
    booking({ group_id: "G1", total_amount: 6000 }),
    booking({ group_id: "G1", total_amount: 6000 }),
  ];
  const s = guestStats(rooms, [g]);
  assert.equal(s.stays, 1);
  assert.equal(s.revenue, 12000);
  assert.equal(s.isRepeat, false);
});
test("guest stats: a cancelled group does not count, nor do its rooms", () => {
  const g = group({ id: "G2", status: "cancelled" });
  const rooms = [booking({ group_id: "G2" }), booking({ group_id: "G2" })];
  assert.equal(guestStats(rooms, [g]).stays, 0);
});

// ── repeat guest ────────────────────────────────────────────────────────────
test("repeat: the first qualifying stay is not a repeat", () => {
  const s = guestStats([booking()], []);
  assert.equal(s.isRepeat, false);
  assert.equal(s.repeatVisits, 0);
  assert.equal(returningLabel(s.stays), null);
});
test("repeat: the second qualifying stay makes a repeat guest, and the count is right", () => {
  const two = guestStats(
    [booking(), booking({ check_in: "2026-06-01", check_out: "2026-06-02" })],
    [],
  );
  assert.equal(two.isRepeat, true);
  assert.equal(two.repeatVisits, 1);
  assert.equal(returningLabel(two.stays), "Returning guest · 2 stays");
  const three = guestStats([booking(), booking(), booking()], []);
  assert.equal(three.repeatVisits, 2);
  assert.equal(returningLabel(three.stays), "Returning guest · 3 stays");
});
test("repeat: cancelled or pending bookings never create repeat status", () => {
  const s = guestStats(
    [booking(), booking({ status: "cancelled" }), booking({ status: "pending" })],
    [],
  );
  assert.equal(s.isRepeat, false);
});
test("repeat: a booking and a group of rooms are two stays (one each)", () => {
  const g = group({ id: "G3" });
  const rooms = [booking({ group_id: "G3" }), booking({ group_id: "G3" })];
  const s = guestStats([...rooms, booking()], [g]);
  assert.equal(s.stays, 2);
  assert.equal(s.isRepeat, true);
});
