/**
 * Pure logic behind the owner Home dashboard (Business snapshot + Revenue opportunities).
 * No React, no Supabase; tested in dashboardMetrics.test.ts.
 *
 * The numbers themselves come from businessMetrics.ts (which reuses balance.ts). This file only decides
 *  - which two months to compare,
 *  - whether a comparison is trustworthy enough to show, and how to word it.
 * (The "opportunities" rules live in revenueIntelligence.ts.)
 */

import { monthRange } from "./expenses";
import type { BusinessMetrics, Period } from "./businessMetrics";

// ── Periods ──────────────────────────────────────────────────────────────────

export interface MonthPeriods {
  current: Period;
  previous: Period;
  /** Last calendar day of the current month (inclusive), for date-range queries. */
  currentLastDay: string;
  /** First day of the previous month. */
  previousStart: string;
}

/** This calendar month and the one before it, from the LOCAL date (never UTC: India is ahead). */
export function monthPeriods(now: Date): MonthPeriods {
  const cur = monthRange(now);
  const prev = monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return {
    current: { start: cur.start, endExclusive: cur.endExclusive },
    previous: { start: prev.start, endExclusive: prev.endExclusive },
    currentLastDay: cur.lastDay,
    previousStart: prev.start,
  };
}

// ── Comparisons ──────────────────────────────────────────────────────────────

export type TrendDirection = "up" | "down" | "flat";

export interface Comparison {
  direction: TrendDirection;
  /** e.g. "↑ 18% vs last month" */
  text: string;
}

function build(direction: TrendDirection, magnitude: string): Comparison {
  if (direction === "flat") return { direction, text: "No change vs last month" };
  return { direction, text: `${direction === "up" ? "↑" : "↓"} ${magnitude} vs last month` };
}

/** Percentage change, whole number; null when there is no usable baseline (zero, negative or not a number). */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "↑ 18% vs last month"; null when there is nothing meaningful to compare with. */
export function percentComparison(current: number, previous: number): Comparison | null {
  const pct = percentChange(current, previous);
  if (pct === null) return null;
  if (pct === 0) return build("flat", "");
  return build(pct > 0 ? "up" : "down", `${Math.abs(pct)}%`);
}

/** Occupancy is already a percentage, so the change is in percentage POINTS: "↑ 7 pts vs last month". */
export function pointsComparison(current: number, previous: number): Comparison | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const pts = Math.round(current - previous);
  if (pts === 0) return build("flat", "");
  return build(pts > 0 ? "up" : "down", `${Math.abs(pts)} pts`);
}

// ── Business snapshot ────────────────────────────────────────────────────────

export interface SnapshotMetric {
  /** null = nothing to show a figure for (shown as "—" with the reason). */
  value: number | null;
  comparison: Comparison | null;
}

export interface BusinessSnapshotData {
  revenue: SnapshotMetric;
  occupancy: SnapshotMetric & { occupiedNights: number; availableNights: number };
  adr: SnapshotMetric;
  /** value is null while no expense is recorded this month: revenue alone is not profit. */
  profit: SnapshotMetric & { expensesRecorded: boolean };
}

/**
 * @param historyCoversPrevious  false when the property was not yet set up for the whole previous month
 *   (its first room is newer than that month's first day). Then last month is a partial month and every
 *   comparison is hidden, because "↑ 300%" against a half-month would mislead.
 *
 * A comparison is shown only when its baseline is real:
 *  - revenue: last month's revenue > 0
 *  - occupancy: last month had rooms on sale and at least one night sold
 *  - ADR: nights sold in BOTH months
 *  - profit: expenses recorded in BOTH months and last month's profit > 0 (a % against a loss or a
 *    month with no costs entered is meaningless)
 */
export function buildBusinessSnapshot(
  current: BusinessMetrics,
  previous: BusinessMetrics,
  historyCoversPrevious: boolean,
): BusinessSnapshotData {
  const trust = historyCoversPrevious;
  const expensesRecorded = current.totalExpenses > 0;

  const adrValue = current.occupiedRoomNights > 0 ? current.adr : null;
  const profitValue = expensesRecorded ? current.estimatedOperatingProfit : null;

  return {
    revenue: {
      value: current.revenue,
      comparison:
        trust && previous.revenue > 0 ? percentComparison(current.revenue, previous.revenue) : null,
    },
    occupancy: {
      value: current.availableRoomNights > 0 ? current.occupancyPercent : null,
      occupiedNights: current.occupiedRoomNights,
      availableNights: current.availableRoomNights,
      comparison:
        trust &&
        current.availableRoomNights > 0 &&
        previous.availableRoomNights > 0 &&
        previous.occupiedRoomNights > 0
          ? pointsComparison(current.occupancyPercent, previous.occupancyPercent)
          : null,
    },
    adr: {
      value: adrValue,
      comparison:
        trust && adrValue !== null && previous.occupiedRoomNights > 0
          ? percentComparison(adrValue, previous.adr)
          : null,
    },
    profit: {
      value: profitValue,
      expensesRecorded,
      comparison:
        trust &&
        profitValue !== null &&
        previous.totalExpenses > 0 &&
        previous.estimatedOperatingProfit > 0
          ? percentComparison(profitValue, previous.estimatedOperatingProfit)
          : null,
    },
  };
}
