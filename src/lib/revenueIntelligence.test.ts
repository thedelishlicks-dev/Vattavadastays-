/**
 * Unit tests for revenueIntelligence.ts.
 *   npx tsx --test src/lib/revenueIntelligence.test.ts
 *
 * Calendar used throughout: today is Friday 2026-11-20, so the 30-day window is Fri 20 Nov … Sat 19 Dec and
 * holds ten Fri/Sat (weekend) nights: 20, 21, 27, 28 Nov · 4, 5, 11, 12, 18, 19 Dec.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_MAX_OPPORTUNITIES,
  MIN_MISSING_SOURCES,
  addDaysYmd,
  compareOpportunities,
  computeRevenueOpportunities,
  emptyDatesRule,
  formatDay,
  missingBookingSourceRule,
  missingExpensesRule,
  outstandingPaymentRule,
  pricingGapRule,
  selectForDashboard,
  type RevenueIntelligenceInput,
  type RevenueOpportunity,
  type RuleBooking,
  type RuleGroup,
  type RuleRoom,
} from "./revenueIntelligence";
import type { RoomRate } from "./roomRates";

const TODAY = "2026-11-20";
const NOV = { start: "2026-11-01", endExclusive: "2026-12-01" };

const GARDEN: RuleRoom = {
  id: "r1",
  name: "Garden",
  is_active: true,
  base_price: 3000,
  weekend_multiplier: 1,
  max_guests: 2,
  extra_guest_price: 0,
};
const MEADOW: RuleRoom = {
  id: "r2",
  name: "Meadow",
  is_active: true,
  base_price: 3000,
  weekend_multiplier: 1,
  max_guests: 2,
  extra_guest_price: 0,
};

let n = 0;
const stay = (over: Partial<RuleBooking> = {}): RuleBooking => ({
  id: `b${++n}`,
  room_id: "r1",
  group_id: null,
  guest_name: "Guest",
  status: "confirmed",
  check_in: "2026-11-02",
  check_out: "2026-11-04",
  total_amount: 6000,
  discount_amount: 0,
  advance_amount: 6000, // paid in full unless a test says otherwise
  booking_charges: [],
  source: "direct",
  booking_source_detail: null,
  ...over,
});
/** A single paid, past stay: gives the property booking history without creating any other opportunity. */
const HISTORY = stay({ source: "agent" });

function input(over: Partial<RevenueIntelligenceInput> = {}): RevenueIntelligenceInput {
  return {
    today: TODAY,
    currentMonth: NOV,
    rooms: [GARDEN],
    bookings: [],
    groups: [],
    bookingTotal: 0,
    rates: [],
    blockedNights: [],
    expenses: [{ expense_date: "2026-11-05", amount: 100 }],
    ...over,
  };
}
const ids = (list: RevenueOpportunity[]) => list.map((o) => o.id);

// ── nothing to say ──────────────────────────────────────────────────────────
test("no opportunities: a brand-new property with nothing recorded gets an empty list", () => {
  assert.deepEqual(computeRevenueOpportunities(input()), []);
});

test("no opportunities: a tidy, fully booked property", () => {
  const booked = stay({
    check_in: "2026-11-19",
    check_out: "2026-12-21",
    total_amount: 90000,
    advance_amount: 90000,
    source: "walk_in",
  });
  assert.deepEqual(computeRevenueOpportunities(input({ bookings: [booked], bookingTotal: 1 })), []);
});

test("no opportunities when nothing could be loaded: silence, never a guess", () => {
  const r = computeRevenueOpportunities(
    input({ bookings: null, groups: null, rates: null, blockedNights: null, expenses: null }),
  );
  assert.deepEqual(r, []);
});

// ── rule 1: outstanding payment ─────────────────────────────────────────────
test("outstanding: upcoming unpaid stays are summed with the exact wording", () => {
  const a = stay({
    check_in: "2026-12-01",
    check_out: "2026-12-04",
    total_amount: 12000,
    advance_amount: 3000,
  }); // 9000 due
  const b = stay({
    check_in: "2026-12-10",
    check_out: "2026-12-13",
    total_amount: 9500,
    advance_amount: 0,
  }); // 9500 due
  const [o] = outstandingPaymentRule(input({ bookings: [a, b] }));
  assert.equal(o.id, "outstanding_payment");
  assert.equal(o.type, "outstanding_payment");
  assert.equal(o.severity, "warning");
  assert.equal(o.title, "₹18,500 is still outstanding");
  assert.equal(o.description, "Some upcoming bookings still have money due.");
  assert.equal(o.estimatedValue, 18500);
  assert.equal(o.href, "/admin/payments");
  assert.equal(o.actionLabel, "Review payments");
});

test("outstanding: discounts, extra charges and advances follow the balance.ts maths", () => {
  const b = stay({
    check_in: "2026-12-01",
    check_out: "2026-12-03",
    total_amount: 6000,
    discount_amount: 500,
    advance_amount: 1000,
    booking_charges: [{ qty: 1, unit_price: 300 }],
  });
  assert.equal(outstandingPaymentRule(input({ bookings: [b] }))[0].estimatedValue, 4800); // 6000 + 300 − 500 − 1000
});

test("outstanding: cancelled and pending bookings are never counted", () => {
  const unpaid = { advance_amount: 0, check_in: "2026-12-01", check_out: "2026-12-03" };
  assert.deepEqual(
    outstandingPaymentRule(
      input({
        bookings: [
          stay({ ...unpaid, status: "cancelled" }),
          stay({ ...unpaid, status: "pending" }),
        ],
      }),
    ),
    [],
  );
  assert.equal(
    outstandingPaymentRule(
      input({
        bookings: [
          stay({ ...unpaid, status: "cancelled" }),
          stay({ ...unpaid, status: "completed" }),
        ],
      }),
    )[0].estimatedValue,
    6000,
  );
});

test("outstanding: fully paid, overpaid or no bookings give nothing", () => {
  assert.deepEqual(outstandingPaymentRule(input({ bookings: [stay()] })), []);
  assert.deepEqual(
    outstandingPaymentRule(input({ bookings: [stay({ advance_amount: 9000 })] })),
    [],
  );
  assert.deepEqual(outstandingPaymentRule(input()), []);
});

test("outstanding: a multi-room booking is counted once, from its group", () => {
  const group: RuleGroup = {
    id: "g1",
    status: "confirmed",
    check_in: "2026-12-01",
    check_out: "2026-12-03",
    total_amount: 10000,
    discount_amount: 1000,
    advance_amount: 2000,
    booking_charges: [],
  };
  const rooms = [
    stay({
      group_id: "g1",
      total_amount: 5000,
      advance_amount: 0,
      check_in: "2026-12-01",
      check_out: "2026-12-03",
    }),
    stay({
      group_id: "g1",
      room_id: "r2",
      total_amount: 5000,
      advance_amount: 0,
      check_in: "2026-12-01",
      check_out: "2026-12-03",
    }),
  ];
  assert.equal(
    outstandingPaymentRule(input({ bookings: rooms, groups: [group] }))[0].estimatedValue,
    7000,
  ); // 10000 − 1000 − 2000
});

test("outstanding: wording changes when stays have already started", () => {
  const started = stay({
    check_in: "2026-11-18",
    check_out: "2026-11-22",
    total_amount: 8000,
    advance_amount: 0,
  });
  const upcoming = stay({
    check_in: "2026-12-05",
    check_out: "2026-12-07",
    total_amount: 6000,
    advance_amount: 0,
  });
  assert.equal(
    outstandingPaymentRule(input({ bookings: [started] }))[0].description,
    "Some bookings that have already started still have money due.",
  );
  assert.equal(
    outstandingPaymentRule(input({ bookings: [started, upcoming] }))[0].description,
    "Some bookings still have money due, 1 of them already started.",
  );
});

test("outstanding: stays on today's date count as started; failed load stays silent", () => {
  const today = stay({ check_in: TODAY, check_out: "2026-11-22", advance_amount: 0 });
  assert.match(
    outstandingPaymentRule(input({ bookings: [today] }))[0].description,
    /already started/,
  );
  assert.deepEqual(outstandingPaymentRule(input({ bookings: null })), []);
  assert.deepEqual(outstandingPaymentRule(input({ groups: null })), []);
});

// ── rule 2: empty dates ─────────────────────────────────────────────────────
test("empty dates: counts open room nights in the next 30 days without claiming anything about demand", () => {
  const [o] = emptyDatesRule(input({ bookings: [HISTORY] }));
  assert.equal(o.id, "empty_dates");
  assert.equal(o.severity, "opportunity");
  assert.equal(o.title, "30 empty room nights");
  assert.equal(
    o.description,
    "You still have availability in the next 30 days. Longest stretch: 30 nights in a row from Fri 20 Nov.",
  );
  assert.equal(o.href, "/admin/calendar");
  assert.equal(o.actionLabel, "Open calendar");
  assert.equal(o.estimatedValue, undefined); // no invented amount
});

test("empty dates: booked nights, pending holds and blocked nights are not empty; the longest stretch is found", () => {
  const booked = stay({ check_in: "2026-11-22", check_out: "2026-11-25" }); // nights 22, 23, 24
  const hold = stay({ status: "pending", check_in: "2026-12-02", check_out: "2026-12-03" }); // night 2 Dec
  const blocked = [{ room_id: "r1", date: "2026-11-30", note: "Painting" }];
  const [o] = emptyDatesRule(input({ bookings: [booked, hold], blockedNights: blocked }));
  assert.equal(o.title, "25 empty room nights"); // 30 − 3 − 1 − 1
  assert.match(o.description, /Longest stretch: 17 nights in a row from Thu 3 Dec\./);
});

test("empty dates: a fully occupied window gives nothing", () => {
  const full = stay({ check_in: "2026-11-19", check_out: "2026-12-21", advance_amount: 6000 });
  assert.deepEqual(emptyDatesRule(input({ bookings: [full] })), []);
});

test("empty dates: cancelled bookings leave their nights empty; inactive rooms are ignored", () => {
  const cancelled = stay({ status: "cancelled", check_in: "2026-11-20", check_out: "2026-12-20" });
  assert.equal(
    emptyDatesRule(input({ bookings: [HISTORY, cancelled] }))[0].title,
    "30 empty room nights",
  );
  const rooms = [GARDEN, { ...MEADOW, is_active: false }];
  assert.equal(
    emptyDatesRule(input({ rooms, bookings: [HISTORY] }))[0].title,
    "30 empty room nights",
  );
});

test("empty dates: several rooms are totalled, and the stretch names its room", () => {
  const gardenBooked = stay({ room_id: "r1", check_in: "2026-11-20", check_out: "2026-12-20" });
  const [o] = emptyDatesRule(input({ rooms: [GARDEN, MEADOW], bookings: [HISTORY, gardenBooked] }));
  assert.equal(o.title, "30 empty room nights");
  assert.match(o.description, /Longest stretch: 30 nights in a row from Fri 20 Nov \(Meadow\)\./);
  assert.ok(!o.description.includes("across")); // only one room has free nights
  const both = emptyDatesRule(input({ rooms: [GARDEN, MEADOW], bookings: [HISTORY] }))[0];
  assert.equal(both.title, "60 empty room nights");
  assert.match(both.description, /across 2 rooms/);
});

test("empty dates: a single free night is singular and has no stretch", () => {
  const nearlyFull = stay({ check_in: "2026-11-21", check_out: "2026-12-20" }); // leaves only Fri 20 Nov
  const [o] = emptyDatesRule(input({ bookings: [nearlyFull] }));
  assert.equal(o.title, "1 empty room night");
  assert.ok(!o.description.includes("Longest stretch"));
});

test("empty dates: silent for a property with no bookings yet, or when data failed to load", () => {
  assert.deepEqual(emptyDatesRule(input()), []);
  assert.deepEqual(emptyDatesRule(input({ bookings: null })), []);
  assert.deepEqual(emptyDatesRule(input({ bookings: [HISTORY], blockedNights: null })), []); // blocks unknown: could be wrong
  assert.deepEqual(emptyDatesRule(input({ rooms: [], bookings: [HISTORY] })), []);
});

test("empty dates: history can come from the all-time count alone", () => {
  assert.equal(emptyDatesRule(input({ bookings: [], bookingTotal: 12 })).length, 1);
});

// ── rule 3: missing booking source ──────────────────────────────────────────
const noSource = (k: number) => Array.from({ length: k }, () => stay());

test("missing source: three or more recent stays without a source are reported, with the product's limits stated", () => {
  const [o] = missingBookingSourceRule(input({ bookings: noSource(5) }));
  assert.equal(o.id, "missing_booking_source");
  assert.equal(o.severity, "info");
  assert.equal(o.title, "5 bookings without a source");
  assert.match(o.description, /^You haven't recorded how 5 recent bookings found you\./);
  assert.match(o.description, /tap Change source to record it/);
  assert.match(o.description, /booking page are counted here too/);
  assert.equal(o.actionLabel, "Review bookings");
  assert.equal(o.href, "/admin/bookings");
  assert.equal(MIN_MISSING_SOURCES, 3);
});

test("missing source: a couple of gaps is not a pattern (threshold)", () => {
  assert.deepEqual(missingBookingSourceRule(input({ bookings: noSource(2) })), []);
  assert.equal(missingBookingSourceRule(input({ bookings: noSource(3) })).length, 1);
});

test("missing source: complete data gives nothing; agent and walk-in bookings already say how", () => {
  const withDetail = Array.from({ length: 5 }, () => stay({ booking_source_detail: "instagram" }));
  assert.deepEqual(missingBookingSourceRule(input({ bookings: withDetail })), []);
  const known = [
    stay({ source: "agent" }),
    stay({ source: "walk_in" }),
    stay({ source: "agent" }),
    stay({ source: "walk_in" }),
  ];
  assert.deepEqual(missingBookingSourceRule(input({ bookings: known })), []);
  assert.deepEqual(
    missingBookingSourceRule(
      input({ bookings: Array.from({ length: 4 }, () => stay({ booking_source_detail: "   " })) }),
    ).length,
    1,
  ); // blank is not a source
});

test("missing source: cancelled and pending stays are ignored; a group counts once", () => {
  const ignored = [
    stay({ status: "cancelled" }),
    stay({ status: "pending" }),
    stay({ status: "cancelled" }),
    stay({ status: "pending" }),
  ];
  assert.deepEqual(missingBookingSourceRule(input({ bookings: ignored })), []);
  const group: RuleGroup = {
    id: "g1",
    status: "confirmed",
    check_in: "2026-11-02",
    check_out: "2026-11-04",
    total_amount: 10000,
    advance_amount: 10000,
    source: "direct",
    booking_source_detail: null,
  };
  const rooms = [
    stay({ group_id: "g1" }),
    stay({ group_id: "g1", room_id: "r2" }),
    stay({ group_id: "g1" }),
  ];
  assert.deepEqual(missingBookingSourceRule(input({ bookings: rooms, groups: [group] })), []); // one booking, not three
});

test("missing source: nothing for no bookings or a failed load", () => {
  assert.deepEqual(missingBookingSourceRule(input()), []);
  assert.deepEqual(missingBookingSourceRule(input({ bookings: null })), []);
});

// ── rule 4: missing expenses ────────────────────────────────────────────────
test("missing expenses: revenue this month but nothing recorded this month", () => {
  const [o] = missingExpensesRule(input({ bookings: [HISTORY], expenses: [] }));
  assert.equal(o.id, "missing_expenses");
  assert.equal(o.severity, "info");
  assert.equal(o.title, "Your profit estimate is incomplete");
  assert.equal(
    o.description,
    "Add your property expenses to see a more realistic operating-profit estimate.",
  );
  assert.equal(o.actionLabel, "Add expense");
  assert.equal(o.href, "/admin/expenses");
});

test("missing expenses: last month's expenses do not count for this month; this month's do", () => {
  const lastMonth = [{ expense_date: "2026-10-31", amount: 5000 }];
  assert.equal(missingExpensesRule(input({ bookings: [HISTORY], expenses: lastMonth })).length, 1);
  assert.deepEqual(
    missingExpensesRule(
      input({ bookings: [HISTORY], expenses: [{ expense_date: "2026-11-01", amount: 1 }] }),
    ),
    [],
  );
  assert.equal(
    missingExpensesRule(
      input({ bookings: [HISTORY], expenses: [{ expense_date: "2026-12-01", amount: 1 }] }),
    ).length,
    1,
  ); // next month does not count either
});

test("missing expenses: silent for a property with no meaningful activity this month", () => {
  assert.deepEqual(missingExpensesRule(input({ expenses: [] })), []); // no bookings at all
  const lastMonthOnly = stay({ check_in: "2026-10-05", check_out: "2026-10-07" });
  assert.deepEqual(missingExpensesRule(input({ bookings: [lastMonthOnly], expenses: [] })), []);
  const cancelledOnly = stay({ status: "cancelled" });
  assert.deepEqual(missingExpensesRule(input({ bookings: [cancelledOnly], expenses: [] })), []);
});

test("missing expenses: expenses that failed to load are not 'missing'", () => {
  assert.deepEqual(missingExpensesRule(input({ bookings: [HISTORY], expenses: null })), []);
});

// ── rule 5: pricing gap ─────────────────────────────────────────────────────
const WEEKEND_ROOM: RuleRoom = { ...GARDEN, weekend_multiplier: 1.2 };

test("pricing: insufficient data returns nothing: one room, no weekend pricing anywhere, or unknown seasonal prices", () => {
  assert.deepEqual(pricingGapRule(input({ rooms: [GARDEN] })), []);
  assert.deepEqual(pricingGapRule(input({ rooms: [GARDEN, MEADOW] })), []); // nothing configured to compare with
  assert.deepEqual(pricingGapRule(input({ rooms: [WEEKEND_ROOM] })), []); // the only room is the configured one
  assert.deepEqual(pricingGapRule(input({ rooms: [WEEKEND_ROOM, MEADOW], rates: null })), []);
  assert.deepEqual(pricingGapRule(input({ rooms: [WEEKEND_ROOM, MEADOW], bookings: null })), []);
  assert.deepEqual(
    pricingGapRule(input({ rooms: [WEEKEND_ROOM, MEADOW], blockedNights: null })),
    [],
  );
});

test("pricing: weekend nights on the standard rate while other rooms have weekend pricing", () => {
  const [o] = pricingGapRule(input({ rooms: [WEEKEND_ROOM, MEADOW] }));
  assert.equal(o.id, "pricing_gap:weekend_standard_rate");
  assert.equal(o.type, "pricing_gap");
  assert.equal(o.severity, "opportunity");
  assert.equal(o.title, "Some weekend dates use your standard rate");
  assert.equal(
    o.description,
    "10 upcoming open weekend nights in Meadow are priced like a weekday, while weekend pricing is set on other rooms.",
  );
  assert.equal(o.actionLabel, "Review weekend pricing");
  assert.equal(o.href, "/admin/rooms");
});

test("pricing: only OPEN weekend nights are counted, and never as an estimate of lost revenue", () => {
  const booked = stay({ room_id: "r2", check_in: "2026-11-20", check_out: "2026-11-22" }); // Fri + Sat nights
  const [o] = pricingGapRule(input({ rooms: [WEEKEND_ROOM, MEADOW], bookings: [booked] }));
  assert.match(o.description, /^8 upcoming open weekend nights in Meadow/);
  assert.equal(o.estimatedValue, undefined);
});

test("pricing: a room that already has weekend pricing is never flagged; inactive rooms are ignored", () => {
  const both = pricingGapRule(
    input({ rooms: [WEEKEND_ROOM, { ...MEADOW, weekend_multiplier: 1.5 }] }),
  );
  assert.deepEqual(both, []);
  const inactive = pricingGapRule(
    input({ rooms: [WEEKEND_ROOM, { ...MEADOW, is_active: false }] }),
  );
  assert.deepEqual(inactive, []);
});

test("pricing: weekend pricing set only on an INACTIVE room is not 'configured elsewhere'", () => {
  assert.deepEqual(
    pricingGapRule(input({ rooms: [{ ...WEEKEND_ROOM, is_active: false }, MEADOW] })),
    [],
  );
});

test("pricing: open nights with no price at all are reported, with the rooms named", () => {
  const unpriced: RuleRoom = { ...MEADOW, base_price: 0 };
  const [o] = pricingGapRule(input({ rooms: [GARDEN, unpriced] }));
  assert.equal(o.id, "pricing_gap:no_price");
  assert.equal(o.severity, "warning");
  assert.equal(o.title, "30 open nights with no price");
  assert.equal(o.description, "Some upcoming dates have no nightly price set (Meadow).");
  assert.equal(o.actionLabel, "Review pricing");
});

test("pricing: a seasonal price that applies closes the gap; one that does not leaves it", () => {
  const unpriced: RuleRoom = { ...MEADOW, base_price: 0 };
  const fixed: RoomRate = {
    room_id: null,
    start_date: "2026-11-01",
    end_date: "2026-12-31",
    kind: "fixed",
    value: 2500,
  };
  assert.deepEqual(pricingGapRule(input({ rooms: [unpriced], rates: [fixed] })), []);
  const partial: RoomRate = { ...fixed, start_date: "2026-12-01" }; // covers 1–19 Dec only
  assert.equal(
    pricingGapRule(input({ rooms: [unpriced], rates: [partial] }))[0].title,
    "11 open nights with no price",
  ); // 20–30 Nov
  const percent: RoomRate = { ...fixed, kind: "percent", value: 10 }; // +10% of 0 is still 0
  assert.equal(
    pricingGapRule(input({ rooms: [unpriced], rates: [percent] }))[0].title,
    "30 open nights with no price",
  );
});

test("pricing: a booked unpriced night is not a gap (it is already sold)", () => {
  const unpriced: RuleRoom = { ...MEADOW, base_price: 0, id: "r2" };
  const booked = stay({ room_id: "r2", check_in: "2026-11-20", check_out: "2026-12-20" });
  assert.deepEqual(pricingGapRule(input({ rooms: [unpriced], bookings: [booked] })), []);
});

test("pricing: unpriced nights are reported once, not again as 'weekend on standard rate'", () => {
  const unpriced: RuleRoom = { ...MEADOW, base_price: 0 };
  assert.deepEqual(ids(pricingGapRule(input({ rooms: [WEEKEND_ROOM, unpriced] }))), [
    "pricing_gap:no_price",
  ]);
});

test("pricing: wording never judges the price or promises revenue", () => {
  const all = pricingGapRule(
    input({ rooms: [WEEKEND_ROOM, MEADOW, { ...MEADOW, id: "r3", name: "Loft", base_price: 0 }] }),
  );
  assert.equal(all.length, 2);
  for (const o of all) {
    assert.ok(
      !/too low|too high|underpriced|demand|competitor|market|discount|lost revenue/i.test(
        `${o.title} ${o.description}`,
      ),
    );
    assert.equal(o.estimatedValue, undefined);
  }
});

// ── ordering and the three-item limit ───────────────────────────────────────
/** Everything at once: unpaid started stays, an unpriced room, empty dates, no expenses, no sources. */
function everything(): RevenueIntelligenceInput {
  const rooms = [
    { ...GARDEN, weekend_multiplier: 1.2 },
    { ...MEADOW, base_price: 0 },
  ];
  const bookings = [
    stay({ check_in: "2026-11-02", check_out: "2026-11-04", advance_amount: 0 }),
    stay({ check_in: "2026-11-05", check_out: "2026-11-07", advance_amount: 0 }),
    stay({ check_in: "2026-11-08", check_out: "2026-11-10", advance_amount: 0 }),
  ];
  return input({ rooms, bookings, bookingTotal: 3, expenses: [] });
}

test("order: payments, pricing, empty dates, expenses, sources", () => {
  const r = computeRevenueOpportunities(everything());
  assert.deepEqual(ids(r), [
    "outstanding_payment",
    "pricing_gap:no_price",
    "empty_dates",
    "missing_expenses",
    "missing_booking_source",
  ]);
  assert.equal(r[0].estimatedValue, 18000);
});

test("dashboard shows at most three and says how many are left", () => {
  const r = computeRevenueOpportunities(everything());
  const { shown, hiddenCount } = selectForDashboard(r);
  assert.equal(DASHBOARD_MAX_OPPORTUNITIES, 3);
  assert.deepEqual(ids(shown), ["outstanding_payment", "pricing_gap:no_price", "empty_dates"]);
  assert.equal(hiddenCount, 2);
  assert.deepEqual(selectForDashboard(r.slice(0, 2)), { shown: r.slice(0, 2), hiddenCount: 0 });
  assert.deepEqual(selectForDashboard([]), { shown: [], hiddenCount: 0 });
  assert.equal(selectForDashboard(r, 5).hiddenCount, 0);
  assert.equal(selectForDashboard(r, 0).shown.length, 0);
});

test("order within a rule: the larger rupee impact first, then severity, then id", () => {
  const o = (over: Partial<RevenueOpportunity>): RevenueOpportunity => ({
    id: "x",
    type: "pricing_gap",
    severity: "info",
    title: "t",
    description: "d",
    ...over,
  });
  const small = o({ id: "a", estimatedValue: 500 });
  const big = o({ id: "b", estimatedValue: 9000 });
  const none = o({ id: "c" });
  assert.deepEqual(
    [none, small, big].sort(compareOpportunities).map((x) => x.id),
    ["b", "a", "c"],
  );
  const warn = o({ id: "z", severity: "warning" });
  const info = o({ id: "a", severity: "info" });
  assert.deepEqual(
    [info, warn].sort(compareOpportunities).map((x) => x.id),
    ["z", "a"],
  );
  assert.deepEqual(
    [o({ id: "b" }), o({ id: "a" })].sort(compareOpportunities).map((x) => x.id),
    ["a", "b"],
  );
});

test("pricing gaps: missing price before weekend rate", () => {
  const r = computeRevenueOpportunities(
    input({ rooms: [WEEKEND_ROOM, MEADOW, { ...MEADOW, id: "r3", name: "Loft", base_price: 0 }] }),
  );
  assert.deepEqual(ids(r), ["pricing_gap:no_price", "pricing_gap:weekend_standard_rate"]);
});

test("deterministic: same input, same output, whatever order the rows arrive in; input untouched", () => {
  const a = everything();
  const frozen = JSON.stringify(a);
  const first = computeRevenueOpportunities(a);
  assert.deepEqual(computeRevenueOpportunities(a), first);
  const shuffled: RevenueIntelligenceInput = {
    ...a,
    rooms: [...a.rooms].reverse(),
    bookings: [...(a.bookings ?? [])].reverse(),
  };
  assert.deepEqual(computeRevenueOpportunities(shuffled), first);
  assert.equal(JSON.stringify(a), frozen);
});

test("no opportunity ever promises an unproven amount: only outstanding money carries one", () => {
  for (const o of computeRevenueOpportunities(everything())) {
    if (o.type !== "outstanding_payment") assert.equal(o.estimatedValue, undefined, o.id);
    assert.ok(o.href && o.actionLabel, o.id);
    assert.ok(
      !/low demand|high demand|too low|competitor|\bAI\b/i.test(`${o.title} ${o.description}`),
      o.id,
    );
  }
});

// ── date helpers ────────────────────────────────────────────────────────────
test("date helpers cross month and year ends and name the weekday", () => {
  assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysYmd("2028-02-28", 1), "2028-02-29");
  assert.equal(formatDay("2026-11-20"), "Fri 20 Nov");
  assert.equal(formatDay("2026-12-03"), "Thu 3 Dec");
});
