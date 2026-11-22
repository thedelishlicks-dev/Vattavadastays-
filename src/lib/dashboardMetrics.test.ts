/**
 * Unit tests for businessMetrics.ts.
 *
 *   npx tsx --test src/lib/businessMetrics.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accommodationRevenue,
  availableRoomNights,
  averageDailyRate,
  bookingCashCollected,
  bookingRevenue,
  computeBusinessMetrics,
  dedupeStays,
  estimatedOperatingProfit,
  nightsInPeriod,
  occupancyPercent,
  occupiedRoomNights,
  openBalances,
  outstandingBalances,
  outstandingAmount,
  periodDays,
  periodShare,
  refundDueAmount,
  revPar,
  totalExpenses,
  type BookingLike,
  type GroupLike,
  type Period,
} from "./businessMetrics";
import { computeBalance, chargesSum } from "./balance";

const NOV: Period = { start: "2026-11-01", endExclusive: "2026-12-01" }; // 30 days

let n = 0;
function booking(over: Partial<BookingLike> = {}): BookingLike {
  return {
    id: `b${++n}`,
    check_in: "2026-11-10",
    check_out: "2026-11-12", // 2 nights
    status: "confirmed",
    total_amount: 6000,
    discount_amount: 0,
    advance_amount: 0,
    booking_charges: [],
    ...over,
  };
}

// ── normal booking ──────────────────────────────────────────────────────────
test("normal confirmed booking: revenue, nights, occupancy, ADR, RevPAR", () => {
  const m = computeBusinessMetrics({ period: NOV, bookings: [booking()], roomCount: 5 });
  assert.equal(m.revenue, 6000);
  assert.equal(m.occupiedRoomNights, 2);
  assert.equal(m.availableRoomNights, 150); // 5 rooms × 30 days
  assert.equal(m.occupancyPercent, 1.33);
  assert.equal(m.adr, 3000);
  assert.equal(m.revPar, 40);
});

test("completed stays count like confirmed ones", () => {
  assert.equal(bookingRevenue([booking({ status: "completed" })], [], NOV), 6000);
});

// ── discount and charges: same definition as balance.ts ─────────────────────
test("discounted booking: revenue is net of the discount", () => {
  assert.equal(bookingRevenue([booking({ discount_amount: 500 })], [], NOV), 5500);
});

test("booking with extra charges: charges are added", () => {
  const b = booking({
    booking_charges: [
      { qty: 2, unit_price: 250 },
      { qty: 1, unit_price: 100 },
    ],
  });
  assert.equal(bookingRevenue([b], [], NOV), 6600);
});

test("revenue equals computeBalance().netTotal for the same booking (one definition of a total)", () => {
  const b = booking({ discount_amount: 700, booking_charges: [{ qty: 3, unit_price: 400 }] });
  const expected = computeBalance({
    roomTotal: 6000,
    chargesTotal: chargesSum(b.booking_charges),
    discount: 700,
  }).netTotal;
  assert.equal(bookingRevenue([b], [], NOV), expected);
});

test("discount larger than the bill never makes revenue negative", () => {
  assert.equal(bookingRevenue([booking({ discount_amount: 99999 })], [], NOV), 0);
});

test("money stored as numeric strings is read correctly", () => {
  const b = booking({
    total_amount: "6000.00",
    discount_amount: "500.00",
    advance_amount: "1000.00",
  });
  assert.equal(bookingRevenue([b], [], NOV), 5500);
  assert.equal(bookingCashCollected([b], [], NOV), 1000);
});

// ── cancelled and pending ───────────────────────────────────────────────────
test("cancelled booking adds no revenue, cash, outstanding or occupancy", () => {
  const b = booking({ status: "cancelled", advance_amount: 2000 });
  const m = computeBusinessMetrics({ period: NOV, bookings: [b], roomCount: 5 });
  assert.equal(m.revenue, 0);
  assert.equal(m.cashCollected, 0);
  assert.equal(m.outstanding, 0);
  assert.equal(m.occupiedRoomNights, 0);
  assert.equal(m.occupancyPercent, 0);
});

test("pending booking adds no revenue or occupancy", () => {
  const m = computeBusinessMetrics({
    period: NOV,
    bookings: [booking({ status: "pending" })],
    roomCount: 5,
  });
  assert.equal(m.revenue, 0);
  assert.equal(m.occupiedRoomNights, 0);
  assert.equal(m.outstanding, 0);
});

test("unknown or missing status is not counted", () => {
  assert.equal(
    bookingRevenue([booking({ status: null }), booking({ status: undefined })], [], NOV),
    0,
  );
});

// ── group / multi-room ──────────────────────────────────────────────────────
function group(over: Partial<GroupLike> = {}): { group: GroupLike; rooms: BookingLike[] } {
  const g: GroupLike = {
    id: `g${++n}`,
    check_in: "2026-11-10",
    check_out: "2026-11-12",
    status: "confirmed",
    total_amount: 10000, // two rooms × 2 nights = 5000 + 5000
    discount_amount: 1000,
    advance_amount: 0,
    booking_charges: [{ qty: 1, unit_price: 500 }],
    ...over,
  };
  const rooms = [1, 2].map(() =>
    booking({
      group_id: g.id,
      check_in: g.check_in,
      check_out: g.check_out,
      status: g.status,
      total_amount: 5000,
      discount_amount: 0,
    }),
  );
  return { group: g, rooms };
}

test("multi-room booking is billed once from the group, never per room", () => {
  const { group: g, rooms } = group();
  const m = computeBusinessMetrics({ period: NOV, bookings: rooms, groups: [g], roomCount: 5 });
  assert.equal(m.revenue, 9500); // 10000 + 500 extras − 1000 discount
  assert.equal(m.occupiedRoomNights, 4); // 2 rooms × 2 nights
  // ADR uses accommodation revenue: 10000 room total − 1000 discount, extras left out
  assert.equal(m.accommodationRevenue, 9000);
  assert.equal(m.adr, 2250);
});

test("a cancelled group takes its rooms with it, even if a room row still says confirmed", () => {
  const { group: g, rooms } = group({ status: "cancelled" });
  rooms.forEach((r) => (r.status = "confirmed"));
  const m = computeBusinessMetrics({ period: NOV, bookings: rooms, groups: [g], roomCount: 5 });
  assert.equal(m.revenue, 0);
  assert.equal(m.occupiedRoomNights, 0);
});

test("a pending group adds nothing", () => {
  const { group: g, rooms } = group({ status: "pending" });
  assert.equal(
    computeBusinessMetrics({ period: NOV, bookings: rooms, groups: [g], roomCount: 5 }).revenue,
    0,
  );
});

test("group and standalone bookings together are each counted once", () => {
  const { group: g, rooms } = group();
  const solo = booking();
  const m = computeBusinessMetrics({
    period: NOV,
    bookings: [...rooms, solo],
    groups: [g],
    roomCount: 5,
  });
  assert.equal(m.revenue, 9500 + 6000);
  assert.equal(m.occupiedRoomNights, 4 + 2);
});

test("a room whose group was not supplied is billed as a standalone booking (no double count, no loss)", () => {
  const { rooms } = group();
  const m = computeBusinessMetrics({ period: NOV, bookings: rooms, groups: [], roomCount: 5 });
  assert.equal(m.revenue, 10000);
  assert.equal(m.occupiedRoomNights, 4);
});

test("group partial payment: cash and outstanding come from the group's advance", () => {
  const { group: g, rooms } = group({ advance_amount: 3000 });
  assert.equal(bookingCashCollected(rooms, [g], NOV), 3000);
  assert.equal(outstandingAmount(rooms, [g], NOV), 6500);
});

// ── zero cases ──────────────────────────────────────────────────────────────
test("zero bookings: every figure is 0 (no NaN); only the available nights remain", () => {
  const m = computeBusinessMetrics({ period: NOV, bookings: [], roomCount: 5 });
  assert.deepEqual(m, {
    revenue: 0,
    cashCollected: 0,
    outstanding: 0,
    refundDue: 0,
    occupiedRoomNights: 0,
    availableRoomNights: 150,
    occupancyPercent: 0,
    accommodationRevenue: 0,
    adr: 0,
    revPar: 0,
    totalExpenses: 0,
    estimatedOperatingProfit: 0,
  });
});

test("zero available rooms: occupancy and RevPAR are 0, not Infinity or NaN", () => {
  const m = computeBusinessMetrics({ period: NOV, bookings: [booking()], roomCount: 0 });
  assert.equal(m.availableRoomNights, 0);
  assert.equal(m.occupancyPercent, 0);
  assert.equal(m.revPar, 0);
  assert.equal(m.adr, 3000); // still defined: it needs sold nights, not rooms
  for (const v of Object.values(m)) assert.ok(Number.isFinite(v));
});

test("negative or invalid room count counts as no rooms", () => {
  assert.equal(availableRoomNights(-3, NOV), 0);
  assert.equal(availableRoomNights(Number.NaN, NOV), 0);
});

test("out-of-service nights reduce availability but never below 0", () => {
  assert.equal(availableRoomNights(2, NOV, 10), 50);
  assert.equal(availableRoomNights(1, NOV, 999), 0);
});

// ── payments ────────────────────────────────────────────────────────────────
test("partial payment: cash collected and outstanding", () => {
  const b = booking({ advance_amount: 2000 });
  assert.equal(bookingCashCollected([b], [], NOV), 2000);
  assert.equal(outstandingAmount([b], [], NOV), 4000);
  assert.equal(refundDueAmount([b], [], NOV), 0);
});

test("fully paid: nothing outstanding", () => {
  assert.equal(outstandingAmount([booking({ advance_amount: 6000 })], [], NOV), 0);
});

test("overpayment is refund due, not negative outstanding", () => {
  const b = booking({ advance_amount: 7000 });
  assert.equal(outstandingAmount([b], [], NOV), 0);
  assert.equal(refundDueAmount([b], [], NOV), 1000);
  assert.equal(bookingCashCollected([b], [], NOV), 7000);
});

test("outstanding accounts for discount and charges", () => {
  const b = booking({
    discount_amount: 500,
    advance_amount: 1000,
    booking_charges: [{ qty: 1, unit_price: 300 }],
  });
  assert.equal(outstandingAmount([b], [], NOV), 4800); // 6000 + 300 − 500 − 1000
});

test("a pending booking's advance is not counted as collected revenue-side cash", () => {
  assert.equal(
    bookingCashCollected([booking({ status: "pending", advance_amount: 500 })], [], NOV),
    0,
  );
});

// ── month boundaries ────────────────────────────────────────────────────────
test("stay crossing into the month is split by nights (30 Oct → 2 Nov = 3 nights, 1 in November)", () => {
  const b = booking({
    check_in: "2026-10-30",
    check_out: "2026-11-02",
    total_amount: 9000,
    advance_amount: 3000,
  });
  assert.equal(nightsInPeriod(b.check_in, b.check_out, NOV), 1);
  assert.equal(bookingRevenue([b], [], NOV), 3000);
  assert.equal(bookingCashCollected([b], [], NOV), 1000);
  assert.equal(outstandingAmount([b], [], NOV), 2000);
  assert.equal(occupiedRoomNights([b], [], NOV), 1);
});

test("the two months of a split stay add back up to the whole stay", () => {
  const b = booking({ check_in: "2026-10-30", check_out: "2026-11-02", total_amount: 9000 });
  const oct: Period = { start: "2026-10-01", endExclusive: "2026-11-01" };
  assert.equal(bookingRevenue([b], [], oct) + bookingRevenue([b], [], NOV), 9000);
  assert.equal(occupiedRoomNights([b], [], oct) + occupiedRoomNights([b], [], NOV), 3);
});

test("check-out on the 1st of the next month: the check-out night is not in this month's stay", () => {
  const b = booking({ check_in: "2026-11-28", check_out: "2026-12-01", total_amount: 3000 });
  assert.equal(occupiedRoomNights([b], [], NOV), 3);
  const dec: Period = { start: "2026-12-01", endExclusive: "2027-01-01" };
  assert.equal(occupiedRoomNights([b], [], dec), 0);
  assert.equal(bookingRevenue([b], [], dec), 0);
});

test("a stay entirely outside the period contributes nothing", () => {
  const b = booking({ check_in: "2026-09-01", check_out: "2026-09-04" });
  assert.equal(bookingRevenue([b], [], NOV), 0);
  assert.equal(occupiedRoomNights([b], [], NOV), 0);
});

test("a stay covering the whole period counts only the period's nights", () => {
  const b = booking({ check_in: "2026-10-25", check_out: "2026-12-05", total_amount: 41000 }); // 41 nights
  assert.equal(nightsInPeriod(b.check_in, b.check_out, NOV), 30);
  assert.equal(bookingRevenue([b], [], NOV), 30000);
});

test("days in the period follow the calendar: leap February, 31-day month", () => {
  assert.equal(periodDays({ start: "2028-02-01", endExclusive: "2028-03-01" }), 29);
  assert.equal(periodDays({ start: "2027-02-01", endExclusive: "2027-03-01" }), 28);
  assert.equal(periodDays({ start: "2026-12-01", endExclusive: "2027-01-01" }), 31);
  assert.equal(availableRoomNights(4, { start: "2028-02-01", endExclusive: "2028-03-01" }), 116);
});

test("timestamps are accepted as dates (only the date part is used)", () => {
  assert.equal(nightsInPeriod("2026-11-10T18:30:00Z", "2026-11-12T00:00:00Z", NOV), 2);
});

test("a stay with no nights (check-in = check-out) is in the month of its check-in, once", () => {
  assert.equal(periodShare("2026-11-30", "2026-11-30", NOV), 1);
  assert.equal(periodShare("2026-12-01", "2026-12-01", NOV), 0);
});

// ── expenses and profit ─────────────────────────────────────────────────────
test("total expenses counts the period only: first day in, next month's first day out", () => {
  const expenses = [
    { expense_date: "2026-10-31", amount: 111 },
    { expense_date: "2026-11-01", amount: 1000 },
    { expense_date: "2026-11-30", amount: 500.5 },
    { expense_date: "2026-12-01", amount: 999 },
  ];
  assert.equal(totalExpenses(expenses, NOV), 1500.5);
});

test("estimated operating profit = revenue − expenses, and can be negative", () => {
  const m = computeBusinessMetrics({
    period: NOV,
    bookings: [booking()],
    roomCount: 5,
    expenses: [{ expense_date: "2026-11-05", amount: 2500 }],
  });
  assert.equal(m.totalExpenses, 2500);
  assert.equal(m.estimatedOperatingProfit, 3500);
  assert.equal(estimatedOperatingProfit(1000, 2500), -1500);
});

test("expenses with no bookings give a loss; no expenses give profit = revenue", () => {
  assert.equal(
    computeBusinessMetrics({
      period: NOV,
      bookings: [],
      roomCount: 3,
      expenses: [{ expense_date: "2026-11-02", amount: 800 }],
    }).estimatedOperatingProfit,
    -800,
  );
  assert.equal(
    computeBusinessMetrics({ period: NOV, bookings: [booking()], roomCount: 3 })
      .estimatedOperatingProfit,
    6000,
  );
});

// ── the small ratio functions ───────────────────────────────────────────────
test("ratio helpers", () => {
  assert.equal(occupancyPercent(75, 150), 50);
  assert.equal(occupancyPercent(5, 0), 0);
  assert.equal(averageDailyRate(9000, 3), 3000);
  assert.equal(averageDailyRate(9000, 0), 0);
  assert.equal(revPar(9000, 150), 60);
  assert.equal(revPar(9000, 0), 0);
});

// ── accommodation revenue (ADR / RevPAR) and open balances ──────────────────
test("ADR and RevPAR use room revenue: extras do not inflate the nightly rate", () => {
  const b = booking({ discount_amount: 500, booking_charges: [{ qty: 4, unit_price: 500 }] }); // room 6000, extras 2000
  const m = computeBusinessMetrics({ period: NOV, bookings: [b], roomCount: 5 });
  assert.equal(m.revenue, 7500); // 6000 + 2000 − 500
  assert.equal(m.accommodationRevenue, 5500); // 6000 − 500
  assert.equal(m.adr, 2750);
  assert.equal(m.revPar, 36.67);
});

test("accommodation revenue is split by nights and ignores cancelled/pending like revenue", () => {
  const split = booking({ check_in: "2026-10-30", check_out: "2026-11-02", total_amount: 9000 });
  assert.equal(accommodationRevenue([split], [], NOV), 3000);
  assert.equal(
    accommodationRevenue(
      [booking({ status: "cancelled" }), booking({ status: "pending" })],
      [],
      NOV,
    ),
    0,
  );
});

test("openBalances: only started, counted stays with money still due", () => {
  const started = booking({
    check_in: "2026-11-05",
    check_out: "2026-11-07",
    advance_amount: 1000,
  }); // 5000 due
  const upcoming = booking({ check_in: "2026-11-25", check_out: "2026-11-27" }); // not due yet
  const paid = booking({ check_in: "2026-11-01", check_out: "2026-11-02", advance_amount: 6000 });
  const pending = booking({ status: "pending", check_in: "2026-11-03", check_out: "2026-11-04" });
  const cancelled = booking({
    status: "cancelled",
    check_in: "2026-11-03",
    check_out: "2026-11-04",
  });
  assert.deepEqual(openBalances([started, upcoming, paid, pending, cancelled], [], "2026-11-19"), {
    count: 1,
    total: 5000,
  });
});

test("openBalances bills a group once and counts it from its own advance", () => {
  const { group: g, rooms } = group({
    check_in: "2026-11-05",
    check_out: "2026-11-07",
    advance_amount: 2500,
  });
  assert.deepEqual(openBalances(rooms, [g], "2026-11-19"), { count: 1, total: 7000 }); // 9500 − 2500
});

test("openBalances on nothing is zero", () => {
  assert.deepEqual(openBalances([], [], "2026-11-19"), { count: 0, total: 0 });
});

// ── dedupeStays / outstandingBalances (used by Revenue Intelligence) ────────
test("dedupeStays: each confirmed/completed stay once; groups replace their rooms; cancelled and pending out", () => {
  const { group: g, rooms } = group();
  const solo = booking();
  const cancelled = booking({ status: "cancelled" });
  const pending = booking({ status: "pending" });
  const stays = dedupeStays([...rooms, solo, cancelled, pending], [g]);
  assert.deepEqual(
    stays.map((s) => s.id),
    [g.id, solo.id],
  );
  assert.deepEqual(
    dedupeStays(rooms, []).map((s) => s.id),
    rooms.map((r) => r.id),
  ); // group not supplied: rooms stand alone
  assert.deepEqual(dedupeStays([], []), []);
});

test("dedupeStays keeps the caller's own fields", () => {
  const withSource = [{ ...booking(), source: "direct" as const }];
  assert.equal(dedupeStays(withSource, [])[0].source, "direct");
});

test("outstandingBalances: upcoming and started stays, split; cancelled and pending never", () => {
  const started = booking({
    check_in: "2026-11-05",
    check_out: "2026-11-07",
    advance_amount: 1000,
  }); // 5000 due
  const upcoming = booking({ check_in: "2026-11-25", check_out: "2026-11-27" }); // 6000 due
  const paid = booking({ advance_amount: 6000 });
  const cancelled = booking({ status: "cancelled" });
  const pending = booking({ status: "pending" });
  assert.deepEqual(
    outstandingBalances([started, upcoming, paid, cancelled, pending], [], "2026-11-19"),
    {
      count: 2,
      total: 11000,
      startedCount: 1,
      startedTotal: 5000,
    },
  );
});

test("outstandingBalances follows balance.ts: discount, charges, advance, and overpayment is not negative", () => {
  const b = booking({
    discount_amount: 500,
    advance_amount: 1000,
    booking_charges: [{ qty: 1, unit_price: 300 }],
  });
  assert.equal(outstandingBalances([b], [], "2026-11-19").total, 4800);
  assert.equal(outstandingBalances([booking({ advance_amount: 9000 })], [], "2026-11-19").total, 0);
});

test("outstandingBalances bills a group once and handles nothing", () => {
  const { group: g, rooms } = group({ advance_amount: 2500 });
  assert.deepEqual(outstandingBalances(rooms, [g], "2026-11-19"), {
    count: 1,
    total: 7000,
    startedCount: 1, // the group's check-in (10 Nov) is before the 19 Nov "today"
    startedTotal: 7000,
  });
  assert.deepEqual(outstandingBalances([], [], "2026-11-19"), {
    count: 0,
    total: 0,
    startedCount: 0,
    startedTotal: 0,
  });
});

// ── Was the property set up for the whole period? (shared by Home and the Monthly report) ──────────────────
import { firstRoomDay, historyCoversPeriod } from "./dashboardMetrics";

test("firstRoomDay: the earliest room decides; plain dates are used as they are; nothing usable is null", () => {
  assert.equal(
    firstRoomDay([{ created_at: "2026-10-25" }, { created_at: "2026-02-01" }]),
    "2026-02-01",
  );
  assert.equal(firstRoomDay([]), null);
  assert.equal(firstRoomDay([{ created_at: null }, {}, { created_at: "not a date" }]), null);
});

test("firstRoomDay: a timestamp becomes its LOCAL date, not the UTC date a slice(0, 10) would give", () => {
  // Built from local parts, so it is 2 Sep 03:00 local on any machine; its UTC date can differ (IST is ahead).
  const createdAt = new Date(2026, 8, 2, 3, 0).toISOString();
  assert.equal(firstRoomDay([{ created_at: createdAt }]), "2026-09-02");
});

test("historyCoversPeriod: true only when a room existed by the first day of the period", () => {
  assert.equal(historyCoversPeriod([{ created_at: "2026-09-01" }], "2026-09-01"), true); // same day counts
  assert.equal(historyCoversPeriod([{ created_at: "2026-09-02" }], "2026-09-01"), false);
  assert.equal(historyCoversPeriod([{ created_at: "2026-01-01" }], "2026-09-01"), true);
  assert.equal(historyCoversPeriod([], "2026-09-01"), false); // no rooms: no history to trust
});
