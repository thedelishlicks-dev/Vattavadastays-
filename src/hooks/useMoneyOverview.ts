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
  type ReportingPeriod,
} from "@/lib/moneySummary";

/**
 * Data for the Money overview. The SELECTED PERIOD decides what is loaded, not the dashboard's generic
 * booking window: stays that overlap the period (useBookings / useBookingGroups `overlapFrom`/`overlapTo`)
 * and expenses dated inside it (useExpenses `startDate`/`endDate`), all scoped to the property. The previous
 * period is loaded the same way, only for the comparison. Nothing older is downloaded.
 *
 * Caching: switching "This month" ⇄ "Last month" reuses the cached window (same key), and `keepPrevious`
 * keeps the old figures on screen while a new window loads. `isSwitching` is true during that time so the
 * screen can show a skeleton rather than last period's numbers under this period's name.
 *
 * Failures: the current period failing is `loadFailed` (never shown as ₹0). The previous period failing
 * only hides the comparisons.
 */
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

  const win = (p: { start: string }, lastDay: string) => ({
    overlapFrom: p.start,
    overlapTo: lastDay,
    keepPrevious: true,
  });
  const curWin = win(rp.period, rp.lastDay);
  const prevWin = win(rp.previous, rp.previousLastDay);

  const bookings = useBookings(propertyId, curWin);
  const groups = useBookingGroups(propertyId, { ...curWin, slim: true });
  const expenses = useExpenses(propertyId, { startDate: rp.period.start, endDate: rp.lastDay });

  const prevBookings = useBookings(propertyId, prevWin);
  const prevGroups = useBookingGroups(propertyId, { ...prevWin, slim: true });
  const prevExpenses = useExpenses(propertyId, {
    startDate: rp.previous.start,
    endDate: rp.previousLastDay,
  });

  const main = [bookings, groups, expenses];
  const loadFailed = main.some((q) => q.isError);
  const ready = main.every((q) => q.isSuccess);
  const isLoading = main.some((q) => q.isPending);
  // keepPrevious rows from the other period are still on screen: not this period's figures yet.
  const isSwitching = bookings.isPlaceholderData || groups.isPlaceholderData;

  const summary = useMemo<MoneySummary | null>(() => {
    if (!ready || isSwitching) return null;
    return computeMoneySummary({
      period: rp.period,
      bookings: bookings.data ?? [],
      groups: groups.data ?? [],
      expenses: expenses.data ?? [],
      today,
    });
  }, [ready, isSwitching, rp, today, bookings.data, groups.data, expenses.data]);

  const prevReady =
    prevBookings.isSuccess &&
    prevGroups.isSuccess &&
    prevExpenses.isSuccess &&
    !prevBookings.isPlaceholderData &&
    !prevGroups.isPlaceholderData;

  const comparisons = useMemo<MoneyComparisons | null>(() => {
    if (!summary || !prevReady) return null;
    const previous = computeMoneySummary({
      period: rp.previous,
      bookings: prevBookings.data ?? [],
      groups: prevGroups.data ?? [],
      expenses: prevExpenses.data ?? [],
      today,
    });
    return compareMoney(summary, previous, rp.comparisonLabel);
  }, [summary, prevReady, rp, today, prevBookings.data, prevGroups.data, prevExpenses.data]);

  return {
    rp,
    summary,
    comparisons,
    isLoading,
    isSwitching,
    loadFailed,
    retry: () => {
      void bookings.refetch();
      void groups.refetch();
      void expenses.refetch();
    },
  };
}
