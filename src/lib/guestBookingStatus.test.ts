/**
 * Tests for the guest card's status wording.
 *
 * Run: npx tsx --test src/lib/guestBookingStatus.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { guestStatusView, statusFromTokenLookup } from "./guestBookingStatus";

test("a new request reads 'Awaiting owner confirmation'", () => {
  const v = guestStatusView("pending", "Raju", "Cash on Arrival");
  assert.equal(v.tone, "pending");
  assert.equal(v.heading, "Request sent!");
  assert.equal(v.badge, "Awaiting owner confirmation");
  assert.match(v.message, /Raju will confirm your booking shortly/);
});

test("while loading or unreadable the card still says awaiting confirmation", () => {
  for (const s of [null, undefined, "", "something-new"]) {
    assert.equal(guestStatusView(s, "Raju", "UPI").tone, "pending");
  }
});

test("a UPI guest is told confirmation follows their advance payment", () => {
  assert.match(guestStatusView("pending", "Raju", "UPI").message, /advance payment/);
});

test("confirmed, completed and cancelled each get their own wording", () => {
  assert.equal(guestStatusView("confirmed", "Raju", "UPI").tone, "confirmed");
  assert.equal(guestStatusView("completed", "Raju", "UPI").tone, "done");
  const c = guestStatusView("cancelled", "Raju", "UPI");
  assert.equal(c.tone, "cancelled");
  assert.match(c.message, /dates have been released/);
});

test("statusFromTokenLookup prefers the group row, then the first booking, else null", () => {
  assert.equal(statusFromTokenLookup({ groups: [{ status: "confirmed" }], bookings: [{ status: "pending" }] }), "confirmed");
  assert.equal(statusFromTokenLookup({ groups: [], bookings: [{ status: "pending" }] }), "pending");
  assert.equal(statusFromTokenLookup({ groups: [], bookings: [] }), null);
  assert.equal(statusFromTokenLookup(null), null);
});
