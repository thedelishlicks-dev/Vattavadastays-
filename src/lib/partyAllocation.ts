// src/lib/partyAllocation.ts
//
// Guests-first booking: the guest says how many people are coming, picks rooms, and this
// works out who sleeps where. Pure functions, no React, so the rules are easy to test.
//
// Rules (same counting as lib/guestCount.ts):
//   - every guest, adults and children, counts;
//   - a room's price covers `max_guests` ("included") guests; each guest above that pays
//     extra_guest_price per night;
//   - a room takes at most included + EXTRA_GUEST_ALLOWANCE guests, at most MAX_CHILDREN children;
//   - every room needs at least one adult.

import { MAX_CHILDREN, maxGuestsFor } from "./guestCount";

export type Party = { adults: number; children: number };

export type AllocRoom = {
  id: string;
  max_guests: number;
  base_price?: number;
  extra_guest_price?: number | null;
};

export type Allocation = {
  byRoom: Record<string, Party>;
  /** Guests of the party that no room could take (capacity, or no adult left for a room). */
  unplacedAdults: number;
  unplacedChildren: number;
  /** Rooms that ended up with no adult. */
  roomsWithoutAdult: string[];
};

export const partySize = (p: Party): number => p.adults + p.children;

const roomCap = (r: AllocRoom) => maxGuestsFor(r.max_guests);
const extraPrice = (r: AllocRoom) => Number(r.extra_guest_price ?? 0);

/**
 * Spread `party` over `rooms`. Rooms in `pinned` keep exactly the numbers the guest set by hand;
 * the rest of the party is shared out over the other rooms.
 *
 * Order of placing: one adult in each free room first, then the remaining adults, then children.
 * Each guest goes to the room with the most included places left; once every room is at its
 * included number, to the room with the cheapest extra-guest charge that still has space.
 */
export function allocateGuests(rooms: AllocRoom[], party: Party, pinned: Record<string, Party> = {}): Allocation {
  const byRoom: Record<string, Party> = {};
  let adultsLeft = Math.max(0, party.adults);
  let childrenLeft = Math.max(0, party.children);

  const free: AllocRoom[] = [];
  for (const r of rooms) {
    const p = pinned[r.id];
    if (p) {
      byRoom[r.id] = { adults: p.adults, children: p.children };
      adultsLeft = Math.max(0, adultsLeft - p.adults);
      childrenLeft = Math.max(0, childrenLeft - p.children);
    } else {
      byRoom[r.id] = { adults: 0, children: 0 };
      free.push(r);
    }
  }

  const size = (r: AllocRoom) => partySize(byRoom[r.id]);
  const canTake = (r: AllocRoom, kind: "adults" | "children") =>
    size(r) < roomCap(r) && (kind === "adults" || byRoom[r.id].children < MAX_CHILDREN);
  const place = (kind: "adults" | "children"): boolean => {
    const options = free.filter((r) => canTake(r, kind));
    if (options.length === 0) return false;
    options.sort((a, b) => {
      const ra = a.max_guests - size(a);
      const rb = b.max_guests - size(b);
      if (ra > 0 || rb > 0) return rb - ra; // most included places left first
      return extraPrice(a) - extraPrice(b); // then cheapest extra guest
    });
    byRoom[options[0].id][kind] += 1;
    return true;
  };

  // One adult in every free room.
  for (const r of free) {
    if (adultsLeft > 0) {
      byRoom[r.id].adults += 1;
      adultsLeft -= 1;
    }
  }
  while (adultsLeft > 0 && place("adults")) adultsLeft -= 1;
  while (childrenLeft > 0 && place("children")) childrenLeft -= 1;

  const roomsWithoutAdult = rooms.filter((r) => byRoom[r.id].adults < 1).map((r) => r.id);
  return { byRoom, unplacedAdults: adultsLeft, unplacedChildren: childrenLeft, roomsWithoutAdult };
}

/** Guests who pay the extra-guest charge across an allocation. */
export function extraGuestsIn(rooms: AllocRoom[], a: Allocation): number {
  return rooms.reduce((sum, r) => sum + Math.max(0, partySize(a.byRoom[r.id]) - r.max_guests), 0);
}

export const isFullyPlaced = (a: Allocation): boolean =>
  a.unplacedAdults === 0 && a.unplacedChildren === 0 && a.roomsWithoutAdult.length === 0;

/**
 * The rooms to offer a group: the fewest rooms that hold everyone inside the included numbers
 * (cheapest set first). If no set does, the set with the fewest extra-guest charges, then the
 * fewest rooms, then the lowest price.
 * Returns [] when even all the rooms cannot take the party.
 */
export function suggestRooms(rooms: AllocRoom[], party: Party): string[] {
  const total = partySize(party);
  if (total === 0 || rooms.length === 0) return [];
  // Subsets are tried by brute force; a homestay has a handful of rooms. Keep the
  // cheapest 14 so a very large property cannot blow this up.
  const pool = [...rooms].sort((a, b) => (a.base_price ?? 0) - (b.base_price ?? 0)).slice(0, 14);
  const n = pool.length;

  let best: { key: [number, number, number, number]; ids: string[] } | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    const set: AllocRoom[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) set.push(pool[i]);
    if (set.length > party.adults) continue; // each room needs an adult
    if (set.reduce((s, r) => s + roomCap(r), 0) < total) continue;
    const a = allocateGuests(set, party);
    if (!isFullyPlaced(a)) continue;
    const extras = extraGuestsIn(set, a);
    const cost = set.reduce((s, r) => s + (r.base_price ?? 0), 0) +
      set.reduce((s, r) => s + Math.max(0, partySize(a.byRoom[r.id]) - r.max_guests) * extraPrice(r), 0);
    const key: [number, number, number, number] = [extras > 0 ? 1 : 0, extras, set.length, cost];
    if (!best || cmp(key, best.key) < 0) best = { key, ids: set.map((r) => r.id) };
  }
  return best ? best.ids : [];
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** How many rooms the group needs without extra-guest charges (0 if it cannot be done). */
export function roomsNeededWithinIncluded(rooms: AllocRoom[], party: Party): number {
  const ids = suggestRooms(rooms, party);
  if (ids.length === 0) return 0;
  const set = rooms.filter((r) => ids.includes(r.id));
  return extraGuestsIn(set, allocateGuests(set, party)) === 0 ? ids.length : 0;
}
