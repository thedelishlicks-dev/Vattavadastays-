import { useMemo } from "react";
import { useBookingGroups, useBookings, useBookingTotal } from "@/hooks/useBookings";
import { useExpenses } from "@/hooks/useExpenses";
import { useRoomRates } from "@/hooks/useRoomRates";
import { localDateString } from "@/lib/expenses";
import { monthPeriods } from "@/lib/dashboardMetrics";
import {
  computePropertyScore,
  summariseActivity,
  type PropertyScoreResult,
  type ScoreProperty,
} from "@/lib/propertyScore";

/**
 * The Property Score for the owner's property.
 *
 * It asks for exactly the same data the Home dashboard already loads (same window, same query keys), so React
 * Query serves it from the cache: Home makes no extra request for the score. The score itself is pure:
 * see lib/propertyScore.ts.
 *
 * A query that failed does not count against the owner: its items are marked unavailable and left out of the
 * maximum (`loadFailed` tells the card to say so).
 */
export function usePropertyScore(property: (ScoreProperty & { id: string }) | undefined): {
  result: PropertyScoreResult | null;
  /** First load of anything the score needs. */
  isLoading: boolean;
  /** Something the score needs could not be loaded. */
  loadFailed: boolean;
} {
  const id = property?.id ?? "";
  const periods = useMemo(() => monthPeriods(new Date()), []);
  const today = useMemo(() => localDateString(new Date()), []);

  const bookings = useBookings(id, { from: periods.previousStart });
  const groups = useBookingGroups(id, { from: periods.previousStart, slim: true });
  const total = useBookingTotal(id);
  const rates = useRoomRates(id || undefined);
  const expenses = useExpenses(id, {
    startDate: periods.previousStart,
    endDate: periods.currentLastDay,
  });

  const queries = [bookings, groups, total, rates, expenses];
  const isLoading = !!id && queries.some((q) => q.isLoading);
  const loadFailed = !!id && queries.some((q) => q.isError);

  const result = useMemo(() => {
    if (!property) return null;
    const activity =
      bookings.isSuccess && groups.isSuccess
        ? summariseActivity(bookings.data ?? [], groups.data ?? [], today)
        : null;
    return computePropertyScore(property, {
      today,
      seasonRates: rates.isSuccess ? rates.data : null,
      activity,
      bookingTotal: total.isSuccess ? total.data : null,
      expenseCount: expenses.isSuccess ? (expenses.data ?? []).length : null,
    });
  }, [
    property,
    today,
    bookings.isSuccess,
    bookings.data,
    groups.isSuccess,
    groups.data,
    rates.isSuccess,
    rates.data,
    total.isSuccess,
    total.data,
    expenses.isSuccess,
    expenses.data,
  ]);

  return { result, isLoading, loadFailed };
}
