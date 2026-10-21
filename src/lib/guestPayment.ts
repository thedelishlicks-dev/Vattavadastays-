// src/lib/guestPayment.ts
//
// Which payment choices the GUEST form offers. The owner sets them in Settings:
//   __pmethods:  accepted methods (default: UPI + Cash on Arrival)
//   __upi:       their UPI ID
// The guest form used to ignore both: it always offered UPI — even with no UPI ID
// set, so the guest was told to "pay 25% via UPI" with nothing to pay to.

export type GuestPayment = "UPI" | "Cash on Arrival";

const DEFAULT_METHODS = ["UPI", "Cash on Arrival"];

/** The owner's accepted methods, as saved in properties.shared_amenities. */
export function acceptedMethods(shared: string[] | null | undefined): string[] {
  const entry = (shared ?? []).find((a) => a.startsWith("__pmethods:"));
  if (!entry) return DEFAULT_METHODS;
  try {
    const parsed = JSON.parse(decodeURIComponent(entry.slice("__pmethods:".length)));
    return Array.isArray(parsed) ? parsed.map(String) : DEFAULT_METHODS;
  } catch {
    return DEFAULT_METHODS;
  }
}

/**
 * What to offer a guest, in order. UPI only when the owner accepts it AND has set a
 * UPI ID (otherwise there is nothing to pay to). Cash on arrival when accepted.
 * Never empty: if the owner's setup leaves nothing usable, cash on arrival is offered
 * so a guest can always send a request (the owner confirms terms by phone/WhatsApp).
 */
export function guestPaymentOptions(shared: string[] | null | undefined, upiId: string | null): GuestPayment[] {
  const methods = acceptedMethods(shared);
  const out: GuestPayment[] = [];
  if (methods.includes("UPI") && upiId) out.push("UPI");
  if (methods.includes("Cash on Arrival")) out.push("Cash on Arrival");
  return out.length > 0 ? out : ["Cash on Arrival"];
}

/** One line under the selector telling the guest what happens next for the chosen method. */
export function paymentNote(method: GuestPayment): string {
  return method === "UPI"
    ? "Pay 25% advance via UPI to confirm. Full balance due on arrival."
    : "No advance needed. Pay the full amount on arrival at the property.";
}
