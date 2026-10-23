 // src/lib/guestSplit.ts — how many guests are in EACH room of an owner's multi-room booking.
//
// The Add Booking form has one "Total guests" box. It used to be applied to every selected room,
// so 4 guests across two 2-guest rooms priced (and saved) each room for 4 guests: extra-guest
// charges that nobody owed, and a stored guest count of 8. Now the total is divided between the
// rooms, and the owner can adjust the split room by room.

export interface SplitRoom { id: string }

/**
 * Guests per room. One room gets everyone. For several rooms the total is shared as evenly
 * as possible (extra guests go to the first rooms) with at least one guest in every room.
 * `overrides` (the owner's own per-room numbers) win when they cover every selected room.
 */
export function splitGuests(total: number, rooms: SplitRoom[], overrides?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const n = rooms.length;
  if (n === 0) return out;
  const t = Math.max(1, Math.floor(total) || 1);
  if (n === 1) { out[rooms[0].id] = t; return out; }

  if (overrides && rooms.every((r) => Number.isInteger(overrides[r.id]) && overrides[r.id] >= 1)) {
    for (const r of rooms) out[r.id] = overrides[r.id];
    return out;
  }
  const base = Math.floor(t / n);
  const extra = t % n;
  rooms.forEach((r, i) => { out[r.id] = Math.max(1, base + (i < extra ? 1 : 0)); });
  return out;
}

export function sumGuests(split: Record<string, number>): number {
  return Object.values(split).reduce((s, g) => s + g, 0);
}
