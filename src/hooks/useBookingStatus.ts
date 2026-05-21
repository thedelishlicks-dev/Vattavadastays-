import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Booking, BookingCharge } from "../types/database";

export function useBookingStatus(phone: string, bookingId: string) {
  return useQuery({
    queryKey: ["booking-status", phone, bookingId],
    queryFn: async () => {
      // Normalize phone — strip non-digits, allow partial match
      const digits = phone.replace(/\D/g, "");

      const { data: booking, error } = await supabase
        .from("bookings")
        .select("*, booking_charges(*)")
        .eq("id", bookingId)
        .single();

      if (error) throw error;
      if (!booking) throw new Error("Booking not found");

      // Verify phone matches — check last 10 digits
      const bookingDigits = booking.guest_phone.replace(/\D/g, "");
      const inputLast10 = digits.slice(-10);
      const bookingLast10 = bookingDigits.slice(-10);

      if (inputLast10 !== bookingLast10) {
        throw new Error("Phone number does not match this booking");
      }

      const charges = (booking.booking_charges ?? []) as BookingCharge[];
      const chargesTotal = charges.reduce(
        (sum: number, c: BookingCharge) => sum + c.qty * c.unit_price,
        0
      );

      return {
        booking: booking as Booking,
        charges,
        chargesTotal,
        balanceDue: Math.max(
          0,
          Number(booking.total_amount) +
            chargesTotal -
            Number(booking.advance_amount ?? 0)
        ),
      };
    },
    enabled: false, // only run when explicitly triggered
    retry: false,
  });
}
