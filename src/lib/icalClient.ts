// src/lib/icalClient.ts — browser-side helpers for channel (iCal) sync.
// Server logic lives in api/ical.ts + api/ical-sync.ts; keep the note format
// ("ical:<feed id>:<name>") in step with api/ical-sync.ts.

import { supabase } from "@/lib/supabase";

export const ICAL_NOTE_PREFIX = "ical:";

/** Calendar notes written by a sync read "ical:<uuid>:<name>"; show people the name. */
export function isIcalNote(note: string | null | undefined): boolean {
  return !!note && note.startsWith(ICAL_NOTE_PREFIX);
}
export function friendlyNote(note: string | null | undefined): string | null {
  if (!note) return null;
  if (!isIcalNote(note)) return note;
  const name = note.split(":").slice(2).join(":").trim();
  return name ? `Synced from ${name}` : "Synced from another site";
}

/** The link a room shares with Booking.com / Airbnb / etc. to import its availability. */
export function exportFeedUrl(origin: string, roomId: string): string {
  return `${origin}/api/ical?room=${roomId}`;
}

export interface SyncResult { feed_id: string; room_id: string; ok: boolean; message: string; nights?: number; conflicts?: number }

/** Ask the server to sync feeds for a room / property / single feed, as the signed-in owner. */
export async function syncIcalFeeds(scope: { room_id?: string; feed_id?: string; property_id?: string }): Promise<SyncResult[]> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/ical-sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(scope),
  });
  const body = (await res.json().catch(() => ({}))) as { results?: SyncResult[]; error?: string };
  if (!res.ok) throw new Error(body.error || "Sync failed. Try again in a moment.");
  return body.results ?? [];
}
