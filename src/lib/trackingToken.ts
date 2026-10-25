/**
 * A 64-character hex token for a booking's tracking link. It is generated in
 * the browser so a guest can send it with their booking insert (guests cannot
 * read the row back). 256 random bits from crypto.getRandomValues. There is
 * deliberately no Math.random fallback: a guessable token would defeat the
 * point of the link.
 */
export function newTrackingToken(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Secure random numbers are not available in this browser.");
  }
  const bytes = new Uint8Array(32);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
