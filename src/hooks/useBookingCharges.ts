import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { BookingCharge } from "../types/database";

export function useBookingCharges(bookingId: string) {
  return useQuery({
    queryKey: ["booking-charges", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_charges")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as BookingCharge[];
    },
    enabled: !!bookingId,
  });
}

export function useAddCharge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (charge: {
      booking_id: string;
      description: string;
      qty: number;
      unit_price: number;
    }) => {
      const { data, error } = await supabase
        .from("booking_charges")
        .insert(charge)
        .select()
        .single();
      if (error) throw error;
      return data as BookingCharge;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["booking-charges", variables.booking_id],
      });
    },
  });
}

export function useDeleteCharge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      bookingId,
    }: {
      id: string;
      bookingId: string;
    }) => {
      const { error } = await supabase
        .from("booking_charges")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return bookingId;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["booking-charges", variables.bookingId],
      });
    },
  });
}
