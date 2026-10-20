// src/lib/phone.ts — Indian mobile numbers: typing, pasting, validating and wa.me links.
//
// People write the same number many ways: "98765 43210", "+91 98765 43210",
// "919876543210", "09876543210", "0091 98765 43210". The guest form used to WIPE
// anything pasted without "+91", and WhatsApp links broke on a leading 0.
// One set of rules lives here; every form and link uses it.

/** The 10-digit national number if one can be read from `raw`, else whatever digits were given. */
export function nationalDigits(raw: string): string {
  const hasPlus = raw.trim().startsWith("+");
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0091")) d = d.slice(4);                       // 0091 98765 43210
  else if (d.startsWith("91") && (hasPlus || d.length > 10)) d = d.slice(2); // +91… or 91 + 10 digits
  if (d.startsWith("0")) d = d.slice(1);                          // trunk zero: 098765 43210
  return d;
}

/** What the phone input should show while typing or after a paste: "+91 " + up to 10 digits. */
export function formatIndianPhoneInput(raw: string): string {
  return "+91 " + nationalDigits(raw).slice(0, 10);
}

/** A complete Indian mobile number: exactly 10 digits, starting 6-9. */
export function isValidIndianMobile(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(nationalDigits(raw));
}

/** Digits for https://wa.me/<digits> — always with the 91 country code. Unreadable input is returned as bare digits. */
export function waDigits(phone: string): string {
  const d = nationalDigits(phone);
  return d.length === 10 ? `91${d}` : phone.replace(/\D/g, "");
}
