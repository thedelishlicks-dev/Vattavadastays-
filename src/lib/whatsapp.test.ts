/**
 * Tests for the WhatsApp message text in whatsapp.ts.
 *
 * Run: npx tsx --test src/lib/whatsapp.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConfirmationText, buildDirectionsText, confirmationLink } from "./whatsapp";

const base = {
  guestName: "Asha",
  propertyName: "Hill View",
  roomName: "Deluxe",
  checkIn: "2026-12-01",
  checkOut: "2026-12-03",
  ownerPhone: "+91 94975 58860",
  trackingUrl: "https://x.stayidom.in/booking-status?t=abc&property=p1",
};

test("confirmation text says Room for one room and Rooms for a group", () => {
  assert.match(buildConfirmationText(base), /Room: Deluxe/);
  const group = buildConfirmationText({ ...base, roomName: "Deluxe, Suite", roomLabel: "Rooms" });
  assert.match(group, /Rooms: Deluxe, Suite/);
});

test("confirmation text carries the tracking link and the owner's number", () => {
  const t = buildConfirmationText(base);
  assert.ok(t.includes(base.trackingUrl));
  assert.ok(t.includes("+91 9497558860"));
});

test("confirmation link opens the guest's chat with the text pre-filled", () => {
  const url = confirmationLink({ ...base, guestPhone: "9876543210" });
  assert.ok(url.startsWith("https://wa.me/919876543210?text="));
  assert.ok(decodeURIComponent(url).includes("is confirmed"));
});

test("directions text does not name a town (the platform serves all of Kerala)", () => {
  const t = buildDirectionsText({ guestName: "Asha", propertyName: "Backwater Stay", lat: 9.5, lng: 76.3, ownerPhone: "9497558860" });
  assert.ok(!/munnar/i.test(t));
  assert.ok(t.includes("https://maps.google.com/?q=9.5,76.3"));
});
