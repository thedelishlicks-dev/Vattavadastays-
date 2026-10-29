// Which rooms can't be booked for the chosen dates (shared by the room list and the
// guest page, so the suggestion and the cards can never disagree).
//
// Guests (anon) cannot read `bookings` (HANDOVER rule 10): this uses getBlockedDatesForRooms,
// the same helper as the date picker and the final booking check. The query key starts with
// "guest-bookings" on purpose: useCreateBooking and BlockDatesModal already invalidate it.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBlockedDatesForRooms, isSameDayTurnoverSafe, eachDate, addOneDay } from "@/lib/bookingAvailability";
import type { useProperty } from "@/hooks/useProperty";

type Property = ReturnType<typeof useProperty>["data"];

export function useUnavailableRoomIds(property: Property, checkInStr: string | null, checkOutStr: string | null) {
  const roomIds = useMemo(
    () => (property?.rooms ?? []).filter((r) => r.is_active).map((r) => r.id),
    [property],
  );
  const turnoverSafe = useMemo(() => isSameDayTurnoverSafe(property), [property]);
  const q = useQuery({
    queryKey: ["guest-bookings", "rooms-unavailable", roomIds.join(","), checkInStr, checkOutStr, turnoverSafe],
    queryFn: async () => {
      if (!checkInStr || !checkOutStr || roomIds.length === 0) return [] as string[];
      const blocked = await getBlockedDatesForRooms(roomIds, checkInStr, checkOutStr, turnoverSafe);
      // Same night window the booking itself is validated against.
      const nights = eachDate(checkInStr, turnoverSafe ? checkOutStr : addOneDay(checkOutStr));
      return roomIds.filter((id) => nights.some((n) => blocked[id]?.has(n)));
    },
    enabled: !!property?.id && !!checkInStr && !!checkOutStr && roomIds.length > 0,
  });
  const unavailable = useMemo(() => new Set(q.data ?? []), [q.data]);
  // True only once the answer is for the CURRENT dates (not while loading or stale).
  const settled = q.isSuccess && !q.isFetching;
  return { unavailable, settled };
}
