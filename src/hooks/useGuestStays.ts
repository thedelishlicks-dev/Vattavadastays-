import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { fetchAllRows } from "@/lib/paginate";
import { guestStats, type GuestStats } from "@/lib/guestIdentity";
import type { Booking, BookingGroup } from "@/types/database";

/**
 * One guest's stay history, loaded ONLY for the booking the owner has open (never for a list of bookings, so
 * there is no N+1): two small indexed queries by `guest_id` (their bookings and their booking groups), scoped
 * to the property as well as by RLS. The numbers come from lib/guestIdentity.ts, which reuses the canonical
 * revenue rules (balance.ts via businessMetrics), so "total revenue" here is the same figure Money shows.
 *
 * Query keys start with "bookings" / "bookingGroups" on purpose: every booking mutation invalidates by those
 * prefixes, so recording a payment or changing a phone refreshes this too (HANDOVER rule on query keys).
 */
export function useGuestStays(propertyId: string, guestId: string | null | undefined) {
  const { isAuthenticated } = useAuth();
  const enabled = !!propertyId && !!guestId && isAuthenticated;

  const bookings = useQuery({
    queryKey: ["bookings", "guest", propertyId, guestId ?? null],
    queryFn: () =>
      fetchAllRows<Booking>((from, to) =>
        supabase
          .from("bookings")
          .select("*, booking_charges(*)", { count: "exact" })
          .eq("property_id", propertyId)
          .eq("guest_id", guestId as string)
          .order("check_in", { ascending: false })
          .order("id")
          .range(from, to),
      ),
    enabled,
  });

  const groups = useQuery({
    queryKey: ["bookingGroups", "guest", propertyId, guestId ?? null],
    queryFn: () =>
      fetchAllRows<BookingGroup>((from, to) =>
        supabase
          .from("booking_groups")
          .select("*, booking_charges(*)", { count: "exact" })
          .eq("property_id", propertyId)
          .eq("guest_id", guestId as string)
          .order("check_in", { ascending: false })
          .order("id")
          .range(from, to),
      ),
    enabled,
  });

  const stats = useMemo<GuestStats | null>(
    () =>
      bookings.isSuccess && groups.isSuccess
        ? guestStats(bookings.data ?? [], groups.data ?? [])
        : null,
    [bookings.isSuccess, groups.isSuccess, bookings.data, groups.data],
  );

  return {
    stats,
    isLoading: enabled && (bookings.isPending || groups.isPending),
    isError: bookings.isError || groups.isError,
  };
}
