// src/lib/pagination.ts
//
// Supabase returns at most 1,000 rows per request and does NOT say when it has cut
// the list short. A busy multi-room property has more than 1,000 occupied nights
// across 6–12 months, so an unpaged availability query silently dropped later
// dates — which then looked free on the guest's date picker.

export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: unknown };

/**
 * Collect every row by asking for successive ranges until a short page comes back.
 * `fetchPage(from, to)` must use a STABLE order (e.g. .order("room_id").order("date")),
 * otherwise rows can repeat or go missing between pages. Throws the first error.
 * `maxPages` stops a runaway loop (50 pages = 50,000 rows).
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
  maxPages = 50,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  return all;
}
