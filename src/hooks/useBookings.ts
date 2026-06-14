import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

interface BookingFilters {
  status?: string;
  from?: string;
  to?: string;
}

export const useBookings = (propertyId: string, filters?: BookingFilters) => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["bookings", propertyId, filters ?? null],
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("*")
        .eq("property_id", propertyId)
        .order("check_in", { ascending: false });
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.from) query = query.gte("check_in", filters.from);
      if (filters?.to) query = query.lte("check_in", filters.to);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!propertyId && isAuthenticated,
  });
};

export const useBookingGroups = (propertyId: string) => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["bookingGroups", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_groups")
        .select("*, bookings(*)")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!propertyId && isAuthenticated,
  });
};
