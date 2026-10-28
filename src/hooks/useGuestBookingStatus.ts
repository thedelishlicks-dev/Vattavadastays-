import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { statusFromTokenLookup } from "@/lib/guestBookingStatus";

/**
 * The CURRENT status of the guest's own booking, read through its secret tracking token
 * (lookup_booking_by_token). Guests cannot read the bookings table, and this returns
 * nothing but the status. Re-checks every minute and when the guest comes back to the tab,
 * so the "Request sent!" card moves to "Confirmed" without a reload.
 *
 * Returns undefined while loading and null when the token matched nothing; callers treat
 * both as "still awaiting confirmation".
 */
export function useGuestBookingStatus(trackingToken: string | null | undefined) {
  return useQuery({
    queryKey: ["guest-booking-status", trackingToken],
    enabled: !!trackingToken,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc("lookup_booking_by_token", { p_token: trackingToken });
      if (error) throw error;
      return statusFromTokenLookup(data as Parameters<typeof statusFromTokenLookup>[0]);
    },
  });
}
