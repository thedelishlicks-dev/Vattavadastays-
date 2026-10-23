 import test from "node:test";
import assert from "node:assert/strict";
import { splitGuests, sumGuests } from "./guestSplit";
import { priceRoomStay } from "./quoteBuilder";

const rooms = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}` }));
const room = (id: string) => ({ id, name: id, base_price: 2000, extra_guest_price: 500, weekend_multiplier: 1, max_guests: 2 });

test("one room gets everyone", () => {
  assert.deepEqual(splitGuests(5, rooms(1)), { r1: 5 });
});

test("4 guests across two 2-guest rooms: 2 + 2, not 4 + 4", () => {
  const s = splitGuests(4, rooms(2));
  assert.deepEqual(s, { r1: 2, r2: 2 });
  assert.equal(sumGuests(s), 4);
});

test("an odd total goes to the first rooms; the sum always equals the total when each room can have one", () => {
  assert.deepEqual(splitGuests(5, rooms(3)), { r1: 2, r2: 2, r3: 1 });
  assert.deepEqual(splitGuests(7, rooms(2)), { r1: 4, r2: 3 });
  for (let total = 3; total <= 20; total++) for (let n = 1; n <= 3; n++) assert.equal(sumGuests(splitGuests(total, rooms(n))), total, `${total} over ${n}`);
});

test("fewer guests than rooms: every room still gets one (a room cannot be empty)", () => {
  assert.deepEqual(splitGuests(1, rooms(2)), { r1: 1, r2: 1 });
});

test("the owner's own numbers win when they cover every room; incomplete or invalid ones are ignored", () => {
  assert.deepEqual(splitGuests(4, rooms(2), { r1: 3, r2: 1 }), { r1: 3, r2: 1 });
  assert.deepEqual(splitGuests(4, rooms(2), { r1: 3 }), { r1: 2, r2: 2 });
  assert.deepEqual(splitGuests(4, rooms(2), { r1: 0, r2: 4 }), { r1: 2, r2: 2 });
  assert.deepEqual(splitGuests(4, [], {}), {});
});

test("the split fixes the overcharge: extra-guest charges follow each room's own guests", () => {
  const total = 4;
  const split = splitGuests(total, rooms(2));
  const stay = (id: string, guests: number) => priceRoomStay({ room: room(id), guests, checkIn: "2027-03-01", checkOut: "2027-03-03" });
  const before = stay("r1", total).extra_guest_charge + stay("r2", total).extra_guest_charge;   // old: everyone in every room
  const after = stay("r1", split.r1).extra_guest_charge + stay("r2", split.r2).extra_guest_charge;
  assert.equal(before, 4000);
  assert.equal(after, 0);
});
