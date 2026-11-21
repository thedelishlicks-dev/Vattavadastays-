import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useBookingGroups, useBookings, useBookingTotal } from "@/hooks/useBookings";
import { useExpenses } from "@/hooks/useExpenses";
import { useRoomRates } from "@/hooks/useRoomRates";
import { monthPeriods } from "@/lib/dashboardMetrics";
import { localDateString } from "@/lib/expenses";
import {
  UPCOMING_WINDOW_DAYS,
  addDaysYmd,
  computeRevenueOpportunities,
  selectForDashboard,
  type RevenueOpportunity,
  type RuleRoom,
} from "@/lib/revenueIntelligence";
import type { CalAvailRow } from "@/lib/calendarState";

/**
 * Revenue opportunities for the owner's property: the rules live in lib/revenueIntelligence.ts; this hook only
 * gathers their data.
 *
 * Four of the five inputs are the SAME queries the Home dashboard and the Property Score already run (same
 * keys, same window), so React Query serves them from the cache. The one query this hook introduces is the
 * blocked-nights read below (one small request: unavailable nights of the active rooms for the next 30 days).
 *
 * A query that failed is passed to the rules as `null`, which silences every rule that needs it: a failure is
 * never read as "nothing found".
 */
export function useRevenueIntelligence(
  property:
    | { id: string; rooms?: readonly (RuleRoom & { is_active?: boolean | null })[] | null }
    | undefined,
): {
  /** Every opportunity, in display order. */
  opportunities: RevenueOpportunity[];
  /** What the dashboard shows first (at most 3). */
  shown: RevenueOpportunity[];
  hiddenCount: number;
  isLoading: boolean;
  loadFailed: boolean;
} {
  const { isAuthenticated } = useAuth();
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

  const rooms = useMemo(
    () => (property?.rooms ?? []).filter((r) => r.is_active !== false),
    [property?.rooms],
  );
  const roomIds = useMemo(() => rooms.map((r) => r.id), [rooms]);
  const windowEnd = addDaysYmd(today, UPCOMING_WINDOW_DAYS - 1);

  // The only new request. The key starts with "availability-range" so blocking dates refreshes it.
  const blocked = useQuery<CalAvailRow[]>({
    queryKey: ["availability-range", "revenue-intelligence", roomIds.join(","), today, windowEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability")
        .select("room_id, date, note")
        .in("room_id", roomIds)
        .eq("is_available", false)
        .gte("date", today)
        .lte("date", windowEnd);
      if (error) throw new Error(error.message);
      return (data ?? []) as CalAvailRow[];
    },
    enabled: !!id && isAuthenticated && roomIds.length > 0,
  });

  const queries = [
    bookings,
    groups,
    total,
    rates,
    expenses,
    ...(roomIds.length > 0 ? [blocked] : []),
  ];
  const isLoading = !!id && queries.some((q) => q.isLoading);
  const loadFailed = !!id && queries.some((q) => q.isError);

  const opportunities = useMemo(() => {
    if (!property) return [];
    return computeRevenueOpportunities({
      today,
      currentMonth: periods.current,
      rooms,
      bookings: bookings.isSuccess ? bookings.data : null,
      groups: groups.isSuccess ? groups.data : null,
      bookingTotal: total.isSuccess ? total.data : null,
      rates: rates.isSuccess ? rates.data : null,
      blockedNights: roomIds.length === 0 ? [] : blocked.isSuccess ? blocked.data : null,
      expenses: expenses.isSuccess ? expenses.data : null,
    });
  }, [
    property,
    today,
    periods,
    rooms,
    roomIds.length,
    bookings.isSuccess,
    bookings.data,
    groups.isSuccess,
    groups.data,
    total.isSuccess,
    total.data,
    rates.isSuccess,
    rates.data,
    blocked.isSuccess,
    blocked.data,
    expenses.isSuccess,
    expenses.data,
  ]);

  const { shown, hiddenCount } = useMemo(() => selectForDashboard(opportunities), [opportunities]);
  return { opportunities, shown, hiddenCount, isLoading, loadFailed };
}
