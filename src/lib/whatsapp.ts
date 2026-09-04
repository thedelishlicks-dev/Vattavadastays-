/**
 * WhatsApp deep link helpers — wa.me only, no API needed.
 * All links open the guest's native WhatsApp app.
 * Indian numbers only — always prefixes 91.
 */

function clean(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function link(phone: string, text: string): string {
  return `https://wa.me/${clean(phone)}?text=${encodeURIComponent(text)}`;
}

/**
 * Builds the guest-facing booking tracking URL — status, invoice, and
 * payment in one place. Pass window.location.origin as `origin`.
 *
 * Pass `propertyId` whenever it's available (i.e. every current call
 * site) so the tracking page can scope its lookup to just this property
 * and show its name in the header — otherwise a guest who has ever booked
 * at more than one property under the same phone number sees every
 * property's bookings mixed together with no way to tell them apart. Omit
 * only for backward compatibility with old links already sent before this
 * param existed; those still work, just without the scoping/branding.
 */
export function guestTrackingUrl(origin: string, guestPhone: string, propertyId?: string): string {
  const propertyParam = propertyId ? `&property=${encodeURIComponent(propertyId)}` : "";
  return `${origin}/booking-status?phone=${encodeURIComponent(guestPhone)}${propertyParam}`;
}

/** Guest taps "Book via WhatsApp" on the guest page */
export function bookingInquiryLink({
  ownerWhatsapp,
  propertyName,
  roomName,
  checkIn,
  checkOut,
  guests,
  guestName,
  guestPhone,
}: {
  ownerWhatsapp: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  guestName?: string;
  guestPhone?: string;
}): string {
  const text =
    `Hi, I'd like to book ${roomName} at ${propertyName}.\n` +
    `Check-in: ${checkIn}\n` +
    `Check-out: ${checkOut}\n` +
    `Guests: ${guests}\n\n` +
    `My name: ${guestName ?? ""}\n` +
    `Phone: ${guestPhone ?? ""}`;
  return link(ownerWhatsapp, text);
}

/** Owner sends booking confirmation to guest */
export function confirmationLink({
  guestPhone,
  guestName,
  propertyName,
  roomName,
  checkIn,
  checkOut,
  ownerPhone,
  trackingUrl,
}: {
  guestPhone: string;
  guestName: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  ownerPhone: string;
  /** Optional link to the guest's booking-status page (status, invoice, payment) */
  trackingUrl?: string;
}): string {
  const text =
    `Dear ${guestName}, your booking at ${propertyName} is confirmed! ✅\n\n` +
    `Room: ${roomName}\n` +
    `Check-in: ${checkIn}\n` +
    `Check-out: ${checkOut}\n\n` +
    (trackingUrl
      ? `📋 View your booking status, invoice & make payments anytime here:\n${trackingUrl}\n\n`
      : "") +
    `Any questions, call us: +91 ${ownerPhone.replace(/\D/g, "").slice(-10)}`;
  return link(guestPhone, text);
}

/** Owner sends directions to guest */
export function directionsLink({
  guestPhone,
  guestName,
  propertyName,
  lat,
  lng,
  ownerPhone,
  landmark,
}: {
  guestPhone: string;
  guestName: string;
  propertyName: string;
  lat: number;
  lng: number;
  ownerPhone: string;
  landmark?: string;
}): string {
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
  const text =
    `Hi ${guestName}, here's how to reach ${propertyName}:\n\n` +
    `📍 Google Maps: ${mapsUrl}\n` +
    (landmark ? `Landmark: ${landmark}\n` : "") +
    `\nCall us when you reach Munnar: +91 ${ownerPhone.replace(/\D/g, "").slice(-10)}`;
  return link(guestPhone, text);
}

/**
 * Shape shared by every payment-reminder call site. Keeping this as one
 * type (instead of each caller inlining its own fields) is what stops the
 * message text, amount math, and links from drifting apart again.
 */
export interface PaymentReminderInput {
  guestName: string;
  /** Room/stay charge only. Extra charges go in chargesTotal below. */
  totalAmount: number;
  /** Sum of all "extra charges" tab entries (qty × unit_price). Defaults to 0. */
  chargesTotal?: number;
  /** Discount applied to the booking. Defaults to 0. */
  discount?: number;
  advancePaid: number;
  checkIn: string;
  propertyName: string;
  /** UPI VPA only — e.g. "name@bank". NEVER pass a phone number here. */
  upiId?: string;
  ownerPhone?: string;
  /** Link to the guest's booking-status page (status, invoice, payment). */
  trackingUrl: string;
}

/**
 * Single source of truth for the payment-reminder amount logic. This MUST
 * be computed the same way as the tracking page / admin balance:
 *   grandTotal = totalAmount + chargesTotal - discount
 * - If no advance recorded yet (advancePaid = 0), suggest a 25% advance
 *   on the grand total (so extra charges aren't quietly excluded).
 * - If an advance is already recorded, ask for the remaining balance.
 * - If fully paid, callers should not show this reminder at all — this
 *   function still degrades gracefully if it's called anyway.
 */
export function paymentDueAmount(grandTotal: number, advancePaid: number): number {
  if (advancePaid === 0) return Math.round(grandTotal * 0.25);
  return Math.max(0, grandTotal - advancePaid);
}

/**
 * Builds the payment-reminder message text. Every screen that sends a
 * payment reminder (bookings list, booking detail, dashboard modal) must
 * call this — never hand-roll the copy or the amount math again.
 *
 * The tracking link is the ONE thing we ask the guest to tap: it hosts a
 * "Pay via UPI" button that deep-links straight into GPay/PhonePe/Paytm
 * with the amount pre-filled. The raw UPI ID is offered only as a labelled
 * fallback for guests who'd rather paste it manually — never presented as
 * a second, separate action, to avoid the "which one do I use?" confusion.
 *
 * NOTE: the fallback UPI ID must be a real UPI VPA. Never substitute the
 * owner's phone number — a bare phone number is not guaranteed to be a
 * valid payment handle and can silently misroute the payment.
 *
 * NOTE: totalAmount is the room charge ONLY. Extra charges (food, late
 * checkout, damages, etc. entered in the "Extra charges" tab) must be
 * passed in chargesTotal, and any discount in discount — otherwise the
 * balance shown here will silently under-count what's actually owed,
 * same as the balance shown on the tracking page and admin dashboard.
 */
export function buildPaymentReminderText({
  guestName,
  totalAmount,
  chargesTotal = 0,
  discount = 0,
  advancePaid,
  checkIn,
  propertyName,
  upiId,
  ownerPhone,
  trackingUrl,
}: PaymentReminderInput): string {
  const grandTotal = totalAmount + chargesTotal - discount;
  const due     = paymentDueAmount(grandTotal, advancePaid);
  const balance = Math.max(0, grandTotal - advancePaid);

  const breakdownLine = chargesTotal > 0 || discount > 0
    ? `(Room: ₹${totalAmount.toLocaleString("en-IN")}` +
      (chargesTotal > 0 ? ` + Extra charges: ₹${chargesTotal.toLocaleString("en-IN")}` : "") +
      (discount > 0 ? ` − Discount: ₹${discount.toLocaleString("en-IN")}` : "") +
      `)\n`
    : "";

  let amountLine: string;
  let contextLine: string;

  if (advancePaid === 0) {
    amountLine  = `₹${due.toLocaleString("en-IN")} (25% advance to confirm your booking)`;
    contextLine = `Total booking amount: ₹${grandTotal.toLocaleString("en-IN")}\n${breakdownLine}`;
  } else if (balance > 0) {
    amountLine  = `₹${due.toLocaleString("en-IN")} (remaining balance)`;
    contextLine = `Advance paid: ₹${advancePaid.toLocaleString("en-IN")} · Total: ₹${grandTotal.toLocaleString("en-IN")}\n${breakdownLine}`;
  } else {
    amountLine  = "fully paid ✓";
    contextLine = `Total: ₹${grandTotal.toLocaleString("en-IN")}\n${breakdownLine}`;
  }

  const payBlock = `👉 Pay ₹${due.toLocaleString("en-IN")} here (tap "Pay via UPI" on the page):\n${trackingUrl}\n\n`;

  const upiFallback = upiId
    ? (
        `Prefer to pay directly in your UPI app instead of the link above? Use this UPI ID:\n` +
        `${upiId}\n\n`
      )
    : "";

  const helpLine = ownerPhone
    ? `Call us at +91 ${ownerPhone.replace(/\D/g, "").slice(-10)} if you need help.`
    : "Call us if you need help.";

  return (
    `Hi ${guestName}, friendly reminder 🙏\n\n` +
    `Payment of ${amountLine} is pending for your stay at ${propertyName} on ${checkIn}.\n` +
    `${contextLine}\n` +
    payBlock +
    upiFallback +
    helpLine
  );
}

/** Owner sends payment reminder to guest — returns a ready-to-open wa.me link. */
export function paymentReminderLink(
  input: PaymentReminderInput & { guestPhone: string }
): string {
  const { guestPhone, ...rest } = input;
  return link(guestPhone, buildPaymentReminderText(rest));
}

/** Owner sends day-before reminder to guest */
export function dayBeforeReminderLink({
  guestPhone,
  guestName,
  propertyName,
  checkInTime,
  ownerPhone,
}: {
  guestPhone: string;
  guestName: string;
  propertyName: string;
  checkInTime: string;
  ownerPhone: string;
}): string {
  const text =
    `Hi ${guestName}, looking forward to your arrival tomorrow at ${propertyName}! 🌿\n\n` +
    `Check-in from ${checkInTime}.\n` +
    `Call us when you're on the way: +91 ${ownerPhone.replace(/\D/g, "").slice(-10)}`;
  return link(guestPhone, text);
}

/** Returns a clean tel: href for Indian numbers — always +91 */
export function telLink(phone: string): string {
  return `tel:+${clean(phone)}`;
}
