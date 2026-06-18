import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface RoomBookingInput {
  roomId: string;
  guestCount: number; // guests assigned to this specific room
}

export interface CreateBookingInput {
  propertyId: string;
  /** For single-room bookings, pass one item. For group bookings, pass multiple. */
  rooms: RoomBookingInput[];
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  /** Total guest count across all rooms */
  totalGuests: number;
  checkIn: string;  // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  paymentMethod?: "UPI" | "Bank Transfer" | "Cash on Arrival";
}

export interface RoomBookingResult {
  bookingId: string;
  roomId: string;
  roomName: string;
  totalAmount: number;
  roomPrice: number;
  extraGuestCharge: number;
}

export interface CreateBookingResult {
  /** The first booking's ID — used as the primary reference shown to the guest */
  bookingId: string;
  /** Short group reference shown to guest: first 8 chars of first booking ID */
  groupRef: string;
  totalAmount: number;
  rooms: RoomBookingResult[];
  nights: number;
}

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBookingInput): Promise<CreateBookingResult> => {
      const checkIn = new Date(input.checkIn);
      const checkOut = new Date(input.checkOut);
      const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000);

      if (nights < 1) throw new Error("Check-out must be after check-in.");

      // Build the list of dates for the stay
      const dates: string[] = [];
      for (let i = 0; i < nights; i++) {
        const d = new Date(checkIn);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().split("T")[0]);
      }

      const roomIds = input.rooms.map((r) => r.roomId);

      // ── Step 1: Load all rooms' details in one query ──
      const { data: roomDetails, error: roomsErr } = await supabase
        .from("rooms")
        .select("id, name, base_price, extra_guest_price, weekend_multiplier, max_guests")
        .in("id", roomIds)
        .eq("is_active", true);

      if (roomsErr || !roomDetails) throw new Error("Could not load room details.");

      // Validate guest counts per room.
      // max_guests is the number of guests INCLUDED in the base price, not
      // a hard cap — guests can exceed it up to EXTRA_GUEST_ALLOWANCE more,
      // charged at extra_guest_price per night. This must match the ceiling
      // used by the adults stepper in RoomDetail.tsx (room.max_guests + 4).
      const EXTRA_GUEST_ALLOWANCE = 4;
      for (const ri of input.rooms) {
        const room = roomDetails.find((r) => r.id === ri.roomId);
        if (!room) throw new Error("One or more selected rooms are no longer available.");
        const absoluteCap = room.max_guests + EXTRA_GUEST_ALLOWANCE;
        if (ri.guestCount > absoluteCap) {
          throw new Error(`"${room.name}" can host a maximum of ${absoluteCap} guests (including extras).`);
        }
      }

      // ── Step 2: Check availability for ALL rooms in ONE query ──
      const { data: avail, error: availErr } = await supabase
        .from("availability")
        .select("room_id, date, is_available, price_override")
        .in("room_id", roomIds)
        .in("date", dates);

      if (availErr) throw new Error("Could not check availability.");

      // Verify every room is available on every date
      for (const ri of input.rooms) {
        const room = roomDetails.find((r) => r.id === ri.roomId)!;
        for (const date of dates) {
          const row = avail?.find((a) => a.room_id === ri.roomId && a.date === date);
          if (!row || !row.is_available) {
            throw new Error(`"${room.name}" is not available on ${date}.`);
          }
        }
      }

      // ── Step 3: Calculate price per room ──
      const roomPrices: { roomId: string; roomPrice: number; extraGuestCharge: number; totalAmount: number }[] = [];

      for (const ri of input.rooms) {
        const room = roomDetails.find((r) => r.id === ri.roomId)!;
        let roomPrice = 0;

        for (const date of dates) {
          const row = avail?.find((a) => a.room_id === ri.roomId && a.date === date);
          if (row?.price_override) {
            roomPrice += Number(row.price_override);
          } else {
            const d = new Date(date);
            const dow = d.getDay();
            const isWeekend = dow === 5 || dow === 6;
            const multiplier = isWeekend ? (room.weekend_multiplier ?? 1) : 1;
            roomPrice += room.base_price * multiplier;
          }
        }

        const extraGuestCharge =
          Math.max(0, ri.guestCount - room.max_guests) * (room.extra_guest_price ?? 0) * nights;

        roomPrices.push({
          roomId: ri.roomId,
          roomPrice,
          extraGuestCharge,
          totalAmount: roomPrice + extraGuestCharge,
        });
      }

      // ── Step 4: Insert booking(s) ──
      // Single room: plain booking, same as before.
      // Multiple rooms: create a booking_groups row first (same shape the
      // owner-side AddGroupBookingModal uses), then insert bookings with
      // group_id set so the owner dashboard renders one group card instead
      // of N separate cards.
      const grandTotal = roomPrices.reduce((sum, r) => sum + r.totalAmount, 0);
      let groupId: string | null = null;

      if (input.rooms.length > 1) {
        const { data: groupData, error: groupErr } = await supabase
          .from("booking_groups")
          .insert({
            property_id: input.propertyId,
            group_reference: "GRP-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
            guest_name: input.guestName,
            guest_phone: input.guestPhone,
            guest_email: input.guestEmail ?? null,
            guest_count: input.totalGuests,
            check_in: input.checkIn,
            check_out: input.checkOut,
            total_amount: grandTotal,
            advance_amount: 0,
            discount_amount: 0,
            status: "pending",
            payment_method: input.paymentMethod ?? "Cash on Arrival",
            is_paid: false,
          })
          .select("id")
          .single();

        if (groupErr || !groupData) {
          throw new Error("Could not create group booking. Please try again.");
        }
        groupId = groupData.id;
      }

      const bookingInserts = input.rooms.map((ri, idx) => {
        const pricing = roomPrices[idx];
        return {
          property_id: input.propertyId,
          room_id: ri.roomId,
          guest_name: input.guestName,
          guest_phone: input.guestPhone,
          guest_email: input.guestEmail ?? null,
          guest_count: ri.guestCount,
          check_in: input.checkIn,
          check_out: input.checkOut,
          room_price: pricing.roomPrice,
          extra_guest_charge: pricing.extraGuestCharge,
          total_amount: pricing.totalAmount,
          status: "pending",
          payment_method: input.paymentMethod ?? "Cash on Arrival",
          is_paid: false,
          ...(groupId ? { group_id: groupId } : {}),
        };
      });

      const { data: insertedBookings, error: bookingErr } = await supabase
        .from("bookings")
        .insert(bookingInserts)
        .select("id, room_id");

      if (bookingErr || !insertedBookings || insertedBookings.length === 0) {
        // Roll back the group row if booking insert failed, so we don't leave
        // an orphaned empty group behind.
        if (groupId) {
          await supabase.from("booking_groups").delete().eq("id", groupId);
        }
        throw new Error("Booking failed. Please try again.");
      }

      // ── Step 5: Mark all dates unavailable for all rooms ──
      // Build upsert rows for every room × date combination
      const unavailRows = roomIds.flatMap((roomId) =>
        dates.map((date) => ({
          room_id: roomId,
          date,
          is_available: false,
        }))
      );

      await supabase
        .from("availability")
        .upsert(unavailRows, { onConflict: "room_id,date" });

      // ── Build result ──
      const firstBookingId = insertedBookings[0].id;

      // For group bookings, look up the group_reference we just created so the
      // guest sees the same reference the owner sees on their dashboard.
      let displayRef = `#${firstBookingId.slice(0, 8).toUpperCase()}`;
      if (groupId) {
        const { data: groupRow } = await supabase
          .from("booking_groups")
          .select("group_reference")
          .eq("id", groupId)
          .single();
        if (groupRow?.group_reference) {
          displayRef = groupRow.group_reference;
        }
      }

      const roomResults: RoomBookingResult[] = insertedBookings.map((b) => {
        const pricing = roomPrices.find((p) => p.roomId === b.room_id)!;
        const room = roomDetails.find((r) => r.id === b.room_id)!;
        return {
          bookingId: b.id,
          roomId: b.room_id,
          roomName: room.name,
          totalAmount: pricing.totalAmount,
          roomPrice: pricing.roomPrice,
          extraGuestCharge: pricing.extraGuestCharge,
        };
      });

      return {
        bookingId: firstBookingId,
        groupRef: displayRef,
        totalAmount: grandTotal,
        rooms: roomResults,
        nights,
      };
    },

    onSuccess: (_data, variables) => {
      variables.rooms.forEach((r) => {
        queryClient.invalidateQueries({ queryKey: ["availability", r.roomId] });
      });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["bookingGroups"] });
      queryClient.invalidateQueries({ queryKey: ["guest-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["guestAvailability"] });
    },
  });
}
