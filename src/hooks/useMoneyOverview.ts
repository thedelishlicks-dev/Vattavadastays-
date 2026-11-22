import { useMemo } from "react";
import { useBookingGroups, useBookings } from "@/hooks/useBookings";
import { useExpenses } from "@/hooks/useExpenses";
import {
  compareMoney,
  computeMoneySummary,
  reportingPeriod,
  todayLocal,
  type MoneyComparisons,
  type MoneySummary,
  type PeriodKey,
  type PeriodWindow,
  type ReportingPeriod,
} from "@/lib/moneySummary";

/**
 * Loads ONE period and the one before it, for the Money overview and the Monthly report. The SELECTED
 * PERIOD decides what is loaded, not the dashboard's generic booking window: stays that overlap the period
 * (useBookings / useBookingGroups `overlapFrom`/`overlapTo`) and expenses dated inside it (useExpenses
 * `startDate`/`endDate`), all scoped to the property. The previous period is loaded the same way, only for the
 * comparison. Nothing older is downloaded.
 *
 * Both screens go through here on purpose: the same period gives the same query keys, so a month opened on
 * Money ("Last month") is served from the cache when the report for that month is opened, and the two screens
 * can never read different rows for the same month.
 *
 * Caching: switching periods reuses the cached window (same key), and `keepPrevious` keeps the old figures on
 * screen while a new window loads. `isSwitching` is true during that time so the screen can show a skeleton
 * rather than last period's numbers under this period's name.
 *
 * Failures: the current period failing is `loadFailed` (never shown as ₹0). The previous period failing only
 * hides the comparisons (`previousFailed`).
 */
export function usePeriodData(propertyId: string, win: PeriodWindow) {
  const overlap = (p: { start: string }, lastDay: string) => ({
    overlapFrom: p.start,
    overlapTo: lastDay,
    keepPrevious: true,
  });
  const curWin = overlap(win.period, win.lastDay);
  const prevWin = overlap(win.previous, win.previousLastDay);

  const bookings = useBookings(propertyId, curWin);
  const groups = useBookingGroups(propertyId, { ...curWin, slim: true });
  const expenses = useExpenses(propertyId, { startDate: win.period.start, endDate: win.lastDay });

  const prevBookings = useBookings(propertyId, prevWin);
  const prevGroups = useBookingGroups(propertyId, { ...prevWin, slim: true });
  const prevExpenses = useExpenses(propertyId, {
    startDate: win.previous.start,
    endDate: win.previousLastDay,
  });

  const main = [bookings, groups, expenses];
  const loadFailed = main.some((q) => q.isError);
  const ready = main.every((q) => q.isSuccess);
  const isLoading = main.some((q) => q.isPending);
  // keepPrevious rows from the other period are still on screen: not this period's figures yet.
  const isSwitching = bookings.isPlaceholderData || groups.isPlaceholderData;

  const prev = [prevBookings, prevGroups, prevExpenses];
  const previousFailed = prev.some((q) => q.isError);
  const previousReady =
    prev.every((q) => q.isSuccess) &&
    !prevBookings.isPlaceholderData &&
    !prevGroups.isPlaceholderData;

  return {
    bookings,
    groups,
    expenses,
    prevBookings,
    prevGroups,
    prevExpenses,
    ready,
    isLoading,
    isSwitching,
    loadFailed,
    previousReady,
    previousFailed,
    retry: () => {
      void bookings.refetch();
      void groups.refetch();
      void expenses.refetch();
    },
  };
}

export function useMoneyOverview(
  propertyId: string,
  key: PeriodKey,
): {
  rp: ReportingPeriod;
  summary: MoneySummary | null;
  comparisons: MoneyComparisons | null;
  isLoading: boolean;
  isSwitching: boolean;
  loadFailed: boolean;
  retry: () => void;
} {
  const rp = useMemo(() => reportingPeriod(key, new Date()), [key]);
  const today = useMemo(() => todayLocal(), [key]);

  const d = usePeriodData(propertyId, rp);
  const { ready, isSwitching, previousReady } = d;

  const summary = useMemo<MoneySummary | null>(() => {
    if (!ready || isSwitching) return null;
    return computeMoneySummary({
      period: rp.period,
      bookings: d.bookings.data ?? [],
      groups: d.groups.data ?? [],
      expenses: d.expenses.data ?? [],
      today,
    });
  }, [ready, isSwitching, rp, today, d.bookings.data, d.groups.data, d.expenses.data]);

  const comparisons = useMemo<MoneyComparisons | null>(() => {
    if (!summary || !previousReady) return null;
    const previous = computeMoneySummary({
      period: rp.previous,
      bookings: d.prevBookings.data ?? [],
      groups: d.prevGroups.data ?? [],
      expenses: d.prevExpenses.data ?? [],
      today,
    });
    return compareMoney(summary, previous, rp.comparisonLabel);
  }, [
    summary,
    previousReady,
    rp,
    today,
    d.prevBookings.data,
    d.prevGroups.data,
    d.prevExpenses.data,
  ]);

  return {
    rp,
    summary,
    comparisons,
    isLoading: d.isLoading,
    isSwitching,
    loadFailed: d.loadFailed,
    retry: d.retry,
  };
}
