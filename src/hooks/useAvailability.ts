import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export const useAvailability = (
  roomId: string,
  checkIn: string,
  checkOut: string
) => {
  return useQuery({
    queryKey: ["availability", roomId, checkIn, checkOut],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability")
        .select("date, is_available")
        .eq("room_id", roomId)
        .gte("date", checkIn)
        .lt("date", checkOut);
      if (error) throw error;

      const unavailableDates = (data ?? [])
        .filter((d) => !d.is_available)
        .map((d) => d.date);

      // Also check confirmed bookings overlapping this range
      const { data: bookings, error: bError } = await supabase
        .from("bookings")
        .select("check_in, check_out")
        .eq("room_id", roomId)
        .neq("status", "cancelled")
        .lt("check_in", checkOut)
        .gt("check_out", checkIn);
      if (bError) throw bError;

      return {
        available: unavailableDates.length === 0 && (!bookings || bookings.length === 0),
        unavailableDates,
        bookedRanges: bookings ?? [],
      };
    },
    enabled: !!roomId && !!checkIn && !!checkOut,
  });
};
