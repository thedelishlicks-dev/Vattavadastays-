import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface CreateBookingInput {
  propertyId: string;
  roomId: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
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

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBookingInput): Promise<CreateBookingResult> => {
      // Step 1: Load room to get pricing
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("base_price, extra_guest_price, weekend_multiplier, max_guests")
        .eq("id", input.roomId)
        .eq("is_active", true)
        .single();

      if (roomError || !room) throw new Error("Room not found.");

      if (input.guestCount > room.max_guests) {
        throw new Error(`Maximum ${room.max_guests} guests allowed for this room.`);
      }

      // Step 2: Check availability for all requested dates
      const checkIn = new Date(input.checkIn);
      const checkOut = new Date(input.checkOut);
      const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);

      if (nights < 1) throw new Error("Check-out must be after check-in.");

      const dates: string[] = [];
      for (let i = 0; i < nights; i++) {
        const d = new Date(checkIn);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split("T")[0]);
      }

      const { data: availability, error: availError } = await supabase
        .from("availability")
        .select("date, is_available, price_override")
        .eq("room_id", input.roomId)
        .in("date", dates);

      if (availError) throw new Error("Could not check availability.");

      // Every requested date must have a row with is_available = true
      for (const date of dates) {
        const row = availability?.find((a) => a.date === date);
        if (!row || !row.is_available) {
          throw new Error(`Room is not available on ${date}.`);
        }
      }

      // Step 3: Calculate price
      let roomPrice = 0;
      for (const date of dates) {
        const row = availability?.find((a) => a.date === date);
        if (row?.price_override) {
          roomPrice += Number(row.price_override);
        } else {
          const d = new Date(date);
          const dow = d.getDay(); // 5=Fri, 6=Sat
          const isWeekend = dow === 5 || dow === 6;
          const multiplier = isWeekend ? (room.weekend_multiplier ?? 1) : 1;
          roomPrice += room.base_price * multiplier;
        }
      }

      const extraGuestCharge =
        input.guestCount > 1
          ? (input.guestCount - 1) * (room.extra_guest_price ?? 0) * nights
          : 0;

      const totalAmount = roomPrice + extraGuestCharge;

      // Step 4: Insert booking
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          property_id: input.propertyId,
          room_id: input.roomId,
          guest_name: input.guestName,
          guest_phone: input.guestPhone,
          guest_email: input.guestEmail ?? null,
          guest_count: input.guestCount,
          check_in: input.checkIn,
          check_out: input.checkOut,
          room_price: roomPrice,
          extra_guest_charge: extraGuestCharge,
          total_amount: totalAmount,
          status: "pending",
          payment_method: input.paymentMethod ?? "Cash on Arrival",
          is_paid: false,
        })
        .select("id")
        .single();

      if (bookingError || !booking) {
        throw new Error("Booking failed. Please try again.");
      }

      // Step 5: Mark dates unavailable
      await supabase
        .from("availability")
        .update({ is_available: false })
        .eq("room_id", input.roomId)
        .in("date", dates);

      return {
        bookingId: booking.id,
        totalAmount,
        roomPrice,
        extraGuestCharge,
        nights,
      };
    },

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["availability", variables.roomId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
