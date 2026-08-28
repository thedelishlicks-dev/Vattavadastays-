import { supabase } from "@/lib/supabase";

/**
 * Returns the subset of dates (YYYY-MM-DD, check-in inclusive, check-out
 * exclusive) between checkIn and checkOut that are explicitly marked
 * unavailable for a room. A date with no row at all is NOT unavailable —
 * see the note in useCreateBooking.ts: most properties aren't pre-seeded
 * with a full year of availability rows, so "no row" just means nobody has
 * touched that date yet, not that it's blocked.
 */
export async function getUnavailableDates(
  roomId: string,
  checkIn: string,
  checkOut: string,
): Promise<string[]> {
  const dates: string[] = [];
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  if (dates.length === 0) return [];
  const { data, error } = await supabase
    .from("availability")
    .select("date, is_available")
    .eq("room_id", roomId)
    .in("date", dates);
  if (error) throw error;
  return (data ?? []).filter((row) => row.is_available === false).map((row) => row.date);
}
