// src/lib/bookingActions.ts
//
// The database writes behind the owner's Confirm / Complete / Cancel buttons,
// for single bookings and for multi-room groups.
//
// Why this exists: these buttons used to ignore the result of the save. On a weak
// connection (or an expired login) the save failed, yet the screen still said
// "confirmed", the "your booking is confirmed" WhatsApp message to the guest was
// still opened, and the dialog still closed. Rules here:
//
//   1. Every write is checked. A failed write THROWS, and callers must not show
//      success, open WhatsApp or close the dialog.
//   2. "No error" is not enough: when the login has expired the database silently
//      updates ZERO rows without any error. We ask for the updated row back and
//      treat an empty answer as a failure (NotSavedError).
//   3. A group is a parent row plus one row per room. If the rooms fail to update
//      after the parent did, the parent is put back, so the two never disagree.
//
// `db` is the Supabase client; tests pass a fake with the same call shape.

import type { SupabaseClient } from "@supabase/supabase-js";

export class NotSavedError extends Error {
  constructor() {
    super("NOT_SAVED");
    this.name = "NotSavedError";
  }
}

export const NOT_SAVED_MESSAGE =
  "That change wasn't saved — your login may have expired. Refresh the page, sign in again and retry. Nothing was changed.";
export const OFFLINE_MESSAGE =
  "Couldn't reach the server — check your internet connection and try again. Nothing was changed.";

/** A message fit to show the owner for any failure from the functions below. */
export function saveFailMessage(e: unknown, fallback = "Couldn't save. Please try again — nothing was changed."): string {
  if (e instanceof NotSavedError) return NOT_SAVED_MESSAGE;
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  // fetch() failures read differently per browser (Chrome / Safari / Firefox).
  if (/failed to fetch|load failed|networkerror|network request failed|timeout/i.test(msg)) return OFFLINE_MESSAGE;
  return msg ? `${fallback.replace(/\.$/, "")} (${msg})` : fallback;
}

type Db = Pick<SupabaseClient, "from">;
type PendingHold = { hold_expires_at?: string | null };

/** The columns that change with a status. Completing records the check-out time; leaving "pending" ends the hold. */
export function statusUpdate(status: string, now: Date = new Date()): Record<string, unknown> {
  const u: Record<string, unknown> = { status };
  if (status === "completed") u.checked_out_at = now.toISOString();
  if (status !== "pending") u.hold_expires_at = null;
  return u;
}

/** Update one booking's status. Returns the columns written (for updating the open dialog). */
export async function setBookingStatus(db: Db, id: string, status: string): Promise<Record<string, unknown>> {
  const updates = statusUpdate(status);
  const { data, error } = await db.from("bookings").update(updates).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new NotSavedError();
  return updates;
}

/** Cancel one booking. */
export async function cancelBooking(db: Db, id: string): Promise<void> {
  const { data, error } = await db.from("bookings").update({ status: "cancelled" }).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new NotSavedError();
}

/** Change a group's status, then all of its rooms. If the rooms fail, the group is put back. */
export async function setGroupStatus(db: Db, group: { id: string; status: string } & PendingHold, status: string): Promise<void> {
  const updates = status !== "pending" ? { status, hold_expires_at: null } : { status };
  await writeGroupAndRooms(db, group, updates);
}

/** Cancel a group and all of its rooms. If the rooms fail, the group is put back. */
export async function cancelGroup(db: Db, group: { id: string; status: string } & PendingHold): Promise<void> {
  await writeGroupAndRooms(db, group, { status: "cancelled" });
}

async function writeGroupAndRooms(db: Db, group: { id: string; status: string } & PendingHold, updates: Record<string, unknown>): Promise<void> {
  const { data, error } = await db.from("booking_groups").update(updates).eq("id", group.id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new NotSavedError();

  const { error: roomsErr } = await db.from("bookings").update(updates).eq("group_id", group.id);
  if (roomsErr) {
    // Best effort: restore the parent, including its hold, so an unconfirmed
    // group can still expire instead of staying "pending" forever.
    const restore: Record<string, unknown> = { status: group.status };
    if (group.hold_expires_at !== undefined) restore.hold_expires_at = group.hold_expires_at;
    try { await db.from("booking_groups").update(restore).eq("id", group.id); } catch { /* the original error is what matters */ }
    throw roomsErr;
  }
}

/** Save a group's discount. Throws if it wasn't saved, so the form can show why instead of closing as if it worked. */
export async function setGroupDiscount(db: Db, groupId: string, amount: number, reason: string): Promise<void> {
  const { data, error } = await db
    .from("booking_groups")
    .update({ discount_amount: amount, discount_reason: reason || null })
    .eq("id", groupId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new NotSavedError();
}
