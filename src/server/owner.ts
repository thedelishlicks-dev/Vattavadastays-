import { createServerFn } from "@tanstack/react-start";
import { createClient } from "../lib/supabase";
import { getRequest } from "@tanstack/react-start/server";
import { Property, Database, Booking } from "../types/database";
import { SupabaseClient } from "@supabase/supabase-js";

const verifyAuth = async (supabase: SupabaseClient<Database>) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw { code: "UNAUTHORIZED", message: "You must be logged in to access this." };
  }
  return user;
};

export const getOwnerProperty = createServerFn({ method: "GET" })
  .inputValidator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    await verifyAuth(supabase);

    const { data: property, error } = await supabase
      .from("properties")
      .select("*, rooms (*)")
      .eq("owner_id", userId)
      .single();

    if (error) {
      console.error("Error fetching owner property:", error);
      return null;
    }

    return property;
  });

export const getPropertyBookings = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { propertyId: string; filters?: { status?: string; from?: string; to?: string } }) =>
      data,
  )
  .handler(async ({ data: { propertyId, filters } }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    await verifyAuth(supabase);

    let query = supabase
      .from("bookings")
      .select("*")
      .eq("property_id", propertyId)
      .order("check_in", { ascending: false });

    if (filters?.status) {
      query = query.eq("status", filters.status as Booking["status"]);
    }

    if (filters?.from) {
      query = query.gte("check_in", filters.from);
    }

    if (filters?.to) {
      query = query.lte("check_out", filters.to);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error("Error fetching property bookings:", error);
      return [];
    }

    return bookings;
  });

export const updateBookingStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { bookingId: string; status: string; isOwner: boolean }) => data)
  .handler(async ({ data: { bookingId, status } }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    await verifyAuth(supabase);

    const { error } = await supabase
      .from("bookings")
      // @ts-expect-error type mismatch
      .update({ status } as Database["public"]["Tables"]["bookings"]["Update"])
      .eq("id", bookingId);

    if (error) {
      console.error("Error updating booking status:", error);
      throw new Error("Failed to update booking status");
    }

    return { success: true };
  });

export const toggleDateAvailability = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { roomId: string; date: string; isAvailable: boolean; note?: string }) => data,
  )
  .handler(async ({ data: { roomId, date, isAvailable, note } }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    await verifyAuth(supabase);

    const { error } = await supabase.from("availability").upsert(
      // @ts-expect-error type mismatch
      {
        room_id: roomId,
        date,
        is_available: isAvailable,
        note: note ?? null,
      } as Database["public"]["Tables"]["availability"]["Insert"],
      { onConflict: "room_id, date" },
    );

    if (error) {
      console.error("Error toggling date availability:", error);
      throw new Error("Failed to toggle availability");
    }

    return { success: true };
  });

export const updatePropertySettings = createServerFn({ method: "POST" })
  .inputValidator((data: { propertyId: string; data: Partial<Property> }) => data)
  .handler(async ({ data: { propertyId, data } }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    await verifyAuth(supabase);

    // Only allow updating specific fields
    const allowedFields = [
      "name",
      "name_ml",
      "description",
      "description_ml",
      "shared_amenities",
      "check_in_time",
      "check_out_time",
      "owner_name",
      "owner_phone",
      "owner_whatsapp",
      "hero_image",
      "area",
    ];

    const filteredData: Record<string, unknown> = {};
    Object.keys(data).forEach((key) => {
      if (allowedFields.includes(key)) {
        filteredData[key] = (data as Record<string, unknown>)[key];
      }
    });

    const { error } = await supabase
      .from("properties")
      // @ts-expect-error type mismatch
      .update(filteredData as Database["public"]["Tables"]["properties"]["Update"])
      .eq("id", propertyId);

    if (error) {
      console.error("Error updating property settings:", error);
      throw new Error("Failed to update property settings");
    }

    return { success: true };
  });
