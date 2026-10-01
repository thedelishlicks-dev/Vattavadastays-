// src/lib/quoteBuilder.ts
//
// Pure helpers for the quote builder: room pricing (identical to the guest
// booking flow in useCreateBooking.ts), the WhatsApp message, and status
// helpers. No React / Supabase. Builds on lib/quotes.ts (add-on pricing).

import { clean } from "./whatsapp";
import { formatINR, lineToCharges, nightsBetween, stayDates, UNIT_LABELS, type QuoteLine } from "./quotes";

// ── Rooms ───────────────────────────────────────────────────────────────────

export interface QuoteRoom {
  id: string;
  name: string;
  base_price: number;
  extra_guest_price: number;
  weekend_multiplier: number;
  max_guests: number;
}

export interface RoomQuoteLine {
  room_id: string;
  name: string;
  guests: number;
  nights: number;
  room_price: number;
  extra_guest_charge: number;
  total: number;
  weekend_nights: number;
  override_nights: number;
}

/** Friday and Saturday nights — the same rule as the guest booking flow. */
export function isWeekendNight(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow === 5 || dow === 6;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Prices one room for a stay with EXACTLY the rule guests are charged:
 *  - per night, a per-date price_override (availability table) wins;
 *  - otherwise base_price × weekend_multiplier on Fri/Sat nights;
 *  - extra guests = max(0, guests − max_guests) × extra_guest_price × nights.
 * `overrides` maps "YYYY-MM-DD" → price_override for THIS room.
 */
export function priceRoomStay(input: {
  room: QuoteRoom;
  guests: number;
  checkIn: string;
  checkOut: string;
  overrides?: Record<string, number>;
}): RoomQuoteLine {
  const { room, checkIn, checkOut } = input;
  // Empty / partial dates → 0 nights (never NaN, which would show as ₹NaN).
  const rawNights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const nights = Number.isFinite(rawNights) ? rawNights : 0;
  const guests = Math.max(1, Math.floor(input.guests || 1));
  const dates = nights > 0 ? stayDates(checkIn, checkOut) : [];

  let roomPrice = 0;
  let weekendNights = 0;
  let overrideNights = 0;
  for (const date of dates) {
    const override = input.overrides?.[date];
    if (override) {
      roomPrice += Number(override);
      overrideNights += 1;
    } else {
      const weekend = isWeekendNight(date);
      if (weekend && (room.weekend_multiplier ?? 1) !== 1) weekendNights += 1;
      roomPrice += room.base_price * (weekend ? (room.weekend_multiplier ?? 1) : 1);
    }
  }
  const extra = Math.max(0, guests - room.max_guests) * (room.extra_guest_price ?? 0) * nights;
  const rp = round2(roomPrice);
  return {
    room_id: room.id,
    name: room.name,
    guests,
    nights,
    room_price: rp,
    extra_guest_charge: round2(extra),
    total: round2(rp + extra),
    weekend_nights: weekendNights,
    override_nights: overrideNights,
  };
}

// ── Dates & status ──────────────────────────────────────────────────────────

/** Today as YYYY-MM-DD in the device's local time (not UTC). */
export function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDate(date: string, withYear = false): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "lost";
export type DisplayStatus = QuoteStatus | "expired";

/** A sent quote past its valid_until date reads as "expired". */
export function displayStatus(q: { status: QuoteStatus; valid_until: string | null }, today = todayStr()): DisplayStatus {
  if (q.status === "sent" && q.valid_until && q.valid_until < today) return "expired";
  return q.status;
}

// ── WhatsApp message ────────────────────────────────────────────────────────

export interface QuoteMessageInput {
  propertyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  rooms: RoomQuoteLine[];
  lines: QuoteLine[];
  discount: number;
  total: number;
  validUntil: string | null;
  ownerPhone?: string | null;
}

function lineDescriptor(l: QuoteLine): string {
  const people = `${l.multiplier} guest${l.multiplier === 1 ? "" : "s"}`;
  const days = `${l.days} day${l.days === 1 ? "" : "s"}`;
  if (l.unit === "per_person_day") return ` × ${people} × ${days}`;
  if (l.unit === "per_person") return ` × ${people}`;
  if (l.unit === "per_day") return ` × ${days}`;
  return l.multiplier !== 1 ? ` × ${l.multiplier}` : "";
}

/**
 * The guest-facing quote. Every screen that sends a quote (builder, list
 * "resend") must use this so the preview and the sent text never drift.
 * The "Standard" variant label is hidden — it's just the default name.
 */
export function buildQuoteText(i: QuoteMessageInput): string {
  const nights = nightsBetween(i.checkIn, i.checkOut);
  const out: string[] = [];
  out.push(`Hi ${i.guestName?.trim() || "there"}, thanks for your enquiry at ${i.propertyName}! Here's your quote:`);
  out.push("");
  out.push(
    `📅 ${fmtDate(i.checkIn)} – ${fmtDate(i.checkOut, true)} (${nights} night${nights === 1 ? "" : "s"}) · ${i.guestCount} guest${i.guestCount === 1 ? "" : "s"}`,
  );
  out.push("");
  for (const r of i.rooms) {
    out.push(`🛏 ${r.name} × ${r.nights} night${r.nights === 1 ? "" : "s"} — ${formatINR(r.total)}`);
  }
  for (const l of i.lines) {
    const variant = l.variant_label && l.variant_label.toLowerCase() !== "standard" ? ` (${l.variant_label})` : "";
    const seasons = Array.from(new Set(l.breakdown.filter((s) => s.source === "season" && s.season_name).map((s) => s.season_name)));
    const rates = seasons.length ? ` (incl. ${seasons.join(", ")} rates)` : "";
    out.push(`${l.kind === "package" ? "🎁" : "➕"} ${l.name}${variant}${lineDescriptor(l)}${rates} — ${formatINR(l.subtotal)}`);
    if (l.kind === "package" && l.includes.length) out.push(`   ↳ ${l.includes.join(" · ")}`);
  }
  if (i.discount > 0) out.push(`🏷 Discount — −${formatINR(i.discount)}`);
  out.push("━━━━━━━━━━");
  out.push(`Total: ${formatINR(i.total)}`);
  if (i.validUntil) out.push(`Valid till ${fmtDate(i.validUntil)}`);
  out.push("");
  out.push("To confirm, reply YES and we'll share the payment details.");
  if (i.ownerPhone) out.push(`Questions? Call +91 ${i.ownerPhone.replace(/\D/g, "").slice(-10)}`);
  return out.join("\n");
}

/** wa.me deep link — no API. Same pattern as lib/whatsapp.ts. */
export function quoteLink(guestPhone: string, text: string): string {
  return `https://wa.me/${clean(guestPhone)}?text=${encodeURIComponent(text)}`;
}

// ── Converting a quote into a booking ───────────────────────────────────────

/** What the booking modal needs to turn an accepted quote into a booking. */
export interface QuoteConversion {
  quoteId: string;
  guestName: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  rooms: RoomQuoteLine[];
  lines: QuoteLine[];
  /** Whole-quote discount, carried over as the booking's discount. */
  discount: number;
  /** Called with the new booking's id once it is saved (links the quote). */
  onConverted?: (bookingId: string) => Promise<void> | void;
}

/** Add-on lines → booking_charges rows (one per price segment, exact prices). */
export function chargesFromQuote(lines: QuoteLine[]): { description: string; qty: number; unit_price: number }[] {
  return lines.flatMap(lineToCharges);
}

/** Quote phone (digits) → the "+91 98765 43210" shape the booking form uses. */
export function formPhoneFromQuote(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const ten = d.length >= 10 ? d.slice(-10) : d;
  return ten.length === 10 ? `+91 ${ten}` : "+91 ";
}

interface RoomTotalLike {
  room: { id: string; name?: string };
  roomPrice: number;
  extraCharge: number;
  total: number;
}

/**
 * While the booking's dates still match the quote, each quoted room keeps
 * EXACTLY the quoted price and guest count (the guest agreed to that number,
 * even if rates have moved since). Rooms not in the quote, or any room once
 * the dates change, fall back to live pricing.
 */
export function lockToQuote<T extends RoomTotalLike>(
  live: T[],
  quoteRooms: RoomQuoteLine[] | undefined,
  active: boolean,
  fallbackGuests: number,
): (T & { guests: number; locked: boolean })[] {
  return live.map((rt) => {
    const q = active ? quoteRooms?.find((r) => r.room_id === rt.room.id) : undefined;
    return q
      ? { ...rt, roomPrice: q.room_price, extraCharge: q.extra_guest_charge, total: q.total, guests: q.guests, locked: true }
      : { ...rt, guests: fallbackGuests, locked: false };
  });
}

/** Rooms whose live room rate (excluding extra guests) now differs from the quote. */
export function quotePriceDrift(
  live: RoomTotalLike[],
  locked: (RoomTotalLike & { locked: boolean })[],
): { name: string; quoted: number; now: number }[] {
  return locked
    .filter((rt) => rt.locked)
    .map((rt) => ({
      name: rt.room.name ?? "Room",
      quoted: rt.roomPrice,
      now: live.find((l) => l.room.id === rt.room.id)?.roomPrice ?? rt.roomPrice,
    }))
    .filter((d) => Math.abs(d.quoted - d.now) > 0.5);
}

export { UNIT_LABELS };
