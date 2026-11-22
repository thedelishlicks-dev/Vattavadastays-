/**
 * Tests for editing a booking's source after creation (bookingSourceEdit.ts) and what it does to
 * Money Intelligence and Revenue Intelligence.
 *
 *   npx tsx --test src/lib/sourceEditing.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourcePatch, canChangeSource, sourceSummary } from "./bookingSourceEdit";
import { computeMoneySummary, sourceGroupOf } from "./moneySummary";
import { MIN_MISSING_SOURCES, missingBookingSourceRule, type RuleBooking } from "./revenueIntelligence";
import { computePropertyScore, summariseActivity } from "./propertyScore";
import type { Period } from "./businessMetrics";

const NOV: Period = { start: "2026-11-01", endExclusive: "2026-12-01" };
const TODAY = "2026-11-20";

// ── the patch ───────────────────────────────────────────────────────────────
test("source can be edited (direct ⇄ walk-in)", () => {
  assert.deepEqual(buildSourcePatch({ source: "direct" }, { source: "walk_in" }), { source: "walk_in", booking_source_detail: null });
  assert.deepEqual(buildSourcePatch({ source: "walk_in", booking_source_detail: "phone" }, { source: "direct", detail: "phone" }), {
    source: "direct",
    booking_source_detail: "phone",
  });
});
test("source detail can be edited", () => {
  assert.deepEqual(buildSourcePatch({ source: "direct" }, { detail: "whatsapp" }), { source: "direct", booking_source_detail: "whatsapp" });
  assert.deepEqual(buildSourcePatch({ source: "direct", booking_source_detail: "whatsapp" }, { detail: "airbnb" }), {
    source: "direct",
    booking_source_detail: "airbnb",
  });
});
test("source detail can be cleared, and the primary source stays valid", () => {
  const p = buildSourcePatch({ source: "walk_in", booking_source_detail: "phone" }, { detail: "" });
  assert.deepEqual(p, { source: "walk_in", booking_source_detail: null });
  assert.deepEqual(buildSourcePatch({ source: "direct", booking_source_detail: "google" }, { detail: "   " }), {
    source: "direct",
    booking_source_detail: null,
  });
});
test("no change = no patch (nothing is written)", () => {
  assert.equal(buildSourcePatch({ source: "direct", booking_source_detail: "google" }, { detail: "google" }), null);
  assert.equal(buildSourcePatch({ source: "direct", booking_source_detail: null }, { detail: "" }), null);
  assert.equal(buildSourcePatch({ source: "walk_in" }, {}), null);
});
test("the patch can only ever carry the two source columns (never money, dates, room, status, payments, guest or agent)", () => {
  const p = buildSourcePatch({ source: "direct" }, { source: "walk_in", detail: "instagram", ...({ total_amount: 1, advance_amount: 1, guest_id: "x", status: "cancelled" } as object) });
  assert.deepEqual(Object.keys(p!).sort(), ["booking_source_detail", "source"]);
});
test("agent source stays compatible: it is kept (with its agent and commission) and its detail can still be edited", () => {
  assert.equal(canChangeSource({ source: "agent" }), false);
  assert.deepEqual(buildSourcePatch({ source: "agent", booking_source_detail: null }, { source: "direct", detail: "whatsapp" }), {
    source: "agent",
    booking_source_detail: "whatsapp",
  });
  assert.equal(buildSourcePatch({ source: "agent" }, { source: "direct" }), null);
});
test("an owner cannot turn a booking into an agent booking here (that needs an agent and a commission)", () => {
  assert.deepEqual(buildSourcePatch({ source: "direct" }, { source: "agent", detail: "google" }), { source: "direct", booking_source_detail: "google" });
});
test("existing source values stay compatible: unknown stored text is untouched until changed, and reads as written", () => {
  assert.equal(buildSourcePatch({ source: "direct", booking_source_detail: "facebook" }, { detail: "facebook" }), null);
  assert.equal(sourceSummary({ source: "direct", booking_source_detail: "facebook" }), "facebook");
  assert.equal(sourceGroupOf({ source: "direct", booking_source_detail: "facebook" }), "other");
});
test("source line on the booking: reads what is stored, never infers", () => {
  assert.equal(sourceSummary({ source: "direct", booking_source_detail: null }), "Not recorded");
  assert.equal(sourceSummary({ source: "direct", booking_source_detail: "whatsapp" }), "WhatsApp");
  assert.equal(sourceSummary({ source: "walk_in" }), "Walk-in");
  assert.equal(sourceSummary({ source: "agent", booking_source_detail: "instagram" }), "Agent · Instagram");
  assert.equal(sourceSummary({ source: "agent" }), "Agent");
});

// ── what an edit does downstream ────────────────────────────────────────────
type Row = RuleBooking & { id: string; guest_phone?: string | null; is_paid?: boolean };
let n = 0;
const row = (over: Partial<Row> = {}): Row => ({
  id: `b${++n}`,
  room_id: "r1",
  group_id: null,
  guest_name: "Guest",
  guest_phone: "+91 98765 43210",
  status: "confirmed",
  check_in: "2026-11-02",
  check_out: "2026-11-04",
  total_amount: 6000,
  discount_amount: 0,
  advance_amount: 2500,
  is_paid: false,
  booking_charges: [],
  source: "direct",
  booking_source_detail: null,
  ...over,
});
const apply = (rows: Row[], id: string, patch: ReturnType<typeof buildSourcePatch>) =>
  rows.map((r) => (r.id === id && patch ? { ...r, ...patch } : r));

function before(): Row[] {
  // 10 qualifying stays; 4 have no source (plain direct, no detail), 6 do.
  return [
    ...Array.from({ length: 4 }, () => row({ total_amount: 5000 + n * 10 })),
    row({ booking_source_detail: "whatsapp" }),
    row({ booking_source_detail: "whatsapp", total_amount: 7000 }),
    row({ booking_source_detail: "website" }),
    row({ source: "agent" }),
    row({ source: "walk_in" }),
    row({ booking_source_detail: "airbnb", total_amount: 3333.33 }),
    row({ status: "cancelled", total_amount: 99999 }), // never counts
    row({ status: "pending", total_amount: 88888 }), // never counts
  ];
}
const money = (rows: Row[]) => computeMoneySummary({ period: NOV, bookings: rows, groups: [], expenses: [], today: TODAY });
const missing = (rows: Row[]) => {
  const o = missingBookingSourceRule({
    today: TODAY,
    currentMonth: NOV,
    rooms: [],
    bookings: rows,
    groups: [],
    rates: [],
    blockedNights: [],
    expenses: [],
  });
  return o.length ? Number(/^(\d+) booking/.exec(o[0].title)![1]) : 0;
};

test("Revenue Intelligence: the missing-source count goes down as the owner corrects bookings", () => {
  const rows = before();
  assert.equal(missing(rows), 4);
  const noSource = rows.filter((r) => r.status === "confirmed" && r.source === "direct" && !r.booking_source_detail);
  const e1 = apply(rows, noSource[0].id, buildSourcePatch(noSource[0], { detail: "instagram" }));
  assert.equal(missing(e1), 3);
  // 2 left is below MIN_MISSING_SOURCES (3): a couple of gaps is not a pattern, so the opportunity goes quiet.
  const e2 = apply(e1, noSource[1].id, buildSourcePatch(noSource[1], { source: "walk_in" }));
  assert.equal(missing(e2), 0);
  assert.equal(MIN_MISSING_SOURCES, 3);
  // and it comes back, with the right count, if bookings lose their source again
  const e3 = apply(e2, noSource[0].id, buildSourcePatch(e2.find((r) => r.id === noSource[0].id)!, { detail: "" }));
  assert.equal(missing(e3), 3); // 4 gaps − 2 corrected + 1 cleared = 3 → reported again
});
test("Revenue Intelligence: clearing a detail makes the booking count as missing again", () => {
  const rows = before();
  const withDetail = rows.find((r) => r.booking_source_detail === "website")!;
  const cleared = apply(rows, withDetail.id, buildSourcePatch(withDetail, { detail: "" }));
  assert.equal(missing(cleared), 5);
});

test("Money: editing sources moves revenue between source rows but never changes the total", () => {
  const rows = before();
  const a = money(rows);
  const unknown = a.bySource.find((r) => r.group === "unknown")!;
  assert.equal(unknown.bookings, 4);

  const noSource = rows.filter((r) => r.status === "confirmed" && r.source === "direct" && !r.booking_source_detail);
  let edited = apply(rows, noSource[0].id, buildSourcePatch(noSource[0], { detail: "instagram" }));
  edited = apply(edited, noSource[1].id, buildSourcePatch(noSource[1], { detail: "whatsapp" }));
  const b = money(edited);

  // the breakdown changed…
  assert.equal(b.bySource.find((r) => r.group === "unknown")!.bookings, 2);
  assert.equal(b.bySource.find((r) => r.group === "instagram")!.bookings, 1);
  assert.equal(b.bySource.find((r) => r.group === "whatsapp")!.bookings, 3);
  assert.notDeepEqual(
    a.bySource.map((r) => [r.group, r.revenue]),
    b.bySource.map((r) => [r.group, r.revenue]),
  );
  // …the money did not
  assert.equal(b.revenue, a.revenue);
  assert.equal(b.collected, a.collected);
  assert.deepEqual(b.outstanding, a.outstanding);
  assert.equal(b.stayCount, a.stayCount);
});
test("Money: source totals still reconcile exactly to total revenue, before and after edits", () => {
  const rows = before();
  const reconciles = (s: ReturnType<typeof money>) =>
    assert.equal(Math.round(s.bySource.reduce((t, r) => t + r.revenue, 0) * 100) / 100, s.revenue);
  reconciles(money(rows));
  const target = rows[1];
  for (const patch of [{ detail: "google" }, { source: "walk_in" }, { detail: "unheard-of-source" }, { detail: "" }]) {
    reconciles(money(apply(rows, target.id, buildSourcePatch(target, patch))));
  }
  // a stay split across the period boundary (odd fraction) still reconciles after an edit
  const split = [...rows, row({ check_in: "2026-10-30", check_out: "2026-11-02", total_amount: 1000 })];
  const sp = split[split.length - 1];
  reconciles(money(split));
  reconciles(money(apply(split, sp.id, buildSourcePatch(sp, { detail: "phone" }))));
});
test("editing a source changes none of the booking's other data", () => {
  const r = row({ advance_amount: 1234, discount_amount: 100, guest_phone: "+91 90000 11111" });
  const patch = buildSourcePatch(r, { source: "walk_in", detail: "phone" })!;
  const after = { ...r, ...patch };
  const { source: _s, booking_source_detail: _d, ...restBefore } = r;
  const { source: _s2, booking_source_detail: _d2, ...restAfter } = after;
  assert.deepEqual(restAfter, restBefore); // value, payments, dates, room, status, guest: identical
});

// ── Property Score ──────────────────────────────────────────────────────────
test("Property Score: the 'booking sources recorded' share follows source edits (same data, no new rule)", () => {
  const rows = before();
  const share = (rs: Row[]) => summariseActivity(rs, [], TODAY).withSourceDetail;
  const a = share(rows);
  const target = rows.find((r) => r.status === "confirmed" && r.source === "direct" && !r.booking_source_detail)!;
  assert.equal(share(apply(rows, target.id, buildSourcePatch(target, { detail: "google" }))), a + 1);
  const prop = { name: "Hill View", rooms: [{ is_active: true, base_price: 3000 }] };
  const sc = (rs: Row[]) =>
    computePropertyScore(prop, { today: TODAY, activity: summariseActivity(rs, [], TODAY), seasonRates: [], bookingTotal: rs.length, expenseCount: 1 }).items.find((i) => i.id === "growth_source")!.points;
  assert.ok(sc(apply(rows, target.id, buildSourcePatch(target, { detail: "google" }))) >= sc(rows));
});
