/**
 * Unit tests for dashboardMetrics.ts — the figures and wording on the owner Home dashboard.
 *   npx tsx --test src/lib/dashboardMetrics.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  buildBusinessSnapshot,
  buildOpportunities,
  countOpenNights,
  monthPeriods,
  percentChange,
  percentComparison,
  pointsComparison,
} from "./dashboardMetrics";
import { computeBusinessMetrics, openBalances, type BookingLike } from "./businessMetrics";
import { buildCalendarIndex } from "./calendarState";

const m = monthPeriods(new Date(2026, 10, 19)); // 19 Nov 2026
let n = 0;
const stay = (over: Partial<BookingLike>): BookingLike => ({
  id: `b${++n}`,
  check_in: "2026-11-10",
  check_out: "2026-11-12",
  status: "confirmed",
  total_amount: 6000,
  discount_amount: 0,
  advance_amount: 0,
  ...over,
});

// ── periods ─────────────────────────────────────────────────────────────────
test("monthPeriods: this and last calendar month from local date, year rollover", () => {
  assert.deepEqual(m.current, { start: "2026-11-01", endExclusive: "2026-12-01" });
  assert.deepEqual(m.previous, { start: "2026-10-01", endExclusive: "2026-11-01" });
  assert.equal(m.currentLastDay, "2026-11-30");
  const jan = monthPeriods(new Date(2027, 0, 5));
  assert.deepEqual(jan.previous, { start: "2026-12-01", endExclusive: "2027-01-01" });
});

test("addDays crosses month and year ends", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-12-31", 14), "2027-01-14");
});

// ── comparison wording ──────────────────────────────────────────────────────
test("percent comparison wording matches the spec", () => {
  assert.equal(percentComparison(11800, 10000)?.text, "↑ 18% vs last month");
  assert.equal(percentComparison(9600, 10000)?.text, "↓ 4% vs last month");
  assert.equal(percentComparison(11800, 10000)?.direction, "up");
  assert.equal(percentComparison(9600, 10000)?.direction, "down");
});

test("points comparison wording matches the spec", () => {
  assert.equal(pointsComparison(57, 50)?.text, "↑ 7 pts vs last month");
  assert.equal(pointsComparison(46, 50)?.text, "↓ 4 pts vs last month");
});

test("no change is stated plainly, not as 0%", () => {
  assert.equal(percentComparison(10000, 10000)?.text, "No change vs last month");
  assert.equal(percentComparison(10040, 10000)?.direction, "flat"); // rounds to 0%
  assert.equal(pointsComparison(50.2, 50)?.direction, "flat");
});

test("no baseline, no percentage: zero, negative or invalid previous value", () => {
  assert.equal(percentChange(5000, 0), null);
  assert.equal(percentChange(5000, -200), null);
  assert.equal(percentChange(5000, Number.NaN), null);
  assert.equal(percentComparison(5000, 0), null);
  assert.equal(pointsComparison(Number.NaN, 10), null);
});

test("falling to zero is a real 100% drop", () => {
  assert.equal(percentComparison(0, 10000)?.text, "↓ 100% vs last month");
});

// ── snapshot: real figures through businessMetrics ──────────────────────────
function metricsFor(
  bookings: BookingLike[],
  rooms: number,
  expenses: { expense_date: string; amount: number }[] = [],
) {
  return {
    current: computeBusinessMetrics({ period: m.current, bookings, roomCount: rooms, expenses }),
    previous: computeBusinessMetrics({ period: m.previous, bookings, roomCount: rooms, expenses }),
  };
}

test("snapshot: revenue, occupancy, ADR, profit and their comparisons", () => {
  const bookings = [
    stay({ check_in: "2026-10-10", check_out: "2026-10-12", total_amount: 5000 }), // Oct: 2 nights, 5000
    stay({ check_in: "2026-11-10", check_out: "2026-11-13", total_amount: 9000 }), // Nov: 3 nights, 9000
    stay({ check_in: "2026-11-20", check_out: "2026-11-21", total_amount: 3000 }), // Nov: 1 night, 3000
  ];
  const expenses = [
    { expense_date: "2026-10-05", amount: 1000 },
    { expense_date: "2026-11-05", amount: 4000 },
  ];
  const { current, previous } = metricsFor(bookings, 2, expenses);
  const s = buildBusinessSnapshot(current, previous, true);
  assert.equal(s.revenue.value, 12000);
  assert.equal(s.revenue.comparison?.text, "↑ 140% vs last month"); // 12000 vs 5000
  assert.equal(s.occupancy.occupiedNights, 4);
  assert.equal(s.occupancy.availableNights, 60); // 2 rooms × 30 days
  assert.equal(s.occupancy.value, 6.67);
  assert.equal(s.occupancy.comparison?.text, "↑ 3 pts vs last month"); // 6.67 vs 3.23 (2/62)
  assert.equal(s.adr.value, 3000); // 12000 / 4 nights
  assert.equal(s.adr.comparison?.text, "↑ 20% vs last month"); // vs 2500
  assert.equal(s.profit.value, 8000); // 12000 − 4000
  assert.equal(s.profit.comparison?.text, "↑ 100% vs last month"); // vs 4000
});

test("snapshot never calls revenue profit: no expenses recorded means no profit figure", () => {
  const { current, previous } = metricsFor([stay({})], 2);
  const s = buildBusinessSnapshot(current, previous, true);
  assert.equal(s.profit.value, null);
  assert.equal(s.profit.expensesRecorded, false);
  assert.equal(s.revenue.value, 6000);
});

test("snapshot: first month of data shows no comparisons at all", () => {
  const { current, previous } = metricsFor([stay({})], 2, [
    { expense_date: "2026-11-05", amount: 500 },
  ]);
  const s = buildBusinessSnapshot(current, previous, true);
  assert.equal(s.revenue.comparison, null);
  assert.equal(s.occupancy.comparison, null);
  assert.equal(s.adr.comparison, null);
  assert.equal(s.profit.comparison, null);
});

test("snapshot: a property not yet set up for all of last month shows no comparisons", () => {
  const bookings = [
    stay({ check_in: "2026-10-10", check_out: "2026-10-12", total_amount: 5000 }),
    stay({}),
  ];
  const { current, previous } = metricsFor(bookings, 2, [
    { expense_date: "2026-10-05", amount: 100 },
    { expense_date: "2026-11-05", amount: 100 },
  ]);
  const s = buildBusinessSnapshot(current, previous, false);
  assert.equal(s.revenue.comparison, null);
  assert.equal(s.occupancy.comparison, null);
  assert.equal(s.adr.comparison, null);
  assert.equal(s.profit.comparison, null);
  assert.equal(s.revenue.value, 6000); // the figures themselves still show
});

test("snapshot: zero rooms and zero bookings are safe (no NaN, no comparison)", () => {
  const { current, previous } = metricsFor([], 0);
  const s = buildBusinessSnapshot(current, previous, true);
  assert.equal(s.revenue.value, 0);
  assert.equal(s.occupancy.value, null);
  assert.equal(s.adr.value, null);
  assert.equal(s.profit.value, null);
  assert.equal(s.revenue.comparison, null);
});

test("snapshot: ADR is hidden when no night was sold this month", () => {
  const { current, previous } = metricsFor(
    [stay({ check_in: "2026-10-10", check_out: "2026-10-12" })],
    2,
  );
  const s = buildBusinessSnapshot(current, previous, true);
  assert.equal(s.adr.value, null);
  assert.equal(s.revenue.comparison?.text, "↓ 100% vs last month");
});

test("snapshot: profit % is hidden against a loss or when last month had no expenses entered", () => {
  const bookings = [
    stay({ check_in: "2026-10-10", check_out: "2026-10-12", total_amount: 1000 }),
    stay({}),
  ];
  const lossLastMonth = metricsFor(bookings, 2, [
    { expense_date: "2026-10-05", amount: 5000 },
    { expense_date: "2026-11-05", amount: 100 },
  ]);
  assert.equal(
    buildBusinessSnapshot(lossLastMonth.current, lossLastMonth.previous, true).profit.comparison,
    null,
  );
  const noCostsLastMonth = metricsFor(bookings, 2, [{ expense_date: "2026-11-05", amount: 100 }]);
  assert.equal(
    buildBusinessSnapshot(noCostsLastMonth.current, noCostsLastMonth.previous, true).profit
      .comparison,
    null,
  );
});

test("snapshot: cancelled and pending stays never reach the dashboard figures", () => {
  const { current, previous } = metricsFor(
    [stay({ status: "cancelled" }), stay({ status: "pending" })],
    2,
  );
  const s = buildBusinessSnapshot(current, previous, true);
  assert.equal(s.revenue.value, 0);
  assert.equal(s.occupancy.occupiedNights, 0);
});

// ── open nights ─────────────────────────────────────────────────────────────
test("countOpenNights: booked, pending and blocked nights are not open", () => {
  const idx = buildCalendarIndex(
    [
      {
        room_id: "r1",
        status: "confirmed",
        guest_name: "A",
        check_in: "2026-11-19",
        check_out: "2026-11-21",
      }, // 19, 20
      {
        room_id: "r1",
        status: "pending",
        guest_name: "B",
        check_in: "2026-11-22",
        check_out: "2026-11-23",
      }, // 22
    ],
    [{ room_id: "r1", date: "2026-11-24", note: "Painting" }], // blocked
  );
  const r = countOpenNights(idx, ["r1", "r2"], "2026-11-19", 7); // 19..25
  assert.equal(r.total, 14);
  assert.equal(r.open, 14 - 2 - 1 - 1); // r1 loses 4 nights, r2 is empty
});

test("countOpenNights with no rooms is empty", () => {
  assert.deepEqual(countOpenNights(buildCalendarIndex([], []), [], "2026-11-19", 14), {
    open: 0,
    total: 0,
  });
});

// ── opportunities ───────────────────────────────────────────────────────────
const base = {
  hasBookingHistory: true,
  openBalance: { count: 0, total: 0 },
  openNights: { open: 0, total: 28 },
  revenueThisMonth: 0,
  expensesThisMonth: 0,
};

test("opportunities: nothing to say means an empty list", () => {
  assert.deepEqual(buildOpportunities(base), []);
});

test("opportunities: a new property with no history gets none", () => {
  assert.deepEqual(
    buildOpportunities({
      ...base,
      hasBookingHistory: false,
      openBalance: { count: 2, total: 900 },
      openNights: { open: 28, total: 28 },
      revenueThisMonth: 1000,
    }),
    [],
  );
});

test("opportunity: outstanding payments carry the amount and link to Payments", () => {
  const [o] = buildOpportunities({ ...base, openBalance: { count: 2, total: 8500 } });
  assert.equal(o.id, "outstanding");
  assert.equal(o.amount, 8500);
  assert.equal(o.to, "/admin/payments");
  assert.match(o.detail, /^2 stays have already started/);
  assert.equal(
    buildOpportunities({ ...base, openBalance: { count: 1, total: 100 } })[0].detail.startsWith(
      "1 stay has",
    ),
    true,
  );
});

test("opportunity: open dates only when at least half the next two weeks is open, and with no invented amount", () => {
  assert.equal(buildOpportunities({ ...base, openNights: { open: 13, total: 28 } }).length, 0);
  const [o] = buildOpportunities({ ...base, openNights: { open: 14, total: 28 } });
  assert.equal(o.id, "open-dates");
  assert.equal(o.amount, undefined);
  assert.equal(o.to, "/admin/calendar");
  assert.match(o.detail, /14 of 28 room-nights/);
});

test("opportunity: missing expenses only when there is revenue and no expense recorded", () => {
  assert.equal(
    buildOpportunities({ ...base, revenueThisMonth: 5000, expensesThisMonth: 0 })[0].id,
    "missing-expenses",
  );
  assert.equal(
    buildOpportunities({ ...base, revenueThisMonth: 5000, expensesThisMonth: 100 }).length,
    0,
  );
  assert.equal(
    buildOpportunities({ ...base, revenueThisMonth: 0, expensesThisMonth: 0 }).length,
    0,
  );
});

test("opportunity: missing expenses is never claimed while expenses are loading or failed", () => {
  assert.equal(
    buildOpportunities({ ...base, revenueThisMonth: 5000, expensesKnown: false }).length,
    0,
  );
});

test("opportunities come in a stable order: money first", () => {
  const ids = buildOpportunities({
    ...base,
    openBalance: { count: 1, total: 100 },
    openNights: { open: 20, total: 28 },
    revenueThisMonth: 100,
  }).map((o) => o.id);
  assert.deepEqual(ids, ["outstanding", "open-dates", "missing-expenses"]);
});

test("openBalances feeds the opportunity: only started, counted stays", () => {
  const bal = openBalances(
    [
      stay({ check_in: "2026-11-05", check_out: "2026-11-07", advance_amount: 1000 }),
      stay({ check_in: "2026-11-25", check_out: "2026-11-27" }),
    ],
    [],
    "2026-11-19",
  );
  assert.deepEqual(bal, { count: 1, total: 5000 });
});
