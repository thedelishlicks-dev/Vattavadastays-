// src/lib/roomRates.ts
//
// Seasonal / date-range room rates — pure helpers, no React / Supabase.
//
// A rate period replaces the room's base price for the nights it covers
// (kind "fixed": a rupee price; kind "percent": a whole-number % change on the
// room's base price). The Fri/Sat weekend multiplier still applies on top —
// that lives in priceRoomStay() (lib/quoteBuilder.ts).
//
// The SQL twin of this file is stay_room_price() in
// supabase/migrations/20261109000000_unified_seasons.sql (before that:
// 20261015000100_server_side_booking_price.sql) — the server re-prices every
// guest booking with the same rules. Change both together;
// src/lib/roomRates.test.ts pins the behaviour, and
// supabase/tests/season_parity_cases.json is asserted by BOTH sides.
//
// TWO rule sets, one picker:
//  • legacy  — room_rates rows: date range + rule, "room-specific, then later start".
//  • seasons — a season (price_seasons) + a room rule (season_room_rules), used when
//    properties.season_pricing_v2 is on. useRoomRates() flattens each rule into a
//    RoomRate that carries `season`, so every price calculation stays unchanged.
//    Overlaps: higher season priority, then the SHORTER window, then name, then id;
//    inside the season a room-specific rule beats an all-rooms rule.

import { inSeason, seasonSpanDays, type PriceSeason } from "./quotes";

export type RateKind = "fixed" | "percent";

/** Present on rates that come from a season (see seasonRulesToRates). */
export interface RateSeason {
  id: string;
  priority: number;
  recurs_yearly: boolean;
}

export interface RoomRate {
  id?: string;
  /** null = applies to every room of the property. */
  room_id: string | null;
  label?: string | null;
  /** yyyy-MM-dd, first night covered. */
  start_date: string;
  /** yyyy-MM-dd, LAST night covered (inclusive). */
  end_date: string;
  kind: RateKind;
  value: number;
  created_at?: string | null;
  /** Set when the rate is a season's room rule: start/end are the season's dates. */
  season?: RateSeason;
}

/** One room price rule of a season (table season_room_rules). room_id null = all rooms. */
export interface SeasonRoomRule {
  id?: string;
  season_id: string;
  room_id: string | null;
  kind: RateKind;
  value: number;
  created_at?: string | null;
}

function covers(date: string, r: RoomRate): boolean {
  if (r.season) return inSeason(date, { start_date: r.start_date, end_date: r.end_date, recurs_yearly: r.season.recurs_yearly });
  return date >= r.start_date && date <= r.end_date;
}

/** Seasons + their room rules → the flat list priceRoomStay() understands. */
export function seasonRulesToRates(
  seasons: readonly PriceSeason[],
  rules: readonly SeasonRoomRule[],
  /** yyyy-MM-dd; one-off seasons that ended before this are dropped to keep the list small. */
  keepFrom?: string,
): RoomRate[] {
  const byId = new Map(seasons.map((s) => [s.id, s]));
  const out: RoomRate[] = [];
  for (const rule of rules) {
    const s = byId.get(rule.season_id);
    if (!s) continue;
    if (keepFrom && !s.recurs_yearly && s.end_date < keepFrom) continue;
    out.push({
      id: rule.id,
      room_id: rule.room_id,
      label: s.name,
      start_date: s.start_date,
      end_date: s.end_date,
      kind: rule.kind,
      value: Number(rule.value),
      created_at: rule.created_at ?? null,
      season: { id: s.id, priority: s.priority, recurs_yearly: s.recurs_yearly },
    });
  }
  return out;
}

/**
 * The rate that prices `date` (a night, yyyy-MM-dd) for `roomId`, or null.
 * Precedence: room-specific beats all-rooms; then the later start_date;
 * then the newest created_at. Deterministic, so guest, owner and server agree.
 */
export function pickRate(date: string, roomId: string, rates: readonly RoomRate[] | undefined): RoomRate | null {
  if (!rates || rates.length === 0) return null;
  let best: RoomRate | null = null;
  for (const r of rates) {
    if (r.room_id !== null && r.room_id !== roomId) continue;
    if (!covers(date, r)) continue;
    if (best === null || beats(r, best)) best = r;
  }
  return best;
}

function beats(a: RoomRate, b: RoomRate): boolean {
  if (a.season && b.season) {
    if (a.season.priority !== b.season.priority) return a.season.priority > b.season.priority;
    const sa = seasonSpanDays({ start_date: a.start_date, end_date: a.end_date, recurs_yearly: a.season.recurs_yearly });
    const sb = seasonSpanDays({ start_date: b.start_date, end_date: b.end_date, recurs_yearly: b.season.recurs_yearly });
    if (sa !== sb) return sa < sb;
    const na = a.label ?? "";
    const nb = b.label ?? "";
    if (na !== nb) return na < nb; // code-point order, like SQL `collate "C"`
    if (a.season.id !== b.season.id) return a.season.id < b.season.id;
    return a.room_id !== null && b.room_id === null; // inside one season a room rule wins
  }
  const aRoom = a.room_id !== null;
  const bRoom = b.room_id !== null;
  if (aRoom !== bRoom) return aRoom;
  if (a.start_date !== b.start_date) return a.start_date > b.start_date;
  return (a.created_at ?? "") > (b.created_at ?? "");
}

/** Nightly base price (before the weekend multiplier) under `rate`. */
export function rateBasePrice(rate: RoomRate, roomBasePrice: number): number {
  if (rate.kind === "fixed") return rate.value;
  // Integer percent → exact in both JS and Postgres (round half up on x.5).
  return Math.round((roomBasePrice * (100 + rate.value)) / 100);
}

export interface RateFormValues {
  label: string;
  start_date: string;
  end_date: string;
  kind: RateKind;
  value: string; // typed text
}

export type ParsedRate =
  | { ok: true; values: { label: string; start_date: string; end_date: string; kind: RateKind; value: number } }
  | { ok: false; error: string };

/** Validation for the legacy rate form. Mirrors the table's CHECK constraints. */
export function parseRate(f: RateFormValues): ParsedRate {
  if (!f.start_date || !f.end_date) return { ok: false, error: "Pick the first and last night." };
  if (f.end_date < f.start_date) return { ok: false, error: "The last night can't be before the first night." };
  const span = (Date.parse(`${f.end_date}T00:00:00Z`) - Date.parse(`${f.start_date}T00:00:00Z`)) / 86400000;
  if (span > 400) return { ok: false, error: "A period can be at most 400 nights. Split it into two." };
  const v = Math.round(parseFloat(f.value));
  if (!Number.isFinite(v)) return { ok: false, error: f.kind === "fixed" ? "Enter the nightly price." : "Enter the percentage." };
  if (f.kind === "fixed" && (v <= 0 || v > 1000000)) return { ok: false, error: "Nightly price must be more than 0." };
  if (f.kind === "percent" && (v <= -90 || v > 500)) return { ok: false, error: "Percentage must be between -89 and 500." };
  if (f.label.trim().length > 60) return { ok: false, error: "Name is too long (60 characters max)." };
  return {
    ok: true,
    values: { label: f.label.trim(), start_date: f.start_date, end_date: f.end_date, kind: f.kind, value: v },
  };
}

/** "Peak season · 20 Dec – 5 Jan" style summary for lists. */
export function describeRate(rate: RoomRate, roomBasePrice?: number): string {
  if (rate.kind === "fixed") return `₹${rate.value.toLocaleString("en-IN")}/night`;
  const sign = rate.value > 0 ? "+" : "";
  const abs = roomBasePrice != null ? ` (₹${rateBasePrice(rate, roomBasePrice).toLocaleString("en-IN")}/night)` : "";
  return `${sign}${rate.value}%${abs}`;
}

// ── Room price rule of a season (unified Seasons screen) ────────────────────

export interface RuleFormValues {
  kind: RateKind;
  value: string; // typed text
}

export type ParsedRule = { ok: true; values: { kind: RateKind; value: number } } | { ok: false; error: string };

/** Same limits as the season_room_rules CHECK constraints. */
export function parseRule(f: RuleFormValues): ParsedRule {
  const v = Math.round(parseFloat(f.value));
  if (!Number.isFinite(v)) return { ok: false, error: f.kind === "fixed" ? "Enter the nightly price." : "Enter the percentage." };
  if (f.kind === "fixed" && (v <= 0 || v > 1000000)) return { ok: false, error: "Nightly price must be more than 0." };
  if (f.kind === "percent" && (v <= -90 || v > 500)) return { ok: false, error: "Percentage must be between -89 and 500." };
  return { ok: true, values: { kind: f.kind, value: v } };
}

/** "+30%" / "-20%" / "₹4,500 / night" — one short line for a rule. */
export function describeRule(rule: Pick<SeasonRoomRule, "kind" | "value">, roomBasePrice?: number): string {
  return describeRate({ room_id: null, start_date: "", end_date: "", kind: rule.kind, value: rule.value }, roomBasePrice);
}
