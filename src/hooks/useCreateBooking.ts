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
      // Never send 'nights' — it is a generated column in Postgres.
      // Never send 'id' or 'created_at' — auto-generated.
      const payload = {
        property_id: data.property_id,
        room_id: data.room_id,
        guest_name: data.guest_name,
        guest_phone: data.guest_phone,
        guest_email: data.guest_email ?? null,
        guest_count: data.guest_count,
        check_in: data.check_in,
        check_out: data.check_out,
        room_price: data.room_price,
        extra_guest_charge: data.extra_guest_charge,
        total_amount: data.total_amount,
        payment_method: data.payment_method ?? null,
        status: "pending",
        is_paid: false,
      };

      const { data: booking, error } = await supabase
        .from("bookings")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        // Surface the real Supabase error message — not just generic fallback
        throw new Error(error.message ?? "Supabase insert failed");
      }

      return booking.id;
    },
    onSuccess: (_bookingId, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["availability", variables.room_id],
      });
    },
  });
};
