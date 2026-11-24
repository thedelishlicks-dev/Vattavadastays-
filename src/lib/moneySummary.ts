/**
 * Pure logic behind the Money overview (Revenue · Collected · Outstanding · Expenses · Estimated profit,
 * revenue by source, expenses by category). No React, no Supabase; tested in moneySummary.test.ts.
 *
 * This is an OWNER BUSINESS DASHBOARD, not accounting. Nothing here re-derives a money formula:
 *   - what a stay is worth, what is paid and what is owed come from `computeBalance` (balance.ts) through
 *     businessMetrics.ts (`periodStays`, `bookingRevenue`, …);
 *   - expenses and category totals come from expenses.ts / businessMetrics.ts;
 *   - percentage changes reuse `percentChange` from dashboardMetrics.ts.
 * This file only chooses the reporting period and groups the same figures.
 *
 * Definitions (kept separate on purpose)
 *  - Revenue    net value (room + extras − discount) of CONFIRMED / COMPLETED stays, by nights in the period.
 *               Pending and cancelled stays never count. A multi-room booking counts once (its group).
 *  - Collected  money recorded as received (`advance_amount`) on those same stays, by nights in the period.
 *               LIMITATION: the app stores no payment dates, only a running total per booking, so this is
 *               "collected on this period's stays", NOT "cash that arrived during the period".
 *  - Outstanding  unpaid balance (balance.ts) of those same stays, by nights in the period; split into
 *               stays that have not started yet and stays that have (check-in on or before today).
 *               Overpayment is never netted against it: it is reported as `refundDue`.
 *  - Expenses   expense records whose expense_date is inside the period.
 *  - Estimated operating profit = revenue − recorded expenses. Not net profit; incomplete with no expenses.
 *
 * Dates are "YYYY-MM-DD" strings from LOCAL date parts (never toISOString(): UTC is a day off in India).
 */

import {
  bookingRevenue,
  dayNumber,
  estimatedOperatingProfit,
  periodStays,
  totalExpenses,
  type BookingLike,
  type GroupLike,
  type Period,
  type PeriodStay,
} from "./businessMetrics";
import { percentChange, type TrendDirection } from "./dashboardMetrics";
import { localDateString, monthRange, totalsByCategory, type CategoryTotal } from "./expenses";
import type { Expense } from "../types/database";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Reporting periods ───────────────────────────────────────────────────────

export type PeriodKey = "this_month" | "last_month" | "this_year";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_year", label: "This year" },
];

export const DEFAULT_PERIOD: PeriodKey = "this_month";

/**
 * A period, the one before it, and their labels: everything a screen needs to LOAD and compare a period.
 * `ReportingPeriod` (Money overview) and `monthWindow` (Monthly report) both produce one, so both screens
 * load their data through the same hook (`usePeriodData`) with the same query keys.
 */
export interface PeriodWindow {
  /** "November 2026" / "2026". */
  label: string;
  period: Period;
  /** Last day of the period, inclusive (for date-range queries). */
  lastDay: string;
  /** The period it is compared with: the month before, or the year before. */
  previous: Period;
  previousLastDay: string;
  /** Completes "vs …": "last month", "the month before", "last year", or "September 2026". */
  comparisonLabel: string;
}

export interface ReportingPeriod extends PeriodWindow {
  key: PeriodKey;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function monthPeriod(year: number, monthIndex: number) {
  // new Date() normalises a month outside 0–11, so December → January crosses the year correctly.
  const r = monthRange(new Date(year, monthIndex, 1));
  return { period: { start: r.start, endExclusive: r.endExclusive }, lastDay: r.lastDay };
}

function yearPeriod(year: number) {
  return {
    period: { start: `${year}-01-01`, endExclusive: `${year + 1}-01-01` },
    lastDay: `${year}-12-31`,
  };
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "October 2026" from LOCAL date parts. Not Intl: the same text on every device and in tests. */
export function monthLabelOf(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex, 1); // normalises a month outside 0–11
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * One calendar month (any month, not only the current one) and the month before it. `monthIndex` is 0–11 and
 * may overflow either way, so January's previous month is December of the year before.
 */
export function monthWindow(year: number, monthIndex: number): PeriodWindow {
  const cur = monthPeriod(year, monthIndex);
  const prev = monthPeriod(year, monthIndex - 1);
  return {
    label: monthLabelOf(year, monthIndex),
    period: cur.period,
    lastDay: cur.lastDay,
    previous: prev.period,
    previousLastDay: prev.lastDay,
    comparisonLabel: monthLabelOf(year, monthIndex - 1),
  };
}

/** The selected reporting period and the one before it, from the LOCAL date `now`. */
export function reportingPeriod(key: PeriodKey, now: Date): ReportingPeriod {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "this_year") {
    const cur = yearPeriod(y);
    const prev = yearPeriod(y - 1);
    return {
      key,
      label: String(y),
      period: cur.period,
      lastDay: cur.lastDay,
      previous: prev.period,
      previousLastDay: prev.lastDay,
      comparisonLabel: "last year",
    };
  }
  const offset = key === "last_month" ? -1 : 0;
  const cur = monthPeriod(y, m + offset);
  const prev = monthPeriod(y, m + offset - 1);
  const shown = new Date(y, m + offset, 1);
  return {
    key,
    label: shown.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    period: cur.period,
    lastDay: cur.lastDay,
    previous: prev.period,
    previousLastDay: prev.lastDay,
    comparisonLabel: key === "last_month" ? "the month before" : "last month",
  };
}

/** Today as a local "YYYY-MM-DD" (re-exported so screens do not import two helper files). */
export function todayLocal(now: Date = new Date()): string {
  return localDateString(now);
}

// ── Booking source ──────────────────────────────────────────────────────────

export type SourceGroup =
  | "whatsapp"
  | "instagram"
  | "google"
  | "website"
  | "phone"
  | "walk_in"
  | "agent"
  | "airbnb"
  | "booking_com"
  | "makemytrip"
  | "agoda"
  | "repeat_guest"
  | "other"
  | "unknown";

export const SOURCE_GROUP_LABELS: Record<SourceGroup, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  google: "Google",
  website: "Website",
  phone: "Phone",
  walk_in: "Walk-in",
  agent: "Agent",
  airbnb: "Airbnb",
  booking_com: "Booking.com",
  makemytrip: "MakeMyTrip",
  agoda: "Agoda",
  repeat_guest: "Repeat guest",
  other: "Other",
  unknown: "Unknown",
};

/** Detail values (lower-cased, punctuation → "_") that map to a display group. */
const DETAIL_ALIASES: Record<string, SourceGroup> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  google: "google",
  website: "website",
  phone: "phone",
  phone_call: "phone",
  walk_in: "walk_in",
  walkin: "walk_in",
  repeat_guest: "repeat_guest",
  airbnb: "airbnb",
  booking_com: "booking_com",
  bookingcom: "booking_com",
  makemytrip: "makemytrip",
  agoda: "agoda",
  other: "other",
};

/**
 * Where a stay came from, from what the owner RECORDED. Nothing is inferred:
 *  - source = "agent" → Agent (the agent brought it; it also drives the commission).
 *  - else a recorded `booking_source_detail` → its group; text we do not recognise (written by another
 *    tool) → Other, because it is a real source we have no heading for.
 *  - else source = "walk_in" → Walk-in (recorded as such).
 *  - else (a plain "direct" booking with no detail, or empty/blank) → Unknown. "Direct" is NOT turned into
 *    Website: a direct booking can be a phone call, a WhatsApp message or a guest who walked in.
 */
export function sourceGroupOf(row: {
  source?: string | null;
  booking_source_detail?: string | null;
}): SourceGroup {
  if (row.source === "agent") return "agent";
  const key = (row.booking_source_detail ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (key) return DETAIL_ALIASES[key] ?? "other";
  if (row.source === "walk_in") return "walk_in";
  return "unknown";
}

export interface SourceRow {
  group: SourceGroup;
  label: string;
  revenue: number;
  /** Stays (a multi-room booking is one). */
  bookings: number;
}

/** The recorded-source fields of a booking / group row. */
export interface SourceFields {
  source?: string | null;
  booking_source_detail?: string | null;
}

/**
 * Revenue and booking count per source, biggest first (ties by name; Unknown last among equals).
 * Built from the same `PeriodStay` rows as the headline revenue, and the rows ALWAYS add up to it: the
 * few paise lost when each row is rounded are put on the largest row, and unsupported source data lands in
 * Unknown instead of dropping out.
 */
export function revenueBySource(
  stays: readonly PeriodStay<SourceFields>[],
  total: number,
): SourceRow[] {
  const map = new Map<SourceGroup, { revenue: number; bookings: number }>();
  for (const s of stays) {
    const g = sourceGroupOf(s.stay);
    const row = map.get(g) ?? { revenue: 0, bookings: 0 };
    row.revenue += s.revenue;
    row.bookings += 1;
    map.set(g, row);
  }
  const rows: SourceRow[] = [...map.entries()].map(([group, r]) => ({
    group,
    label: SOURCE_GROUP_LABELS[group],
    revenue: round2(r.revenue),
    bookings: r.bookings,
  }));
  rows.sort(
    (a, b) =>
      b.revenue - a.revenue ||
      (a.group === "unknown" ? 1 : 0) - (b.group === "unknown" ? 1 : 0) ||
      a.label.localeCompare(b.label),
  );
  const residue = round2(total - rows.reduce((s, r) => s + r.revenue, 0));
  if (rows.length > 0 && residue !== 0) rows[0].revenue = round2(rows[0].revenue + residue);
  return rows;
}

// ── Expenses ────────────────────────────────────────────────────────────────

type ExpenseLike = Pick<Expense, "amount" | "expense_date" | "category">;

/** Expenses dated inside [start, endExclusive). */
export function expensesInPeriod<E extends Pick<Expense, "expense_date">>(
  expenses: readonly E[],
  period: Period,
): E[] {
  const from = dayNumber(period.start);
  const to = dayNumber(period.endExclusive);
  return expenses.filter((e) => {
    const d = dayNumber(e.expense_date);
    return d >= from && d < to;
  });
}

// ── The summary ─────────────────────────────────────────────────────────────

export interface OutstandingBreakdown {
  /** Unpaid balance of the period's stays, by nights in the period. */
  total: number;
  /** Stays with money still due. */
  count: number;
  /** Stays that have not started (check-in after today). */
  upcoming: number;
  /** Stays that have started (check-in on or before today). */
  started: number;
}

export interface MoneyFigures {
  revenue: number;
  collected: number;
  outstanding: OutstandingBreakdown;
  /** Paid above the net total on the period's stays: to refund or adjust. Never netted off Outstanding. */
  refundDue: number;
  expenses: number;
  /** Number of recorded expenses in the period (0 = the profit estimate is incomplete). */
  expenseCount: number;
  /** revenue − expenses. Can be negative. */
  profit: number;
  /** Stays counted (a multi-room booking is one). */
  stayCount: number;
}

export interface MoneyInput {
  period: Period;
  bookings: readonly (BookingLike & SourceFields)[];
  groups?: readonly (GroupLike & SourceFields)[];
  expenses?: readonly ExpenseLike[];
  /** Local "YYYY-MM-DD": splits Outstanding into upcoming / started stays. */
  today: string;
}

export interface MoneySummary extends MoneyFigures {
  bySource: SourceRow[];
  byCategory: CategoryTotal[];
}

export function computeMoneySummary(input: MoneyInput): MoneySummary {
  const { period, today } = input;
  const bookings = input.bookings;
  const groups = input.groups ?? [];
  const inPeriod = expensesInPeriod(input.expenses ?? [], period);
  const stays = periodStays(bookings, groups, period);

  const revenue = bookingRevenue(bookings, groups, period);
  const sum = (pick: (s: (typeof stays)[number]) => number, list = stays) =>
    round2(list.reduce((t, s) => t + pick(s), 0));

  const due = stays.filter((s) => s.balance > 0);
  const upcomingStays = due.filter((s) => dayNumber(s.stay.check_in) > dayNumber(today));
  const total = sum((s) => s.balance);
  const upcoming = sum((s) => s.balance, upcomingStays);

  const expenses = totalExpenses(inPeriod, period);
  return {
    revenue,
    collected: sum((s) => s.collected),
    outstanding: {
      total,
      count: due.length,
      upcoming,
      started: round2(total - upcoming),
    },
    refundDue: sum((s) => s.refundDue),
    expenses,
    expenseCount: inPeriod.length,
    profit: estimatedOperatingProfit(revenue, expenses),
    stayCount: stays.length,
    bySource: revenueBySource(stays, revenue),
    byCategory: totalsByCategory(inPeriod),
  };
}

// ── Comparison with the previous period ─────────────────────────────────────

export interface MoneyChange {
  direction: TrendDirection;
  /** Whole percent, absolute. 0 when flat. */
  percent: number;
  /** "↑ 18% vs last month" / "No change vs last month". */
  text: string;
}

/**
 * % change from `previous` to `current`, or null when it would mislead: no usable baseline (previous is
 * zero or negative, so "↑ ∞%" or a % against a loss) or a non-number. A current value of 0 against a real
 * baseline IS shown ("↓ 100%"): that is true.
 */
export function moneyChange(
  current: number,
  previous: number,
  comparisonLabel: string,
): MoneyChange | null {
  const pct = percentChange(current, previous);
  if (pct === null) return null;
  if (pct === 0) return { direction: "flat", percent: 0, text: `No change vs ${comparisonLabel}` };
  const direction: TrendDirection = pct > 0 ? "up" : "down";
  return {
    direction,
    percent: Math.abs(pct),
    text: `${direction === "up" ? "↑" : "↓"} ${Math.abs(pct)}% vs ${comparisonLabel}`,
  };
}

export interface MoneyComparisons {
  revenue: MoneyChange | null;
  collected: MoneyChange | null;
  expenses: MoneyChange | null;
  profit: MoneyChange | null;
  /**
   * Always null, on purpose: Outstanding is a balance still open today, so last month's open balance is not
   * a figure to compare this month's with (collecting money makes it "fall" without anything going wrong).
   */
  outstanding: null;
}

/**
 * Comparisons for Revenue / Collected / Expenses / Profit. Profit is compared only when expenses were
 * recorded in BOTH periods and last period's profit was above zero (otherwise it is just revenue, or a %
 * against a loss).
 */
export function compareMoney(
  current: MoneyFigures,
  previous: MoneyFigures,
  comparisonLabel: string,
): MoneyComparisons {
  const profitComparable =
    current.expenseCount > 0 && previous.expenseCount > 0 && previous.profit > 0;
  return {
    revenue: moneyChange(current.revenue, previous.revenue, comparisonLabel),
    collected: moneyChange(current.collected, previous.collected, comparisonLabel),
    expenses: moneyChange(current.expenses, previous.expenses, comparisonLabel),
    profit: profitComparable ? moneyChange(current.profit, previous.profit, comparisonLabel) : null,
    outstanding: null,
  };
}

// ── Profit wording ──────────────────────────────────────────────────────────

/** The one line under the profit figure. Never implies accounting profit. */
export function profitNote(expenseCount: number): { complete: boolean; text: string } {
  return expenseCount > 0
    ? { complete: true, text: "Based on recorded expenses." }
    : {
        complete: false,
        text: "No expenses recorded for this period, so this estimate is incomplete. Add property expenses to improve this estimate.",
      };
}
