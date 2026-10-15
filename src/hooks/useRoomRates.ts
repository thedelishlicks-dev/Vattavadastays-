// Seasonal room rates for one property (small table: a handful of rows per
// room). Read by the guest page, the owner modals and the quote builder so
// every price calculation sees the same periods — see lib/roomRates.ts.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { RoomRate } from "@/lib/roomRates";

export const roomRatesKey = (propertyId: string | undefined) => ["roomRates", propertyId ?? ""] as const;

export async function fetchRoomRates(propertyId: string): Promise<RoomRate[]> {
  const { data, error } = await supabase
    .from("room_rates")
    .select("id, room_id, label, start_date, end_date, kind, value, created_at")
    .eq("property_id", propertyId)
    // Past periods can't price any future stay; keep the list small.
    .gte("end_date", new Date(Date.now() - 86400000).toISOString().slice(0, 10))
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, value: Number(r.value) })) as RoomRate[];
}

export function useRoomRates(propertyId: string | undefined) {
  return useQuery({
    queryKey: roomRatesKey(propertyId),
    enabled: !!propertyId,
    queryFn: () => fetchRoomRates(propertyId as string),
    staleTime: 60_000,
    // Rates are an enhancement: if the table isn't there yet (migration not
    // run) or the request fails, prices fall back to the room's base price.
    retry: 1,
  });
}
