/**
 * /api/ical?room=<room id>[&for=<feed id>] — Vercel Edge Function
 *
 * Public iCal feed of ONE room's occupied nights, for Booking.com / Airbnb /
 * Agoda / MakeMyTrip / Google Calendar to import ("Import calendar" in those
 * dashboards). Built only from the public `availability` table, which the
 * database already keeps in step with every booking and manual block, so the
 * feed contains no guest names, phones or amounts — every event is "Reserved".
 *
 * By default the feed carries only nights WE own (our bookings and manual blocks),
 * never nights imported from other sites — see exportNights() in _lib/ical.ts for why,
 * and for what `for=<feed id>` adds.
 *
 * Works on the anon key (no service role needed). The room id is a random
 * UUID; it is already public in the guest page's room data.
 */
import { buildIcs, addDays, exportNights, isUuid } from "./_lib/ical";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  Accept: "application/json",
};

function text(body: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...extra },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const room =
    new URL(req.url).searchParams
      .get("room")
      ?.trim()
      .toLowerCase()
      .replace(/\.ics$/, "") ?? "";
  if (!isUuid(room)) return text("Missing or invalid room id", 400);
  const forRaw = new URL(req.url).searchParams.get("for")?.trim().toLowerCase() ?? "";
  if (forRaw && !isUuid(forRaw)) return text("Invalid feed id", 400);

  try {
    const roomRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rooms?id=eq.${room}&select=name,is_active&limit=1`,
      { headers },
    );
    if (!roomRes.ok) return text("Could not load calendar", 502);
    const rooms = await roomRes.json();
    if (!rooms?.[0]) return text("Room not found", 404);

    const today = new Date().toISOString().slice(0, 10);
    const from = addDays(today, -1);
    const to = addDays(today, 730);
    const avRes = await fetch(
      `${SUPABASE_URL}/rest/v1/availability?room_id=eq.${room}&is_available=eq.false&date=gte.${from}&date=lte.${to}&select=date,note&order=date.asc&limit=1000`,
      { headers },
    );
    if (!avRes.ok) return text("Could not load calendar", 502);
    const rows: { date: string; note: string | null }[] = await avRes.json();

    const ics = buildIcs({
      roomId: room,
      calName: String(rooms[0].name ?? "Room"),
      blockedNights: exportNights(rows, forRaw || undefined),
    });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="availability.ics"',
        // Channels poll every few hours; a short CDN cache protects Supabase from aggressive pollers.
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch {
    return text("Could not load calendar", 502);
  }
}
