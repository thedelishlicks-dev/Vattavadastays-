/**
 * Revenue Intelligence: a deterministic, rule-based list of things the owner can do to earn more or to see
 * their business more clearly. Pure (no React, no Supabase, no clock, no randomness): the same input always
 * gives the same list, in the same order. No AI, no market data, no competitor data, no demand claims, and
 * nothing here changes a price or a booking.
 *
 * Five rules, each a small function that returns zero or more opportunities and says nothing when the data
 * it needs is missing or not trustworthy (a failed query is `null`, never "nothing found"):
 *
 *  1. outstanding_payment     money still due on confirmed/completed stays (balance.ts via businessMetrics).
 *  2. pricing_gap             open upcoming nights with no price, or weekend nights on the standard rate
 *                             while weekend pricing is set on other rooms. Prices come from priceRoomStay
 *                             (quoteBuilder.ts), the same calculation guests are charged.
 *  3. empty_dates             room-nights in the next 30 days with no booking, hold or block (calendar rules).
 *  4. missing_expenses        revenue this month but no expense recorded this month.
 *  5. missing_booking_source  recent confirmed/completed stays that do not say how the guest found you.
 *
 * Order: by rule (the list above), then by the larger rupee impact where there is one, then severity, then id.
 * `selectForDashboard` shows at most three.
 *
 * What it deliberately does NOT do: say a price is "too low", estimate extra revenue from a price we cannot
 * compute, call dates "low demand", or recommend a discount.
 */

import {
  bookingRevenue,
  dedupeStays,
  outstandingBalances,
  type BookingLike,
  type GroupLike,
  type Period,
} from "./businessMetrics";
import { buildCalendarIndex, stateOf, type CalAvailRow } from "./calendarState";
import { isWeekendNight, priceRoomStay, type QuoteRoom } from "./quoteBuilder";
import type { RoomRate } from "./roomRates";

// ── Types ───────────────────────────────────────────────────────────────────

export type OpportunityType =
  | "outstanding_payment"
  | "empty_dates"
  | "missing_booking_source"
  | "missing_expenses"
  | "pricing_gap";

export type OpportunitySeverity = "info" | "warning" | "opportunity";

export interface RevenueOpportunity {
  /** Stable. One id per distinct opportunity (e.g. "pricing_gap:no_price"). */
  id: string;
  type: OpportunityType;
  severity: OpportunitySeverity;
  title: string;
  description: string;
  /** Rupees. Only when it can be calculated from the owner's own data (never an estimate of demand). */
  estimatedValue?: number;
  /** In-app route. */
  href?: string;
  actionLabel?: string;
}

export interface RuleRoom {
  id: string;
  name: string;
  is_active?: boolean | null;
  base_price?: number | string | null;
  weekend_multiplier?: number | string | null;
  extra_guest_price?: number | string | null;
  max_guests?: number | string | null;
}

export type RuleBooking = BookingLike & {
  room_id?: string | null;
  guest_name?: string | null;
  source?: string | null;
  booking_source_detail?: string | null;
};
export type RuleGroup = GroupLike & {
  source?: string | null;
  booking_source_detail?: string | null;
};

export interface RevenueIntelligenceInput {
  /** Local date "YYYY-MM-DD". Passed in so the rules never read the clock. */
  today: string;
  /** The current calendar month, [start, endExclusive). */
  currentMonth: Period;
  rooms: readonly RuleRoom[];
  /** `null` = could not be loaded: every rule that needs it stays silent. */
  bookings: readonly RuleBooking[] | null;
  groups: readonly RuleGroup[] | null;
  /** All bookings ever recorded (count only); optional, widens "has booking history". */
  bookingTotal?: number | null;
  /** Seasonal price rules (what useRoomRates returns). */
  rates: readonly RoomRate[] | null;
  /** Nights marked unavailable (blocks, synced calendars, booking nights) for the next 30 days. */
  blockedNights: readonly CalAvailRow[] | null;
  /** Expenses covering at least the current month. */
  expenses: readonly { expense_date: string; amount: number | string }[] | null;
}

// ── Tunable thresholds ──────────────────────────────────────────────────────

/** How far ahead dates and prices are looked at. */
export const UPCOMING_WINDOW_DAYS = 30;
/** Recent stays without a source before it is worth mentioning (a single one is not a pattern). */
export const MIN_MISSING_SOURCES = 3;
/** The dashboard shows this many at first. */
export const DASHBOARD_MAX_OPPORTUNITIES = 3;

const PAYMENTS = "/admin/payments";
const CALENDAR = "/admin/calendar";
const ROOMS = "/admin/rooms";
const EXPENSES = "/admin/expenses";
const BOOKINGS = "/admin/bookings";

// ── Helpers ─────────────────────────────────────────────────────────────────

const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const text = (v: string | null | undefined) => (v ?? "").trim();
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const DAY_MS = 86_400_000;
const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
/** YYYY-MM-DD `days` after `ymd`, timezone-proof. */
export function addDaysYmd(ymd: string, days: number): string {
  return new Date((dayNumber(ymd) + days) * DAY_MS).toISOString().slice(0, 10);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Fri 4 Dec" */
export function formatDay(ymd: string): string {
  const d = new Date(dayNumber(ymd) * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

function activeRooms(rooms: readonly RuleRoom[]): RuleRoom[] {
  return rooms
    .filter((r) => r.is_active !== false)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function hasBookingHistory(input: RevenueIntelligenceInput): boolean {
  return (
    (input.bookingTotal ?? 0) > 0 ||
    (input.bookings?.length ?? 0) > 0 ||
    (input.groups?.length ?? 0) > 0
  );
}

interface OpenNight {
  room: RuleRoom;
  date: string;
}

/**
 * Nights in the next 30 days with nothing on them, using the calendar's own definition of a night's state:
 * a booked night, a pending hold and a blocked night are NOT open; a check-out night is. null when the
 * bookings or the blocked nights could not be loaded.
 */
function openNights(input: RevenueIntelligenceInput): OpenNight[] | null {
  if (!input.bookings || !input.blockedNights) return null;
  const index = buildCalendarIndex(
    input.bookings
      .filter((b): b is RuleBooking & { room_id: string } => !!b.room_id)
      .map((b) => ({
        room_id: b.room_id,
        status: b.status ?? "",
        guest_name: b.guest_name ?? "",
        check_in: b.check_in,
        check_out: b.check_out,
      })),
    [...input.blockedNights],
  );
  const out: OpenNight[] = [];
  for (const room of activeRooms(input.rooms)) {
    for (let i = 0; i < UPCOMING_WINDOW_DAYS; i++) {
      const date = addDaysYmd(input.today, i);
      const state = stateOf(index, room.id, date).state;
      if (state === "open" || state === "checkout") out.push({ room, date });
    }
  }
  return out;
}

// ── Rule 1: outstanding payment ─────────────────────────────────────────────

export function outstandingPaymentRule(input: RevenueIntelligenceInput): RevenueOpportunity[] {
  if (!input.bookings || !input.groups) return [];
  const due = outstandingBalances(input.bookings, input.groups, input.today);
  if (due.count === 0 || due.total <= 0) return [];
  const description =
    due.startedCount === 0
      ? "Some upcoming bookings still have money due."
      : due.startedCount === due.count
        ? "Some bookings that have already started still have money due."
        : `Some bookings still have money due, ${due.startedCount} of them already started.`;
  return [
    {
      id: "outstanding_payment",
      type: "outstanding_payment",
      severity: "warning",
      title: `${rupees(due.total)} is still outstanding`,
      description,
      estimatedValue: due.total,
      href: PAYMENTS,
      actionLabel: "Review payments",
    },
  ];
}

// ── Rule 2: empty upcoming dates ────────────────────────────────────────────

export function emptyDatesRule(input: RevenueIntelligenceInput): RevenueOpportunity[] {
  if (!hasBookingHistory(input)) return [];
  const open = openNights(input);
  if (!open || open.length === 0) return [];

  // The longest run of consecutive open nights in one room: "3 nights in a row from Fri 4 Dec".
  let best: { room: RuleRoom; start: string; nights: number } | null = null;
  const byRoom = new Map<string, OpenNight[]>();
  for (const n of open) byRoom.set(n.room.id, [...(byRoom.get(n.room.id) ?? []), n]);
  for (const nights of byRoom.values()) {
    let runStart = 0;
    for (let i = 1; i <= nights.length; i++) {
      const continues =
        i < nights.length && dayNumber(nights[i].date) === dayNumber(nights[i - 1].date) + 1;
      if (continues) continue;
      const len = i - runStart;
      const candidate = { room: nights[runStart].room, start: nights[runStart].date, nights: len };
      if (!best || len > best.nights || (len === best.nights && candidate.start < best.start))
        best = candidate;
      runStart = i;
    }
  }

  const roomCount = new Set(open.map((n) => n.room.id)).size;
  const total = open.length;
  const stretch =
    best && best.nights >= 2
      ? ` Longest stretch: ${best.nights} nights in a row from ${formatDay(best.start)}${
          activeRooms(input.rooms).length > 1 ? ` (${best.room.name})` : ""
        }.`
      : "";
  return [
    {
      id: "empty_dates",
      type: "empty_dates",
      severity: "opportunity",
      title: `${plural(total, "empty room night")}`,
      description: `You still have availability in the next ${UPCOMING_WINDOW_DAYS} days${
        roomCount > 1 ? ` across ${roomCount} rooms` : ""
      }.${stretch}`,
      href: CALENDAR,
      actionLabel: "Open calendar",
    },
  ];
}

// ── Rule 3: missing booking source ──────────────────────────────────────────

/** A stay says how the guest found you if it carries a detail, or its source is an agent or a walk-in. */
function hasUsefulSource(s: {
  source?: string | null;
  booking_source_detail?: string | null;
}): boolean {
  return text(s.booking_source_detail) !== "" || s.source === "agent" || s.source === "walk_in";
}

export function missingBookingSourceRule(input: RevenueIntelligenceInput): RevenueOpportunity[] {
  if (!input.bookings || !input.groups) return [];
  const stays = dedupeStays(input.bookings, input.groups);
  const missing = stays.filter((s) => !hasUsefulSource(s)).length;
  if (missing < MIN_MISSING_SOURCES) return [];
  return [
    {
      id: "missing_booking_source",
      type: "missing_booking_source",
      severity: "info",
      title: `${plural(missing, "booking")} without a source`,
      // The honest limits, in the description: capture is at creation only, and guest-made bookings cannot be told apart.
      description: `You haven't recorded how ${missing} recent ${missing === 1 ? "booking" : "bookings"} found you. A source can only be recorded when you add a booking, not afterwards, and bookings made through your booking page are counted here too.`,
      href: BOOKINGS,
      actionLabel: "Review bookings",
    },
  ];
}

// ── Rule 4: missing expense data ────────────────────────────────────────────

export function missingExpensesRule(input: RevenueIntelligenceInput): RevenueOpportunity[] {
  if (!input.bookings || !input.groups || !input.expenses) return [];
  const revenue = bookingRevenue(input.bookings, input.groups, input.currentMonth);
  if (revenue <= 0) return []; // no meaningful activity this month: nothing to estimate a profit from
  const from = dayNumber(input.currentMonth.start);
  const to = dayNumber(input.currentMonth.endExclusive);
  const recorded = input.expenses.some((e) => {
    const d = dayNumber(e.expense_date);
    return d >= from && d < to && num(e.amount) > 0;
  });
  if (recorded) return [];
  return [
    {
      id: "missing_expenses",
      type: "missing_expenses",
      severity: "info",
      title: "Your profit estimate is incomplete",
      description: "Add your property expenses to see a more realistic operating-profit estimate.",
      href: EXPENSES,
      actionLabel: "Add expense",
    },
  ];
}

// ── Rule 5: basic pricing gap ───────────────────────────────────────────────

function quoteRoom(r: RuleRoom): QuoteRoom {
  return {
    id: r.id,
    name: r.name,
    base_price: num(r.base_price),
    extra_guest_price: num(r.extra_guest_price),
    weekend_multiplier: r.weekend_multiplier == null ? 1 : num(r.weekend_multiplier) || 1,
    max_guests: Math.max(1, num(r.max_guests) || 1),
  };
}

/**
 * Only the owner's own configuration is compared, never a market:
 *  a) open upcoming nights whose nightly price (priceRoomStay) is 0: no price applies;
 *  b) open upcoming Fri/Sat nights of a room still on the standard rate while at least one OTHER active room
 *     has weekend pricing. With no room configured, or only one room, there is nothing to compare: silent.
 * No amount is estimated: the owner has not said what the weekend price should be.
 */
export function pricingGapRule(input: RevenueIntelligenceInput): RevenueOpportunity[] {
  if (!input.rates) return []; // seasonal prices unknown: any price we computed could be wrong
  const open = openNights(input);
  if (!open || open.length === 0) return [];

  const out: RevenueOpportunity[] = [];
  const rooms = new Map(activeRooms(input.rooms).map((r) => [r.id, quoteRoom(r)]));

  const nightlyPrice = (room: QuoteRoom, date: string) =>
    priceRoomStay({
      room,
      guests: 1,
      checkIn: date,
      checkOut: addDaysYmd(date, 1),
      rates: input.rates ?? [],
    }).room_price;

  // a) no price
  const unpriced = open.filter((n) => nightlyPrice(rooms.get(n.room.id)!, n.date) <= 0);
  if (unpriced.length > 0) {
    const names = [...new Set(unpriced.map((n) => n.room.name))];
    out.push({
      id: "pricing_gap:no_price",
      type: "pricing_gap",
      severity: "warning",
      title: `${plural(unpriced.length, "open night")} with no price`,
      description: `Some upcoming dates have no nightly price set (${listNames(names)}).`,
      href: ROOMS,
      actionLabel: "Review pricing",
    });
  }

  // b) weekend dates on the standard rate
  const anyWeekendPricing = [...rooms.values()].some((r) => r.weekend_multiplier > 1);
  if (anyWeekendPricing) {
    const standardRate = open.filter((n) => {
      const r = rooms.get(n.room.id)!;
      return r.weekend_multiplier === 1 && isWeekendNight(n.date) && nightlyPrice(r, n.date) > 0;
    });
    if (standardRate.length > 0) {
      const names = [...new Set(standardRate.map((n) => n.room.name))];
      out.push({
        id: "pricing_gap:weekend_standard_rate",
        type: "pricing_gap",
        severity: "opportunity",
        title: "Some weekend dates use your standard rate",
        description: `${plural(standardRate.length, "upcoming open weekend night")} in ${listNames(names)} ${
          standardRate.length === 1 ? "is" : "are"
        } priced like a weekday, while weekend pricing is set on other rooms.`,
        href: ROOMS,
        actionLabel: "Review weekend pricing",
      });
    }
  }
  return out;
}

// ── The engine ──────────────────────────────────────────────────────────────

/** Rule priority: payments, pricing, empty dates, expenses, sources. */
const TYPE_RANK: Record<OpportunityType, number> = {
  outstanding_payment: 0,
  pricing_gap: 1,
  empty_dates: 2,
  missing_expenses: 3,
  missing_booking_source: 4,
};
const SEVERITY_RANK: Record<OpportunitySeverity, number> = { warning: 0, opportunity: 1, info: 2 };

export function compareOpportunities(a: RevenueOpportunity, b: RevenueOpportunity): number {
  return (
    TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
    (b.estimatedValue ?? -1) - (a.estimatedValue ?? -1) || // larger rupee impact first; none last
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Every opportunity the rules find, in display order. Deterministic. */
export function computeRevenueOpportunities(input: RevenueIntelligenceInput): RevenueOpportunity[] {
  return [
    ...outstandingPaymentRule(input),
    ...pricingGapRule(input),
    ...emptyDatesRule(input),
    ...missingExpensesRule(input),
    ...missingBookingSourceRule(input),
  ].sort(compareOpportunities);
}

/** What the dashboard shows first: at most `max` (default 3), plus how many more there are. */
export function selectForDashboard(
  opportunities: readonly RevenueOpportunity[],
  max: number = DASHBOARD_MAX_OPPORTUNITIES,
): { shown: RevenueOpportunity[]; hiddenCount: number } {
  const limit = Math.max(0, Math.floor(max));
  return {
    shown: opportunities.slice(0, limit),
    hiddenCount: Math.max(0, opportunities.length - limit),
  };
}
