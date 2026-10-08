 // src/lib/paginate.ts
//
// Supabase/PostgREST silently returns at most 1,000 rows per request (the
// project default). The admin screens used to fetch "all bookings" in one
// request, so a property that passes 1,000 bookings would quietly lose its
// oldest ones — wrong totals on Payments / Agents with no error shown.
//
// fetchAllRows() keeps asking for the next page until it has everything. In the
// normal case (< 1,000 rows) it is still exactly ONE request: the first page
// asks the server for the total count, so we know when to stop without a
// wasted empty request. Works even if the server's cap is lower than ours.

export const PAGE_SIZE = 1000;

export type Page<T> = {
  data: T[] | null;
  error: unknown;
  /** Total matching rows — request with { count: "exact" } on the first call. */
  count: number | null;
};

export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;

  for (;;) {
    const { data, error, count } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) throw error;

    const batch = data ?? [];
    if (total === null) total = count;
    rows.push(...batch);

    if (batch.length === 0) break; // nothing more (also guards against loops)
    if (total !== null) {
      if (rows.length >= total) break;
    } else if (batch.length < pageSize) {
      break; // no count available: a short page means we're done
    }
  }
  return rows;
}
