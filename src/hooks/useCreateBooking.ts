import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateBookingInput {
  propertyId: string;
  roomId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestCount: number;
  checkIn: string;   // "YYYY-MM-DD"
  checkOut: string;  // "YYYY-MM-DD"
  paymentMethod?: "UPI" | "Bank Transfer" | "Cash on Arrival";
}

export interface CreateBookingResult {
  bookingId: string;
  totalAmount: number;
  roomPrice: number;
  extraGuestCharge: number;
  nights: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useCreateBooking
 *
 * Calls the `create_booking_atomic` Postgres RPC which:
 *   1. Locks the availability rows for the requested dates (FOR UPDATE)
 *   2. Verifies every night is available — rolls back if any night is taken
 *   3. Marks those dates unavailable
 *   4. Inserts the booking
 *
 * This replaces the previous pattern of checking availability in JS then
 * inserting, which had a race condition where two guests could simultaneously
 * book the same room/dates.
 *
 * The RPC returns { booking_id, total_amount, ... } on success or
 * { error: "..." } on failure. We normalise both into the standard
 * TanStack Query error/data shape so callers don't need to inspect the result.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBookingInput): Promise<CreateBookingResult> => {
      const { data, error } = await supabase.rpc("create_booking_atomic", {
        p_property_id:    input.propertyId,
        p_room_id:        input.roomId,
        p_guest_name:     input.guestName,
        p_guest_phone:    input.guestPhone,
        p_guest_email:    input.guestEmail,
        p_guest_count:    input.guestCount,
        p_check_in:       input.checkIn,
        p_check_out:      input.checkOut,
        p_payment_method: input.paymentMethod ?? "Cash on Arrival",
      });

      // Supabase client-level error (network, auth, etc.)
      if (error) {
        throw new Error(error.message);
      }

      // The RPC returns { error: "..." } when the booking itself fails
      // (unavailable date, invalid guest count, etc.)
      if (data?.error) {
        throw new Error(data.error as string);
      }

      if (!data?.booking_id) {
        throw new Error("Booking failed — no booking ID returned.");
      }

      return {
        bookingId:         data.booking_id as string,
        totalAmount:       data.total_amount as number,
        roomPrice:         data.room_price as number,
        extraGuestCharge:  data.extra_guest_charge as number,
        nights:            data.nights as number,
      };
    },

    onSuccess: (_data, variables) => {
      // Invalidate availability so the calendar re-fetches and shows the
      // newly blocked dates immediately.
      queryClient.invalidateQueries({
        queryKey: ["availability", variables.roomId],
      });

      // Invalidate bookings list in case the owner dashboard is open
      // in another tab.
      queryClient.invalidateQueries({
        queryKey: ["bookings"],
      });
    },
  });
}
