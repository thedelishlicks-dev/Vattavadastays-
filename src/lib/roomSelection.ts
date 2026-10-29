// src/lib/roomSelection.ts
//
// One room in the guest's booking: who sleeps in it and what it costs. Prices come from
// priceRoomStay() (HANDOVER rule 5) plus the extra-guest charge, exactly as the booking is
// stored; the database re-prices every guest booking anyway (rule 19).

import { differenceInCalendarDays, format } from "date-fns";
import type { Room } from "@/types/database";
import { priceRoomStay } from "@/lib/quoteBuilder";
import { extraGuestCount } from "@/lib/guestCount";
import type { RoomRate } from "@/lib/roomRates";

export type BookingDetails = {
  room: Room;
  adults: number;
  children: number;
  nights: number;
  total: number;
  checkIn: string;
  checkOut: string;
  extraGuestCharge: number;
};

export function stayNights(checkIn: Date, checkOut: Date): number {
  return Math.max(1, differenceInCalendarDays(checkOut, checkIn));
}

/** What the room itself costs for the stay (no extra guests), with the seasonal info. */
export function roomStayPrice(room: Room, checkIn: Date | null, checkOut: Date | null, rates?: readonly RoomRate[]) {
  if (!checkIn || !checkOut) return { nights: 0, roomCost: room.base_price, seasonalNights: 0, rateLabels: [] as string[] };
  const nights = stayNights(checkIn, checkOut);
  let roomCost = room.base_price * nights;
  let seasonalNights = 0;
  let rateLabels: string[] = [];
  const stay = priceRoomStay({ room, guests: 1, checkIn: format(checkIn, "yyyy-MM-dd"), checkOut: format(checkOut, "yyyy-MM-dd"), rates });
  if (stay.nights > 0) {
    roomCost = stay.room_price;
    seasonalNights = stay.seasonal_nights ?? 0;
    rateLabels = stay.rate_labels ?? [];
  }
  return { nights, roomCost, seasonalNights, rateLabels };
}

export function buildBookingDetails(
  room: Room,
  party: { adults: number; children: number },
  checkIn: Date,
  checkOut: Date,
  rates?: readonly RoomRate[],
): BookingDetails {
  const { nights, roomCost } = roomStayPrice(room, checkIn, checkOut, rates);
  const extraGuestCharge = extraGuestCount(party.adults + party.children, room.max_guests) * (room.extra_guest_price ?? 0) * nights;
  return {
    room,
    adults: party.adults,
    children: party.children,
    nights,
    total: roomCost + extraGuestCharge,
    checkIn: format(checkIn, "yyyy-MM-dd"),
    checkOut: format(checkOut, "yyyy-MM-dd"),
    extraGuestCharge,
  };
}
