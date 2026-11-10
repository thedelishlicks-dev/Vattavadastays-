// src/components/RoomSeasonPrices.tsx
//
// A room's season prices, inside the room editor drawer — READ ONLY. Seasons and their room
// prices are edited in one place: Rooms & Pricing → Seasons (SeasonsPanel). Rules live in
// lib/roomRates.ts; the guest page, owner bookings and quotes all price through priceRoomStay().

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { useSeasonRules } from "@/hooks/useRoomRates";
import { useSeasons } from "@/hooks/useCatalog";
import { describeRate } from "@/lib/roomRates";

const fmt = (d: string) => format(parseISO(d), "d MMM yyyy");

/** This room's prices from the Seasons screen — read only; one place to edit them. */
export function RoomSeasonPrices({ propertyId, room, onGoToSeasons }: { propertyId: string; room: { id: string; name: string; base_price: number }; onGoToSeasons?: () => void }) {
  const { data: seasons = [] } = useSeasons(propertyId);
  const { data: rules = [], isLoading } = useSeasonRules(propertyId);
  const lines = useMemo(() => {
    // For this room: its own rule in a season, else the all-rooms rule.
    return seasons
      .map((s) => {
        const mine = rules.find((r) => r.season_id === s.id && r.room_id === room.id) ?? rules.find((r) => r.season_id === s.id && r.room_id === null);
        return mine ? { season: s, rule: mine } : null;
      })
      .filter((x): x is { season: (typeof seasons)[number]; rule: (typeof rules)[number] } => x !== null);
  }, [seasons, rules, room.id]);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Season prices</h3>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!isLoading && lines.length === 0 && (
        <p className="text-xs text-muted-foreground">No season changes this room's price. Every night uses the price above.</p>
      )}
      {lines.length > 0 && (
        <ul className="space-y-1.5">
          {lines.map(({ season, rule }) => (
            <li key={season.id} className="rounded-lg border border-border px-3 py-2 text-sm">
              <div className="font-medium">
                {season.name}
                {rule.room_id === null && <span className="ml-2 text-[10px] uppercase tracking-wider rounded-full bg-muted px-2 py-0.5 text-muted-foreground align-middle">All rooms</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                {fmt(season.start_date)} – {fmt(season.end_date)}
                {season.recurs_yearly && " · every year"}
              </div>
              <div className="text-xs">{describeRate({ room_id: rule.room_id, start_date: "", end_date: "", kind: rule.kind, value: rule.value }, room.base_price)}</div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onGoToSeasons} className="text-xs text-primary hover:underline">
        Change season prices in Seasons (top of this page)
      </button>
    </div>
  );
}
