/**
 * WhatsApp deep link helpers — wa.me only, no API needed.
 * All links open the guest's native WhatsApp app.
 * Indian numbers only — always prefixes 91.
 */

function clean(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Already has country code
  if (digits.startsWith("91") && digits.length === 12) return digits;
  // 10-digit mobile number
  if (digits.length === 10) return `91${digits}`;
  // Fallback — return as-is
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

/** Owner sends payment reminder to guest */
export function paymentReminderLink({
  guestPhone,
  guestName,
  amount,
  checkIn,
  propertyName,
}: {
  guestPhone: string;
  guestName: string;
  amount: number;
  checkIn: string;
  propertyName: string;
}): string {
  const text =
    `Hi ${guestName}, friendly reminder 🙏\n\n` +
    `Payment of ₹${amount.toLocaleString("en-IN")} is pending for your stay at ${propertyName} on ${checkIn}.\n\n` +
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
