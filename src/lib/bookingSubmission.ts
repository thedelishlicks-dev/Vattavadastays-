// src/lib/bookingSubmission.ts
//
// The ids a guest booking is saved under, kept stable across retries of the SAME submission.
//
// Why: the browser makes the booking ids and the secret tracking token itself (a guest cannot read
// a row back). If the request reaches the server but the reply is lost (weak mobile signal), the
// guest taps "Request booking" again. With fresh ids the second attempt looks like a different
// booking for the same dates, collides with the first one on the overlap constraint, and shows
// "those dates were just booked" — while the first booking sits there with a token the guest never
// received. Re-using the same ids and token lets the retry notice the first attempt landed
// (lookup by token) and carry on to the confirmation instead.
//
// Pure functions (the id generators are passed in) so they are unit-tested in bookingSubmission.test.ts.

export interface Submission {
  /** What the guest asked for. Same fingerprint = same submission = same ids. */
  fingerprint: string;
  trackingToken: string;
  /** Present only for multi-room stays. */
  groupId: string | null;
  groupRef: string | null;
  /** One per room, in the order of the rooms in the request. */
  bookingIds: string[];
}

export interface SubmissionInput {
  propertyId: string;
  rooms: { roomId: string; guestCount: number }[];
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  totalGuests: number;
  checkIn: string;
  checkOut: string;
  paymentMethod?: string;
}

export interface IdGenerators {
  newId: () => string;
  newToken: () => string;
  newGroupRef: () => string;
}

/** A stable string for "the same booking request". Any change to who, what or when gives a new one. */
export function submissionFingerprint(i: SubmissionInput): string {
  return JSON.stringify([
    i.propertyId,
    i.rooms.map((r) => [r.roomId, r.guestCount]),
    i.guestName.trim(),
    i.guestPhone.trim(),
    (i.guestEmail ?? "").trim(),
    i.totalGuests,
    i.checkIn,
    i.checkOut,
    i.paymentMethod ?? "",
  ]);
}

/**
 * The submission to use for this request: the previous one when the request is unchanged (a retry),
 * otherwise a fresh one. `isRetry` tells the caller an earlier attempt may already have been saved.
 */
export function reuseOrCreateSubmission(
  previous: Submission | null,
  input: SubmissionInput,
  gen: IdGenerators,
): { submission: Submission; isRetry: boolean } {
  const fingerprint = submissionFingerprint(input);
  if (previous && previous.fingerprint === fingerprint && previous.bookingIds.length === input.rooms.length) {
    return { submission: previous, isRetry: true };
  }
  const multi = input.rooms.length > 1;
  return {
    isRetry: false,
    submission: {
      fingerprint,
      trackingToken: gen.newToken(),
      groupId: multi ? gen.newId() : null,
      groupRef: multi ? gen.newGroupRef() : null,
      bookingIds: input.rooms.map(() => gen.newId()),
    },
  };
}

/** What the token lookup says is already saved for a submission. */
export interface StoredState {
  groupSaved: boolean;
  bookingsSaved: boolean;
}

/** Reads the `lookup_booking_by_token` result: { groups: [...], bookings: [...] }. Anything else = nothing saved. */
export function storedStateFromLookup(data: unknown): StoredState {
  const d = (data ?? {}) as { groups?: unknown; bookings?: unknown };
  return {
    groupSaved: Array.isArray(d.groups) && d.groups.length > 0,
    bookingsSaved: Array.isArray(d.bookings) && d.bookings.length > 0,
  };
}
