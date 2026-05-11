import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export const useAvailabilityRange = (
  roomId: string,
  startDate: string, // "YYYY-MM-DD"
  endDate: string    // "YYYY-MM-DD"
) => {
  return useQuery({
    queryKey: ["availability-range", roomId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability")
        .select("date, is_available, price_override, note")
        .eq("room_id", roomId)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!roomId && !!startDate && !!endDate,
  });
};
