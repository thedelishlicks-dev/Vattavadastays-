// src/lib/bookingConfirmation.ts
//
// The guest's "Request sent!" screen.
//
// It used to be drawn from the CURRENT room selection plus a few state variables, so:
//   • touching the calendar afterwards swapped the summary under the old reference, and
//     choosing new dates brought back "Request sent!" for a booking never submitted;
//   • a reload lost it entirely — likely, because the phone jumps to GPay and the
//     browser can discard the tab.
// Now a snapshot of what was booked is saved when the booking succeeds and the screen is
// drawn from the snapshot alone. It is kept on the guest's own device for 24 hours and
// can be dismissed ("Book another stay").

import type { GuestPayment } from "./guestPayment";

export interface Confirmation {
  v: 1;
  savedAt: number;
  propertyId: string;
  name: string;
  phone: string;
  bookingId: string;
  groupRef: string | null;
  ownerNotifyLink: string | null;
  rooms: { name: string; total: number }[];
  checkIn: string;
  checkOut: string;
  nights: number;
  totalGuests: number;
  grandTotal: number;
  payment: GuestPayment;
  requests: string;
  /** Which selection was booked, so the form hides only for exactly that selection. */
  selectionKey: string;
}

export const CONFIRMATION_KEY = "stayidom:last-booking";
export const CONFIRMATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's localStorage if usable (private modes and some webviews throw), else null. */
export function browserStore(): Store | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Identifies a selection: the same rooms for the same dates. */
export function selectionKey(selections: { roomId: string; checkIn: string; checkOut: string }[]): string {
  if (selections.length === 0) return "";
  const rooms = selections.map((s) => s.roomId).sort().join(",");
  return `${rooms}|${selections[0].checkIn}|${selections[0].checkOut}`;
}

export function saveConfirmation(store: Store | null | undefined, c: Confirmation): void {
  try { store?.setItem(CONFIRMATION_KEY, JSON.stringify(c)); } catch { /* storage full / blocked: the screen still shows this session */ }
}

export function clearConfirmation(store: Store | null | undefined): void {
  try { store?.removeItem(CONFIRMATION_KEY); } catch { /* ignore */ }
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The saved confirmation for THIS property, if it exists, is intact and is under 24 hours old. */
export function loadConfirmation(store: Store | null | undefined, propertyId: string, now: number = Date.now()): Confirmation | null {
  let raw: string | null = null;
  try { raw = store?.getItem(CONFIRMATION_KEY) ?? null; } catch { return null; }
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<Confirmation>;
    const ok =
      c && c.v === 1 && c.propertyId === propertyId &&
      isNum(c.savedAt) && now - c.savedAt >= -60_000 && now - c.savedAt <= CONFIRMATION_MAX_AGE_MS &&
      isStr(c.name) && isStr(c.phone) && isStr(c.bookingId) && isStr(c.checkIn) && isStr(c.checkOut) &&
      isNum(c.nights) && isNum(c.totalGuests) && isNum(c.grandTotal) && isStr(c.selectionKey) && isStr(c.requests) &&
      (c.payment === "UPI" || c.payment === "Cash on Arrival") &&
      Array.isArray(c.rooms) && c.rooms.every((r) => r && isStr(r.name) && isNum(r.total));
    if (!ok) { clearConfirmation(store); return null; }
    return c as Confirmation;
  } catch {
    clearConfirmation(store);
    return null;
  }
}
