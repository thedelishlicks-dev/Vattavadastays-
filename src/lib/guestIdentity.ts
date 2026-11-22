/**
 * Guest identity (Sprint 6): who is this guest, and have they stayed before? Pure logic, no React or
 * Supabase; tested in guestIdentity.test.ts.
 *
 * A guest is a row in `guests`, ALWAYS scoped to one property (never a directory across properties). The
 * database links a booking to its guest by NORMALIZED PHONE inside the same property
 * (supabase/migrations/20261121000000_guests.sql: normalize_phone_key / resolve_guest / link_booking_guest).
 * No fuzzy name matching; no usable phone means no guest identity.
 *
 * What this file adds on the TypeScript side:
 *  - `phoneKey`: the same key as SQL `normalize_phone_key` (shared cases in supabase/tests/phone_parity_cases.json,
 *    asserted by BOTH this file's tests and supabase/tests/guests.test.sql).
 *  - `guestStats`: stays, revenue, first and last stay of one guest, built on the canonical rules:
 *      · a stay is a CONFIRMED / COMPLETED booking (businessMetrics `dedupeStays`); pending and cancelled never count;
 *      · a multi-room booking is ONE stay (its group), never one per room;
 *      · revenue is `stayNetTotal` (balance.ts: room + extras − discount), the same figure Money uses.
 *        It is NOT advance payments.
 *  - Repeat guest: more than one qualifying stay at the same property. Nothing else (no name, email, device…).
 */

import { dedupeStays, dayNumber, stayNetTotal, type BookingLike, type GroupLike } from "./businessMetrics";
import { nationalDigits } from "./phone";

/**
 * The key two phone numbers share when they are the same number, or null when there is nothing usable
 * (fewer than 7 or more than 15 digits). Mirrors SQL `normalize_phone_key` exactly.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const d = nationalDigits(raw);
  return d.length < 7 || d.length > 15 ? null : d;
}

export interface GuestStats {
  /** Qualifying stays (a multi-room booking counts once). */
  stays: number;
  /** Net value of those stays (balance.ts), not payments received. */
  revenue: number;
  /** Check-in date of the earliest / latest qualifying stay, "YYYY-MM-DD"; null when there is none. */
  firstStay: string | null;
  lastStay: string | null;
  /** More than one qualifying stay. */
  isRepeat: boolean;
  /** Stays after the first (0 for a first-time guest). */
  repeatVisits: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Stats of ONE guest from that guest's bookings and booking groups (fetch both by guest_id). Cancelled and
 * pending rows are ignored, so they can neither add revenue nor make a guest "returning".
 */
export function guestStats<B extends BookingLike, G extends GroupLike>(
  bookings: readonly B[],
  groups: readonly G[],
): GuestStats {
  const stays = dedupeStays(bookings, groups);
  let revenue = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const s of stays) {
    revenue += stayNetTotal(s);
    if (first === null || dayNumber(s.check_in) < dayNumber(first)) first = s.check_in;
    if (last === null || dayNumber(s.check_in) > dayNumber(last)) last = s.check_in;
  }
  return {
    stays: stays.length,
    revenue: round2(revenue),
    firstStay: first && first.slice(0, 10),
    lastStay: last && last.slice(0, 10),
    isRepeat: stays.length > 1,
    repeatVisits: Math.max(0, stays.length - 1),
  };
}

/** "Returning guest · 3 stays", or null for a first-time guest (nothing is shown then). */
export function returningLabel(stays: number): string | null {
  return stays > 1 ? `Returning guest · ${stays} stays` : null;
}
