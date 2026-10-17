import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { syncIcalFeeds } from "@/lib/icalClient";
import { CHANNEL_SYNC_ENABLED } from "@/lib/features";

export interface IcalFeed {
  id: string;
  property_id: string;
  room_id: string;
  name: string;
  url: string;
  last_synced_at: string | null;
  last_status: "ok" | "error" | null;
  last_message: string | null;
  last_nights: number | null;
  last_conflicts: number | null;
}

export const icalFeedsKey = (propertyId: string | undefined) => ["icalFeeds", propertyId ?? ""] as const;

export function useIcalFeeds(propertyId: string | undefined) {
  return useQuery({
    queryKey: icalFeedsKey(propertyId),
    enabled: !!propertyId && CHANNEL_SYNC_ENABLED,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<IcalFeed[]> => {
      const { data, error } = await supabase
        .from("room_ical_feeds")
        .select("id, property_id, room_id, name, url, last_synced_at, last_status, last_message, last_nights, last_conflicts")
        .eq("property_id", propertyId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as IcalFeed[];
    },
  });
}

/** Refresh everything that shows availability after a sync changed it. */
export function invalidateAvailability(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["blocked-dates", "availability-range", "availability", "guestAvailability", "bookings", "guest-bookings"]) {
    qc.invalidateQueries({ queryKey: [key], exact: false });
  }
}

const AUTO_SYNC_AFTER_MS = 20 * 60 * 1000;
let lastAutoSyncAt = 0;

/**
 * Quietly re-sync stale feeds when an owner opens the app, so channel
 * bookings show up without anyone tapping anything. At most once per 20 min
 * per browser tab. (A pg_cron job can do this in the background too — see
 * the comment at the bottom of the room_ical_feeds migration.)
 */
export function useIcalAutoSync(propertyId: string | undefined) {
  const qc = useQueryClient();
  const { data: feeds } = useIcalFeeds(propertyId);
  useEffect(() => {
    if (!propertyId || !feeds || feeds.length === 0) return;
    const now = Date.now();
    if (now - lastAutoSyncAt < AUTO_SYNC_AFTER_MS) return;
    const stale = feeds.some((f) => !f.last_synced_at || now - Date.parse(f.last_synced_at) > AUTO_SYNC_AFTER_MS);
    if (!stale) return;
    lastAutoSyncAt = now;
    syncIcalFeeds({ property_id: propertyId })
      .then(() => { invalidateAvailability(qc); qc.invalidateQueries({ queryKey: icalFeedsKey(propertyId) }); })
      .catch(() => { /* silent: the manual "Sync now" shows errors */ });
  }, [propertyId, feeds, qc]);
}
