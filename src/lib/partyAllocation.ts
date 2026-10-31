// src/lib/partyAllocation.ts
//
// Guests-first booking: the guest says how many people are coming, picks rooms, and this
// works out who sleeps where. Pure functions, no React, so the rules are easy to test.
//
// Rules (same counting as lib/guestCount.ts):
//   - every guest, adults and children, counts;
//   - a room's price covers `max_guests` ("included") guests; each guest above that pays
//     extra_guest_price per night;
//   - a room takes at most its max_occupancy guests (included + EXTRA_GUEST_ALLOWANCE if the owner
//     set none), at most MAX_CHILDREN children;
//   - every room needs at least one adult.

import { MAX_CHILDREN, maxGuestsFor } from "./guestCount";

export type Party = { adults: number; children: number };

export type AllocRoom = {
  id: string;
  max_guests: number;
  /** The owner's limit including extra beds; null/undefined = included + the standard allowance. */
  max_occupancy?: number | null;
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

const roomCap = (r: AllocRoom) => maxGuestsFor(r.max_guests, r.max_occupancy);
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

/** One way to house the whole group, with what it really costs for the stay. */
export type RoomOption = {
  ids: string[];
  /** Real total for the stay: room prices for the dates (weekend and season included) plus extra-guest charges. */
  total: number;
  extraGuests: number;
};

export type RoomOptions = {
  /** The cheapest way to house everyone. */
  bestValue: RoomOption | null;
  /** The cheapest way that puts fewer guests on extra-guest charges (more rooms / roomier), if there is one. */
  moreSpace: RoomOption | null;
};

/**
 * The options to offer a group. `priceOf(room, guestsInRoom)` must return what that room costs for the
 * stay with that many guests in it (room price for the dates plus its extra-guest charge).
 *
 * Every set of rooms that can hold everyone (a room needs an adult, nobody over a room's limit) is priced
 * for real. "Best value" is the cheapest; "More space" is the cheapest one with fewer extra guests than
 * Best value. Returns nulls when nobody can be housed, or when Best value already has no extra guests.
 */
export function suggestOptions(rooms: AllocRoom[], party: Party, priceOf: (room: AllocRoom, guests: number) => number): RoomOptions {
  const none: RoomOptions = { bestValue: null, moreSpace: null };
  const total = partySize(party);
  if (total === 0 || rooms.length === 0) return none;

  // All sets are tried; a homestay has a handful of rooms. Keep the 12 cheapest so a huge property can't blow this up.
  const pool = [...rooms].sort((a, b) => (a.base_price ?? 0) - (b.base_price ?? 0)).slice(0, 12);
  const n = pool.length;
  const memo = new Map<string, number>();
  const price = (r: AllocRoom, g: number) => {
    const k = `${r.id}:${g}`;
    let v = memo.get(k);
    if (v === undefined) memo.set(k, (v = priceOf(r, g)));
    return v;
  };

  const feasible: (RoomOption & { rooms: number })[] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const set: AllocRoom[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) set.push(pool[i]);
    if (set.length > party.adults) continue; // each room needs an adult
    if (set.reduce((sum, r) => sum + roomCap(r), 0) < total) continue;
    const a = allocateGuests(set, party);
    if (!isFullyPlaced(a)) continue;
    feasible.push({
      ids: set.map((r) => r.id),
      total: set.reduce((sum, r) => sum + price(r, partySize(a.byRoom[r.id])), 0),
      extraGuests: extraGuestsIn(set, a),
      rooms: set.length,
    });
  }
  if (feasible.length === 0) return none;

  const strip = ({ ids, total, extraGuests }: RoomOption & { rooms: number }): RoomOption => ({ ids, total, extraGuests });
  // Cheapest first; on a tie fewer rooms, then fewer extra guests.
  const byValue = (x: (typeof feasible)[number], y: (typeof feasible)[number]) => x.total - y.total || x.rooms - y.rooms || x.extraGuests - y.extraGuests;
  const best = [...feasible].sort(byValue)[0];
  const roomier = feasible.filter((o) => o.extraGuests < best.extraGuests).sort(byValue)[0];
  return { bestValue: strip(best), moreSpace: roomier ? strip(roomier) : null };
}
