import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

interface BookingData {
  property_id: string;
  room_id: string;
  guest_name: string;
  guest_phone: string;
  guest_email?: string;
  guest_count: number;
  check_in: string;
  check_out: string;
  room_price: number;
  extra_guest_charge: number;
  total_amount: number;
  payment_method?: string;
}

export const useCreateBooking = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: BookingData) => {
      const { data: booking, error } = await supabase
        .from("bookings")
        .insert({
          ...data,
          status: "pending",
          is_paid: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      return booking.id;
    },
    onSuccess: (_bookingId, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["availability", variables.room_id],
      });
    },
  });
};
