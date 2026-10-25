// src/lib/calendarState.ts
//
// Pure logic behind the owner Calendar (admin.calendar.tsx) — no React, no
// Supabase, so it can be tested on its own.
//
// Every (room, date) resolves to exactly ONE state:
//   booked    a confirmed/completed booking occupies the night
//   pending   an unconfirmed guest request / hold occupies the night
//   checkout  the booking's own departure day (availability may say
//             "unavailable" because of that booking — it is NOT a manual block)
//   blocked   unavailable with no booking behind it = closed by the owner.
//             On a guest's check-out day the "unavailable" row is ambiguous (the
//             booking's own, or the owner closing that night) — unless it carries a
//             note (the owner's reason, or a synced calendar's name), which only a
//             deliberate block has, so a note makes it "blocked".
//   open      free
//
// Nights follow the app-wide rule: check-in inclusive, check-out exclusive.

export type DayState = "open" | "booked" | "pending" | "checkout" | "blocked";
export type DayInfo = { state: DayState; name?: string };

export interface CalBooking {
  room_id: string | null;
  status: string;
  guest_name: string;
  check_in: string;
  check_out: string;
}
export interface CalAvailRow {
  room_id: string;
  date: string;
  note?: string | null;
}

export interface CalIndex {
  occupied: Map<string, Map<string, { name: string; status: string }>>;
  checkouts: Map<string, Map<string, string>>;
  unavailable: Map<string, Set<string>>;
  /** Non-empty notes on unavailable rows: room -> date -> note. */
  notes: Map<string, Map<string, string>>;
}

const day = (s: string) => String(s).slice(0, 10);

/** Nights from check-in (inclusive) to check-out (exclusive), as YYYY-MM-DD — timezone-proof. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const [y1, m1, d1] = day(checkIn).split("-").map(Number);
  const [y2, m2, d2] = day(checkOut).split("-").map(Number);
  const out: string[] = [];
  const end = Date.UTC(y2, m2 - 1, d2);
  for (let t = Date.UTC(y1, m1 - 1, d1); t < end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function buildCalendarIndex(bookings: CalBooking[], availRows: CalAvailRow[]): CalIndex {
  const occupied: CalIndex["occupied"] = new Map();
  const checkouts: CalIndex["checkouts"] = new Map();
  const unavailable: CalIndex["unavailable"] = new Map();
  const notes: CalIndex["notes"] = new Map();

  for (const b of bookings) {
    if (b.status === "cancelled" || !b.room_id) continue;
    const occ = occupied.get(b.room_id) ?? new Map();
    for (const d of nightsOf(b.check_in, b.check_out)) {
      const existing = occ.get(d);
      // a pending request must never hide a confirmed booking on the same night
      if (existing && existing.status !== "pending" && b.status === "pending") continue;
      occ.set(d, { name: b.guest_name, status: b.status });
    }
    occupied.set(b.room_id, occ);

    const out = checkouts.get(b.room_id) ?? new Map();
    out.set(day(b.check_out), b.guest_name);
    checkouts.set(b.room_id, out);
  }

  for (const r of availRows) {
    const set = unavailable.get(r.room_id) ?? new Set<string>();
    set.add(day(r.date));
    unavailable.set(r.room_id, set);
    const note = (r.note ?? "").trim();
    if (note) {
      const m = notes.get(r.room_id) ?? new Map<string, string>();
      m.set(day(r.date), note);
      notes.set(r.room_id, m);
    }
  }
  return { occupied, checkouts, unavailable, notes };
}

export function stateOf(idx: CalIndex, roomId: string, date: string): DayInfo {
  const occ = idx.occupied.get(roomId)?.get(date);
  if (occ) return { state: occ.status === "pending" ? "pending" : "booked", name: occ.name };
  const out = idx.checkouts.get(roomId)?.get(date);
  const unavail = idx.unavailable.get(roomId)?.has(date) ?? false;
  if (out && unavail) {
    // A note means someone closed this night on purpose (reason typed, or a synced calendar):
    // show it as blocked so it can be seen and reopened. No note: it may just be the booking's own row.
    return idx.notes.get(roomId)?.has(date) ? { state: "blocked" } : { state: "checkout", name: out };
  }
  if (unavail) return { state: "blocked" };
  return { state: "open", name: out }; // free; `name` is only an "Out: …" hint
}

export type RoomDay = { id: string; name: string; state: DayState; guest?: string };

export type DaySummary = {
  kind: "none" | "open" | "some-free" | "full" | "blocked" | "checkout";
  free: number;
  total: number;
  /** rooms closed by the owner */
  blocked: number;
  /** rooms with a confirmed/completed booking tonight */
  booked: number;
  /** rooms with an unconfirmed guest request (needs the owner's confirmation) */
  pending: number;
  /** rooms on a guest's check-out day (guest leaves; room not yet free) */
  leaving: number;
  /** one entry per room — what the day-detail view shows (hover tooltips don't exist on touch screens) */
  rooms: RoomDay[];
  lines: string[];
};

/** One date across several rooms — for the "All rooms" view. */
export function summarizeDate(idx: CalIndex, rooms: { id: string; name: string }[], date: string): DaySummary {
  const total = rooms.length;
  let free = 0;
  let blocked = 0;
  let booked = 0;
  let pending = 0;
  let leaving = 0;
  const lines: string[] = [];
  const perRoom: RoomDay[] = [];
  for (const r of rooms) {
    const info = stateOf(idx, r.id, date);
    perRoom.push({ id: r.id, name: r.name, state: info.state, guest: info.state === "open" ? undefined : info.name });
    if (info.state === "open") free++;
    else if (info.state === "blocked") blocked++;
    else if (info.state === "pending") pending++;
    else if (info.state === "checkout") leaving++;
    else booked++;
    const label = { open: "Open", booked: "Booked", pending: "Pending", checkout: "Check-out", blocked: "Blocked" }[info.state];
    lines.push(`${r.name}: ${label}${info.state !== "open" && info.name ? ` (${info.name})` : ""}`);
  }
  let kind: DaySummary["kind"];
  if (total === 0) kind = "none";
  else if (free === total) kind = "open";
  else if (free > 0) kind = "some-free";
  else if (blocked === total) kind = "blocked";
  else if (leaving === total) kind = "checkout";
  else kind = "full";
  return { kind, free, total, blocked, booked, pending, leaving, rooms: perRoom, lines };
}

// ---------------------------------------------------------------------------
// Which booking is behind a calendar cell — so a tap can open it.
// ---------------------------------------------------------------------------

export interface CalBookingRef extends CalBooking {
  id: string;
  group_id?: string | null;
}

/**
 * The booking to show for (room, date):
 *   booked / pending -> the booking whose nights include that date (a confirmed one wins over a pending one);
 *   checkout         -> the booking that leaves that day.
 */
export function bookingForCell<T extends CalBookingRef>(
  bookings: T[],
  roomId: string,
  date: string,
  state: DayState,
): T | undefined {
  const mine = bookings.filter((b) => b.room_id === roomId && b.status !== "cancelled");
  if (state === "checkout") return mine.find((b) => day(b.check_out) === date);
  if (state !== "booked" && state !== "pending") return undefined;
  const covering = mine.filter((b) => day(b.check_in) <= date && date < day(b.check_out));
  return covering.find((b) => b.status !== "pending") ?? covering[0];
}
