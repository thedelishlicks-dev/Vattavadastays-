// src/lib/quotes.ts
//
// Pure pricing engine for the Quotes feature: no React, no Supabase, no
// imports — so it is trivially unit-testable (see tests/quotes.test.ts) and
// the exact same function prices a quote in the builder, in the WhatsApp
// message, and when a quote is converted into a booking.
//
// Pricing model (agreed design):
//  • Owners enter EXACT rupee prices per season. There is no percentage
//    formula anywhere; a blank season price means "use the base price".
//  • Seasons are defined once per property (price_seasons) and shared by
//    every add-on and package.
//  • Per-day units (meals, per person per day) are priced day by day, so a
//    stay that crosses a season boundary is billed part base / part peak.
//  • Flat units (per person, per group, per stay) are priced by the
//    CHECK-IN date — a simple rule guests can follow.
//  • Every priced line is a snapshot (name, unit, resolved prices, season)
//    so editing the catalog later never changes a quote already sent.
//
// All dates are "YYYY-MM-DD" strings compared/added in UTC, so there are no
// timezone off-by-one bugs.

// ── Types ───────────────────────────────────────────────────────────────────

export type AddonUnit = "per_person_day" | "per_person" | "per_group" | "per_day" | "per_stay";
export type AddonCategory = "food" | "activity" | "facility" | "transport" | "other";

export const UNIT_LABELS: Record<AddonUnit, string> = {
  per_person_day: "per person / day",
  per_person: "per person",
  per_group: "per group",
  per_day: "per day",
  per_stay: "per stay",
};

export const CATEGORY_LABELS: Record<AddonCategory, string> = {
  food: "Food",
  activity: "Activity",
  facility: "Facility",
  transport: "Transport",
  other: "Other",
};

export interface PriceVariant {
  key: string;
  label: string;
  base_price: number;
  /** season id -> exact price. Missing/undefined = use base_price. */
  season_prices: Record<string, number | undefined>;
}

export interface PriceSeason {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  recurs_yearly: boolean;
  priority: number;
}

export interface Addon {
  id: string;
  name: string;
  category: AddonCategory;
  unit: AddonUnit;
  variants: PriceVariant[];
  is_active: boolean;
  sort_order: number;
}

export interface PackageIncluded {
  addon_id: string;
  /** null = follow the package's chosen variant (see includedVariantKey). */
  variant_key: string | null;
}

export interface Package {
  id: string;
  name: string;
  description: string | null;
  unit: AddonUnit;
  included: PackageIncluded[];
  variants: PriceVariant[];
  is_active: boolean;
  sort_order: number;
}

/** "season" = explicit season price; "base" = no season applies;
 *  "base_fallback" = a season applies but the owner set no price for it;
 *  "override" = owner typed a one-off price on this quote. */
export type PriceSource = "season" | "base" | "base_fallback" | "override";

export interface BreakdownSegment {
  from: string;
  to: string;
  days: number;
  unit_price: number;
  season_name: string | null;
  source: PriceSource;
}

export interface QuoteLine {
  kind: "addon" | "package";
  item_id: string;
  name: string;
  variant_key: string | null;
  variant_label: string | null;
  unit: AddonUnit;
  /** Headcount for per-person units, otherwise 1 (or the owner's override). */
  multiplier: number;
  /** Number of priced days (1 for flat units). */
  days: number;
  breakdown: BreakdownSegment[];
  subtotal: number;
  used_fallback: boolean;
  overridden: boolean;
  /** Package inclusions, for display and for the booking-charge description. */
  includes: string[];
}

// ── Dates ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function toUTC(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return fromUTC(toUTC(date) + n * DAY_MS);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(0, Math.round((toUTC(checkOut) - toUTC(checkIn)) / DAY_MS));
}

/** One entry per night of the stay. A same-day / invalid range counts as 1 day. */
export function stayDates(checkIn: string, checkOut: string): string[] {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights === 0) return [checkIn];
  return Array.from({ length: nights }, (_, i) => addDays(checkIn, i));
}

// ── Seasons ─────────────────────────────────────────────────────────────────

const mmdd = (date: string) => date.slice(5, 10);

function inSeason(date: string, s: PriceSeason): boolean {
  if (!s.recurs_yearly) return date >= s.start_date && date <= s.end_date;
  const d = mmdd(date);
  const a = mmdd(s.start_date);
  const b = mmdd(s.end_date);
  // a > b means the window wraps the new year (e.g. 12-20 → 01-05)
  return a <= b ? d >= a && d <= b : d >= a || d <= b;
}

function seasonSpanDays(s: PriceSeason): number {
  if (!s.recurs_yearly) return Math.round((toUTC(s.end_date) - toUTC(s.start_date)) / DAY_MS) + 1;
  // Recurring: measure inside leap year 2000 so Feb 29 is representable.
  const at = (date: string) => Date.UTC(2000, Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  let span = Math.round((at(s.end_date) - at(s.start_date)) / DAY_MS) + 1;
  if (span <= 0) span += 366;
  return span;
}

/**
 * The season that applies on `date`, or null. Overlaps: higher priority wins,
 * then the narrower window (so a 3-day festival inside a month-long peak wins
 * without the owner having to think about priority), then name for a
 * deterministic result.
 */
export function resolveSeason(date: string, seasons: PriceSeason[]): PriceSeason | null {
  let best: PriceSeason | null = null;
  for (const s of seasons) {
    if (!inSeason(date, s)) continue;
    if (!best) {
      best = s;
      continue;
    }
    if (s.priority !== best.priority) {
      if (s.priority > best.priority) best = s;
      continue;
    }
    const sa = seasonSpanDays(s);
    const ba = seasonSpanDays(best);
    if (sa !== ba) {
      if (sa < ba) best = s;
      continue;
    }
    if (s.name < best.name) best = s;
  }
  return best;
}

// ── Single-day price resolution ─────────────────────────────────────────────

export interface DayPrice {
  date: string;
  price: number;
  season: PriceSeason | null;
  source: PriceSource;
}

export function priceForDate(variant: PriceVariant, date: string, seasons: PriceSeason[]): DayPrice {
  const season = resolveSeason(date, seasons);
  if (!season) return { date, price: variant.base_price, season: null, source: "base" };
  const p = variant.season_prices?.[season.id];
  if (typeof p === "number" && Number.isFinite(p) && p >= 0) {
    return { date, price: p, season, source: "season" };
  }
  return { date, price: variant.base_price, season, source: "base_fallback" };
}

// ── Pricing one quote line ──────────────────────────────────────────────────

export interface PriceLineInput {
  kind: "addon" | "package";
  item: { id: string; name: string; unit: AddonUnit; variants: PriceVariant[] };
  variantKey?: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  seasons: PriceSeason[];
  /** Owner typed a different headcount / quantity on this quote. */
  quantityOverride?: number;
  /** Owner typed a one-off unit price on this quote (negotiation). */
  unitPriceOverride?: number;
  includes?: string[];
}

const isPerDay = (u: AddonUnit) => u === "per_person_day" || u === "per_day";
const isPerPerson = (u: AddonUnit) => u === "per_person_day" || u === "per_person";

export function priceLine(input: PriceLineInput): QuoteLine {
  const { item, seasons } = input;
  const variant =
    item.variants.find((v) => v.key === input.variantKey) ?? item.variants[0];
  if (!variant) throw new Error(`"${item.name}" has no price set`);

  const guests = Math.max(1, Math.floor(input.guests || 1));
  const dates = isPerDay(item.unit) ? stayDates(input.checkIn, input.checkOut) : [input.checkIn];
  const multiplier =
    input.quantityOverride !== undefined ? Math.max(0, input.quantityOverride) : isPerPerson(item.unit) ? guests : 1;

  const hasOverride = input.unitPriceOverride !== undefined;
  const days: DayPrice[] = dates.map((date) =>
    hasOverride
      ? { date, price: Math.max(0, input.unitPriceOverride!), season: null, source: "override" as const }
      : priceForDate(variant, date, seasons),
  );

  // Collapse consecutive days that share price + season + source.
  const breakdown: BreakdownSegment[] = [];
  for (const d of days) {
    const last = breakdown[breakdown.length - 1];
    const seasonName = d.season?.name ?? null;
    if (last && last.unit_price === d.price && last.season_name === seasonName && last.source === d.source) {
      last.to = d.date;
      last.days += 1;
    } else {
      breakdown.push({ from: d.date, to: d.date, days: 1, unit_price: d.price, season_name: seasonName, source: d.source });
    }
  }

  const subtotal = Math.round(breakdown.reduce((s, seg) => s + seg.unit_price * seg.days, 0) * multiplier);

  return {
    kind: input.kind,
    item_id: item.id,
    name: item.name,
    variant_key: variant.key,
    variant_label: variant.label,
    unit: item.unit,
    multiplier,
    days: days.length,
    breakdown,
    subtotal,
    used_fallback: breakdown.some((s) => s.source === "base_fallback"),
    overridden: hasOverride || input.quantityOverride !== undefined,
    includes: input.includes ?? [],
  };
}

// ── Packages ────────────────────────────────────────────────────────────────

/** Which add-on variant a package's included item uses. */
export function includedVariantKey(inc: PackageIncluded, addon: Addon, packageVariantKey: string | null): string | null {
  if (inc.variant_key) return inc.variant_key;
  if (packageVariantKey && addon.variants.some((v) => v.key === packageVariantKey)) return packageVariantKey;
  return addon.variants[0]?.key ?? null;
}

export function packageIncludes(pkg: Package, addons: Addon[]): string[] {
  return pkg.included.map((inc) => addons.find((a) => a.id === inc.addon_id)?.name).filter((n): n is string => !!n);
}

export interface PackageSaving {
  partsTotal: number;
  bundleTotal: number;
  saving: number;
}

/** What the guest would pay buying the parts separately vs the bundle, for
 *  this stay and season. saving is floored at 0 (never show a negative). */
export function packageSaving(
  pkg: Package,
  addons: Addon[],
  opts: { variantKey: string | null; checkIn: string; checkOut: string; guests: number; seasons: PriceSeason[] },
): PackageSaving {
  let partsTotal = 0;
  for (const inc of pkg.included) {
    const addon = addons.find((a) => a.id === inc.addon_id);
    if (!addon || addon.variants.length === 0) continue;
    partsTotal += priceLine({
      kind: "addon",
      item: addon,
      variantKey: includedVariantKey(inc, addon, opts.variantKey),
      checkIn: opts.checkIn,
      checkOut: opts.checkOut,
      guests: opts.guests,
      seasons: opts.seasons,
    }).subtotal;
  }
  const bundleTotal = priceLine({
    kind: "package",
    item: pkg,
    variantKey: opts.variantKey,
    checkIn: opts.checkIn,
    checkOut: opts.checkOut,
    guests: opts.guests,
    seasons: opts.seasons,
  }).subtotal;
  return { partsTotal, bundleTotal, saving: Math.max(0, partsTotal - bundleTotal) };
}

// ── Quote totals & warnings ─────────────────────────────────────────────────

export interface QuoteTotals {
  roomsTotal: number;
  addonsTotal: number;
  discount: number;
  total: number;
}

export function sumQuote(input: { lines: QuoteLine[]; roomsTotal?: number; discount?: number }): QuoteTotals {
  const roomsTotal = Math.max(0, input.roomsTotal ?? 0);
  const addonsTotal = input.lines.reduce((s, l) => s + l.subtotal, 0);
  const gross = roomsTotal + addonsTotal;
  const discount = Math.min(Math.max(0, input.discount ?? 0), gross);
  return { roomsTotal, addonsTotal, discount, total: gross - discount };
}

export const formatINR = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Non-blocking warnings for the builder: the owner is mid-call, so we flag
 *  fallbacks rather than stop them. */
export function quoteWarnings(lines: QuoteLine[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    for (const seg of line.breakdown) {
      if (seg.source === "base_fallback" && seg.season_name) {
        const label = line.variant_label ? `${line.name} (${line.variant_label})` : line.name;
        out.push(`${label} has no ${seg.season_name} price — using base ${formatINR(seg.unit_price)}.`);
      }
    }
  }
  return Array.from(new Set(out));
}

// ── Booking-charge conversion (used by "Convert to booking", phase 3) ───────

/** One booking_charges row per price segment, so mixed-season lines keep
 *  their exact prices (booking_charges only has description/qty/unit_price). */
export function lineToCharges(line: QuoteLine): { description: string; qty: number; unit_price: number }[] {
  const variant = line.variant_label ? ` (${line.variant_label})` : "";
  const inc = line.includes.length ? ` — ${line.includes.join(", ")}` : "";
  return line.breakdown.map((seg) => ({
    description: `${line.name}${variant}${seg.source === "season" && seg.season_name ? ` · ${seg.season_name}` : ""}${inc}`,
    qty: line.multiplier * seg.days,
    unit_price: seg.unit_price,
  }));
}

// ── Catalog maintenance helpers (Seasons editor) ────────────────────────────

/** season id -> number of variants that have no explicit price for it. */
export function coverageGaps(items: { variants: PriceVariant[] }[], seasons: PriceSeason[]): Record<string, number> {
  const gaps: Record<string, number> = {};
  for (const s of seasons) {
    gaps[s.id] = 0;
    for (const item of items) {
      for (const v of item.variants) {
        const p = v.season_prices?.[s.id];
        if (!(typeof p === "number" && Number.isFinite(p) && p >= 0)) gaps[s.id] += 1;
      }
    }
  }
  return gaps;
}

export type BulkFillMode = { type: "copy_base" } | { type: "add_pct"; pct: number };

/**
 * One-time helper: writes EXACT numbers into blank season cells. It never
 * touches a price the owner already set, and it is not a live formula — the
 * owner can edit every resulting number freely afterwards.
 */
export function bulkFillVariants(
  variants: PriceVariant[],
  seasonId: string,
  mode: BulkFillMode,
  roundTo = 10,
): PriceVariant[] {
  return variants.map((v) => {
    const existing = v.season_prices?.[seasonId];
    if (typeof existing === "number" && Number.isFinite(existing) && existing >= 0) return v;
    const raw = mode.type === "copy_base" ? v.base_price : v.base_price * (1 + mode.pct / 100);
    const price = mode.type === "copy_base" || roundTo <= 0 ? Math.round(raw) : Math.round(raw / roundTo) * roundTo;
    return { ...v, season_prices: { ...(v.season_prices ?? {}), [seasonId]: price } };
  });
}

/** A fresh variant with a URL-safe key. */
export function newVariant(label = "Standard", base = 0): PriceVariant {
  const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "standard";
  return { key, label, base_price: base, season_prices: {} };
}
