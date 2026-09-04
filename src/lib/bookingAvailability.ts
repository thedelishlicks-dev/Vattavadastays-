import { supabase } from "@/lib/supabase";

/**
 * Every night a stay occupies a room: check-in date inclusive, check-out
 * date EXCLUSIVE. This is the one and only definition of "occupied nights"
 * used anywhere in the app — every calendar, picker, and validator imports
 * this instead of re-implementing its own date loop. (Three separate
 * reimplementations of this exact loop is what caused the same-day-turnover
 * bugs found and fixed across this codebase — never add a fourth.)
 */
export function eachDate(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Adds one calendar day to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Minutes needed between a property's check-out time and its check-in time
 * for the room to be cleaned and turned over the same day. If a property's
 * actual gap is smaller than this, same-day turnover is NOT offered — the
 * app falls back to requiring a full clear day between stays instead.
 *
 * This is a single, global constant rather than a per-property setting for
 * now. If a property ever needs a different buffer, promote this to a
 * `cleaning_buffer_minutes` column on `properties` and thread it through
 * isSameDayTurnoverSafe() below — every call site already takes the whole
 * property object, so that change wouldn't need to touch any consumer.
 */
export const CLEANING_BUFFER_MINUTES = 60;

/**
 * How long a "pending" booking (owner-created enquiry hold, or a guest's
 * self-service booking awaiting advance payment) keeps its dates blocked
 * before it's treated as abandoned and auto-released. A `pending` booking
 * already blocks its dates the instant it's created (see
 * markDatesUnavailable below) — this is what stops that block from lasting
 * forever if the guest never follows through.
 *
 * This is now owner-configurable per property (see
 * `properties.pending_hold_hours`, editable in Settings) — this constant
 * is only the fallback used when a property record isn't available.
 *
 * Matched by a scheduled `expire_stale_pending_bookings()` Postgres
 * function (see supabase/migrations) that cancels any booking/group still
 * `pending` past its `hold_expires_at` and frees its `availability` rows.
 * That function does NOT need to know this value — it only ever compares
 * `hold_expires_at < now()`, and `hold_expires_at` is computed here at
 * creation time using whichever hours value applies.
 */
export const PENDING_HOLD_HOURS = 24;

/** ISO timestamp `hours` from now — set as `hold_expires_at` on every
 * booking/booking_group inserted with status "pending". Bookings inserted
 * as "confirmed" should pass `null` instead (no expiry).
 *
 * Pass the property's own `pending_hold_hours` when available; falls back
 * to `PENDING_HOLD_HOURS` (24h) if omitted or not a positive number. */
export function pendingHoldExpiry(hours: number = PENDING_HOLD_HOURS): string {
  const safeHours = hours > 0 ? hours : PENDING_HOLD_HOURS;
  return new Date(Date.now() + safeHours * 60 * 60 * 1000).toISOString();
}

export interface TurnoverPolicyInput {
  check_in_time?: string | null;
  check_out_time?: string | null;
}

/**
 * Parses a time string into minutes-since-midnight. Handles the native
 * <input type="time"> format ("11:00", "14:30") that admin.settings.tsx
 * actually stores, plus a defensive fallback for "12:00 PM"-style values
 * in case of legacy/manual data. Returns null if unparseable.
 */
export function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const trimmed = time.trim();

  const hm24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hm24) {
    const h = Number(hm24[1]);
    const m = Number(hm24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
    return null;
  }

  const hm12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (hm12) {
    let h = Number(hm12[1]) % 12;
    const m = Number(hm12[2]);
    if (/pm/i.test(hm12[3])) h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return h * 60 + m;
    return null;
  }

  return null;
}

/**
 * Whether a NEW guest can check into a room on the same calendar date
 * another guest checked out of — i.e. whether the exclusive-checkout-date
 * convention used throughout this app (a stay's check-out date is never
 * counted as one of its own occupied nights, so it's free for someone
 * else's stay to start) is actually safe for THIS property, given its real
 * check-in/check-out times and the cleaning buffer above.
 *
 * Returns false — no same-day turnover, require a full clear day — if the
 * property's times are missing/unparseable, equal, or leave less than
 * CLEANING_BUFFER_MINUTES of gap. Missing/ambiguous data must default to
 * the SAFE (stricter) behavior, never to silently allowing turnover.
 *
 * Every conflict-detection function in this file, plus the date pickers in
 * RoomAvailabilityCalendar.tsx and Availability.tsx, call this — so the
 * turnover rule can never drift out of sync between the guest site, the
 * owner dashboard, and the final save-time check. Change the rule here and
 * it changes everywhere at once.
 */
export function isSameDayTurnoverSafe(property: TurnoverPolicyInput | null | undefined): boolean {
  const checkOutMin = parseTimeToMinutes(property?.check_out_time);
  const checkInMin = parseTimeToMinutes(property?.check_in_time);
  if (checkOutMin == null || checkInMin == null) return false;
  return checkOutMin + CLEANING_BUFFER_MINUTES <= checkInMin;
}

/**
 * Returns, for each room id, the set of blocked dates (booked or manually
 * marked unavailable) within [rangeStart, rangeEnd). Used by the visual
 * availability calendar to paint a whole month at once in one round trip
 * per source table, rather than one query per day.
 *
 * `turnoverSafe` (from isSameDayTurnoverSafe(property), computed once by
 * the caller for the property these rooms belong to) determines whether an
 * existing booking's checkout date itself is treated as blocked. When
 * turnover ISN'T safe, a booking's occupied nights are widened through its
 * own checkout day — that day can't be anyone else's check-in either,
 * without a cleaning gap. When it IS safe, behavior is unchanged: a
 * booking's checkout date is exempt, exactly like before same-day-turnover
 * support existed.
 *
 * The SQL fetch below is deliberately permissive (non-strict inequalities,
 * over-inclusive) rather than trying to encode the exact widened boundary
 * in the query itself — a booking whose true relevance depends on the
 * widening is still fetched either way, and the precise decision is made
 * afterward in JS via eachDate(). Under-fetching here would silently miss
 * a real conflict at the exact turnover boundary; over-fetching a few
 * harmless extra rows costs nothing.
 */
export async function getBlockedDatesForRooms(
  roomIds: string[],
  rangeStart: string,
  rangeEnd: string,
  turnoverSafe = true,
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
    const effectiveCheckOut = turnoverSafe ? b.check_out : addOneDay(b.check_out);
    eachDate(b.check_in, effectiveCheckOut).forEach((d) => blocked[b.room_id]?.add(d));
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

/**
 * Returns the subset of NIGHTS (check-in inclusive, check-out exclusive)
 * within [checkIn, checkOut) that genuinely conflict for a SPECIFIC
 * proposed booking on this room.
 *
 * Unlike getBlockedDatesForRooms() — which exists to paint a whole visible
 * calendar month and intentionally returns every occupied night touching
 * that window — this is scoped exactly to the requested stay and applies
 * the SAME turnover policy as the date pickers (isSameDayTurnoverSafe): the
 * checkout day itself is only exempt from conflict when the property's
 * actual times leave a cleaning gap. Checkout at 11am, next check-in at
 * noon is a normal, valid turnover — but only if the property's settings
 * actually support it.
 *
 * Use this whenever validating one specific proposed booking before saving
 * it (e.g. AddBookingModal's handleSave, useCreateBooking.ts). Reusing the
 * calendar-painting helper for this purpose was the original bug: it has
 * no concept of "which day is MY checkout", so it flagged same-day
 * turnovers as conflicts even after the date picker correctly allowed them.
 *
 * `property` determines whether same-day turnover is actually offered for
 * THIS room's property (see isSameDayTurnoverSafe). When it's not safe,
 * this widens validation to also treat the proposed booking's own checkout
 * date as a night that must be free — without a cleaning gap, no one else
 * can check in that same day either, so it's no longer exempt.
 */
export async function getConflictingDates(
  roomId: string,
  checkIn: string,
  checkOut: string,
  property?: TurnoverPolicyInput | null,
): Promise<string[]> {
  const turnoverSafe = isSameDayTurnoverSafe(property);
  const widen = (dateStr: string) => (turnoverSafe ? dateStr : addOneDay(dateStr));

  // When turnover isn't safe, widen the window we validate by one day so
  // our own checkout date is checked too. When safe, behavior is exactly
  // the original exclusive-checkout logic.
  const effectiveCheckOut = widen(checkOut);
  const nights = eachDate(checkIn, effectiveCheckOut);
  if (nights.length === 0) return [];

  // Deliberately permissive (non-strict) fetch bounds: we widen by an
  // extra day on both sides here so a booking sitting exactly on a
  // turnover boundary is never missed by the SQL filter itself — the
  // precise decision happens afterward in JS via eachDate()+widen(),
  // which is exact. Under-fetching here would silently miss a real
  // conflict (this is exactly the bug that slipped through in testing:
  // a previous booking whose checkout lands exactly on our check-in day
  // wasn't fetched at all by a strict .gt() filter). Over-fetching a few
  // harmless extra rows costs nothing.
  const [{ data: bookings, error: bookingsErr }, { data: availRows, error: availErr }] = await Promise.all([
    supabase
      .from("bookings")
      .select("check_in, check_out")
      .eq("room_id", roomId)
      .neq("status", "cancelled")
      .lte("check_in", effectiveCheckOut)
      .gte("check_out", checkIn),
    // Manual/explicit blocks within the (possibly widened) window.
    supabase
      .from("availability")
      .select("date")
      .eq("room_id", roomId)
      .eq("is_available", false)
      .gte("date", checkIn)
      .lt("date", effectiveCheckOut),
  ]);
  if (bookingsErr) throw bookingsErr;
  if (availErr) throw availErr;

  const blockedNights = new Set<string>();
  // Other bookings' occupied nights are widened through THEIR OWN checkout
  // day too, using the exact same policy — symmetric with our own nights
  // above. Without this, a previous booking's checkout coinciding with our
  // check-in would wrongly be allowed even when turnover isn't safe: it's
  // the same rule applied from the other direction (our check-in touching
  // their checkout, instead of our checkout touching their check-in).
  (bookings ?? []).forEach((b) => eachDate(b.check_in, widen(b.check_out)).forEach((d) => blockedNights.add(d)));
  (availRows ?? []).forEach((row) => blockedNights.add(row.date));

  // Only ever report a conflict that actually falls within the nights we're
  // validating — never a stray date outside that window.
  return nights.filter((d) => blockedNights.has(d));
}

/**
 * Releases the availability rows a booking previously claimed, so its
 * dates become bookable again. Call this whenever a booking is cancelled
 * (or its dates are shortened/removed) — nothing else in the codebase
 * does this, so without it, cancelling a booking leaves its dates
 * permanently blocked for that room.
 *
 * For each night in [checkIn, checkOut), only releases it if no OTHER
 * active (non-cancelled) booking on this room still needs it — this never
 * frees a night that's genuinely still occupied by a different booking.
 *
 * CAVEAT: the `availability` table doesn't distinguish "blocked because of
 * this booking" from "blocked because the owner manually marked it
 * unavailable" (via BlockDatesModal) — both are just an is_available:false
 * row with no source/reason recorded. If a manual block happens to land on
 * the same date as a cancelled booking, this will release that date too.
 * Low-risk in practice, but worth knowing — re-apply the manual block if
 * that ever happens. A proper fix would add a `source` column to
 * `availability` to distinguish the two; out of scope for this change.
 */
export async function releaseDatesIfUnblocked(roomId: string, checkIn: string, checkOut: string): Promise<void> {
  const nights = eachDate(checkIn, checkOut);
  if (nights.length === 0) return;

  const { data: stillActive, error } = await supabase
    .from("bookings")
    .select("check_in, check_out")
    .eq("room_id", roomId)
    .neq("status", "cancelled");
  if (error) throw error;

  const stillOccupied = new Set<string>();
  (stillActive ?? []).forEach((b) => eachDate(b.check_in, b.check_out).forEach((d) => stillOccupied.add(d)));

  const toRelease = nights.filter((d) => !stillOccupied.has(d));
  if (toRelease.length === 0) return;

  const { error: delErr } = await supabase
    .from("availability")
    .delete()
    .eq("room_id", roomId)
    .in("date", toRelease);
  if (delErr) throw delErr;
}

