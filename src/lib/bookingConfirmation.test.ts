import test from "node:test";
import assert from "node:assert/strict";
import { saveConfirmation, loadConfirmation, clearConfirmation, selectionKey, CONFIRMATION_KEY, CONFIRMATION_MAX_AGE_MS, type Confirmation } from "./bookingConfirmation";
import { acceptedMethods, guestPaymentOptions, paymentNote } from "./guestPayment";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}
const NOW = Date.parse("2026-10-20T10:00:00Z");
const sample = (over: Partial<Confirmation> = {}): Confirmation => ({
  v: 1, savedAt: NOW, propertyId: "P1", name: "Asha", phone: "+91 9876543210", bookingId: "b-1", groupRef: "GRP-ABC123", ownerNotifyLink: "https://wa.me/91999",
  rooms: [{ name: "Deluxe", total: 4000 }], checkIn: "2027-03-01", checkOut: "2027-03-03", nights: 2, totalGuests: 2, grandTotal: 4000, payment: "UPI", requests: "Late arrival",
  selectionKey: "r1|2027-03-01|2027-03-03", ...over,
});

test("a confirmation survives a reload (save then load)", () => {
  const s = memStore();
  saveConfirmation(s, sample());
  assert.deepEqual(loadConfirmation(s, "P1", NOW + 60_000), sample());
});

test("it is only shown for the same property, and never after 24 hours", () => {
  const s = memStore(); saveConfirmation(s, sample());
  assert.equal(loadConfirmation(s, "OTHER", NOW + 1000), null);
  assert.equal(loadConfirmation(s, "P1", NOW + CONFIRMATION_MAX_AGE_MS + 1000), null);
  assert.equal(s.m.has(CONFIRMATION_KEY), false);   // an expired one is cleaned up
});

test("corrupt, partial or tampered data is ignored and removed, never thrown", () => {
  for (const bad of ["not json", "{}", JSON.stringify({ ...sample(), v: 2 }), JSON.stringify({ ...sample(), grandTotal: "free" }), JSON.stringify({ ...sample(), payment: "Bitcoin" }), JSON.stringify({ ...sample(), rooms: [{ name: 1 }] }), JSON.stringify({ ...sample(), savedAt: NOW + 10 * 3600_000 })]) {
    const s = memStore(); s.setItem(CONFIRMATION_KEY, bad);
    assert.equal(loadConfirmation(s, "P1", NOW + 1000), null, bad.slice(0, 40));
  }
});

test("dismissing clears it; unusable storage (private mode) never breaks anything", () => {
  const s = memStore(); saveConfirmation(s, sample()); clearConfirmation(s);
  assert.equal(loadConfirmation(s, "P1", NOW), null);
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
  assert.doesNotThrow(() => saveConfirmation(broken, sample()));
  assert.equal(loadConfirmation(broken, "P1", NOW), null);
  assert.doesNotThrow(() => clearConfirmation(broken));
  assert.equal(loadConfirmation(null, "P1", NOW), null);
});

test("selectionKey: same rooms and dates match in any order; different dates or rooms do not", () => {
  const a = [{ roomId: "r2", checkIn: "2027-03-01", checkOut: "2027-03-03" }, { roomId: "r1", checkIn: "2027-03-01", checkOut: "2027-03-03" }];
  const b = [{ roomId: "r1", checkIn: "2027-03-01", checkOut: "2027-03-03" }, { roomId: "r2", checkIn: "2027-03-01", checkOut: "2027-03-03" }];
  assert.equal(selectionKey(a), selectionKey(b));
  assert.notEqual(selectionKey(a), selectionKey([{ roomId: "r1", checkIn: "2027-03-02", checkOut: "2027-03-04" }]));
  assert.equal(selectionKey([]), "");
});

test("payment options follow the owner's settings and never offer UPI without a UPI ID", () => {
  assert.deepEqual(guestPaymentOptions(null, "abc@upi"), ["UPI", "Cash on Arrival"]);        // defaults
  assert.deepEqual(guestPaymentOptions(null, null), ["Cash on Arrival"]);                     // UPI accepted but no ID
  const upiOnly = [`__pmethods:${encodeURIComponent(JSON.stringify(["UPI"]))}`];
  assert.deepEqual(guestPaymentOptions(upiOnly, "abc@upi"), ["UPI"]);
  assert.deepEqual(guestPaymentOptions(upiOnly, null), ["Cash on Arrival"]);                  // never an empty choice
  const cashOnly = [`__pmethods:${encodeURIComponent(JSON.stringify(["Cash on Arrival"]))}`];
  assert.deepEqual(guestPaymentOptions(cashOnly, "abc@upi"), ["Cash on Arrival"]);
  assert.deepEqual(acceptedMethods(["__pmethods:%E0%A4%A"]), ["UPI", "Cash on Arrival"]);     // bad data -> defaults
  assert.match(paymentNote("UPI"), /25%/);
  assert.match(paymentNote("Cash on Arrival"), /No advance/);
});
