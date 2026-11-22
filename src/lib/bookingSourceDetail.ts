// src/lib/bookingSourceDetail.ts — the suggested answers to "How did this guest find you?".
//
// `bookings.source` / `booking_groups.source` (direct | agent | walk_in) is unchanged and still drives
// agents and commissions. This is the finer detail kept beside it in `booking_source_detail`
// (nullable text, no DB list on purpose: a value written by another tool still reads fine).

import type { BookingSourceDetail } from "@/types/database";

export const BOOKING_SOURCE_DETAIL_OPTIONS: { value: BookingSourceDetail; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "website", label: "Website" },
  { value: "phone", label: "Phone call" },
  { value: "walk_in", label: "Walk-in" },
  { value: "repeat_guest", label: "Repeat guest" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking_com", label: "Booking.com" },
  { value: "makemytrip", label: "MakeMyTrip" },
  { value: "agoda", label: "Agoda" },
  { value: "other", label: "Other" },
];

/** Label for a stored value; unknown values are shown as written, null/empty as null. */
export function bookingSourceDetailLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return BOOKING_SOURCE_DETAIL_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
