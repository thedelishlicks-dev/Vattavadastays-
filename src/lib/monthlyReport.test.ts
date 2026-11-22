/**
 * Unit tests for monthlyReport.ts (the Monthly Business Report).
 *
 *   npx tsx --test src/lib/monthlyReport.test.ts
 *
 * The report is a composition layer over Money Intelligence, the business metrics, guest identity, the Property
 * Score and Revenue Intelligence, so many of these tests assert that it reports EXACTLY what those engines
 * report for the same rows (and then test only what the report adds: month choice, comparison states, guest
 * insights, source percentages, the deterministic takeaway).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_BASELINE_TEXT,
  OPPORTUNITIES_HEADING,
  REPORT_MAX_OPPORTUNITIES,
  REPORT_MONTHS_BACK,
  SCORE_HISTORY_NOTE,
  buildMonthlyReport,
  buildTakeaway,
  compareMonths,
  computeGuestInsights,
  earliestReportMonth,
  guestSectionState,
  isSelectableMonth,
  lastCompletedMonth,
  opportunitiesNote,
  percentChangeOf,
  periodGuestIds,
  reportOpportunities,
  reportWindow,
  scoreSection,
  setupNoteFor,
  shiftMonth,
  sourceShares,
  type MonthRows,
  type MonthlyReport,
  type MonthlyReportInput,
  type ReportMonth,
} from "./monthlyReport";
import {
  averageDailyRate,
  bookingRevenue,
  revPar,
  type BookingLike,
  type GroupLike,
} from "./businessMetrics";
import { computeMoneySummary, type SourceFields } from "./moneySummary";
import { buildSourcePatch } from "./bookingSourceEdit";
import { computePropertyScore } from "./propertyScore";
import {
  computeRevenueOpportunities,
  type RevenueOpportunity,
  type RevenueIntelligenceInput,
} from "./revenueIntelligence";
import type { ExpenseCategory } from "../types/database";

// ── fixtures ────────────────────────────────────────────────────────────────
const OCT: ReportMonth = { year: 2026, month0: 9 };
const TODAY = "2026-11-22";
const OCT_P = reportWindow(OCT).period;
const SEP_P = reportWindow(shiftMonth(OCT, -1)).period;

const room = (over: { is_active?: boolean; created_at?: string } = {}) => ({
  is_active: true,
  created_at: "2026-01-01",
  ...over,
});
const THREE_ROOMS = [room(), room(), room()];
const tenRooms = () => Array.from({ length: 10 }, () => room());

type Row = BookingLike & SourceFields & { guest_id?: string | null; property_id?: string | null };
type GRow = GroupLike & SourceFields & { guest_id?: string | null; property_id?: string | null };

let n = 0;
function stay(over: Partial<Row> = {}): Row {
  return {
    id: `b${++n}`,
    property_id: "P1",
    check_in: "2026-10-10",
    check_out: "2026-10-12", // 2 nights
    status: "confirmed",
    total_amount: 6000,
    discount_amount: 0,
    advance_amount: 0,
    booking_charges: [],
    source: "direct",
    booking_source_detail: null,
    guest_id: null,
    ...over,
  };
}
function grp(over: Partial<GRow> = {}): GRow {
  return {
    id: `g${++n}`,
    property_id: "P1",
    check_in: "2026-10-10",
    check_out: "2026-10-12",
    status: "confirmed",
    total_amount: 12000,
    discount_amount: 0,
    advance_amount: 0,
    booking_charges: [],
    source: "direct",
    booking_source_detail: null,
    guest_id: null,
    ...over,
  };
}
let en = 0;
function expense(
  expense_date: string,
  amount: number,
  category: ExpenseCategory = "staff",
): { id: string; expense_date: string; amount: number; category: ExpenseCategory } {
  return { id: `e${++en}`, expense_date, amount, category };
}

const rows = (r: Partial<MonthRows> = {}): MonthRows => ({
  bookings: [],
  groups: [],
  expenses: [],
  ...r,
});

function build(over: Partial<MonthlyReportInput> = {}): MonthlyReport {
  return buildMonthlyReport({
    month: OCT,
    today: TODAY,
    rooms: THREE_ROOMS,
    propertyId: "P1",
    current: rows(),
    previous: rows(),
    guestHistory: { bookings: [], groups: [] },
    ...over,
  });
}
const noNaN = (o: unknown) => assert.doesNotMatch(JSON.stringify(o), /NaN|Infinity|null%/);

// ── choosing the month ──────────────────────────────────────────────────────
test("default month: the last COMPLETED calendar month, never the current one", () => {
  assert.deepEqual(lastCompletedMonth(new Date(2026, 10, 22)), { year: 2026, month0: 9 }); // 22 Nov → Oct
  assert.deepEqual(lastCompletedMonth(new Date(2026, 10, 1, 0, 0, 0)), { year: 2026, month0: 9 }); // first minute of Nov
  assert.deepEqual(lastCompletedMonth(new Date(2026, 9, 31, 23, 59)), { year: 2026, month0: 8 }); // last minute of Oct → Sep
});

test("default month crosses the year boundary: any day of January shows December of the year before", () => {
  assert.deepEqual(lastCompletedMonth(new Date(2027, 0, 1)), { year: 2026, month0: 11 });
  assert.deepEqual(lastCompletedMonth(new Date(2027, 0, 31)), { year: 2026, month0: 11 });
  assert.deepEqual(lastCompletedMonth(new Date(2027, 1, 1)), { year: 2027, month0: 0 });
});

test("shiftMonth steps across year boundaries in both directions", () => {
  assert.deepEqual(shiftMonth({ year: 2027, month0: 0 }, -1), { year: 2026, month0: 11 });
  assert.deepEqual(shiftMonth({ year: 2026, month0: 11 }, 1), { year: 2027, month0: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, month0: 5 }, -18), { year: 2024, month0: 11 });
  assert.equal(compareMonths({ year: 2026, month0: 0 }, { year: 2025, month0: 11 }) > 0, true);
});

test("selectable months: completed only, and not older than the step-back limit", () => {
  const now = new Date(2026, 10, 22);
  assert.equal(isSelectableMonth({ year: 2026, month0: 10 }, now), false); // the current month
  assert.equal(isSelectableMonth({ year: 2026, month0: 11 }, now), false); // the future
  assert.equal(isSelectableMonth(lastCompletedMonth(now), now), true);
  const earliest = earliestReportMonth(now);
  assert.equal(isSelectableMonth(earliest, now), true);
  assert.equal(isSelectableMonth(shiftMonth(earliest, -1), now), false);
  assert.equal(compareMonths(lastCompletedMonth(now), earliest), REPORT_MONTHS_BACK - 1);
});

test("window: October 2026 and its previous month (September), local dates", () => {
  const w = reportWindow(OCT);
  assert.equal(w.label, "October 2026");
  assert.deepEqual(w.period, { start: "2026-10-01", endExclusive: "2026-11-01" });
  assert.equal(w.lastDay, "2026-10-31");
  assert.deepEqual(w.previous, { start: "2026-09-01", endExclusive: "2026-10-01" });
  assert.equal(w.previousLastDay, "2026-09-30");
  assert.equal(w.comparisonLabel, "September 2026");
});

test("window: January compares with the December of the YEAR BEFORE", () => {
  const w = reportWindow({ year: 2027, month0: 0 });
  assert.equal(w.label, "January 2027");
  assert.deepEqual(w.previous, { start: "2026-12-01", endExclusive: "2027-01-01" });
  assert.equal(w.previousLastDay, "2026-12-31");
  assert.equal(w.comparisonLabel, "December 2026");
  // December itself ends on the 1st of the next year (exclusive end), and leap February has 29 days.
  assert.equal(reportWindow({ year: 2026, month0: 11 }).period.endExclusive, "2027-01-01");
  assert.equal(reportWindow({ year: 2028, month0: 1 }).lastDay, "2028-02-29");
});

// ── revenue is Money Intelligence's revenue ─────────────────────────────────
test("report money is EXACTLY Money Intelligence's summary for the same rows", () => {
  const bookings = [
    stay({ total_amount: 6000 }),
    stay({
      check_in: "2026-10-30",
      check_out: "2026-11-02",
      total_amount: 9000,
      advance_amount: 3000,
    }),
    stay({ status: "completed", total_amount: 4000 }),
    stay({ status: "pending", total_amount: 99999 }),
    stay({ status: "cancelled", total_amount: 88888 }),
  ];
  const expenses = [expense("2026-10-05", 1500)];
  const r = build({ current: rows({ bookings, expenses }) });
  const money = computeMoneySummary({
    period: OCT_P,
    bookings,
    groups: [],
    expenses,
    today: TODAY,
  });
  assert.deepEqual(r.money, money);
  // 6000 + (2 of 3 nights of 9000 = 6000) + 4000: pending and cancelled never count.
  assert.equal(r.money.revenue, 16000);
  assert.equal(r.metrics.revenue, r.money.revenue); // business metrics and Money agree
  assert.equal(r.money.revenue, bookingRevenue(bookings, [], OCT_P));
  assert.equal(r.money.stayCount, 3);
  noNaN(r);
});

test("pending, cancelled, confirmed and completed: only the last two earn revenue or nights", () => {
  const count = (status: string) => build({ current: rows({ bookings: [stay({ status })] }) });
  assert.equal(count("confirmed").money.revenue, 6000);
  assert.equal(count("completed").money.revenue, 6000);
  for (const s of ["pending", "cancelled"]) {
    const r = count(s);
    assert.equal(r.money.revenue, 0);
    assert.equal(r.money.stayCount, 0);
    assert.equal(r.metrics.occupiedRoomNights, 0);
    assert.equal(r.hasStays, false);
  }
});

test("a stay crossing the month boundary is split by nights between the two months", () => {
  const crossing = stay({ check_in: "2026-10-30", check_out: "2026-11-02", total_amount: 9000 }); // 3 nights
  const oct = build({ current: rows({ bookings: [crossing] }) });
  const nov = build({ month: { year: 2026, month0: 10 }, current: rows({ bookings: [crossing] }) });
  assert.equal(oct.money.revenue, 6000); // 30 and 31 Oct
  assert.equal(nov.money.revenue, 3000); // 1 Nov
  assert.equal(oct.money.revenue + nov.money.revenue, 9000);
  assert.equal(oct.metrics.occupiedRoomNights, 2);
  assert.equal(nov.metrics.occupiedRoomNights, 1);
});

test("a booking spanning several months is shared across them and the shares add up to the whole", () => {
  const long = stay({ check_in: "2026-09-28", check_out: "2026-11-03", total_amount: 36000 }); // 36 nights
  const inMonth = (m: ReportMonth) => build({ month: m, current: rows({ bookings: [long] }) });
  const sep = inMonth({ year: 2026, month0: 8 });
  const oct = inMonth(OCT);
  const nov = inMonth({ year: 2026, month0: 10 });
  assert.equal(sep.money.revenue, 3000);
  assert.equal(oct.money.revenue, 31000);
  assert.equal(nov.money.revenue, 2000);
  assert.equal(sep.money.revenue + oct.money.revenue + nov.money.revenue, 36000);
  assert.equal(oct.money.stayCount, 1);
});

// ── multi-room bookings ─────────────────────────────────────────────────────
test("a multi-room booking is ONE stay, but every room-night is occupied", () => {
  const g = grp({ id: "G1", total_amount: 12000, guest_id: "gu1" });
  const roomsOfG = [1, 2, 3].map(() =>
    stay({ group_id: "G1", total_amount: 4000, guest_id: "gu1" }),
  );
  const r = build({ current: rows({ bookings: roomsOfG, groups: [g] }) });
  assert.equal(r.money.stayCount, 1); // booking count: once
  assert.equal(r.money.revenue, 12000); // billed once, from the group
  assert.equal(r.metrics.occupiedRoomNights, 6); // 3 rooms × 2 nights
  assert.equal(r.metrics.availableRoomNights, 93); // 3 rooms × 31 days
  assert.equal(r.metrics.occupancyPercent, Math.round((6 / 93) * 10000) / 100);
  assert.equal(r.guests?.stays, 1);
  assert.equal(r.guests?.uniqueGuests, 1);
});

test("rooms of a cancelled group are not occupied even if their own rows still say confirmed", () => {
  const g = grp({ id: "G2", status: "cancelled" });
  const roomsOfG = [1, 2].map(() => stay({ group_id: "G2", status: "confirmed" }));
  const r = build({ current: rows({ bookings: roomsOfG, groups: [g] }) });
  assert.equal(r.money.stayCount, 0);
  assert.equal(r.metrics.occupiedRoomNights, 0);
});

// ── occupancy / ADR / RevPAR ────────────────────────────────────────────────
test("available room nights = ACTIVE rooms × days in the month (inactive rooms are not on sale)", () => {
  const r = build({ rooms: [room(), room(), room(), room({ is_active: false })] });
  assert.equal(r.roomCount, 3);
  assert.equal(r.days, 31);
  assert.equal(r.metrics.availableRoomNights, 93);
  assert.equal(build({ month: { year: 2026, month0: 8 } }).metrics.availableRoomNights, 90); // September: 30 days
});

test("ADR and RevPAR are the canonical ones: room revenue only, extras left out", () => {
  const b = stay({ booking_charges: [{ qty: 1, unit_price: 600 }] }); // 6000 room + 600 extras
  const r = build({ current: rows({ bookings: [b] }) });
  assert.equal(r.money.revenue, 6600); // revenue includes extras
  assert.equal(r.metrics.adr, averageDailyRate(6000, 2));
  assert.equal(r.metrics.revPar, revPar(6000, 93));
  assert.equal(r.metrics.adr, 3000);
});

test("no rooms, no stays: every metric is 0, never NaN or Infinity", () => {
  const r = build({ rooms: [] });
  assert.equal(r.roomCount, 0);
  assert.equal(r.metrics.availableRoomNights, 0);
  assert.equal(r.metrics.occupancyPercent, 0);
  assert.equal(r.metrics.adr, 0);
  assert.equal(r.metrics.revPar, 0);
  noNaN(r);
});

// ── expenses ────────────────────────────────────────────────────────────────
test("expenses: the first and the last day of the month count; the day before and the day after do not", () => {
  const expenses = [
    expense("2026-09-30", 500, "supplies"),
    expense("2026-10-01", 1000, "electricity"),
    expense("2026-10-31", 2000, "staff"),
    expense("2026-11-01", 700, "food"),
  ];
  const r = build({ current: rows({ expenses }) });
  assert.equal(r.money.expenses, 3000);
  assert.equal(r.money.expenseCount, 2);
  assert.deepEqual(r.money.byCategory.map((c) => c.category).sort(), ["electricity", "staff"]);
});

test("expense categories reconcile exactly to the total", () => {
  const expenses = [
    expense("2026-10-02", 1234.56, "electricity"),
    expense("2026-10-03", 0.1, "staff"),
    expense("2026-10-04", 0.2, "staff"),
    expense("2026-10-05", 999.99, "cleaning"),
    expense("2026-10-06", 10, "other"),
  ];
  const r = build({ current: rows({ expenses }) });
  const cents = r.money.byCategory.reduce((s, c) => s + Math.round(c.total * 100), 0);
  assert.equal(cents, Math.round(r.money.expenses * 100));
  assert.equal(r.money.expenses, 2244.85);
});

test("no expenses: stated as 'not recorded', the profit estimate is flagged incomplete, and a sentence says so", () => {
  const r = build({ current: rows({ bookings: [stay()] }) });
  assert.equal(r.money.expenseCount, 0);
  assert.equal(r.profitNote.complete, false);
  assert.match(r.profitNote.text, /No expenses recorded/);
  assert.match(r.profitNote.text, /incomplete/);
  assert.ok(buildTakeaway(r, []).whatChanged.includes("No expenses were recorded in October."));
});

// ── estimated operating profit ──────────────────────────────────────────────
test("estimated operating profit = revenue − recorded expenses", () => {
  const r = build({
    current: rows({
      bookings: [stay({ total_amount: 10000 })],
      expenses: [expense("2026-10-05", 2500)],
    }),
  });
  assert.equal(r.money.profit, 7500);
  assert.equal(r.profitNote.complete, true);
});

test("a negative operating result is kept negative, not clamped", () => {
  const r = build({ current: rows({ expenses: [expense("2026-10-05", 4000)] }) });
  assert.equal(r.money.revenue, 0);
  assert.equal(r.money.profit, -4000);
});

// ── previous-month comparison ───────────────────────────────────────────────
const SEP_STAY = { check_in: "2026-09-10", check_out: "2026-09-12" };

test("comparison: an increase is shown with a word, an arrow and the month it is against", () => {
  const r = build({
    current: rows({ bookings: [stay({ total_amount: 12000 })] }),
    previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 10000 })] }),
  });
  const c = r.comparison!.revenue;
  assert.equal(c.kind, "percent");
  assert.equal(c.direction, "up");
  assert.equal(c.value, 20);
  assert.equal(c.text, "↑ Up 20% vs September 2026"); // not colour alone
  assert.equal(r.comparison!.previousLabel, "September 2026");
});

test("comparison: a decrease is shown clearly", () => {
  const r = build({
    current: rows({ bookings: [stay({ total_amount: 8000 })] }),
    previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 10000 })] }),
  });
  assert.equal(r.comparison!.revenue.direction, "down");
  assert.equal(r.comparison!.revenue.text, "↓ Down 20% vs September 2026");
});

test("comparison: previous = 0 and current > 0 is a neutral phrase, never ∞%", () => {
  const r = build({ current: rows({ bookings: [stay()] }), previous: rows() });
  const c = r.comparison!;
  for (const key of ["revenue", "stays", "revPar"] as const) {
    assert.equal(c[key].kind, "no_baseline", key);
    assert.equal(c[key].text, NO_BASELINE_TEXT);
    assert.equal(c[key].direction, null);
  }
  assert.doesNotMatch(JSON.stringify(c), /∞|Infinity|NaN/);
});

test("comparison: zero in BOTH months shows no percentage", () => {
  const c = build().comparison!;
  assert.equal(c.revenue.kind, "none");
  assert.equal(c.stays.kind, "none");
  assert.doesNotMatch(c.revenue.text, /%/);
  assert.doesNotMatch(c.stays.text, /%/);
});

test("comparison: current = 0 against a real previous month IS a 100% decrease (that is true)", () => {
  const r = build({
    current: rows(),
    previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 10000 })] }),
  });
  assert.equal(r.comparison!.revenue.text, "↓ Down 100% vs September 2026");
  assert.equal(r.comparison!.stays.value, 100);
});

test("comparison: identical figures read 'No change', a sub-1% move reads 'About the same'", () => {
  const same = build({
    current: rows({ bookings: [stay({ total_amount: 10000 })] }),
    previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 10000 })] }),
  });
  assert.equal(same.comparison!.revenue.text, "No change vs September 2026");
  const close = build({
    current: rows({ bookings: [stay({ total_amount: 10020 })] }),
    previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 10000 })] }),
  });
  assert.equal(close.comparison!.revenue.kind, "flat");
  assert.equal(close.comparison!.revenue.text, "About the same as September 2026");
});

test("comparison: a January report is compared with December of the year before", () => {
  const dec = stay({ check_in: "2026-12-10", check_out: "2026-12-12", total_amount: 5000 });
  const jan = stay({ check_in: "2027-01-10", check_out: "2027-01-12", total_amount: 10000 });
  const r = build({
    month: { year: 2027, month0: 0 },
    current: rows({ bookings: [jan] }),
    previous: rows({ bookings: [dec] }),
  });
  assert.equal(r.label, "January 2027");
  assert.equal(r.previousLabel, "December 2026");
  assert.equal(r.comparison!.revenue.text, "↑ Up 100% vs December 2026");
});

test("comparison: previous month could not be loaded → no comparison at all, not a fake one", () => {
  assert.equal(build({ current: rows({ bookings: [stay()] }), previous: null }).comparison, null);
});

test("comparison: a month the property was not yet set up for is never a baseline", () => {
  // Rooms were created on 15 Sep: September is a partial month, so nothing is compared with it.
  const r = build({
    rooms: [room({ created_at: "2026-09-15" })],
    current: rows({ bookings: [stay({ total_amount: 30000 })] }),
    previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 1000 })] }),
  });
  for (const k of ["revenue", "occupancy", "adr", "revPar", "expenses", "profit", "stays"] as const)
    assert.equal(r.comparison![k].kind, "no_baseline", k);
  assert.match(r.setupNote ?? "", /15 Sep 2026/);
});

test("comparison: occupancy is in percentage POINTS between the displayed figures; the sentence matches", () => {
  const sep = Array.from({ length: 6 }, () =>
    stay({ check_in: "2026-09-01", check_out: "2026-10-01", total_amount: 60000 }),
  ); // 180 room-nights of 300 = 60%
  const oct = Array.from({ length: 5 }, () =>
    stay({ check_in: "2026-10-01", check_out: "2026-10-31", total_amount: 90000 }),
  ); // 150 room-nights of 310 = 48.39% → 48%
  const r = build({
    rooms: tenRooms(),
    current: rows({ bookings: oct }),
    previous: rows({ bookings: sep }),
  });
  assert.equal(r.metrics.occupancyPercent, 48.39);
  assert.equal(r.comparison!.occupancy.text, "↓ Down 12 pts vs September 2026");
  assert.ok(buildTakeaway(r, []).whatChanged.includes("Occupancy fell from 60% to 48%."));
  // ADR 3,000 vs 2,000 and revenue 450,000 vs 360,000
  assert.equal(r.comparison!.adr.text, "↑ Up 50% vs September 2026");
  assert.equal(r.comparison!.revenue.value, 25);
});

test("comparison: occupancy and ADR are not compared when the previous month sold no nights", () => {
  const r = build({ current: rows({ bookings: [stay()] }), previous: rows() });
  assert.equal(r.comparison!.occupancy.kind, "no_baseline");
  assert.equal(r.comparison!.adr.kind, "no_baseline");
});

test("comparison: expenses are compared only when both months recorded some (no records ≠ 100% cost cut)", () => {
  const both = build({
    current: rows({ expenses: [expense("2026-10-02", 3000)] }),
    previous: rows({ expenses: [expense("2026-09-02", 2000)] }),
  });
  assert.equal(both.comparison!.expenses.text, "↑ Up 50% vs September 2026");

  const noneNow = build({
    current: rows(),
    previous: rows({ expenses: [expense("2026-09-02", 2000)] }),
  });
  assert.equal(noneNow.comparison!.expenses.kind, "none");
  assert.equal(noneNow.comparison!.expenses.text, "No expenses recorded this month");
  assert.doesNotMatch(noneNow.comparison!.expenses.text, /100|%/);

  const nonePrev = build({
    current: rows({ expenses: [expense("2026-10-02", 3000)] }),
    previous: rows(),
  });
  assert.equal(nonePrev.comparison!.expenses.kind, "no_baseline");

  assert.equal(build().comparison!.expenses.kind, "none"); // neither month recorded any
});

test("comparison: profit needs expenses in BOTH months; a loss is compared in rupees, not as a percentage", () => {
  const ok = build({
    current: rows({
      bookings: [stay({ total_amount: 12000 })],
      expenses: [expense("2026-10-05", 2000)],
    }),
    previous: rows({
      bookings: [stay({ ...SEP_STAY, total_amount: 10000 })],
      expenses: [expense("2026-09-05", 2000)],
    }),
  });
  assert.equal(ok.money.profit, 10000);
  assert.equal(ok.comparison!.profit.text, "↑ Up 25% vs September 2026"); // 10,000 vs 8,000

  const loss = build({
    current: rows({ expenses: [expense("2026-10-05", 1000)] }),
    previous: rows({
      bookings: [stay({ ...SEP_STAY, total_amount: 10000 })],
      expenses: [expense("2026-09-05", 2000)],
    }),
  });
  assert.equal(loss.money.profit, -1000);
  assert.equal(loss.comparison!.profit.kind, "amount");
  assert.equal(loss.comparison!.profit.text, "↓ Down ₹9,000 vs September 2026");

  const incomplete = build({
    current: rows({ bookings: [stay()] }),
    previous: rows({ bookings: [stay({ ...SEP_STAY })], expenses: [expense("2026-09-05", 500)] }),
  });
  assert.equal(incomplete.comparison!.profit.kind, "none");
  assert.match(incomplete.comparison!.profit.text, /expenses weren't recorded in both months/);
});

test("percentChangeOf: the guard rails on their own", () => {
  assert.equal(percentChangeOf(5, 0, "X", "none").kind, "no_baseline");
  assert.equal(percentChangeOf(0, 0, "X", "none text").text, "none text");
  assert.equal(percentChangeOf(5, -3, "X", "n").kind, "no_baseline"); // a loss is not a baseline
  assert.equal(percentChangeOf(Number.NaN, 5, "X", "n").kind, "no_baseline");
  assert.equal(percentChangeOf(150, 100, "X", "n").text, "↑ Up 50% vs X");
});

// ── set-up note ─────────────────────────────────────────────────────────────
test("setup note: said when the property joined part-way through the month or the month before", () => {
  const win = reportWindow(OCT);
  assert.match(
    setupNoteFor([{ created_at: "2026-10-20" }], win) ?? "",
    /20 Oct 2026.*may be missing/,
  );
  assert.match(
    setupNoteFor([{ created_at: "2026-09-15" }], win) ?? "",
    /15 Sep 2026.*isn't compared/,
  );
  assert.equal(setupNoteFor([{ created_at: "2026-01-01" }], win), null);
  assert.equal(setupNoteFor([], win), null);
  // The EARLIEST room decides, not the latest.
  assert.equal(
    setupNoteFor([{ created_at: "2026-10-25" }, { created_at: "2026-02-01" }], win),
    null,
  );
});

// ── revenue by source ───────────────────────────────────────────────────────
test("source revenue reconciles EXACTLY to the report revenue, even with fractional boundary shares", () => {
  const bookings = [
    stay({
      booking_source_detail: "whatsapp",
      check_in: "2026-10-30",
      check_out: "2026-11-02",
      total_amount: 10000,
    }),
    stay({
      booking_source_detail: "instagram",
      check_in: "2026-09-29",
      check_out: "2026-10-02",
      total_amount: 7777,
    }),
    stay({ source: "walk_in", total_amount: 3333 }),
    stay({ source: "agent", total_amount: 4444.44 }),
    stay({ total_amount: 1111.11 }), // unknown
  ];
  const r = build({ current: rows({ bookings }) });
  const cents = r.bySource.reduce((s, x) => s + Math.round(x.revenue * 100), 0);
  assert.equal(cents, Math.round(r.money.revenue * 100));
  assert.equal(
    r.bySource.reduce((s, x) => s + (x.percent ?? 0), 0),
    100,
  );
  assert.deepEqual(r.bySource.map((x) => x.group).sort(), [
    "agent",
    "instagram",
    "unknown",
    "walk_in",
    "whatsapp",
  ]);
});

test("unknown source stays its own row and is never folded into Website or Other", () => {
  const r = build({
    current: rows({
      bookings: [
        stay({ total_amount: 1000 }),
        stay({ booking_source_detail: "website", total_amount: 3000 }),
      ],
    }),
  });
  const unknown = r.bySource.find((x) => x.group === "unknown");
  assert.equal(unknown?.revenue, 1000);
  assert.equal(unknown?.label, "Unknown");
  assert.equal(r.bySource.find((x) => x.group === "website")?.revenue, 3000);
  assert.equal(
    r.bySource.find((x) => x.group === "other"),
    undefined,
  );
});

test("an edited source is what the report uses; revenue is unchanged by the edit", () => {
  const before = stay({ total_amount: 6000 }); // a plain direct booking: Unknown
  const r1 = build({ current: rows({ bookings: [before] }) });
  assert.deepEqual(
    r1.bySource.map((x) => x.group),
    ["unknown"],
  );

  const patch = buildSourcePatch(before, { detail: "whatsapp" })!;
  const after = { ...before, ...patch }; // what the database holds once the owner saves the edit
  const r2 = build({ current: rows({ bookings: [after] }) });
  assert.deepEqual(
    r2.bySource.map((x) => x.group),
    ["whatsapp"],
  );
  assert.equal(r2.bySource[0].revenue, 6000);
  assert.equal(r2.bySource[0].percent, 100);
  assert.equal(r2.money.revenue, r1.money.revenue);
  assert.deepEqual(r2.money.stayCount, r1.money.stayCount);
});

test("source percentages: whole numbers that add up to exactly 100 (largest remainder)", () => {
  const row = (label: string, revenue: number) => ({
    group: "other" as const,
    label,
    revenue,
    bookings: 1,
  });
  assert.deepEqual(
    sourceShares([row("a", 100), row("b", 100), row("c", 100)]).map((x) => x.percent),
    [34, 33, 33],
  );
  assert.deepEqual(
    sourceShares([row("a", 1)]).map((x) => x.percent),
    [100],
  );
  assert.deepEqual(
    sourceShares([row("a", 2), row("b", 1), row("c", 1)]).map((x) => x.percent),
    [50, 25, 25],
  );
  for (const rev of [
    [7, 11, 13, 17],
    [1, 1, 1, 1, 1, 1, 1],
    [999, 1],
  ]) {
    const sum = sourceShares(rev.map((x, i) => row(String(i), x))).reduce(
      (s, x) => s + (x.percent ?? 0),
      0,
    );
    assert.equal(sum, 100, JSON.stringify(rev));
  }
});

test("source percentages: a month with no revenue has no percentages (not 0/0)", () => {
  assert.deepEqual(sourceShares([]), []);
  assert.equal(
    sourceShares([{ group: "unknown", label: "Unknown", revenue: 0, bookings: 1 }])[0].percent,
    null,
  );
});

// ── guest insights ──────────────────────────────────────────────────────────
function insights(
  bookings: Row[],
  history: Row[] = [],
  opts: {
    groups?: GRow[];
    historyGroups?: GRow[];
    period?: typeof OCT_P;
    propertyId?: string;
  } = {},
) {
  return computeGuestInsights({
    period: opts.period ?? OCT_P,
    bookings,
    groups: opts.groups ?? [],
    history: { bookings: history, groups: opts.historyGroups ?? [] },
    propertyId: opts.propertyId ?? "P1",
  });
}

test("guests: identified guests are counted by guest id; stays without one are 'not identified', not new guests", () => {
  const g = insights([
    stay({ guest_id: "g1" }),
    stay({ guest_id: "g2" }),
    stay({ guest_id: null }),
  ]);
  assert.equal(g.stays, 3);
  assert.equal(g.identifiedStays, 2);
  assert.equal(g.unidentifiedStays, 1);
  assert.equal(g.uniqueGuests, 2);
  assert.equal(g.repeatGuests, 0);
});

test("guests: the same guest on two stays in the same month is one guest and a repeat guest", () => {
  const g = insights([
    stay({ guest_id: "g1" }),
    stay({ guest_id: "g1", check_in: "2026-10-20", check_out: "2026-10-22" }),
  ]);
  assert.equal(g.uniqueGuests, 1);
  assert.equal(g.repeatGuests, 1);
  assert.equal(g.repeatGuestStays, 2);
});

test("guests: a guest who stayed in an EARLIER month is a repeat guest this month (same property)", () => {
  const sepStay = stay({ guest_id: "g1", check_in: "2026-09-05", check_out: "2026-09-07" });
  const g = insights([stay({ guest_id: "g1" }), stay({ guest_id: "g2" })], [sepStay]);
  assert.equal(g.uniqueGuests, 2);
  assert.equal(g.repeatGuests, 1);
  assert.equal(g.repeatGuestStays, 1);
});

test("guests: repeat status is as of the END of the month; a LATER stay does not rewrite a past month", () => {
  const octStay = stay({ guest_id: "g1" });
  const novStay = stay({ guest_id: "g1", check_in: "2026-11-10", check_out: "2026-11-12" });
  const sepStay = stay({ guest_id: "g1", check_in: "2026-09-05", check_out: "2026-09-07" });
  // October's report, with a November stay already on the books: still not a repeat in October.
  assert.equal(insights([octStay], [octStay, novStay]).repeatGuests, 0);
  // September's report with October and November stays on the books: also not a repeat.
  assert.equal(insights([sepStay], [sepStay, octStay, novStay], { period: SEP_P }).repeatGuests, 0);
  // November's report: now it is.
  const novPeriod = reportWindow({ year: 2026, month0: 10 }).period;
  assert.equal(insights([novStay], [octStay, novStay], { period: novPeriod }).repeatGuests, 1);
});

test("guests: cancelled and pending stays never make a guest a repeat guest", () => {
  const history = [
    stay({ guest_id: "g1", status: "cancelled", check_in: "2026-09-05", check_out: "2026-09-07" }),
    stay({ guest_id: "g1", status: "pending", check_in: "2026-08-05", check_out: "2026-08-07" }),
  ];
  assert.equal(insights([stay({ guest_id: "g1" })], history).repeatGuests, 0);
  // …and a cancelled booking in the month is not a stay at all.
  assert.equal(insights([stay({ guest_id: "g1", status: "cancelled" })]).stays, 0);
});

test("guests: a different property's stays never count (a guest record belongs to ONE property)", () => {
  const otherProperty = stay({
    guest_id: "g1",
    property_id: "P2",
    check_in: "2026-09-05",
    check_out: "2026-09-07",
  });
  assert.equal(insights([stay({ guest_id: "g1" })], [otherProperty]).repeatGuests, 0);
  // The same person at two properties is two guest records (ids), each with one stay.
  const atP2 = stay({
    guest_id: "g1-at-P2",
    property_id: "P2",
    check_in: "2026-09-05",
    check_out: "2026-09-07",
  });
  assert.equal(insights([stay({ guest_id: "g1" })], [atP2]).repeatGuests, 0);
});

test("guests: one multi-room booking is one stay, so it never makes a repeat guest", () => {
  const g = grp({ id: "GR1", guest_id: "g1" });
  const roomsOfG = [1, 2, 3].map(() => stay({ group_id: "GR1", guest_id: "g1" }));
  const out = insights(roomsOfG, roomsOfG, { groups: [g], historyGroups: [g] });
  assert.equal(out.stays, 1);
  assert.equal(out.uniqueGuests, 1);
  assert.equal(out.repeatGuests, 0);
});

test("guests: the month's own stays count even if the loaded history is empty or incomplete", () => {
  const out = insights(
    [
      stay({ guest_id: "g1" }),
      stay({ guest_id: "g1", check_in: "2026-10-20", check_out: "2026-10-22" }),
    ],
    [],
  );
  assert.equal(out.repeatGuests, 1);
});

test("guests: periodGuestIds lists exactly the month's identified guests, once each, sorted", () => {
  const ids = periodGuestIds(
    [
      stay({ guest_id: "g2" }),
      stay({ guest_id: "g1" }),
      stay({ guest_id: "g1", check_in: "2026-10-20", check_out: "2026-10-22" }),
      stay({ guest_id: "g3", status: "cancelled" }),
      stay({ guest_id: "g4", check_in: "2026-11-10", check_out: "2026-11-12" }), // another month
      stay({ guest_id: null }),
    ],
    [],
    OCT_P,
  );
  assert.deepEqual(ids, ["g1", "g2"]);
});

test("guests: section wording state: no stays, none identified, measured", () => {
  assert.equal(guestSectionState(insights([])), "no_stays");
  assert.equal(guestSectionState(insights([stay({ guest_id: null })])), "none_identified");
  assert.equal(guestSectionState(insights([stay({ guest_id: "g1" })])), "measured");
});

test("guests: a brand-new property is not penalised: zero repeat guests is just the measured number", () => {
  const r = build({ current: rows({ bookings: [stay({ guest_id: "g1" })] }) });
  assert.equal(r.guests?.repeatGuests, 0);
  assert.equal(r.guests?.uniqueGuests, 1);
  assert.equal(r.comparison?.stays.kind, "no_baseline"); // no guest comparison exists to be misleading
});

test("guests: left out (null) while the history has not loaded, never shown as zero", () => {
  assert.equal(
    build({ current: rows({ bookings: [stay({ guest_id: "g1" })] }), guestHistory: null }).guests,
    null,
  );
});

// ── Property Score ──────────────────────────────────────────────────────────
test("property score: the section shows the engine's CURRENT score and never a made-up earlier one", () => {
  const result = computePropertyScore(
    { name: "Hill View", rooms: [{ is_active: true, base_price: 2500 }] },
    {
      today: TODAY,
      seasonRates: [],
      activity: {
        countedStays: 0,
        startedStays: 0,
        startedWithPayment: 0,
        withPhone: 0,
        withSourceDetail: 0,
      },
      bookingTotal: 0,
      expenseCount: 0,
    },
  );
  const s = scoreSection(result)!;
  assert.equal(s.current, result.score);
  assert.equal(s.message, result.message);
  assert.deepEqual(s.topActions, result.topActions.slice(0, 3));
  assert.equal(s.previous, null);
  assert.equal(s.note, SCORE_HISTORY_NOTE);
  assert.match(s.note, /Past scores aren't saved/);
  assert.equal(scoreSection(null), null);
});

test("property score: the same score is shown whichever month is selected (it is not the month's score)", () => {
  // scoreSection has no month input at all, so it cannot attribute a score to one.
  assert.equal(scoreSection.length, 1);
  assert.equal(build().month.month0, 9);
  assert.equal((build() as unknown as Record<string, unknown>).propertyScore, undefined);
});

// ── opportunities ───────────────────────────────────────────────────────────
const opp = (
  id: string,
  type: RevenueOpportunity["type"] = "outstanding_payment",
): RevenueOpportunity => ({
  id,
  type,
  severity: "info",
  title: `Title ${id}`,
  description: "d",
  actionLabel: `Do ${id}`,
});

test("opportunities: at most three, in the engine's own order, nothing re-ranked", () => {
  const all = ["a", "b", "c", "d", "e"].map((id) => opp(id));
  assert.equal(REPORT_MAX_OPPORTUNITIES, 3);
  assert.deepEqual(
    reportOpportunities(all).map((o) => o.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    reportOpportunities(all.slice(0, 2)).map((o) => o.id),
    ["a", "b"],
  );
  assert.deepEqual(reportOpportunities([]), []);
});

test("opportunities: reuses the real Revenue Intelligence engine (rule order: payments → pricing → dates → expenses → sources)", () => {
  const input: RevenueIntelligenceInput = {
    today: TODAY,
    currentMonth: { start: "2026-11-01", endExclusive: "2026-12-01" },
    rooms: [
      {
        id: "r1",
        name: "Garden",
        base_price: 2500,
        weekend_multiplier: 1,
        extra_guest_price: 0,
        max_guests: 2,
      },
    ],
    bookings: [
      stay({
        check_in: "2026-11-10",
        check_out: "2026-11-12",
        total_amount: 5000,
        advance_amount: 1000,
        room_id: "r1",
      } as Partial<Row>),
    ],
    groups: [],
    bookingTotal: 1,
    rates: [],
    blockedNights: [],
    expenses: [],
  };
  const all = computeRevenueOpportunities(input);
  assert.ok(all.length >= 2);
  const shown = reportOpportunities(all);
  assert.deepEqual(shown, all.slice(0, 3)); // exactly the engine's list, first three
  assert.equal(shown[0].type, "outstanding_payment"); // payments first
});

test("opportunities: labelled CURRENT, never attributed to the selected month", () => {
  assert.equal(OPPORTUNITIES_HEADING, "Current opportunities");
  const note = opportunitiesNote({ monthName: "October" });
  assert.equal(note, "Based on your property today, not on October.");
  assert.doesNotMatch(OPPORTUNITIES_HEADING, /October|month/i);
});

// ── owner takeaway ──────────────────────────────────────────────────────────
test("takeaway: revenue change, outstanding, no expenses, largest source and repeat guests, as measured facts", () => {
  const r = build({
    current: rows({
      bookings: [
        stay({
          total_amount: 12000,
          advance_amount: 0,
          booking_source_detail: "whatsapp",
          guest_id: "g1",
        }),
        stay({
          total_amount: 2000,
          advance_amount: 2000,
          booking_source_detail: "instagram",
          guest_id: "g1",
          check_in: "2026-10-20",
          check_out: "2026-10-22",
        }),
      ],
    }),
    previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 11864 })] }),
  });
  const t = buildTakeaway(r, [opp("a")]);
  // 14,000 vs 11,864 = +18%
  assert.ok(t.whatChanged.includes("Revenue increased 18% from September."));
  assert.ok(t.whatChanged.includes("₹12,000 remains outstanding on qualifying stays."));
  assert.ok(t.whatChanged.includes("No expenses were recorded in October."));
  assert.ok(t.whatChanged.includes("WhatsApp generated the largest share of recorded revenue."));
  assert.ok(t.whatChanged.includes("1 repeat guest stayed in October."));
});

test("takeaway: a fall is worded as a fall; no previous month falls back to the month's own figure", () => {
  const fell = buildTakeaway(
    build({
      current: rows({ bookings: [stay({ total_amount: 8000 })] }),
      previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 10000 })] }),
    }),
    [],
  );
  assert.ok(fell.whatChanged.includes("Revenue fell 20% from September."));

  const first = buildTakeaway(
    build({ current: rows({ bookings: [stay()] }), previous: rows() }),
    [],
  );
  assert.ok(first.whatChanged.includes("Revenue was ₹6,000 in October."));
  // No sentence compares with September when September gave no baseline.
  assert.deepEqual(
    first.whatChanged.filter((x) => /September/.test(x)),
    [],
  );
});

test("takeaway: states facts only, never a cause", () => {
  const r = build({
    current: rows({ bookings: [stay({ total_amount: 5000 })] }),
    previous: rows({ bookings: [stay({ ...SEP_STAY, total_amount: 10000 })] }),
  });
  const text = buildTakeaway(r, [opp("a")]).whatChanged.join(" ");
  assert.doesNotMatch(text, /because|due to|caused|too high|too low|pricing|should|reason/i);
});

test("takeaway: a month with no stays says so plainly and does not invent trends", () => {
  const r = build({ current: rows(), previous: rows({ bookings: [stay({ ...SEP_STAY })] }) });
  const t = buildTakeaway(r, []);
  assert.deepEqual(t.whatChanged, [
    "No confirmed or completed stays were recorded for October.",
    "No expenses were recorded in October.",
  ]);
  assert.equal(r.hasStays, false);
});

test("takeaway: 'what to do next' is the engine's opportunities, and is left out when they could not load", () => {
  const r = build({ current: rows({ bookings: [stay()] }) });
  assert.deepEqual(buildTakeaway(r, [opp("a"), opp("b")]).whatToDoNext, [
    "Do a: Title a",
    "Do b: Title b",
  ]);
  assert.deepEqual(buildTakeaway(r, []).whatToDoNext, ["No current opportunities found."]);
  assert.deepEqual(buildTakeaway(r, null).whatToDoNext, []); // failed to load ≠ "nothing to do"
  assert.equal(
    buildTakeaway(
      r,
      ["a", "b", "c", "d", "e"].map((x) => opp(x)),
    ).whatToDoNext.length,
    3,
  );
});

test("takeaway: an unknown-source majority is reported as a data gap, and a tie claims no 'largest'", () => {
  const unk = buildTakeaway(
    build({
      current: rows({
        bookings: [
          stay({ total_amount: 9000 }),
          stay({ booking_source_detail: "google", total_amount: 1000 }),
        ],
      }),
    }),
    [],
  );
  assert.ok(
    unk.whatChanged.includes("The largest share of revenue has no booking source recorded."),
  );
  const tie = buildTakeaway(
    build({
      current: rows({
        bookings: [
          stay({ total_amount: 5000, booking_source_detail: "google" }),
          stay({ total_amount: 5000, booking_source_detail: "website" }),
        ],
      }),
    }),
    [],
  );
  assert.ok(tie.whatChanged.every((s) => !/largest share/.test(s)));
});

test("takeaway is deterministic: the same report always gives the same words", () => {
  const make = () =>
    buildTakeaway(
      build({
        current: rows({
          bookings: [stay({ guest_id: "g1" })],
          expenses: [expense("2026-10-02", 100)],
        }),
        previous: rows({ bookings: [stay({ ...SEP_STAY })] }),
      }),
      [opp("a")],
    );
  assert.deepEqual(make(), make());
});

// ── empty and low-data states ───────────────────────────────────────────────
test("no bookings: nothing breaks, the report says there is no data, and set-up metrics still show", () => {
  const r = build();
  assert.equal(r.hasStays, false);
  assert.equal(r.money.revenue, 0);
  assert.equal(r.money.stayCount, 0);
  assert.equal(r.metrics.availableRoomNights, 93); // still known: the property has rooms
  assert.equal(r.metrics.occupancyPercent, 0);
  assert.equal(r.guests?.stays, 0);
  assert.equal(guestSectionState(r.guests!), "no_stays");
  assert.deepEqual(r.bySource, []);
  noNaN(r);
});

test("a brand-new property (rooms set up last week, nothing booked) gets neutral comparisons and a clear note", () => {
  const r = build({
    rooms: [room({ created_at: "2026-10-25" })],
    current: rows(),
    previous: rows(),
  });
  assert.ok(r.setupNote);
  assert.equal(r.comparison!.revenue.kind, "no_baseline");
  noNaN(r);
});
