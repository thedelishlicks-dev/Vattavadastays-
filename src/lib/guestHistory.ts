/**
 * Loading the stay history of the guests who stayed in a month, for the Monthly report's repeat-guest numbers.
 * No React; the Supabase client is passed in, so the query shape is unit-tested with a recording fake
 * (guestHistory.test.ts) instead of a live database.
 *
 * Why this shape (no N+1, no all-history download):
 *  - The month's guests are already known (their `guest_id`s come from the month's own stays), so ONE query per
 *    table asks for all of their rows at once with `guest_id IN (…)`. Never one query per booking or per guest.
 *  - A long list of ids is split into chunks so the request URL stays short (a UUID is 36 characters). A
 *    typical small property has a few dozen guests a month: one chunk, one request per table.
 *  - Only the columns the stay rules read are selected, and only rows up to the END of the month
 *    (`check_in < endExclusive`): a later booking can never change a past month's report.
 *  - Scoped to the property as well as by RLS, and paginated (`fetchAllRows`, PostgREST's 1,000-row cap).
 */

import { fetchAllRows, type Page } from "./paginate";

/** Guest ids per request. 50 ids ≈ 1.9 KB of URL, well under every proxy limit. */
export const GUEST_ID_CHUNK = 50;

/** Everything `dedupeStays` / `computeGuestInsights` reads, and nothing else (no money columns beyond the total). */
export const HISTORY_COLUMNS =
  "id, property_id, group_id, guest_id, status, check_in, check_out, total_amount";
export const HISTORY_GROUP_COLUMNS =
  "id, property_id, guest_id, status, check_in, check_out, total_amount";

export interface GuestHistoryRow {
  id: string;
  property_id: string | null;
  group_id?: string | null;
  guest_id: string | null;
  status: string | null;
  check_in: string;
  check_out: string;
  total_amount: number | string | null;
}

/** The slice of the Supabase query builder this module uses (the real client satisfies it structurally). */
export interface HistoryQuery {
  select(columns: string, options?: { count: "exact" }): HistoryQuery;
  eq(column: string, value: string): HistoryQuery;
  in(column: string, values: readonly string[]): HistoryQuery;
  lt(column: string, value: string): HistoryQuery;
  order(column: string, options?: { ascending: boolean }): HistoryQuery;
  range(from: number, to: number): PromiseLike<Page<GuestHistoryRow>>;
}
export interface HistoryClient {
  from(table: string): HistoryQuery;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * All `table` rows (bookings or booking_groups) of these guests at this property that start before
 * `endExclusive`. Empty ids means no request at all.
 */
export async function fetchGuestHistoryRows(
  client: HistoryClient,
  table: "bookings" | "booking_groups",
  propertyId: string,
  guestIds: readonly string[],
  endExclusive: string,
): Promise<GuestHistoryRow[]> {
  if (!propertyId || guestIds.length === 0) return [];
  const columns = table === "bookings" ? HISTORY_COLUMNS : HISTORY_GROUP_COLUMNS;
  const parts = await Promise.all(
    chunk(guestIds, GUEST_ID_CHUNK).map((ids) =>
      fetchAllRows<GuestHistoryRow>((from, to) =>
        client
          .from(table)
          .select(columns, { count: "exact" })
          .eq("property_id", propertyId)
          .in("guest_id", ids)
          .lt("check_in", endExclusive)
          .order("check_in", { ascending: false })
          .order("id")
          .range(from, to),
      ),
    ),
  );
  return parts.flat();
}
