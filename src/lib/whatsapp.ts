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
 */
export function guestTrackingUrl(origin: string, guestPhone: string): string {
  return `${origin}/booking-status?phone=${encodeURIComponent(guestPhone)}`;
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
  totalAmount: number;
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
 * Single source of truth for the payment-reminder amount logic:
 * - If no advance recorded yet (advancePaid = 0), suggest a 25% advance.
 * - If an advance is already recorded, ask for the remaining balance.
 * - If fully paid, callers should not show this reminder at all — this
 *   function still degrades gracefully if it's called anyway.
 */
export function paymentDueAmount(totalAmount: number, advancePaid: number): number {
  if (advancePaid === 0) return Math.round(totalAmount * 0.25);
  return Math.max(0, totalAmount - advancePaid);
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
 */
export function buildPaymentReminderText({
  guestName,
  totalAmount,
  advancePaid,
  checkIn,
  propertyName,
  upiId,
  ownerPhone,
  trackingUrl,
}: PaymentReminderInput): string {
  const due     = paymentDueAmount(totalAmount, advancePaid);
  const balance = Math.max(0, totalAmount - advancePaid);

  let amountLine: string;
  let contextLine: string;

  if (advancePaid === 0) {
    amountLine  = `₹${due.toLocaleString("en-IN")} (25% advance to confirm your booking)`;
    contextLine = `Total booking amount: ₹${totalAmount.toLocaleString("en-IN")}`;
  } else if (balance > 0) {
    amountLine  = `₹${due.toLocaleString("en-IN")} (remaining balance)`;
    contextLine = `Advance paid: ₹${advancePaid.toLocaleString("en-IN")} · Total: ₹${totalAmount.toLocaleString("en-IN")}`;
  } else {
    amountLine  = "fully paid ✓";
    contextLine = `Total: ₹${totalAmount.toLocaleString("en-IN")}`;
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
    `${contextLine}\n\n` +
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
