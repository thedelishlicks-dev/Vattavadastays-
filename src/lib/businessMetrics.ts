/**
 * Business metrics (revenue, occupancy, ADR, RevPAR, expenses, estimated profit).
 *
 * Pure functions only (no React, no Supabase), unit-tested in businessMetrics.test.ts.
 *
 * ONE definition of "what a booking is worth": every figure here goes through `computeBalance` /
 * `chargesSum` in balance.ts (net total = room total + extra charges − discount, never below 0;
 * balance and refund due from the advance). Nothing in this file re-derives `total + extras − discount`.
 *
 * Rules
 *  - Only CONFIRMED and COMPLETED stays count. Pending (not yet confirmed, may expire) and cancelled
 *    stays add no revenue, no cash, no outstanding amount and no occupied nights.
 *  - A multi-room booking is billed ONCE, from its `booking_groups` row (total, discount and extras
 *    live there). Its room rows (`bookings.group_id` set) only supply occupied room nights, so
 *    revenue is never double counted. A room row whose group was not supplied is billed as a standalone
 *    booking instead (it cannot be double counted: its group is absent).
 *  - A group's status decides whether its rooms count (rooms of a cancelled group do not).
 *  - The report period is [start, endExclusive) in "YYYY-MM-DD" local dates. A stay is made of its
 *    nights (check-in day up to the day BEFORE check-out). Money for a stay that crosses the period
 *    boundary is split by nights: revenue, cash and outstanding are each × (nights inside the period ÷
 *    nights of the stay). The app stores no payment dates, so "cash collected" is the stay's `advance_amount`
 *    shared by nights, not cash received during the period.
 *  - Revenue is the whole net stay total (room + extras − discount). ADR and RevPAR use ACCOMMODATION
 *    revenue instead: the room total less the discount, without extra charges (meals, add-ons), so
 *    the rate reflects the room, not what was sold with it. (The discount is taken off the room because
 *    the app does not record which part of the bill it applied to.) Both are 0, never NaN or Infinity,
 *    when there is nothing to divide by.
 *  - Estimated operating profit = revenue − expenses recorded in the period. It is an estimate: agent
 *    commission is not deducted unless the owner also recorded it as an expense (ota_commission), and
 *    nothing is accrued for depreciation, tax or unrecorded costs.
 */

import { chargesSum, computeBalance, type ChargeLike } from "./balance";
import type { Expense } from "../types/database";

// ── Types ───────────────────────────────────────────────────────────────────

type MoneyLike = number | string | null | undefined;

/** The fields of a `bookings` row these functions read (a full Booking satisfies it). */
export interface BookingLike {
  id: string;
  group_id?: string | null;
  check_in: string;
  check_out: string;
  status?: string | null;
  total_amount: MoneyLike;
  discount_amount?: MoneyLike;
  advance_amount?: MoneyLike;
  booking_charges?: readonly ChargeLike[] | null;
}

/** The fields of a `booking_groups` row these functions read (a full BookingGroup satisfies it). */
export interface GroupLike {
  id: string;
  check_in: string;
  check_out: string;
  status?: string | null;
  total_amount: MoneyLike;
  discount_amount?: MoneyLike;
  advance_amount?: MoneyLike;
  booking_charges?: readonly ChargeLike[] | null;
}

/** [start, endExclusive) as "YYYY-MM-DD". */
export interface Period {
  start: string;
  endExclusive: string;
}

export interface BusinessMetricsInput {
  period: Period;
  bookings: readonly BookingLike[];
  groups?: readonly GroupLike[];
  /** Rooms that can be sold (active rooms). Available room nights = this × days in the period. */
  roomCount: number;
  /** Room nights taken out of sale in the period (blocked dates, maintenance). Default 0. */
  outOfServiceRoomNights?: number;
  expenses?: readonly Pick<Expense, "amount" | "expense_date">[];
}

export interface BusinessMetrics {
  /** Net stay value (room + extras − discount) of confirmed/completed stays, by nights in the period. */
  revenue: number;
  /** Money received on those stays (advance_amount), by nights in the period. */
  cashCollected: number;
  /** Still to collect on those stays (never negative). */
  outstanding: number;
  /** Paid above the net total on those stays: to refund or adjust. */
  refundDue: number;
  occupiedRoomNights: number;
  availableRoomNights: number;
  /** 0–100, 2 decimals. */
  occupancyPercent: number;
  /** Room total less discount (no extra charges) of those stays, by nights in the period. */
  accommodationRevenue: number;
  /** accommodation revenue ÷ occupied room nights (₹, 2 decimals). */
  adr: number;
  /** accommodation revenue ÷ available room nights (₹, 2 decimals). */
  revPar: number;
  totalExpenses: number;
  /** revenue − totalExpenses. Can be negative. */
  estimatedOperatingProfit: number;
}

// ── Status and date helpers ──────────────────────────────────────────────────

/** Statuses that earn revenue and occupy rooms. */
export const REVENUE_STATUSES: readonly string[] = ["confirmed", "completed"];

export function countsAsStay(status: string | null | undefined): boolean {
  return REVENUE_STATUSES.includes(status ?? "");
}

const DAY_MS = 86_400_000;

/** Whole days since 1970-01-01 for a "YYYY-MM-DD" (or ISO timestamp) string. Timezone-proof (UTC maths on date parts). */
export function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Nights of a stay (check-out day not included). Never negative. */
export function stayNights(checkIn: string, checkOut: string): number {
  return Math.max(0, dayNumber(checkOut) - dayNumber(checkIn));
}

/** Days in [start, endExclusive). */
export function periodDays(period: Period): number {
  return Math.max(0, dayNumber(period.endExclusive) - dayNumber(period.start));
}

/** Nights of the stay that fall inside the period. */
export function nightsInPeriod(checkIn: string, checkOut: string, period: Period): number {
  const from = Math.max(dayNumber(checkIn), dayNumber(period.start));
  const to = Math.min(dayNumber(checkOut), dayNumber(period.endExclusive));
  return Math.max(0, to - from);
}

/**
 * Share of a stay's money that belongs to the period: nights inside ÷ nights of the stay. A stay with
 * no nights (check-in = check-out) is all in the period holding its check-in day, or all outside.
 */
export function periodShare(checkIn: string, checkOut: string, period: Period): number {
  const total = stayNights(checkIn, checkOut);
  if (total === 0) {
    const day = dayNumber(checkIn);
    return day >= dayNumber(period.start) && day < dayNumber(period.endExclusive) ? 1 : 0;
  }
  return nightsInPeriod(checkIn, checkOut, period) / total;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function safeDiv(a: number, b: number): number {
  return b > 0 && Number.isFinite(a / b) ? a / b : 0;
}

// ── Billing units: what is billed once ───────────────────────────────────────

interface BillingUnit {
  check_in: string;
  check_out: string;
  net: number;
  /** Room total less discount; extras excluded. */
  accommodation: number;
  balance: number;
  refundDue: number;
  advance: number;
}

function unitFor(row: BookingLike | GroupLike): BillingUnit {
  const b = computeBalance({
    roomTotal: Number(row.total_amount),
    chargesTotal: chargesSum(row.booking_charges),
    discount: Number(row.discount_amount ?? 0),
    advance: Number(row.advance_amount ?? 0),
  });
  const advance = Number(row.advance_amount ?? 0);
  const room = computeBalance({
    roomTotal: Number(row.total_amount),
    chargesTotal: 0,
    discount: Number(row.discount_amount ?? 0),
    advance: 0,
  });
  return {
    check_in: row.check_in,
    check_out: row.check_out,
    net: b.netTotal,
    accommodation: room.netTotal,
    balance: b.balance,
    refundDue: b.refundDue,
    advance: Number.isFinite(advance) ? Math.max(0, advance) : 0,
  };
}

/** Net value of ONE stay (room + extras − discount, never below 0) from balance.ts; the whole stay, not split by period. */
export function stayNetTotal(row: BookingLike | GroupLike): number {
  return unitFor(row).net;
}

/**
 * The confirmed/completed stays, each exactly once: every counted group, plus every counted standalone
 * booking. The room rows of a supplied group are left out (their group carries the money), and a room whose
 * group was not supplied stands on its own. Cancelled and pending stays never appear.
 * Generic, so callers keep the extra fields of their own rows (source, guest, …).
 */
export function dedupeStays<B extends BookingLike, G extends GroupLike>(
  bookings: readonly B[],
  groups: readonly G[],
): (B | G)[] {
  const groupIds = new Set(groups.map((g) => g.id));
  const stays: (B | G)[] = [];
  for (const g of groups) if (countsAsStay(g.status)) stays.push(g);
  for (const b of bookings) {
    const isMemberOfSuppliedGroup = !!b.group_id && groupIds.has(b.group_id);
    if (!isMemberOfSuppliedGroup && countsAsStay(b.status)) stays.push(b);
  }
  return stays;
}

/** Standalone bookings and groups that count as stays: each is billed exactly once. */
function billingUnits(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
): BillingUnit[] {
  return dedupeStays(bookings, groups).map(unitFor);
}

/**
 * One counted stay with its money, restricted to the period: each figure is the stay's whole figure × the
 * share of its nights inside the period (same split as every function below). Stays with no night in the
 * period are left out. Used by the Money overview to group the SAME numbers by source, by started/upcoming…
 * so a breakdown can never disagree with the headline.
 */
export interface PeriodStay<S> {
  stay: S;
  /** nights inside the period ÷ nights of the stay (0 < share ≤ 1). */
  share: number;
  revenue: number;
  collected: number;
  balance: number;
  refundDue: number;
  /** Balance of the WHOLE stay (not split by period): whether money is due on it at all. */
  stayBalance: number;
}

export function periodStays<B extends BookingLike, G extends GroupLike>(
  bookings: readonly B[],
  groups: readonly G[],
  period: Period,
): PeriodStay<B | G>[] {
  const out: PeriodStay<B | G>[] = [];
  for (const stay of dedupeStays(bookings, groups)) {
    const share = periodShare(stay.check_in, stay.check_out, period);
    if (share <= 0) continue;
    const u = unitFor(stay);
    out.push({
      stay,
      share,
      revenue: u.net * share,
      collected: u.advance * share,
      balance: u.balance * share,
      refundDue: u.refundDue * share,
      stayBalance: u.balance,
    });
  }
  return out;
}

// ── The individual metrics ───────────────────────────────────────────────────

function sumShare(units: BillingUnit[], period: Period, pick: (u: BillingUnit) => number): number {
  return round2(
    units.reduce((s, u) => s + pick(u) * periodShare(u.check_in, u.check_out, period), 0),
  );
}

/** Revenue: net value (room + extras − discount) of confirmed/completed stays, by nights in the period. */
export function bookingRevenue(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
  period: Period,
): number {
  return sumShare(billingUnits(bookings, groups), period, (u) => u.net);
}

/** Room revenue for ADR / RevPAR: room total less discount, extras excluded, by nights in the period. */
export function accommodationRevenue(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
  period: Period,
): number {
  return sumShare(billingUnits(bookings, groups), period, (u) => u.accommodation);
}

/**
 * Unpaid balance of confirmed/completed stays whose check-in is on or before `startedBy` (the guest has
 * arrived, so the money is due). Whole balances, not split by month. Pending and cancelled never count.
 */
export function openBalances(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
  startedBy: string,
): { count: number; total: number } {
  const due = billingUnits(bookings, groups).filter(
    (u) => u.balance > 0 && dayNumber(u.check_in) <= dayNumber(startedBy),
  );
  return { count: due.length, total: round2(due.reduce((s, u) => s + u.balance, 0)) };
}

/**
 * Money still due on confirmed/completed stays, upcoming AND already started (never cancelled, never pending),
 * from the same balance calculation as everywhere else (balance.ts). Whole balances, not split by month.
 * `startedCount/startedTotal` is the part whose check-in is on or before `today`.
 */
export function outstandingBalances(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
  today: string,
): { count: number; total: number; startedCount: number; startedTotal: number } {
  const due = billingUnits(bookings, groups).filter((u) => u.balance > 0);
  const started = due.filter((u) => dayNumber(u.check_in) <= dayNumber(today));
  const sum = (list: BillingUnit[]) => round2(list.reduce((t, u) => t + u.balance, 0));
  return {
    count: due.length,
    total: sum(due),
    startedCount: started.length,
    startedTotal: sum(started),
  };
}

/** Money received (advance_amount) on confirmed/completed stays, by nights in the period. */
export function bookingCashCollected(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
  period: Period,
): number {
  return sumShare(billingUnits(bookings, groups), period, (u) => u.advance);
}

/** Still to collect (never negative) on confirmed/completed stays, by nights in the period. */
export function outstandingAmount(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
  period: Period,
): number {
  return sumShare(billingUnits(bookings, groups), period, (u) => u.balance);
}

/** Overpayment on confirmed/completed stays, by nights in the period. */
export function refundDueAmount(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
  period: Period,
): number {
  return sumShare(billingUnits(bookings, groups), period, (u) => u.refundDue);
}

/**
 * Room nights sold inside the period: one per room per night, for every room row of a confirmed or
 * completed stay. A room of a group follows its group's status; a room without a supplied group
 * follows its own.
 */
export function occupiedRoomNights(
  bookings: readonly BookingLike[],
  groups: readonly GroupLike[],
  period: Period,
): number {
  const groupStatus = new Map(groups.map((g) => [g.id, g.status]));
  let nights = 0;
  for (const b of bookings) {
    const status =
      b.group_id && groupStatus.has(b.group_id) ? groupStatus.get(b.group_id) : b.status;
    if (countsAsStay(status)) nights += nightsInPeriod(b.check_in, b.check_out, period);
  }
  return nights;
}

/** Room nights on sale: rooms × days in the period, less any nights taken out of service. Never negative. */
export function availableRoomNights(
  roomCount: number,
  period: Period,
  outOfServiceRoomNights = 0,
): number {
  const rooms = Number.isFinite(roomCount) ? Math.max(0, Math.floor(roomCount)) : 0;
  return Math.max(0, rooms * periodDays(period) - Math.max(0, outOfServiceRoomNights || 0));
}

/** occupied ÷ available × 100, 2 decimals. 0 when nothing is available. */
export function occupancyPercent(occupiedNights: number, availableNights: number): number {
  return round2(safeDiv(occupiedNights, availableNights) * 100);
}

/** Average daily rate: (accommodation) revenue ÷ occupied room nights. 0 when no room night was sold. */
export function averageDailyRate(revenue: number, occupiedNights: number): number {
  return round2(safeDiv(revenue, occupiedNights));
}

/** (Accommodation) revenue per available room night. 0 when nothing is available. */
export function revPar(revenue: number, availableNights: number): number {
  return round2(safeDiv(revenue, availableNights));
}

/** Expenses dated inside [start, endExclusive). */
export function totalExpenses(
  expenses: readonly Pick<Expense, "amount" | "expense_date">[],
  period: Period,
): number {
  const from = dayNumber(period.start);
  const to = dayNumber(period.endExclusive);
  return round2(
    expenses.reduce((s, e) => {
      const day = dayNumber(e.expense_date);
      const amount = Number(e.amount);
      return day >= from && day < to && Number.isFinite(amount) ? s + amount : s;
    }, 0),
  );
}

/** Revenue − expenses. An estimate (see the header). Can be negative. */
export function estimatedOperatingProfit(revenue: number, expensesTotal: number): number {
  return round2(revenue - expensesTotal);
}

// ── Everything at once ──────────────────────────────────────────────────────

export function computeBusinessMetrics(input: BusinessMetricsInput): BusinessMetrics {
  const { period, bookings, roomCount } = input;
  const groups = input.groups ?? [];
  const revenue = bookingRevenue(bookings, groups, period);
  const accommodation = accommodationRevenue(bookings, groups, period);
  const occupied = occupiedRoomNights(bookings, groups, period);
  const available = availableRoomNights(roomCount, period, input.outOfServiceRoomNights);
  const expensesTotal = totalExpenses(input.expenses ?? [], period);
  return {
    revenue,
    cashCollected: bookingCashCollected(bookings, groups, period),
    outstanding: outstandingAmount(bookings, groups, period),
    refundDue: refundDueAmount(bookings, groups, period),
    occupiedRoomNights: occupied,
    availableRoomNights: available,
    occupancyPercent: occupancyPercent(occupied, available),
    accommodationRevenue: accommodation,
    adr: averageDailyRate(accommodation, occupied),
    revPar: revPar(accommodation, available),
    totalExpenses: expensesTotal,
    estimatedOperatingProfit: estimatedOperatingProfit(revenue, expensesTotal),
  };
}
