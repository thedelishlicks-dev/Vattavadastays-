/**
 * Run: npx tsx --test src/lib/bookingSubmission.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reuseOrCreateSubmission, storedStateFromLookup, submissionFingerprint, type SubmissionInput } from "./bookingSubmission";

let n = 0;
const gen = { newId: () => `id-${++n}`, newToken: () => `tok-${++n}`, newGroupRef: () => `GRP-${++n}` };

const one: SubmissionInput = {
  propertyId: "p1", rooms: [{ roomId: "r1", guestCount: 2 }], guestName: "Asha", guestPhone: "+91 98765 43210",
  totalGuests: 2, checkIn: "2026-11-10", checkOut: "2026-11-12", paymentMethod: "UPI",
};
const two: SubmissionInput = { ...one, rooms: [{ roomId: "r1", guestCount: 2 }, { roomId: "r2", guestCount: 2 }], totalGuests: 4 };

test("a first submission gets fresh ids and is not a retry", () => {
  const { submission, isRetry } = reuseOrCreateSubmission(null, one, gen);
  assert.equal(isRetry, false);
  assert.equal(submission.bookingIds.length, 1);
  assert.equal(submission.groupId, null);
  assert.ok(submission.trackingToken);
});

test("the same request again re-uses the same ids and token", () => {
  const first = reuseOrCreateSubmission(null, two, gen).submission;
  const again = reuseOrCreateSubmission(first, { ...two }, gen);
  assert.equal(again.isRetry, true);
  assert.deepEqual(again.submission, first);
});

test("a multi-room request gets a group id and reference", () => {
  const { submission } = reuseOrCreateSubmission(null, two, gen);
  assert.equal(submission.bookingIds.length, 2);
  assert.ok(submission.groupId && submission.groupRef);
});

test("changing the dates, rooms, guest or payment starts a new submission", () => {
  const first = reuseOrCreateSubmission(null, one, gen).submission;
  for (const changed of [
    { ...one, checkOut: "2026-11-13" },
    { ...one, rooms: [{ roomId: "r1", guestCount: 3 }] },
    { ...one, guestPhone: "+91 98765 43211" },
    { ...one, paymentMethod: "Cash on Arrival" },
  ]) {
    const r = reuseOrCreateSubmission(first, changed, gen);
    assert.equal(r.isRetry, false);
    assert.notEqual(r.submission.trackingToken, first.trackingToken);
  }
});

test("stray spaces in the name do not make it a different request", () => {
  assert.equal(submissionFingerprint(one), submissionFingerprint({ ...one, guestName: "  Asha " }));
});

test("the token lookup result says what is already saved", () => {
  assert.deepEqual(storedStateFromLookup({ groups: [], bookings: [] }), { groupSaved: false, bookingsSaved: false });
  assert.deepEqual(storedStateFromLookup({ groups: [{}], bookings: [] }), { groupSaved: true, bookingsSaved: false });
  assert.deepEqual(storedStateFromLookup({ groups: [{}], bookings: [{}] }), { groupSaved: true, bookingsSaved: true });
  assert.deepEqual(storedStateFromLookup(null), { groupSaved: false, bookingsSaved: false });
});
