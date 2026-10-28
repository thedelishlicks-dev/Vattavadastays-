// src/lib/guestBookingStatus.ts
//
// What the guest's "Request sent!" card says about the booking's CURRENT status.
// The card used to be a frozen snapshot: it said "will confirm your booking shortly" for
// the whole 24 hours, even after the owner confirmed it or the hold had expired and the
// dates were released. Now the card reads the live status (through the booking's secret
// tracking token) and this file turns that status into words.
//
// Pure functions (no React, no Supabase) so they are unit-tested in guestBookingStatus.test.ts.

export type GuestStatusTone = "pending" | "confirmed" | "cancelled" | "done";

export interface GuestStatusView {
  tone: GuestStatusTone;
  /** Card heading, e.g. "Request sent!" */
  heading: string;
  /** Short status pill, e.g. "Awaiting owner confirmation" */
  badge: string;
  /** One or two sentences under the heading. */
  message: string;
}

export type GuestPaymentChoice = "UPI" | "Cash on Arrival";

/**
 * @param status  bookings.status / booking_groups.status, or null/undefined while it is
 *                still loading or could not be read. Unknown values are treated as pending:
 *                the guest has just sent a request, so "awaiting the owner" is the safe wording.
 */
export function guestStatusView(
  status: string | null | undefined,
  ownerName: string,
  payment: GuestPaymentChoice,
): GuestStatusView {
  switch (status) {
    case "confirmed":
      return {
        tone: "confirmed",
        heading: "Booking confirmed!",
        badge: "Confirmed by the host",
        message: `${ownerName} has confirmed your stay. See you soon!`,
      };
    case "completed":
      return {
        tone: "done",
        heading: "Stay completed",
        badge: "Completed",
        message: "Thank you for staying with us.",
      };
    case "cancelled":
      return {
        tone: "cancelled",
        heading: "Request not confirmed",
        badge: "Cancelled or expired",
        message: `This request was cancelled or expired, so the dates have been released. Contact ${ownerName} on WhatsApp or book again.`,
      };
    default:
      return {
        tone: "pending",
        heading: "Request sent!",
        badge: "Awaiting owner confirmation",
        message:
          payment === "UPI"
            ? `${ownerName} will confirm your booking once they receive your advance payment.`
            : `${ownerName} will confirm your booking shortly.`,
      };
  }
}

/** The status of the first row a token lookup returned (a group row wins over its rooms). */
export function statusFromTokenLookup(
  result: { groups?: { status?: string }[] | null; bookings?: { status?: string }[] | null } | null | undefined,
): string | null {
  return result?.groups?.[0]?.status ?? result?.bookings?.[0]?.status ?? null;
}
