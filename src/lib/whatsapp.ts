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
}: {
  guestPhone: string;
  guestName: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  ownerPhone: string;
}): string {
  const text =
    `Dear ${guestName}, your booking at ${propertyName} is confirmed! ✅\n\n` +
    `Room: ${roomName}\n` +
    `Check-in: ${checkIn}\n` +
    `Check-out: ${checkOut}\n\n` +
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
 * Owner sends payment reminder to guest.
 *
 * Logic:
 * - If no advance recorded yet (advancePaid = 0), ask for 25% advance.
 * - If advance already recorded, ask for the remaining balance.
 * - If fully paid, the caller should not show this link at all,
 *   but we handle it gracefully just in case.
 */
export function paymentReminderLink({
  guestPhone,
  guestName,
  totalAmount,
  advancePaid,
  checkIn,
  propertyName,
  upiId,
}: {
  guestPhone: string;
  guestName: string;
  totalAmount: number;
  advancePaid: number;
  checkIn: string;
  propertyName: string;
  upiId?: string;
}): string {
  const suggested25 = Math.round(totalAmount * 0.25);
  const balance     = Math.max(0, totalAmount - advancePaid);

  let amountLine: string;
  let contextLine: string;

  if (advancePaid === 0) {
    // No advance recorded — ask for 25% to confirm
    amountLine  = `₹${suggested25.toLocaleString("en-IN")} (25% advance to confirm your booking)`;
    contextLine = `Total booking amount: ₹${totalAmount.toLocaleString("en-IN")}`;
  } else if (balance > 0) {
    // Advance received, balance still pending
    amountLine  = `₹${balance.toLocaleString("en-IN")} (remaining balance)`;
    contextLine = `Advance paid: ₹${advancePaid.toLocaleString("en-IN")} · Total: ₹${totalAmount.toLocaleString("en-IN")}`;
  } else {
    // Fully paid — shouldn't normally be called, but handle gracefully
    amountLine  = "fully paid ✓";
    contextLine = `Total: ₹${totalAmount.toLocaleString("en-IN")}`;
  }

  const text =
    `Hi ${guestName}, friendly reminder 🙏\n\n` +
    `Payment of ${amountLine} is pending for your stay at ${propertyName} on ${checkIn}.\n` +
    `${contextLine}\n\n` +
    (upiId
      ? `UPI ID: ${upiId}\n` +
        `Amount: ₹${(advancePaid === 0 ? suggested25 : balance).toLocaleString("en-IN")}\n\n` +
        `Open GPay / PhonePe / Paytm → Send money → paste the UPI ID above.\n\n`
      : "") +
    `Please transfer at your earliest convenience. Thank you!`;

  return link(guestPhone, text);
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
