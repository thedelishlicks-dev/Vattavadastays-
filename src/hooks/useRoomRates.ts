// Room price rules for one property, as one flat list that every price calculation reads
// (guest page, owner modals, quote builder — see lib/roomRates.ts).
//
// Two sources, chosen per property by properties.season_pricing_v2:
//   off → room_rates (the old "Seasonal rates" on each room), exactly as before;
//   on  → seasons (price_seasons) + their room rules (season_room_rules), flattened by
//         seasonRulesToRates() so callers never need to know which one is in use.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { seasonRulesToRates, type RoomRate, type SeasonRoomRule } from "@/lib/roomRates";
import type { PriceSeason } from "@/lib/quotes";

export const roomRatesKey = (propertyId: string | undefined) => ["roomRates", propertyId ?? ""] as const;
export const seasonRulesKey = (propertyId: string | undefined) => ["seasonRoomRules", propertyId ?? ""] as const;

const yesterday = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

/** Is the unified Seasons model on for this property? Any failure (column not there yet) = off. */
async function seasonPricingOn(propertyId: string): Promise<boolean> {
  const { data, error } = await supabase.from("properties").select("season_pricing_v2").eq("id", propertyId).maybeSingle();
  if (error) return false;
  return (data as { season_pricing_v2?: boolean } | null)?.season_pricing_v2 === true;
}

export async function fetchSeasonRules(propertyId: string): Promise<SeasonRoomRule[]> {
  const { data, error } = await supabase
    .from("season_room_rules")
    .select("id, season_id, room_id, kind, value, created_at")
    .eq("property_id", propertyId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, value: Number(r.value) })) as SeasonRoomRule[];
}

async function fetchSeasonRates(propertyId: string): Promise<RoomRate[]> {
  const [seasonsRes, rules] = await Promise.all([
    supabase.from("price_seasons").select("id, name, start_date, end_date, recurs_yearly, priority").eq("property_id", propertyId),
    fetchSeasonRules(propertyId),
  ]);
  if (seasonsRes.error) throw seasonsRes.error;
  const seasons: PriceSeason[] = (seasonsRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    start_date: s.start_date,
    end_date: s.end_date,
    recurs_yearly: !!s.recurs_yearly,
    priority: Number(s.priority ?? 0),
  }));
  return seasonRulesToRates(seasons, rules, yesterday());
}

async function fetchLegacyRates(propertyId: string): Promise<RoomRate[]> {
  const { data, error } = await supabase
    .from("room_rates")
    .select("id, room_id, label, start_date, end_date, kind, value, created_at")
    .eq("property_id", propertyId)
    // Past periods can't price any future stay; keep the list small.
    .gte("end_date", yesterday())
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, value: Number(r.value) })) as RoomRate[];
}

export async function fetchRoomRates(propertyId: string): Promise<RoomRate[]> {
  return (await seasonPricingOn(propertyId)) ? fetchSeasonRates(propertyId) : fetchLegacyRates(propertyId);
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

/** Raw room rules of the property's seasons (owner Seasons screen). */
export function useSeasonRules(propertyId: string | undefined) {
  return useQuery({
    queryKey: seasonRulesKey(propertyId),
    enabled: !!propertyId,
    queryFn: () => fetchSeasonRules(propertyId as string),
    staleTime: 30_000,
  });
}
