/**
 * Unit tests for moneySummary.ts (the Money overview figures).
 *
 *   npx tsx --test src/lib/moneySummary.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareMoney,
  computeMoneySummary,
  expensesInPeriod,
  moneyChange,
  profitNote,
  reportingPeriod,
  sourceGroupOf,
  type MoneyInput,
  type MoneySummary,
} from "./moneySummary";
import {
  bookingCashCollected,
  bookingRevenue,
  outstandingAmount,
  periodStays,
  totalExpenses,
  type BookingLike,
  type GroupLike,
  type Period,
} from "./businessMetrics";
import { computeBalance, chargesSum } from "./balance";
import type { ExpenseCategory } from "../types/database";

const NOV: Period = { start: "2026-11-01", endExclusive: "2026-12-01" };
const TODAY = "2026-11-15";

type B = BookingLike & { source?: string; booking_source_detail?: string | null };
type G = GroupLike & { source?: string; booking_source_detail?: string | null };

let n = 0;
function booking(over: Partial<B> = {}): B {
  return {
    id: `b${++n}`,
    check_in: "2026-11-10",
    check_out: "2026-11-12", // 2 nights
    status: "confirmed",
    total_amount: 6000,
    discount_amount: 0,
    advance_amount: 0,
    booking_charges: [],
    source: "direct",
    booking_source_detail: null,
    ...over,
  };
}
function group(over: Partial<G> = {}): G {
  return {
    id: `g${++n}`,
    check_in: "2026-11-10",
    check_out: "2026-11-12",
    status: "confirmed",
    total_amount: 12000,
    discount_amount: 0,
    advance_amount: 0,
    booking_charges: [],
    source: "direct",
    booking_source_detail: null,
    ...over,
  };
}
let en = 0;
function expense(
  over: Partial<{ amount: number; expense_date: string; category: ExpenseCategory }> = {},
) {
  return {
    id: `e${++en}`,
    amount: 1000,
    expense_date: "2026-11-05",
    category: "staff" as const,
    ...over,
  };
}

function sum(over: Partial<MoneyInput> = {}): MoneySummary {
  return computeMoneySummary({
    period: NOV,
    bookings: [],
    groups: [],
    expenses: [],
    today: TODAY,
    ...over,
  });
}

// ── Revenue ─────────────────────────────────────────────────────────────────
test("revenue: normal booking", () => {
  assert.equal(sum({ bookings: [booking()] }).revenue, 6000);
});
test("revenue: discounted booking", () => {
  assert.equal(sum({ bookings: [booking({ discount_amount: 1000 })] }).revenue, 5000);
});
test("revenue: booking with charges", () => {
  const b = booking({ booking_charges: [{ qty: 2, unit_price: 500 }] });
  assert.equal(sum({ bookings: [b] }).revenue, 7000);
});
test("revenue: cancelled and pending bookings are not counted", () => {
  const s = sum({ bookings: [booking({ status: "cancelled" }), booking({ status: "pending" })] });
  assert.equal(s.revenue, 0);
  assert.equal(s.stayCount, 0);
  assert.equal(s.outstanding.total, 0);
});
test("revenue: completed stays count", () => {
  assert.equal(sum({ bookings: [booking({ status: "completed" })] }).revenue, 6000);
});
test("revenue: a multi-room booking is counted once, from its group", () => {
  const g = group({ id: "G1", total_amount: 12000 });
  const rooms = [
    booking({ group_id: "G1", total_amount: 6000 }),
    booking({ group_id: "G1", total_amount: 6000 }),
  ];
  const s = sum({ bookings: rooms, groups: [g] });
  assert.equal(s.revenue, 12000);
  assert.equal(s.stayCount, 1);
});
test("revenue: rooms of a cancelled group do not count", () => {
  const g = group({ id: "G2", status: "cancelled" });
  const rooms = [booking({ group_id: "G2" }), booking({ group_id: "G2" })];
  assert.equal(sum({ bookings: rooms, groups: [g] }).revenue, 0);
});
test("revenue: a stay outside the period adds nothing; one crossing the boundary is split by nights", () => {
  const outside = booking({ check_in: "2026-10-10", check_out: "2026-10-12" });
  const crossing = booking({ check_in: "2026-10-30", check_out: "2026-11-03", total_amount: 4000 }); // 2 of 4 nights in Nov
  assert.equal(sum({ bookings: [outside] }).revenue, 0);
  assert.equal(sum({ bookings: [crossing] }).revenue, 2000);
});

// ── Collected ───────────────────────────────────────────────────────────────
test("collected: one payment", () => {
  assert.equal(sum({ bookings: [booking({ advance_amount: 2000 })] }).collected, 2000);
});
test("collected: multiple payments (several bookings and a running total) add up", () => {
  const s = sum({
    bookings: [booking({ advance_amount: 1500 + 1500 }), booking({ advance_amount: 500 })],
  });
  assert.equal(s.collected, 3500);
});
test("collected: partial payment is only what was received", () => {
  const s = sum({ bookings: [booking({ advance_amount: 1500 })] });
  assert.equal(s.collected, 1500);
  assert.equal(s.outstanding.total, 4500);
});
test("collected: payment on a stay outside the period is not counted; a crossing stay is split by nights", () => {
  const outside = booking({
    check_in: "2026-10-10",
    check_out: "2026-10-12",
    advance_amount: 6000,
  });
  const crossing = booking({
    check_in: "2026-10-30",
    check_out: "2026-11-03",
    total_amount: 4000,
    advance_amount: 4000,
  });
  const s = sum({ bookings: [outside, crossing] });
  assert.equal(s.collected, 2000);
});
test("collected: never inferred from status (confirmed with nothing recorded is 0)", () => {
  assert.equal(
    sum({ bookings: [booking({ status: "completed", advance_amount: 0 })] }).collected,
    0,
  );
});
test("collected: matches businessMetrics.bookingCashCollected", () => {
  const bs = [booking({ advance_amount: 2500 }), booking({ advance_amount: 700 })];
  assert.equal(sum({ bookings: bs }).collected, bookingCashCollected(bs, [], NOV));
});

// ── Outstanding ─────────────────────────────────────────────────────────────
test("outstanding: fully paid, partially paid, unpaid", () => {
  assert.equal(sum({ bookings: [booking({ advance_amount: 6000 })] }).outstanding.total, 0);
  assert.equal(sum({ bookings: [booking({ advance_amount: 2000 })] }).outstanding.total, 4000);
  const unpaid = sum({ bookings: [booking()] }).outstanding;
  assert.equal(unpaid.total, 6000);
  assert.equal(unpaid.count, 1);
});
test("outstanding: uses balance.ts (charges and discount included)", () => {
  const b = booking({
    booking_charges: [{ qty: 1, unit_price: 1000 }],
    discount_amount: 500,
    advance_amount: 2000,
  });
  const expected = computeBalance({
    roomTotal: 6000,
    chargesTotal: chargesSum(b.booking_charges),
    discount: 500,
    advance: 2000,
  }).balance;
  assert.equal(sum({ bookings: [b] }).outstanding.total, expected);
  assert.equal(expected, 4500);
});
test("outstanding: cancelled and pending never count", () => {
  const s = sum({ bookings: [booking({ status: "cancelled" }), booking({ status: "pending" })] });
  assert.deepEqual(s.outstanding, { total: 0, count: 0, upcoming: 0, started: 0 });
});
test("outstanding: a multi-room booking is one booking with one balance", () => {
  const g = group({ id: "G3", total_amount: 12000, advance_amount: 3000 });
  const rooms = [booking({ group_id: "G3" }), booking({ group_id: "G3" })];
  const o = sum({ bookings: rooms, groups: [g] }).outstanding;
  assert.equal(o.total, 9000);
  assert.equal(o.count, 1);
});
test("outstanding: split into upcoming and started stays, and the parts add up to the total", () => {
  const started = booking({
    check_in: "2026-11-10",
    check_out: "2026-11-12",
    advance_amount: 5000,
  }); // 1000 due
  const upcoming = booking({
    check_in: "2026-11-20",
    check_out: "2026-11-22",
    advance_amount: 3000,
  }); // 3000 due
  const onToday = booking({ check_in: TODAY, check_out: "2026-11-17", advance_amount: 4000 }); // 2000 due, started
  const o = sum({ bookings: [started, upcoming, onToday] }).outstanding;
  assert.equal(o.upcoming, 3000);
  assert.equal(o.started, 3000);
  assert.equal(o.total, 6000);
  assert.equal(o.count, 3);
});
test("outstanding: equals businessMetrics.outstandingAmount (one calculation)", () => {
  const bs = [
    booking({ advance_amount: 100 }),
    booking({ check_in: "2026-10-30", check_out: "2026-11-03", advance_amount: 50 }),
  ];
  assert.equal(sum({ bookings: bs }).outstanding.total, outstandingAmount(bs, [], NOV));
});
test("outstanding: overpayment is reported as refund due and not netted off Outstanding", () => {
  const over = booking({ advance_amount: 7000 }); // 1000 over
  const due = booking({ advance_amount: 4000 }); // 2000 due
  const s = sum({ bookings: [over, due] });
  assert.equal(s.outstanding.total, 2000);
  assert.equal(s.refundDue, 1000);
});

// ── Expenses ────────────────────────────────────────────────────────────────
test("expenses: one and multiple, with category totals that reconcile", () => {
  const one = sum({ expenses: [expense({ amount: 2500 })] });
  assert.equal(one.expenses, 2500);
  const many = sum({
    expenses: [
      expense({ amount: 20000, category: "staff" }),
      expense({ amount: 8500.5, category: "electricity" }),
      expense({ amount: 7200, category: "cleaning" }),
      expense({ amount: 1000.25, category: "staff" }),
    ],
  });
  assert.equal(many.expenses, 36700.75);
  assert.equal(many.expenseCount, 4);
  assert.deepEqual(
    many.byCategory.map((c) => [c.category, c.total]),
    [
      ["staff", 21000.25],
      ["electricity", 8500.5],
      ["cleaning", 7200],
    ],
  );
  const catTotal = Math.round(many.byCategory.reduce((s, c) => s + c.total, 0) * 100) / 100;
  assert.equal(catTotal, many.expenses);
});
test("expenses: dated outside the period are ignored (inclusive first day, exclusive next period)", () => {
  const s = sum({
    expenses: [
      expense({ amount: 100, expense_date: "2026-10-31" }),
      expense({ amount: 200, expense_date: "2026-11-01" }),
      expense({ amount: 300, expense_date: "2026-11-30" }),
      expense({ amount: 400, expense_date: "2026-12-01" }),
    ],
  });
  assert.equal(s.expenses, 500);
  assert.equal(s.expenseCount, 2);
});
test("expenses: zero expenses", () => {
  const s = sum({ expenses: [] });
  assert.equal(s.expenses, 0);
  assert.equal(s.expenseCount, 0);
  assert.deepEqual(s.byCategory, []);
});
test("expenses: agrees with businessMetrics.totalExpenses", () => {
  const ex = [expense({ amount: 123.45 }), expense({ amount: 10, expense_date: "2026-12-02" })];
  assert.equal(sum({ expenses: ex }).expenses, totalExpenses(ex, NOV));
  assert.equal(expensesInPeriod(ex, NOV).length, 1);
});

// ── Profit ──────────────────────────────────────────────────────────────────
test("profit: revenue minus expenses", () => {
  const s = sum({
    bookings: [booking({ total_amount: 18450 })],
    expenses: [expense({ amount: 6120 })],
  });
  assert.equal(s.profit, 12330);
});
test("profit: unpaid balances are not subtracted from revenue and are not an expense", () => {
  const s = sum({
    bookings: [booking({ advance_amount: 0 })],
    expenses: [expense({ amount: 1000 })],
  });
  assert.equal(s.profit, 5000);
});
test("profit: zero expenses equals revenue and is flagged incomplete", () => {
  const s = sum({ bookings: [booking()] });
  assert.equal(s.profit, 6000);
  const note = profitNote(s.expenseCount);
  assert.equal(note.complete, false);
  assert.match(note.text, /incomplete/);
  assert.match(note.text, /Add property expenses to improve this estimate/);
});
test("profit: with expenses the note says it is based on recorded expenses", () => {
  assert.deepEqual(profitNote(3), { complete: true, text: "Based on recorded expenses." });
});
test("profit: no revenue gives a negative result equal to the expenses", () => {
  assert.equal(sum({ expenses: [expense({ amount: 4000 })] }).profit, -4000);
});
test("profit: negative operating result when expenses exceed revenue", () => {
  const s = sum({
    bookings: [booking({ total_amount: 3000 })],
    expenses: [expense({ amount: 5000 })],
  });
  assert.equal(s.profit, -2000);
});

// ── Source ──────────────────────────────────────────────────────────────────
test("source: known source (agent), detailed source, walk-in and unknown", () => {
  assert.equal(sourceGroupOf({ source: "agent" }), "agent");
  assert.equal(sourceGroupOf({ source: "direct", booking_source_detail: "whatsapp" }), "whatsapp");
  assert.equal(
    sourceGroupOf({ source: "direct", booking_source_detail: "booking_com" }),
    "booking_com",
  );
  assert.equal(sourceGroupOf({ source: "walk_in" }), "walk_in");
  assert.equal(sourceGroupOf({ source: "direct" }), "unknown");
});
test("source: a plain direct booking is Unknown, never Website", () => {
  assert.equal(sourceGroupOf({ source: "direct", booking_source_detail: null }), "unknown");
  assert.equal(sourceGroupOf({ source: "direct", booking_source_detail: "" }), "unknown");
  assert.equal(sourceGroupOf({ source: "direct", booking_source_detail: "   " }), "unknown");
});
test("source: recorded text is matched leniently, and unrecognised text becomes Other (not dropped)", () => {
  assert.equal(sourceGroupOf({ booking_source_detail: " WhatsApp " }), "whatsapp");
  assert.equal(sourceGroupOf({ booking_source_detail: "Booking.com" }), "booking_com");
  assert.equal(sourceGroupOf({ booking_source_detail: "Repeat guest" }), "repeat_guest");
  assert.equal(sourceGroupOf({ booking_source_detail: "facebook" }), "other");
});
test("source: agent bookings stay under Agent even if a detail is recorded", () => {
  assert.equal(sourceGroupOf({ source: "agent", booking_source_detail: "whatsapp" }), "agent");
});
test("source: revenue and booking counts per source, biggest first", () => {
  const s = sum({
    bookings: [
      booking({ total_amount: 5000, booking_source_detail: "whatsapp" }),
      booking({ total_amount: 3000, booking_source_detail: "whatsapp" }),
      booking({ total_amount: 4000, booking_source_detail: "website" }),
      booking({ total_amount: 2000, source: "agent" }),
      booking({ total_amount: 1000 }),
    ],
  });
  assert.deepEqual(
    s.bySource.map((r) => [r.label, r.revenue, r.bookings]),
    [
      ["WhatsApp", 8000, 2],
      ["Website", 4000, 1],
      ["Agent", 2000, 1],
      ["Unknown", 1000, 1],
    ],
  );
});
test("source: a multi-room booking is one booking under its group's source", () => {
  const g = group({ id: "G4", total_amount: 12000, booking_source_detail: "instagram" });
  const rooms = [booking({ group_id: "G4" }), booking({ group_id: "G4" })];
  const s = sum({ bookings: rooms, groups: [g] });
  assert.deepEqual(
    s.bySource.map((r) => [r.group, r.revenue, r.bookings]),
    [["instagram", 12000, 1]],
  );
});
test("source: totals reconcile with revenue, including split stays and odd amounts", () => {
  const bs = [
    booking({
      check_in: "2026-10-30",
      check_out: "2026-11-02",
      total_amount: 1000,
      booking_source_detail: "google",
    }), // 2/3 in Nov
    booking({
      check_in: "2026-10-31",
      check_out: "2026-11-03",
      total_amount: 1000,
      booking_source_detail: "phone",
    }), // 2/3
    booking({
      check_in: "2026-10-31",
      check_out: "2026-11-03",
      total_amount: 1000,
      source: "agent",
    }),
    booking({ check_in: "2026-11-29", check_out: "2026-12-02", total_amount: 1001 }), // 2/3, unknown
    booking({ booking_source_detail: "something else", total_amount: 333.33 }),
  ];
  const s = sum({ bookings: bs });
  const rowsTotal = Math.round(s.bySource.reduce((t, r) => t + r.revenue, 0) * 100) / 100;
  assert.equal(rowsTotal, s.revenue);
  assert.equal(s.revenue, bookingRevenue(bs, [], NOV));
  assert.equal(
    s.bySource.reduce((t, r) => t + r.bookings, 0),
    s.stayCount,
  );
});
test("source: no stays gives no rows", () => {
  assert.deepEqual(sum().bySource, []);
});
test("periodStays leaves out stays with no night in the period", () => {
  const inside = booking();
  const before = booking({ check_in: "2026-10-01", check_out: "2026-10-03" });
  const after = booking({ check_in: "2026-12-01", check_out: "2026-12-03" });
  assert.deepEqual(
    periodStays([inside, before, after], [], NOV).map((s) => s.stay.id),
    [inside.id],
  );
});

// ── Reporting periods ───────────────────────────────────────────────────────
test("period: this month and its previous month", () => {
  const p = reportingPeriod("this_month", new Date(2026, 10, 15, 10, 0));
  assert.deepEqual(p.period, { start: "2026-11-01", endExclusive: "2026-12-01" });
  assert.equal(p.lastDay, "2026-11-30");
  assert.deepEqual(p.previous, { start: "2026-10-01", endExclusive: "2026-11-01" });
  assert.equal(p.previousLastDay, "2026-10-31");
  assert.equal(p.comparisonLabel, "last month");
  assert.match(p.label, /November 2026/);
});
test("period: last month and the month before it", () => {
  const p = reportingPeriod("last_month", new Date(2026, 10, 15));
  assert.deepEqual(p.period, { start: "2026-10-01", endExclusive: "2026-11-01" });
  assert.deepEqual(p.previous, { start: "2026-09-01", endExclusive: "2026-10-01" });
  assert.equal(p.lastDay, "2026-10-31");
  assert.equal(p.comparisonLabel, "the month before");
});
test("period: this year and last year", () => {
  const p = reportingPeriod("this_year", new Date(2026, 10, 15));
  assert.deepEqual(p.period, { start: "2026-01-01", endExclusive: "2027-01-01" });
  assert.equal(p.lastDay, "2026-12-31");
  assert.deepEqual(p.previous, { start: "2025-01-01", endExclusive: "2026-01-01" });
  assert.equal(p.label, "2026");
  assert.equal(p.comparisonLabel, "last year");
});
test("period: month boundaries use the local date (last evening of a month, first morning of the next)", () => {
  assert.equal(
    reportingPeriod("this_month", new Date(2026, 10, 30, 23, 59)).period.start,
    "2026-11-01",
  );
  assert.equal(
    reportingPeriod("this_month", new Date(2026, 11, 1, 0, 1)).period.start,
    "2026-12-01",
  );
  assert.equal(
    reportingPeriod("this_month", new Date(2026, 10, 1, 0, 0)).period.start,
    "2026-11-01",
  );
});
test("period: year boundary (January looks back into December of the previous year)", () => {
  const jan = reportingPeriod("this_month", new Date(2027, 0, 5));
  assert.deepEqual(jan.period, { start: "2027-01-01", endExclusive: "2027-02-01" });
  assert.deepEqual(jan.previous, { start: "2026-12-01", endExclusive: "2027-01-01" });
  const lastMonth = reportingPeriod("last_month", new Date(2027, 0, 5));
  assert.deepEqual(lastMonth.period, { start: "2026-12-01", endExclusive: "2027-01-01" });
  assert.deepEqual(lastMonth.previous, { start: "2026-11-01", endExclusive: "2026-12-01" });
  const dec = reportingPeriod("this_month", new Date(2026, 11, 31));
  assert.equal(dec.period.endExclusive, "2027-01-01");
  assert.equal(dec.lastDay, "2026-12-31");
});
test("period: February in a leap year", () => {
  const feb = reportingPeriod("this_month", new Date(2028, 1, 10));
  assert.equal(feb.lastDay, "2028-02-29");
  assert.equal(feb.period.endExclusive, "2028-03-01");
});
test("period: the selected period alone decides what is counted", () => {
  const oct = booking({ check_in: "2026-10-10", check_out: "2026-10-12", advance_amount: 1000 });
  const nov = booking({ advance_amount: 2000 });
  const lastMonth = reportingPeriod("last_month", new Date(2026, 10, 15));
  const asOct = computeMoneySummary({
    period: lastMonth.period,
    bookings: [oct, nov],
    today: TODAY,
  });
  assert.equal(asOct.revenue, 6000);
  assert.equal(asOct.collected, 1000);
  const year = reportingPeriod("this_year", new Date(2026, 10, 15));
  const asYear = computeMoneySummary({ period: year.period, bookings: [oct, nov], today: TODAY });
  assert.equal(asYear.revenue, 12000);
  assert.equal(asYear.collected, 3000);
});

// ── Comparisons ─────────────────────────────────────────────────────────────
test("comparison: normal previous period", () => {
  const up = moneyChange(1500, 1000, "last month");
  assert.deepEqual(up, { direction: "up", percent: 50, text: "↑ 50% vs last month" });
  assert.equal(moneyChange(750, 1000, "last month")?.text, "↓ 25% vs last month");
  assert.equal(moneyChange(1000, 1000, "last year")?.text, "No change vs last year");
});
test("comparison: previous period zero shows nothing (no infinite or misleading %)", () => {
  assert.equal(moneyChange(5000, 0, "last month"), null);
  assert.equal(moneyChange(0, 0, "last month"), null);
});
test("comparison: current period zero against a real baseline is a true 100% fall", () => {
  assert.equal(moneyChange(0, 4000, "last month")?.text, "↓ 100% vs last month");
});
test("comparison: bad numbers show nothing", () => {
  assert.equal(moneyChange(Number.NaN, 100, "x"), null);
  assert.equal(moneyChange(100, Number.NaN, "x"), null);
});
test("comparison: Outstanding is never compared; profit only when both periods have expenses and a positive baseline", () => {
  const prev = sum({
    bookings: [booking({ total_amount: 4000 })],
    expenses: [expense({ amount: 1000 })],
  });
  const cur = sum({
    bookings: [booking({ total_amount: 6000 })],
    expenses: [expense({ amount: 1500 })],
  });
  const c = compareMoney(cur, prev, "last month");
  assert.equal(c.outstanding, null);
  assert.equal(c.revenue?.text, "↑ 50% vs last month");
  assert.equal(c.expenses?.text, "↑ 50% vs last month");
  assert.equal(c.profit?.text, "↑ 50% vs last month"); // 4500 vs 3000

  const noPrevExpenses = compareMoney(
    cur,
    sum({ bookings: [booking({ total_amount: 4000 })] }),
    "last month",
  );
  assert.equal(noPrevExpenses.profit, null);
  const lossBefore = compareMoney(
    cur,
    sum({ bookings: [booking({ total_amount: 500 })], expenses: [expense({ amount: 1000 })] }),
    "last month",
  );
  assert.equal(lossBefore.profit, null);
});
test("comparison: nothing recorded last period hides every comparison", () => {
  const cur = sum({ bookings: [booking()], expenses: [expense()] });
  const c = compareMoney(cur, sum(), "last month");
  assert.deepEqual(
    [c.revenue, c.collected, c.expenses, c.profit, c.outstanding],
    [null, null, null, null, null],
  );
});
