// src/lib/guestCount.ts
//
// ONE definition of how guests are counted, used by the room popup (what the
// guest is told) and the booking submit (what is validated and stored).
//
// The rule — the one the database has always stored and the owner-side booking
// form already uses: EVERY guest counts, adults and children together.
//   - `included` (rooms.max_guests) guests are covered by the nightly price;
//   - each guest above that pays rooms.extra_guest_price per night;
//   - at most `rooms.max_occupancy` guests can be booked; when the owner has not set it,
//     `included + EXTRA_GUEST_ALLOWANCE` (the old rule, kept for existing rooms).
// The popup used to count only adults for the charge and let adults and children
// each reach the cap on their own, so the price it showed disagreed with the stored
// price (children added extra charges nobody had been told about), and a family
// could choose a party that was only rejected on the final step.

export const EXTRA_GUEST_ALLOWANCE = 4;
export const MAX_CHILDREN = 4;

/**
 * The most guests (adults + children) one room can take: the owner's own limit
 * (rooms.max_occupancy, never below the included guests) or, when not set, included + allowance.
 * The database applies the same rule when a guest booking is saved.
 */
export function maxGuestsFor(included: number, maxOccupancy?: number | null): number {
  return maxOccupancy != null && maxOccupancy >= included ? maxOccupancy : included + EXTRA_GUEST_ALLOWANCE;
}

/** Guests who pay the extra-guest charge. */
export function extraGuestCount(totalGuests: number, included: number): number {
  return Math.max(0, totalGuests - included);
}

/** Highest value each stepper may reach given the other one, so the total can never exceed the cap. */
export function stepperLimits(included: number, adults: number, children: number, maxOccupancy?: number | null): { maxAdults: number; maxChildren: number } {
  const cap = maxGuestsFor(included, maxOccupancy);
  return {
    maxAdults: Math.max(1, cap - children),
    maxChildren: Math.max(0, Math.min(MAX_CHILDREN, cap - adults)),
  };
}

/** Bring a (possibly stale) selection inside the limits: at least 1 adult, total within the cap. */
export function clampParty(included: number, adults: number, children: number, maxOccupancy?: number | null): { adults: number; children: number } {
  const cap = maxGuestsFor(included, maxOccupancy);
  const a = Math.min(Math.max(1, adults), cap);
  const c = Math.min(Math.max(0, children), MAX_CHILDREN, cap - a);
  return { adults: a, children: c };
}
