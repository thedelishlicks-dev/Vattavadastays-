// src/lib/stayAvailability.ts
//
// Is there any room that is free for EVERY night of a proposed stay?
// The date picker only checks that each night has at least one free room, so a stay
// can pass it while no single room is free all the way through (room A is taken the
// first nights, room B the last). The guest then saw every room "Not available" with
// no explanation. This lets the picker say so up front.

export interface StayDates { checkIn: string; checkOut: string } // yyyy-MM-dd

function eachNight(checkIn: string, checkOut: string, includeCheckoutDay: boolean): string[] {
  const out: string[] = [];
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  for (let t = start; includeCheckoutDay ? t <= end : t < end; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Room ids that have no occupied night in the stay. `blockedByRoom` maps room -> occupied dates
 * (bookings + owner blocks, already widened for turnover by getBlockedDatesForRooms).
 * When the property has no cleaning gap between same-day check-out and check-in
 * (`turnoverSafe` false), the check-out day counts too — the same rule as the booking check.
 */
export function roomsFreeForStay(
  roomIds: string[],
  blockedByRoom: Record<string, Set<string>>,
  stay: StayDates,
  turnoverSafe: boolean,
): string[] {
  const nights = eachNight(stay.checkIn, stay.checkOut, !turnoverSafe);
  return roomIds.filter((id) => {
    const blocked = blockedByRoom[id];
    return !blocked || nights.every((n) => !blocked.has(n));
  });
}
