import test from "node:test";
import assert from "node:assert/strict";
import { allocateGuests, extraGuestsIn, isFullyPlaced, partySize, suggestRooms, roomsNeededWithinIncluded } from "./partyAllocation";

const room = (id: string, max_guests: number, base_price = 2000, extra_guest_price = 500) => ({ id, max_guests, base_price, extra_guest_price });

test("one room takes the whole party, extras counted above the included number", () => {
  const rooms = [room("a", 2)];
  const a = allocateGuests(rooms, { adults: 3, children: 1 });
  assert.deepEqual(a.byRoom.a, { adults: 3, children: 1 });
  assert.equal(extraGuestsIn(rooms, a), 2);
  assert.ok(isFullyPlaced(a));
});

test("5 guests over 2 rooms of 3 are shared 3 + 2, no extras", () => {
  const rooms = [room("a", 3), room("b", 3)];
  const a = allocateGuests(rooms, { adults: 5, children: 0 });
  assert.equal(partySize(a.byRoom.a) + partySize(a.byRoom.b), 5);
  assert.equal(extraGuestsIn(rooms, a), 0);
});

test("every room gets an adult before children are placed", () => {
  const rooms = [room("a", 2), room("b", 2)];
  const a = allocateGuests(rooms, { adults: 2, children: 2 });
  assert.equal(a.byRoom.a.adults, 1);
  assert.equal(a.byRoom.b.adults, 1);
  assert.ok(isFullyPlaced(a));
});

test("more rooms than adults leaves a room with no adult", () => {
  const rooms = [room("a", 2), room("b", 2), room("c", 2)];
  const a = allocateGuests(rooms, { adults: 2, children: 3 });
  assert.equal(a.roomsWithoutAdult.length, 1);
  assert.ok(!isFullyPlaced(a));
});

test("a party above the hard cap leaves guests unplaced", () => {
  const rooms = [room("a", 2)]; // cap 2 + 4 = 6
  const a = allocateGuests(rooms, { adults: 8, children: 0 });
  assert.equal(a.unplacedAdults, 2);
  assert.ok(!isFullyPlaced(a));
});

test("a room set by hand keeps its numbers; the rest is shared over the others", () => {
  const rooms = [room("a", 3), room("b", 3), room("c", 3)];
  const a = allocateGuests(rooms, { adults: 6, children: 0 }, { a: { adults: 1, children: 0 } });
  assert.deepEqual(a.byRoom.a, { adults: 1, children: 0 });
  assert.equal(partySize(a.byRoom.b) + partySize(a.byRoom.c), 5);
  assert.ok(isFullyPlaced(a));
});

test("extra guests go to the room with the cheaper extra charge", () => {
  const rooms = [room("a", 1, 2000, 900), room("b", 1, 2000, 300)];
  const a = allocateGuests(rooms, { adults: 3, children: 0 });
  assert.equal(partySize(a.byRoom.b), 2);
  assert.equal(partySize(a.byRoom.a), 1);
});

test("suggestion: fewest rooms inside the included numbers, cheapest first", () => {
  const rooms = [room("big", 4, 6000), room("a", 2, 2000), room("b", 2, 2500), room("c", 2, 3000)];
  assert.deepEqual(suggestRooms(rooms, { adults: 4, children: 0 }), ["big"]);
  const two = suggestRooms(rooms, { adults: 4, children: 0 }).length;
  assert.equal(two, 1);
  assert.deepEqual(suggestRooms([room("a", 2, 2000), room("b", 2, 2500), room("c", 2, 3000)], { adults: 5, children: 0 }).sort(), ["a", "b", "c"]);
});

test("suggestion: if nobody fits inside the included numbers, the fewest rooms that can hold the group", () => {
  const rooms = [room("a", 2), room("b", 2)];
  const ids = suggestRooms(rooms, { adults: 5, children: 0 });
  assert.equal(ids.length, 2);
  assert.equal(roomsNeededWithinIncluded(rooms, { adults: 5, children: 0 }), 0);
});

test("suggestion: [] when even every room cannot take the party", () => {
  assert.deepEqual(suggestRooms([room("a", 2)], { adults: 20, children: 0 }), []);
  assert.deepEqual(suggestRooms([], { adults: 2, children: 0 }), []);
});

test("suggestion never uses more rooms than there are adults", () => {
  const rooms = [room("a", 2), room("b", 2), room("c", 2)];
  const ids = suggestRooms(rooms, { adults: 1, children: 5 });
  assert.ok(ids.length <= 1);
});
