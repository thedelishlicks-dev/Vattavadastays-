import { createServerFn } from "@tanstack/react-start";
import { createClient } from "../lib/supabase";
import { getRequest } from "@tanstack/react-start/server";
import { Database, Booking, Availability } from "../types/database";

export const getPropertyBySubdomain = createServerFn({ method: "GET" })
  .inputValidator((subdomain: string) => subdomain)
  .handler(async ({ data: subdomain }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    const { data: property, error } = await supabase
      .from("properties")
      .select(
        `
        *,
        rooms (*)
      `,
      )
      .eq("subdomain", subdomain)
      .eq("is_active", true)
      .eq("rooms.is_active", true)
      .order("base_price", { foreignTable: "rooms", ascending: true })
      .maybeSingle();

    if (error) {
      console.error("Error fetching property by subdomain:", error);
      return null;
    }

    return property;
  });

export const getRoomById = createServerFn({ method: "GET" })
  .inputValidator((roomId: string) => roomId)
  .handler(async ({ data: roomId }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    const { data: room, error } = await supabase
      .from("rooms")
      .select(
        `
        *,
        property:properties (*)
      `,
      )
      .eq("id", roomId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching room by ID:", error);
      return null;
    }

    return room;
  });

export const checkRoomAvailability = createServerFn({ method: "GET" })
  .inputValidator((data: { roomId: string; checkIn: string; checkOut: string }) => data)
  .handler(async ({ data: { roomId, checkIn, checkOut } }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    // 1. Check availability table for manual blocks
    const { data: availabilityBlocks, error: availabilityError } = await supabase
      .from("availability")
      .select("date")
      .eq("room_id", roomId)
      .eq("is_available", false)
      .gte("date", checkIn)
      .lt("date", checkOut);

    if (availabilityError) {
      console.error("Error checking availability table:", availabilityError);
      throw new Error("Failed to check availability");
    }

    // 2. Check bookings table for confirmed/overlapping bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("check_in, check_out")
      .eq("room_id", roomId)
      .neq("status", "cancelled")
      .lt("check_in", checkOut)
      .gt("check_out", checkIn);

    if (bookingsError) {
      console.error("Error checking bookings table:", bookingsError);
      throw new Error("Failed to check bookings");
    }

    const unavailableDates = new Set<string>();

    // Add dates from availability blocks
    (availabilityBlocks as Pick<Availability, "date">[])?.forEach((block) => {
      unavailableDates.add(block.date);
    });

    // For overlapping bookings, we need to determine which specific dates are blocked.
    (bookings as Pick<Booking, "check_in" | "check_out">[])?.forEach((booking) => {
      const start = new Date(booking.check_in);
      const end = new Date(booking.check_out);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        // Only add if it's within our requested range
        if (dateStr >= checkIn && dateStr < checkOut) {
          unavailableDates.add(dateStr);
        }
      }
    });

    const unavailableDatesArray = Array.from(unavailableDates).sort();

    return {
      available: unavailableDatesArray.length === 0,
      unavailableDates: unavailableDatesArray,
    };
  });

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      property_id: string;
      room_id: string;
      guest_name: string;
      guest_phone: string;
      guest_email: string;
      guest_count: number;
      check_in: string;
      check_out: string;
      room_price: number;
      extra_guest_charge: number;
      total_amount: number;
    }) => data,
  )
  .handler(async ({ data: bookingData }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    const insertData: Database["public"]["Tables"]["bookings"]["Insert"] = {
      property_id: bookingData.property_id,
      room_id: bookingData.room_id,
      guest_name: bookingData.guest_name,
      guest_phone: bookingData.guest_phone,
      guest_email: bookingData.guest_email,
      guest_count: bookingData.guest_count,
      check_in: bookingData.check_in,
      check_out: bookingData.check_out,
      room_price: bookingData.room_price,
      extra_guest_charge: bookingData.extra_guest_charge,
      total_amount: bookingData.total_amount,
      status: "pending",
      is_paid: false,
      payment_method: null,
      payment_reference: null,
    };

    const { data: booking, error } = await supabase
      .from("bookings")
      // @ts-expect-error insert expects exact type
      .insert(insertData)
      .select("id")
      .single();

    if (error) {
      console.error("Error creating booking:", error);
      throw new Error("Failed to create booking");
    }

    return (booking as { id: string }).id;
  });
