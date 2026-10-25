// src/lib/blockDates.ts — what the "Block dates" dialog works out. Pure functions.
//
// Closing the property for a festival used to mean: pick a room, tap every single day,
// save, then repeat for every other room (rooms × days of taps). Now several rooms and a
// date range can be chosen at once.

const dayMs = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const MAX_RANGE_DAYS = 366;
export const UPSERT_CHUNK = 500;

/** Every date from `a` to `b` inclusive, in either order (tap order doesn't matter). Capped at a year. */
export function datesBetween(a: string, b: string): string[] {
  const [from, to] = toMs(a) <= toMs(b) ? [toMs(a), toMs(b)] : [toMs(b), toMs(a)];
  const out: string[] = [];
  for (let t = from; t <= to && out.length < MAX_RANGE_DAYS; t += dayMs) out.push(fmt(t));
  return out;
}

/** The availability rows to write: every chosen room × every chosen date, closed, with the owner's note. */
export function blockRows(roomIds: string[], dates: string[], note: string) {
  const n = note.trim() || null;
  const rows: { room_id: string; date: string; is_available: false; note: string | null }[] = [];
  for (const room_id of roomIds) for (const date of dates) rows.push({ room_id, date, is_available: false, note: n });
  return rows;
}

export function chunk<T>(arr: T[], size: number = UPSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Selected dates that already have a booking, per room. Blocking them doesn't cancel the booking,
 * so the dialog warns first. `bookedByRoom` maps room id -> its booked dates.
 */
export function findBlockConflicts(
  dates: string[],
  roomIds: string[],
  bookedByRoom: Record<string, string[]>,
): { roomId: string; dates: string[] }[] {
  const out: { roomId: string; dates: string[] }[] = [];
  for (const roomId of roomIds) {
    const booked = new Set(bookedByRoom[roomId] ?? []);
    const hit = dates.filter((d) => booked.has(d)).sort();
    if (hit.length > 0) out.push({ roomId, dates: hit });
  }
  return out;
}

/** "Saved 500 of 1,200" style progress for a partial failure, so the owner knows nothing is lost by retrying. */
export function partialSaveMessage(saved: number, total: number, reason: string): string {
  return `Blocked ${saved.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}. ${reason} Tap Block again — dates already blocked stay blocked.`;
}
