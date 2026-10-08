import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { fetchAllRows, PAGE_SIZE } from "../lib/paginate";
import type { BookingGroup } from "../types/database";

export interface BookingFilters {
  status?: string;
  /** check_in on/after this date (YYYY-MM-DD) */
  from?: string;
  /** check_in on/before this date (YYYY-MM-DD) */
  to?: string;
  /**
   * Only stays that overlap [overlapFrom, overlapTo] — i.e. check_in <= overlapTo
   * AND check_out >= overlapFrom. Used by the Calendar so it downloads one
   * month, not the property's whole history.
   */
  overlapFrom?: string;
  overlapTo?: string;
  /** Include extra charges (default true). The Calendar doesn't need them. */
  withCharges?: boolean;
}

export const useBookings = (propertyId: string, filters?: BookingFilters) => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    // Key must keep starting with "bookings": every mutation invalidates
    // ["bookings"] with exact:false, which refreshes all windows at once.
    queryKey: ["bookings", propertyId, filters ?? null],
    queryFn: async () => {
      const select = filters?.withCharges === false ? "*" : "*, booking_charges(*)";
      // Paginated: PostgREST caps one request at 1,000 rows (see lib/paginate.ts).
      // Secondary order on id keeps page boundaries stable when check_in ties.
      return fetchAllRows<any>((from, to) => {
        let query = supabase
          .from("bookings")
          .select(select, { count: "exact" })
          .eq("property_id", propertyId)
          .order("check_in", { ascending: false })
          .order("id");
        if (filters?.status) query = query.eq("status", filters.status);
        if (filters?.from) query = query.gte("check_in", filters.from);
        if (filters?.to) query = query.lte("check_in", filters.to);
        if (filters?.overlapTo) query = query.lte("check_in", filters.overlapTo);
        if (filters?.overlapFrom) query = query.gte("check_out", filters.overlapFrom);
        return query.range(from, to);
      });
    },
    enabled: !!propertyId && isAuthenticated,
  });
};

export interface BookingGroupOptions {
  /** Only groups whose check_in is on/after this date (YYYY-MM-DD). */
  from?: string;
  /**
   * Download only the ids of each group's rooms instead of every column.
   * Dashboard / Payments / Agents only need ids + a count — the full room rows
   * were already being downloaded a second time via useBookings().
   * The Bookings page needs the full rows, so it leaves this off.
   */
  slim?: boolean;
}

export const useBookingGroups = (propertyId: string, options?: BookingGroupOptions) => {
  const { isAuthenticated } = useAuth();
  return useQuery<BookingGroup[]>({
    queryKey: ["bookingGroups", propertyId, options ?? null],
    queryFn: async () => {
      const select = options?.slim
        ? "*, bookings(id), booking_charges(*)"
        : "*, bookings(*), booking_charges(*)";
      const rows = await fetchAllRows<any>((from, to) => {
        let query = supabase
          .from("booking_groups")
          .select(select, { count: "exact" })
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .order("id");
        if (options?.from) query = query.gte("check_in", options.from);
        return query.range(from, to);
      });
      return rows as BookingGroup[];
    },
    enabled: !!propertyId && isAuthenticated,
  });
};

/**
 * Total number of booking rows for the property (all time, incl. cancelled and
 * each room of a group booking) — the same number `bookings.length` used to
 * give, but via a count-only request with no rows downloaded.
 */
export const useBookingTotal = (propertyId: string) => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["bookings", propertyId, "total"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!propertyId && isAuthenticated,
  });
};

export { PAGE_SIZE };
