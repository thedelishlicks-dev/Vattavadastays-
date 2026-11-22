import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { usePeriodData } from "@/hooks/useMoneyOverview";
import {
  fetchGuestHistoryRows,
  type GuestHistoryRow,
  type HistoryClient,
} from "@/lib/guestHistory";
import {
  buildMonthlyReport,
  periodGuestIds,
  reportWindow,
  type MonthlyReport,
  type ReportMonth,
} from "@/lib/monthlyReport";
import { todayLocal } from "@/lib/moneySummary";

/**
 * Data for the Monthly report. The SELECTED MONTH decides everything that is loaded:
 *  - the month's stays and expenses, and the previous month's, through the SAME loader and query keys as the
 *    Money overview (`usePeriodData`): never a "last N days" window, never the dashboard cache filtered by eye;
 *  - then, only for the guests who actually stayed that month, their stays up to the end of that month: one
 *    `guest_id IN (…)` query per table (chunked), never one query per booking (see lib/guestHistory.ts).
 * Nothing older than needed is downloaded and nothing is fetched per row.
 *
 * Failures (HANDOVER rule 36): the month failing is `loadFailed` and never shown as ₹0. The previous month
 * failing only removes the comparisons (`comparisonFailed`); the guest history failing only removes the guest
 * section (`guestsStatus: "error"`). The rest of the report stays usable.
 */
export function useMonthlyReport(
  property:
    | {
        id: string;
        rooms?: readonly { is_active?: boolean | null; created_at?: string | null }[] | null;
      }
    | undefined,
  month: ReportMonth,
): {
  win: ReturnType<typeof reportWindow>;
  report: MonthlyReport | null;
  isLoading: boolean;
  isSwitching: boolean;
  loadFailed: boolean;
  comparisonFailed: boolean;
  guestsStatus: "loading" | "error" | "ready";
  retry: () => void;
} {
  const { isAuthenticated } = useAuth();
  const propertyId = property?.id ?? "";
  const win = useMemo(() => reportWindow(month), [month]);
  const today = useMemo(() => todayLocal(), []);

  const d = usePeriodData(propertyId, win);
  const settled = d.ready && !d.isSwitching;

  const guestIds = useMemo(
    () => (settled ? periodGuestIds(d.bookings.data ?? [], d.groups.data ?? [], win.period) : []),
    [settled, d.bookings.data, d.groups.data, win.period],
  );
  const idsKey = guestIds.join(",");
  const needHistory = settled && guestIds.length > 0;
  const client = supabase as unknown as HistoryClient;

  // Keys follow the booking convention (HANDOVER rules): they start with "bookings" / "bookingGroups" and carry
  // the property id second, so every booking mutation refreshes them.
  const historyBookings = useQuery<GuestHistoryRow[]>({
    queryKey: ["bookings", propertyId, "guestHistory", win.period.endExclusive, idsKey],
    queryFn: () =>
      fetchGuestHistoryRows(client, "bookings", propertyId, guestIds, win.period.endExclusive),
    enabled: needHistory && !!propertyId && isAuthenticated,
  });
  const historyGroups = useQuery<GuestHistoryRow[]>({
    queryKey: ["bookingGroups", propertyId, "guestHistory", win.period.endExclusive, idsKey],
    queryFn: () =>
      fetchGuestHistoryRows(
        client,
        "booking_groups",
        propertyId,
        guestIds,
        win.period.endExclusive,
      ),
    enabled: needHistory && !!propertyId && isAuthenticated,
  });

  const guestsStatus: "loading" | "error" | "ready" = !settled
    ? "loading"
    : !needHistory
      ? "ready"
      : historyBookings.isError || historyGroups.isError
        ? "error"
        : historyBookings.isSuccess && historyGroups.isSuccess
          ? "ready"
          : "loading";

  const rooms = property?.rooms;
  const report = useMemo<MonthlyReport | null>(() => {
    if (!settled) return null;
    const history =
      guestsStatus !== "ready"
        ? null
        : needHistory
          ? { bookings: historyBookings.data ?? [], groups: historyGroups.data ?? [] }
          : { bookings: [], groups: [] };
    return buildMonthlyReport({
      month,
      today,
      rooms: rooms ?? [],
      propertyId,
      current: {
        bookings: d.bookings.data ?? [],
        groups: d.groups.data ?? [],
        expenses: d.expenses.data ?? [],
      },
      previous: d.previousReady
        ? {
            bookings: d.prevBookings.data ?? [],
            groups: d.prevGroups.data ?? [],
            expenses: d.prevExpenses.data ?? [],
          }
        : null,
      guestHistory: history,
    });
  }, [
    settled,
    month,
    today,
    rooms,
    propertyId,
    d.bookings.data,
    d.groups.data,
    d.expenses.data,
    d.previousReady,
    d.prevBookings.data,
    d.prevGroups.data,
    d.prevExpenses.data,
    guestsStatus,
    needHistory,
    historyBookings.data,
    historyGroups.data,
  ]);

  return {
    win,
    report,
    isLoading: d.isLoading,
    isSwitching: d.isSwitching,
    loadFailed: d.loadFailed,
    comparisonFailed: d.previousFailed,
    guestsStatus,
    retry: () => {
      d.retry();
      if (needHistory) {
        void historyBookings.refetch();
        void historyGroups.refetch();
      }
    },
  };
}
