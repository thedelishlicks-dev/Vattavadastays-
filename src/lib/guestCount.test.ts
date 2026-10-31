import test from "node:test";
import assert from "node:assert/strict";
import { EXTRA_GUEST_ALLOWANCE, MAX_CHILDREN, maxGuestsFor, extraGuestCount, stepperLimits, clampParty } from "./guestCount";
import { priceRoomStay } from "./quoteBuilder";

const room = { id: "r", name: "Deluxe", base_price: 2000, extra_guest_price: 500, weekend_multiplier: 1, max_guests: 2 };

test("cap is the included guests plus the allowance", () => {
  assert.equal(maxGuestsFor(2), 2 + EXTRA_GUEST_ALLOWANCE);
});

test("everyone counts for the extra charge: 2 adults + 2 children in a 2-guest room = 2 extra guests", () => {
  assert.equal(extraGuestCount(2 + 2, 2), 2);
  assert.equal(extraGuestCount(2, 2), 0);
  assert.equal(extraGuestCount(1, 2), 0);
});

test("the popup's number equals the stored number: same party, same price from priceRoomStay (what is submitted)", () => {
  const adults = 2, children = 2, nights = 2;
  const popupExtra = extraGuestCount(adults + children, room.max_guests) * room.extra_guest_price * nights;
  const stored = priceRoomStay({ room, guests: adults + children, checkIn: "2027-03-01", checkOut: "2027-03-03" });
  assert.equal(popupExtra, stored.extra_guest_charge);
  assert.equal(popupExtra, 2000);
});

test("steppers never allow a total above the cap that submit enforces", () => {
  const cap = maxGuestsFor(room.max_guests);
  for (let adults = 1; adults <= cap; adults++) {
    for (let children = 0; children <= MAX_CHILDREN; children++) {
      const { maxAdults, maxChildren } = stepperLimits(room.max_guests, adults, children);
      // if the guest can still press "+", the new total must stay inside the cap
      if (adults < maxAdults) assert.ok(adults + 1 + children <= cap, `adults ${adults}+1, children ${children}`);
      if (children < maxChildren) assert.ok(adults + children + 1 <= cap, `adults ${adults}, children ${children}+1`);
    }
  }
});

test("at the cap neither stepper can grow; with room to spare children are limited to 4", () => {
  const cap = maxGuestsFor(2); // 6
  assert.deepEqual(stepperLimits(2, 4, 2), { maxAdults: cap - 2, maxChildren: 2 });
  assert.equal(stepperLimits(2, cap, 0).maxChildren, 0);
  assert.equal(stepperLimits(2, 1, 0).maxChildren, MAX_CHILDREN);
  assert.equal(stepperLimits(2, 1, 6).maxAdults, 1);  // never below one adult
});

test("clampParty repairs a stale selection (e.g. after switching rooms)", () => {
  assert.deepEqual(clampParty(2, 6, 4), { adults: 6, children: 0 });   // 10 guests -> 6, adults kept
  assert.deepEqual(clampParty(2, 0, 9), { adults: 1, children: 4 });   // at least 1 adult, children capped at 4
  assert.deepEqual(clampParty(2, 2, 1), { adults: 2, children: 1 });   // already valid: unchanged
  assert.deepEqual(clampParty(4, 3, 3), { adults: 3, children: 3 });   // larger room, valid
});

test("the owner's own limit replaces included + allowance; blank keeps the old rule", () => {
  assert.equal(maxGuestsFor(4, 6), 6);
  assert.equal(maxGuestsFor(4, null), 4 + EXTRA_GUEST_ALLOWANCE);
  assert.equal(maxGuestsFor(4, undefined), 4 + EXTRA_GUEST_ALLOWANCE);
  assert.equal(maxGuestsFor(4, 3), 4 + EXTRA_GUEST_ALLOWANCE); // a limit below the included guests is ignored
});

test("steppers and clamping follow the owner's limit", () => {
  assert.deepEqual(stepperLimits(2, 2, 0, 3), { maxAdults: 3, maxChildren: 1 });
  assert.deepEqual(clampParty(2, 5, 2, 3), { adults: 3, children: 0 });
});
