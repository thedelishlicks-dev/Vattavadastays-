import { useCallback, useMemo, useState } from "react";
import { WINDOW_STEP_MONTHS, windowStart } from "@/lib/historyWindow";

/**
 * How far back a page loads bookings: the last 6 months at first, then 6 more each time the owner
 * asks, or everything. `from` is a "YYYY-MM-DD" check-in date, or undefined for no limit.
 */
export function useHistoryWindow() {
  const [months, setMonths] = useState<number | "all">(WINDOW_STEP_MONTHS);
  const from = useMemo(() => (months === "all" ? undefined : windowStart(new Date(), months)), [months]);
  const loadMore = useCallback(() => setMonths((m) => (m === "all" ? m : m + WINDOW_STEP_MONTHS)), []);
  const loadAll = useCallback(() => setMonths("all"), []);
  return { from, isAll: months === "all", loadMore, loadAll };
}
