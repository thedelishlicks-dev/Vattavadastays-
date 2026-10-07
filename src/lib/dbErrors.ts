// src/lib/dbErrors.ts
//
// Turns Supabase/Postgres errors into messages people can act on.
// Supabase returns plain objects ({ code, message }), not Error instances, so
// `e instanceof Error` checks miss them and users only saw "Save failed".

type DbErrorLike = { code?: string; message?: string };

const asDbError = (e: unknown): DbErrorLike =>
  e && typeof e === "object" ? (e as DbErrorLike) : {};

/** True when the database's no-overlap constraint rejected the booking (23P01). */
export function isOverlapError(e: unknown): boolean {
  const { code, message } = asDbError(e);
  return code === "23P01" || (message ?? "").includes("bookings_no_overlap");
}

export const OVERLAP_MESSAGE =
  "Those dates were just booked for this room. Please choose different dates.";

/** Best human-readable message for any thrown value. */
export function friendlyDbError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isOverlapError(e)) return OVERLAP_MESSAGE;
  if (e instanceof Error && e.message) return e.message;
  const { message } = asDbError(e);
  return message || fallback;
}
