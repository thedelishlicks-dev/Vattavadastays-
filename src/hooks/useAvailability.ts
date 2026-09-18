import { useQuery } from "@tanstack/react-query";
import { getConflictingDates, type TurnoverPolicyInput } from "../lib/bookingAvailability";

/**
 * Whether a room is free for [checkIn, checkOut) and, if not, which nights
 * conflict. Not currently used anywhere in the app (kept for any future
 * caller that wants a simple per-room/date-range check) — but it used to
 * hand-roll its own overlap query with a plain, non-turnover-aware
 * `.lt()/.gt()` comparison against `bookings`, completely separate from
 * getConflictingDates()'s logic. That's exactly the "reimplementing the
 * date loop" trap eachDate()'s own doc comment warns about: it could
 * disagree with the owner dashboard and the real guest-booking path about
 * what counts as a conflict (e.g. same-day turnover), and it never looked
 * at the `availability` table's manual blocks at all. Delegates to the one
 * real implementation instead, so if this ever IS wired up, it can't drift
 * out of sync with every other conflict check in the app.
 */
export const useAvailability = (
  roomId: string,
  checkIn: string,
  checkOut: string,
  property?: TurnoverPolicyInput | null
) => {
  return useQuery({
    queryKey: ["availability", roomId, checkIn, checkOut, property?.check_in_time, property?.check_out_time],
    queryFn: async () => {
      const unavailableDates = await getConflictingDates(roomId, checkIn, checkOut, property);
      return {
        available: unavailableDates.length === 0,
        unavailableDates,
      };
    },
    enabled: !!roomId && !!checkIn && !!checkOut,
  });
};
