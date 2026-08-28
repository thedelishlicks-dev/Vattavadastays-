import { supabase } from "@/lib/supabase";

function eachDate(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Returns the subset of dates (YYYY-MM-DD, check-in inclusive, check-out
 * exclusive) between checkIn and checkOut that are unavailable for a room —
 * either because an active booking already overlaps that date, or because
 * the owner explicitly blocked it in the `availability` table.
 *
 * Checks the `bookings` table directly rather than relying solely on
 * `availability` being kept in sync. That sync is NOT guaranteed at the
 * time a booking is created: the DB trigger (trg_booking_status_change)
 * only fires on UPDATE of status, not on INSERT, and the owner-side booking
 * form inserts new bookings with status already set to 'confirmed'. The
 * guest-facing site's own calendar (Availability.tsx) already reads
 * `bookings` directly for the same reason — this matches that approach so
 * both surfaces agree.
 */
export async function getUnavailableDates(
  roomId: string,
  checkIn: string,
  checkOut: string,
): Promise<string[]> {
  const blocked = await getBlockedDatesForRooms([roomId], checkIn, checkOut);
  return Array.from(blocked[roomId] ?? []).sort();
}

/**
 * Returns, for each room id, the set of blocked dates (booked or manually
 * marked unavailable) within [rangeStart, rangeEnd). Used by the visual
 * availability calendar to paint a whole month at once in one round trip
 * per source table, rather than one query per day.
 */
export async function getBlockedDatesForRooms(
  roomIds: string[],
  rangeStart: string,
  rangeEnd: string,
): Promise<Record<string, Set<string>>> {
  const blocked: Record<string, Set<string>> = {};
  roomIds.forEach((id) => (blocked[id] = new Set()));
  if (roomIds.length === 0) return blocked;

  const [{ data: bookings, error: bookingsErr }, { data: availRows, error: availErr }] = await Promise.all([
    supabase
      .from("bookings")
      .select("room_id, check_in, check_out")
      .in("room_id", roomIds)
      .neq("status", "cancelled")
      .gte("check_out", rangeStart)
      .lte("check_in", rangeEnd),
    supabase
      .from("availability")
      .select("room_id, date")
      .in("room_id", roomIds)
      .eq("is_available", false)
      .gte("date", rangeStart)
      .lte("date", rangeEnd),
  ]);
  if (bookingsErr) throw bookingsErr;
  if (availErr) throw availErr;

  (bookings ?? []).forEach((b) => {
    eachDate(b.check_in, b.check_out).forEach((d) => blocked[b.room_id]?.add(d));
  });
  (availRows ?? []).forEach((row) => {
    blocked[row.room_id]?.add(row.date);
  });

  return blocked;
}

/**
 * Marks a room unavailable for every date in [checkIn, checkOut) in the
 * `availability` table. Call this after creating a booking directly (owner
 * side), since — unlike a status UPDATE — an INSERT of a 'confirmed'
 * booking does not fire trg_booking_status_change and won't otherwise sync
 * this table. Without it, a guest booking through the public site (whose
 * own conflict check reads `availability`, not `bookings`) could book
 * straight over an owner-added reservation. Mirrors the upsert
 * useCreateBooking.ts already does on the guest-booking path.
 */
export async function markDatesUnavailable(roomId: string, checkIn: string, checkOut: string): Promise<void> {
  const dates = eachDate(checkIn, checkOut);
  if (dates.length === 0) return;
  const rows = dates.map((date) => ({ room_id: roomId, date, is_available: false }));
  const { error } = await supabase.from("availability").upsert(rows, { onConflict: "room_id,date" });
  if (error) throw error;
}

