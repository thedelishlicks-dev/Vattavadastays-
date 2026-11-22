/**
 * Monthly Business Report (Sprint 7): "How did my property perform, and what should I do next?" Pure logic, no
 * React, no Supabase, no clock; tested in monthlyReport.test.ts.
 *
 * This is a COMPOSITION layer, not a new analytics engine. Every figure comes from code that already exists:
 *   - revenue, collected, outstanding, expenses, profit, revenue by source, expenses by category:
 *     `computeMoneySummary` (moneySummary.ts), the exact function the Money overview uses;
 *   - occupancy, ADR, RevPAR, room nights: `computeBusinessMetrics` (businessMetrics.ts);
 *   - the Property Score and the opportunities are the existing engines' output, passed in unchanged.
 * Nothing here re-derives a money formula, an occupancy formula or a source taxonomy.
 *
 * What this file adds, and nothing else:
 *   1. choosing the month (default: the last COMPLETED month) and its previous month;
 *   2. comparison wording that never misleads (zero baselines, expenses not recorded, partial months);
 *   3. guest insights for the month, built on the persistent guest identity of Sprint 6;
 *   4. whole-number source percentages that add up to 100;
 *   5. a deterministic "what changed / what to do next" summary built only from the measured figures.
 *
 * Definitions that are specific to the report
 *  - Stay count        stays with nights in the month (a multi-room booking is ONE stay).
 *  - Identified guest  a stay whose booking carries a `guest_id` (a usable phone number, Sprint 6). Names are
 *                      never matched. A stay without one is "not identified", never "a new guest".
 *  - Repeat guest      a guest who stayed in the month AND has more than one confirmed/completed stay at the
 *                      same property up to the END of the month. A stay booked later does not make a past month's
 *                      guest "repeat": last month's report does not change when next month's booking is added.
 *  - Repeat guest stays  the month's stays made by repeat guests.
 *  - Available room nights use the rooms that are active TODAY × days in the month (the same rule as the Home
 *    snapshot). The app keeps no room history; `setupNote` says so when the property was set up part-way through.
 *  - Property Score and opportunities are CURRENT-STATE (they read today's calendar, prices and bookings). The
 *    report shows them labelled as current and never presents them as the month's own.
 *
 * Dates are "YYYY-MM-DD" strings from LOCAL date parts (never toISOString(): UTC is a day off in India).
 */

import {
  computeBusinessMetrics,
  dayNumber,
  dedupeStays,
  periodDays,
  periodStays,
  type BookingLike,
  type BusinessMetrics,
  type GroupLike,
  type Period,
} from "./businessMetrics";
import { firstRoomDay, historyCoversPeriod, percentChange } from "./dashboardMetrics";
import {
  MONTH_NAMES,
  computeMoneySummary,
  monthWindow,
  profitNote,
  type MoneySummary,
  type PeriodWindow,
  type SourceFields,
  type SourceRow,
} from "./moneySummary";
import type { PropertyScoreResult, RecommendedAction } from "./propertyScore";
import {
  DASHBOARD_MAX_OPPORTUNITIES,
  selectForDashboard,
  type RevenueOpportunity,
} from "./revenueIntelligence";
import type { Expense } from "../types/database";

// ── Choosing the month ──────────────────────────────────────────────────────

export interface ReportMonth {
  year: number;
  /** 0–11. */
  month0: number;
}

/** How many completed months back the owner can step. The report is a recent-performance view, not an archive. */
export const REPORT_MONTHS_BACK = 24;

const monthIndex = (m: ReportMonth) => m.year * 12 + m.month0;

export function compareMonths(a: ReportMonth, b: ReportMonth): number {
  return monthIndex(a) - monthIndex(b);
}

/** `m` moved by `delta` months (negative = earlier). January − 1 is December of the year before. */
export function shiftMonth(m: ReportMonth, delta: number): ReportMonth {
  const d = new Date(m.year, m.month0 + delta, 1);
  return { year: d.getFullYear(), month0: d.getMonth() };
}

/**
 * The last COMPLETED calendar month, from the LOCAL date: on any day of November 2026 it is October 2026;
 * on 5 January 2027 it is December 2026. The current, unfinished month is never the default.
 */
export function lastCompletedMonth(now: Date): ReportMonth {
  return shiftMonth({ year: now.getFullYear(), month0: now.getMonth() }, -1);
}

/** The oldest month the owner can step back to. */
export function earliestReportMonth(now: Date): ReportMonth {
  return shiftMonth(lastCompletedMonth(now), -(REPORT_MONTHS_BACK - 1));
}

/** A month the report may show: completed, and not older than `REPORT_MONTHS_BACK`. */
export function isSelectableMonth(m: ReportMonth, now: Date): boolean {
  return (
    compareMonths(m, lastCompletedMonth(now)) <= 0 &&
    compareMonths(m, earliestReportMonth(now)) >= 0
  );
}

/** "October". */
export function monthName(m: ReportMonth): string {
  return MONTH_NAMES[shiftMonth(m, 0).month0];
}

/** The month and the one before it, in the shape the loading hook and Money overview already share. */
export function reportWindow(m: ReportMonth): PeriodWindow {
  return monthWindow(m.year, m.month0);
}

// ── Formatting used in sentences ────────────────────────────────────────────

const rupees = (n: number) =>
  `${n < 0 ? "−" : ""}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
const percentText = (n: number) => `${Math.round(n)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "5 Nov 2026" from a "YYYY-MM-DD". */
export function formatDayShort(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`;
}

// ── Comparison with the previous month ──────────────────────────────────────

export type ChangeKind =
  /** A percentage change (zero baseline never reaches here). */
  | "percent"
  /** A change in percentage points (occupancy). */
  | "points"
  /** A change in rupees (profit, where a percentage against zero or a loss would mislead). */
  | "amount"
  /** Effectively unchanged. */
  | "flat"
  /** The previous month gives nothing to compare with: nothing sold, or the property was not yet set up. */
  | "no_baseline"
  /** Nothing to compare on either side, or the figure is not comparable (e.g. expenses not recorded). */
  | "none";

export interface ReportChange {
  kind: ChangeKind;
  direction: "up" | "down" | "flat" | null;
  /** Absolute size of the change in its unit (percent, points or rupees); 0 for the kinds without a number. */
  value: number;
  /**
   * Plain words with a direction word AND an arrow, so a change is never carried by colour alone:
   * "↑ Up 18% vs September 2026", "No previous-month baseline".
   */
  text: string;
}

/** Shown wherever the previous month cannot be a baseline. Never "∞%". */
export const NO_BASELINE_TEXT = "No previous-month baseline";

const noBaseline = (): ReportChange => ({
  kind: "no_baseline",
  direction: null,
  value: 0,
  text: NO_BASELINE_TEXT,
});
const noComparison = (text: string): ReportChange => ({
  kind: "none",
  direction: null,
  value: 0,
  text,
});
const flatChange = (same: boolean, previousLabel: string): ReportChange => ({
  kind: "flat",
  direction: "flat",
  value: 0,
  text: same ? `No change vs ${previousLabel}` : `About the same as ${previousLabel}`,
});
const moved = (
  kind: "percent" | "points" | "amount",
  up: boolean,
  value: number,
  unit: string,
  previousLabel: string,
): ReportChange => ({
  kind,
  direction: up ? "up" : "down",
  value,
  text: `${up ? "↑ Up" : "↓ Down"} ${unit} vs ${previousLabel}`,
});

/**
 * % change, or a neutral state when a percentage would mislead. Previous = 0 and current > 0 is
 * "No previous-month baseline" (never "∞%"); zero in both months is `noneText`; current = 0 against a real
 * baseline IS a 100% decrease, because that is true.
 */
export function percentChangeOf(
  current: number,
  previous: number,
  previousLabel: string,
  noneText: string,
): ReportChange {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return noBaseline();
  if (previous <= 0) return current > 0 ? noBaseline() : noComparison(noneText);
  const pct = percentChange(current, previous);
  if (pct === null) return noBaseline();
  if (pct === 0) return flatChange(current === previous, previousLabel);
  return moved("percent", pct > 0, Math.abs(pct), `${Math.abs(pct)}%`, previousLabel);
}

/** Occupancy is already a percentage: the change is in points between the two DISPLAYED (rounded) figures. */
function pointsChangeOf(current: number, previous: number, previousLabel: string): ReportChange {
  const pts = Math.round(current) - Math.round(previous);
  if (pts === 0) return flatChange(current === previous, previousLabel);
  return moved("points", pts > 0, Math.abs(pts), `${Math.abs(pts)} pts`, previousLabel);
}

/** A change in rupees, for profit when either month is not a positive baseline. */
function amountChangeOf(current: number, previous: number, previousLabel: string): ReportChange {
  const diff = Math.round(current - previous);
  if (diff === 0) return flatChange(current === previous, previousLabel);
  return moved("amount", diff > 0, Math.abs(diff), rupees(Math.abs(diff)), previousLabel);
}

/** One month's figures: the Money summary and the business metrics, both from the shared functions. */
export interface MonthFigures {
  money: MoneySummary;
  metrics: BusinessMetrics;
}

export interface ReportComparison {
  previousLabel: string;
  revenue: ReportChange;
  occupancy: ReportChange;
  adr: ReportChange;
  revPar: ReportChange;
  expenses: ReportChange;
  profit: ReportChange;
  stays: ReportChange;
  /** The previous month's own figures, for sentences like "Occupancy fell from 61% to 48%". */
  previous: {
    revenue: number;
    occupancyPercent: number;
    expenses: number;
    stays: number;
  };
}

/**
 * Compares a month with the one before it.
 * @param baselineOk false when the property was not yet set up for the whole previous month: that month is a
 *   partial one, so every comparison is neutral rather than "↑ 300%" against half a month (the same rule the
 *   Home snapshot uses).
 */
export function compareMonthFigures(
  current: MonthFigures,
  previous: MonthFigures,
  previousLabel: string,
  baselineOk: boolean,
): ReportComparison {
  const c = current.metrics;
  const p = previous.metrics;
  const cm = current.money;
  const pm = previous.money;

  const revenue = baselineOk
    ? percentChangeOf(cm.revenue, pm.revenue, previousLabel, "No revenue in either month")
    : noBaseline();

  let occupancy: ReportChange;
  if (!baselineOk) occupancy = noBaseline();
  else if (c.availableRoomNights === 0 || p.availableRoomNights === 0)
    occupancy = noComparison("No rooms on sale to compare");
  else if (p.occupiedRoomNights === 0)
    occupancy =
      c.occupiedRoomNights > 0 ? noBaseline() : noComparison("No nights sold in either month");
  else occupancy = pointsChangeOf(c.occupancyPercent, p.occupancyPercent, previousLabel);

  let adr: ReportChange;
  if (!baselineOk) adr = noBaseline();
  else if (c.occupiedRoomNights === 0)
    adr = noComparison(
      p.occupiedRoomNights > 0 ? "No nights sold this month" : "No nights sold in either month",
    );
  else if (p.occupiedRoomNights === 0) adr = noBaseline();
  else adr = percentChangeOf(c.adr, p.adr, previousLabel, "No nights sold in either month");

  let revPar: ReportChange;
  if (!baselineOk) revPar = noBaseline();
  else if (c.availableRoomNights === 0 || p.availableRoomNights === 0)
    revPar = noComparison("No rooms on sale to compare");
  else
    revPar = percentChangeOf(c.revPar, p.revPar, previousLabel, "No room revenue in either month");

  // "No expenses recorded" is not "zero expenses": a month with nothing recorded is never shown as a 100% cost cut.
  let expenses: ReportChange;
  if (!baselineOk) expenses = noBaseline();
  else if (cm.expenseCount === 0 && pm.expenseCount === 0)
    expenses = noComparison("No expenses recorded in either month");
  else if (cm.expenseCount === 0) expenses = noComparison("No expenses recorded this month");
  else if (pm.expenseCount === 0) expenses = noBaseline();
  else expenses = percentChangeOf(cm.expenses, pm.expenses, previousLabel, "No expenses recorded");

  // Profit means something only when expenses were recorded in BOTH months (otherwise it is just revenue).
  let profit: ReportChange;
  if (!baselineOk) profit = noBaseline();
  else if (cm.expenseCount === 0 || pm.expenseCount === 0)
    profit = noComparison("Not compared: expenses weren't recorded in both months");
  else if (cm.profit > 0 && pm.profit > 0)
    profit = percentChangeOf(cm.profit, pm.profit, previousLabel, "No profit in either month");
  else profit = amountChangeOf(cm.profit, pm.profit, previousLabel);

  const stays = baselineOk
    ? percentChangeOf(cm.stayCount, pm.stayCount, previousLabel, "No bookings in either month")
    : noBaseline();

  return {
    previousLabel,
    revenue,
    occupancy,
    adr,
    revPar,
    expenses,
    profit,
    stays,
    previous: {
      revenue: pm.revenue,
      occupancyPercent: p.occupancyPercent,
      expenses: pm.expenses,
      stays: pm.stayCount,
    },
  };
}

// ── Revenue by source: whole percentages that add up ────────────────────────

export interface SourceShareRow extends SourceRow {
  /** Whole percent of the month's revenue; null when the month's revenue is 0. */
  percent: number | null;
}

/**
 * Adds a whole-number share to each source row. The rows are the Money overview's own (`revenueBySource`, which
 * already adds up to the revenue to the paisa); the shares use the largest-remainder method so they add up to
 * exactly 100 ("33% + 33% + 33%" never appears as a total of 99).
 */
export function sourceShares(rows: readonly SourceRow[]): SourceShareRow[] {
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  if (!(total > 0)) return rows.map((r) => ({ ...r, percent: null }));
  const exact = rows.map((r) => (r.revenue / total) * 100);
  const floors = exact.map((x) => Math.floor(x));
  let left = 100 - floors.reduce((s, x) => s + x, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return rows.map((r, i) => ({ ...r, percent: floors[i] }));
}

// ── Guest insights ──────────────────────────────────────────────────────────

/** What a booking / group row carries for guest identity (Sprint 6). */
export interface GuestRef {
  guest_id?: string | null;
  property_id?: string | null;
}

export interface GuestInsights {
  /** Stays in the month (a multi-room booking counts once). */
  stays: number;
  /** Stays whose booking has a guest record. */
  identifiedStays: number;
  /** Stays with no usable phone number, so no guest record. Never guessed from a name. */
  unidentifiedStays: number;
  /** Different identified guests who stayed in the month. */
  uniqueGuests: number;
  /** Of those, guests with more than one stay at this property up to the end of the month. */
  repeatGuests: number;
  /** The month's stays made by repeat guests. */
  repeatGuestStays: number;
}

type ReportBookingRow = BookingLike & SourceFields & GuestRef;
type ReportGroupRow = GroupLike & SourceFields & GuestRef;

const inProperty = (r: GuestRef, propertyId: string | undefined) =>
  !propertyId || !r.property_id || r.property_id === propertyId;

/** The distinct guest ids of the month's stays: exactly the guests whose history is worth loading. Sorted. */
export function periodGuestIds(
  bookings: readonly ReportBookingRow[],
  groups: readonly ReportGroupRow[],
  period: Period,
): string[] {
  const ids = new Set<string>();
  for (const s of periodStays(bookings, groups, period)) {
    const g = s.stay.guest_id;
    if (g) ids.add(g);
  }
  return [...ids].sort();
}

/**
 * Guest insights for the month.
 *
 * `bookings` / `groups` are the month's rows; `history` is every booking/group row of the guests who stayed in
 * the month (loaded by `guest_id`, up to the end of the month), so repeat status needs no per-booking lookup.
 * Stays are counted by `dedupeStays` (confirmed/completed only, a multi-room booking once), so a pending,
 * cancelled or expired booking can never make a guest "returning". Rows of another property are ignored.
 * The month's own stays are always part of the count, even if `history` is incomplete.
 */
export function computeGuestInsights(input: {
  period: Period;
  bookings: readonly ReportBookingRow[];
  groups: readonly ReportGroupRow[];
  history: { bookings: readonly ReportBookingRow[]; groups: readonly ReportGroupRow[] };
  propertyId?: string;
}): GuestInsights {
  const { period, propertyId } = input;
  const keep = <T extends GuestRef>(rows: readonly T[]) =>
    rows.filter((r) => inProperty(r, propertyId));
  const endDay = dayNumber(period.endExclusive);

  const stays = periodStays(keep(input.bookings), keep(input.groups), period);

  // Every qualifying stay of these guests up to the end of the month, once each (by id).
  const upToEnd = new Map<string, GuestRef>();
  for (const s of dedupeStays(keep(input.history.bookings), keep(input.history.groups))) {
    if (dayNumber(s.check_in) < endDay) upToEnd.set(s.id, s);
  }
  for (const s of stays) upToEnd.set(s.stay.id, s.stay);

  const stayCount = new Map<string, number>();
  for (const s of upToEnd.values()) {
    if (s.guest_id) stayCount.set(s.guest_id, (stayCount.get(s.guest_id) ?? 0) + 1);
  }
  const isRepeat = (id: string) => (stayCount.get(id) ?? 0) > 1;

  const guests = new Set<string>();
  let identifiedStays = 0;
  let repeatGuestStays = 0;
  for (const s of stays) {
    const g = s.stay.guest_id;
    if (!g) continue;
    identifiedStays += 1;
    guests.add(g);
    if (isRepeat(g)) repeatGuestStays += 1;
  }
  return {
    stays: stays.length,
    identifiedStays,
    unidentifiedStays: stays.length - identifiedStays,
    uniqueGuests: guests.size,
    repeatGuests: [...guests].filter(isRepeat).length,
    repeatGuestStays,
  };
}

// ── The report ──────────────────────────────────────────────────────────────

type ExpenseRow = Pick<Expense, "amount" | "expense_date" | "category">;

export interface MonthRows {
  bookings: readonly ReportBookingRow[];
  groups: readonly ReportGroupRow[];
  expenses: readonly ExpenseRow[];
}

export interface MonthlyReportInput {
  month: ReportMonth;
  /** Local "YYYY-MM-DD" of today: splits Outstanding into upcoming / started stays. */
  today: string;
  /** The property's rooms (`is_active` decides what is on sale; `created_at` how long the app has been in use). */
  rooms: readonly { is_active?: boolean | null; created_at?: string | null }[];
  /** Rows overlapping the selected month. */
  current: MonthRows;
  /** Rows overlapping the month before; null when they could not be loaded (comparisons are then left out). */
  previous: MonthRows | null;
  /** Rows of the month's guests up to month end; null while loading or failed (guest insights are then left out). */
  guestHistory: { bookings: readonly ReportBookingRow[]; groups: readonly ReportGroupRow[] } | null;
  propertyId?: string;
}

export interface MonthlyReport {
  month: ReportMonth;
  /** "October 2026". */
  label: string;
  /** "October". */
  monthName: string;
  /** "September 2026". */
  previousLabel: string;
  /** "September". */
  previousMonthName: string;
  days: number;
  /** Rooms on sale (active today). */
  roomCount: number;
  money: MoneySummary;
  metrics: BusinessMetrics;
  bySource: SourceShareRow[];
  /** False = no confirmed or completed stay in the month: the report shows "Not enough booking data". */
  hasStays: boolean;
  profitNote: { complete: boolean; text: string };
  /** Said when the property was set up part-way through the month or the month before; null otherwise. */
  setupNote: string | null;
  comparison: ReportComparison | null;
  guests: GuestInsights | null;
}

function figuresFor(
  period: Period,
  rows: MonthRows,
  roomCount: number,
  today: string,
): MonthFigures {
  return {
    money: computeMoneySummary({
      period,
      bookings: rows.bookings,
      groups: rows.groups,
      expenses: rows.expenses,
      today,
    }),
    metrics: computeBusinessMetrics({
      period,
      bookings: rows.bookings,
      groups: rows.groups,
      roomCount,
      expenses: rows.expenses,
    }),
  };
}

/** Says why a month is partial when the property joined part-way through it or the month before. */
export function setupNoteFor(
  rooms: readonly { created_at?: string | null }[],
  win: PeriodWindow,
): string | null {
  const first = firstRoomDay(rooms);
  if (first === null) return null;
  if (first > win.period.start)
    return `Your property was set up in the app on ${formatDayShort(first)}, so stays before then may be missing from this report.`;
  if (first > win.previous.start)
    return `Your property was set up in the app on ${formatDayShort(first)}, part-way through ${win.comparisonLabel}, so this month isn't compared with it.`;
  return null;
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const { month, today, rooms, current, previous, guestHistory, propertyId } = input;
  const win = reportWindow(month);
  const roomCount = rooms.filter((r) => r.is_active).length;

  const cur = figuresFor(win.period, current, roomCount, today);
  const comparison = previous
    ? compareMonthFigures(
        cur,
        figuresFor(win.previous, previous, roomCount, today),
        win.comparisonLabel,
        historyCoversPeriod(rooms, win.previous.start),
      )
    : null;
  const guests = guestHistory
    ? computeGuestInsights({
        period: win.period,
        bookings: current.bookings,
        groups: current.groups,
        history: guestHistory,
        propertyId,
      })
    : null;

  const prevMonth = shiftMonth(month, -1);
  return {
    month,
    label: win.label,
    monthName: monthName(month),
    previousLabel: win.comparisonLabel,
    previousMonthName: monthName(prevMonth),
    days: periodDays(win.period),
    roomCount,
    money: cur.money,
    metrics: cur.metrics,
    bySource: sourceShares(cur.money.bySource),
    hasStays: cur.money.stayCount > 0,
    profitNote: profitNote(cur.money.expenseCount),
    setupNote: setupNoteFor(rooms, win),
    comparison,
    guests,
  };
}

// ── Property Score and opportunities: current-state, never attributed to the month ──

/** At most this many opportunities; the same limit the Home dashboard starts with. */
export const REPORT_MAX_OPPORTUNITIES = DASHBOARD_MAX_OPPORTUNITIES;
export const OPPORTUNITIES_HEADING = "Current opportunities";

/** At most 3, in the engine's own rule order (payments, pricing, empty dates, expenses, sources). */
export function reportOpportunities(all: readonly RevenueOpportunity[]): RevenueOpportunity[] {
  return selectForDashboard(all, REPORT_MAX_OPPORTUNITIES).shown;
}

export function opportunitiesNote(report: Pick<MonthlyReport, "monthName">): string {
  return `Based on your property today, not on ${report.monthName}.`;
}

export interface ScoreSection {
  /** The score as it stands today (computePropertyScore), 0–100. */
  current: number;
  message: string;
  topActions: RecommendedAction[];
  /**
   * Always null, on purpose. The score reads today's calendar, prices and bookings and nothing stores it, so a
   * past month's score cannot be reconstructed. It is never estimated.
   */
  previous: null;
  note: string;
}

export const SCORE_HISTORY_NOTE =
  "This is today's score. Past scores aren't saved, so it isn't compared with an earlier month.";

/** The report's view of the existing Property Score: today's number and its top actions, nothing invented. */
export function scoreSection(result: PropertyScoreResult | null): ScoreSection | null {
  if (!result) return null;
  return {
    current: result.score,
    message: result.message,
    topActions: result.topActions.slice(0, 3),
    previous: null,
    note: SCORE_HISTORY_NOTE,
  };
}

// ── Owner takeaway: facts only ──────────────────────────────────────────────

export interface OwnerTakeaway {
  /** Measured facts about the month. No causes ("because your pricing is too high") are ever stated. */
  whatChanged: string[];
  /** The engine's own current opportunities, in its own order. */
  whatToDoNext: string[];
}

/**
 * A short, deterministic summary from the report's figures only. Every sentence is a measurement: the same
 * report always gives the same words, and nothing is inferred about why a figure moved.
 * @param opportunities the existing opportunities (`null` = could not be loaded: "what to do next" is left out
 *   rather than saying there is nothing to do).
 */
export function buildTakeaway(
  report: MonthlyReport,
  opportunities: readonly Pick<RevenueOpportunity, "title" | "actionLabel">[] | null,
): OwnerTakeaway {
  const { money, metrics, comparison: c, monthName: m, previousMonthName: prev } = report;
  const changed: string[] = [];

  if (!report.hasStays) {
    changed.push(`No confirmed or completed stays were recorded for ${m}.`);
  } else {
    const rev = c?.revenue;
    if (rev?.kind === "percent")
      changed.push(
        `Revenue ${rev.direction === "up" ? "increased" : "fell"} ${rev.value}% from ${prev}.`,
      );
    else if (rev?.kind === "flat") changed.push(`Revenue was about the same as in ${prev}.`);
    else changed.push(`Revenue was ${rupees(money.revenue)} in ${m}.`);

    const occ = c?.occupancy;
    if (occ?.kind === "points")
      changed.push(
        `Occupancy ${occ.direction === "up" ? "rose" : "fell"} from ${percentText(c!.previous.occupancyPercent)} to ${percentText(metrics.occupancyPercent)}.`,
      );
    else if (occ?.kind === "flat")
      changed.push(
        `Occupancy was ${percentText(metrics.occupancyPercent)}, about the same as in ${prev}.`,
      );
    else if (metrics.availableRoomNights > 0)
      changed.push(`Occupancy was ${percentText(metrics.occupancyPercent)}.`);

    if (money.outstanding.total > 0)
      changed.push(`${rupees(money.outstanding.total)} remains outstanding on qualifying stays.`);
  }

  if (money.expenseCount === 0) {
    changed.push(`No expenses were recorded in ${m}.`);
  } else if (c?.expenses.kind === "percent") {
    changed.push(
      `Recorded expenses ${c.expenses.direction === "up" ? "rose" : "fell"} ${c.expenses.value}% from ${prev}.`,
    );
  }

  if (report.hasStays) {
    const [top, second] = report.bySource;
    if (top && (!second || top.revenue > second.revenue)) {
      changed.push(
        top.group === "unknown"
          ? "The largest share of revenue has no booking source recorded."
          : `${top.label} generated the largest share of recorded revenue.`,
      );
    }
  }

  const g = report.guests;
  if (g && g.repeatGuests > 0)
    changed.push(`${plural(g.repeatGuests, "repeat guest")} stayed in ${m}.`);

  let next: string[] = [];
  if (opportunities) {
    next =
      opportunities.length === 0
        ? ["No current opportunities found."]
        : opportunities
            .slice(0, REPORT_MAX_OPPORTUNITIES)
            .map((o) => (o.actionLabel ? `${o.actionLabel}: ${o.title}` : o.title));
  }
  return { whatChanged: changed, whatToDoNext: next };
}

// ── Guest section wording ───────────────────────────────────────────────────

export type GuestSectionState = "no_stays" | "none_identified" | "measured";

/** Which message the guest section shows. A month without identified guests never reads as "no guests came". */
export function guestSectionState(g: GuestInsights): GuestSectionState {
  if (g.stays === 0) return "no_stays";
  if (g.uniqueGuests === 0) return "none_identified";
  return "measured";
}
