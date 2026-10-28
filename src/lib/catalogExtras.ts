// src/lib/catalogExtras.ts
//
// Picks an add-on or package from the property's catalog (Property → Add-ons) and turns it
// into extra-charge rows for a booking. This is the same pricing the Quote Builder uses
// (priceLine in quotes.ts: seasons, variants, per-person / per-day units), so an item costs the
// same whether it is added to a quote, to a new booking or to an existing booking's Extras tab.
//
// The money itself still lives in one place, booking_charges (description, qty, unit_price).
// A picked item is a SNAPSHOT: it is priced for the stay dates and guest count at the moment it
// is added and does not reprice if the dates change later.
//
// Pure functions (no React, no Supabase) so they are unit-tested in catalogExtras.test.ts.

import {
  lineToCharges,
  nightsBetween,
  packageIncludes,
  priceLine,
  UNIT_LABELS,
  type Addon,
  type AddonUnit,
  type Package,
  type PriceSeason,
  type PriceVariant,
  type QuoteLine,
} from "./quotes";

/** One extra-charge row, the shape of a booking_charges insert (minus the booking / group id). */
export interface ExtraRow {
  description: string;
  qty: number;
  unit_price: number;
}

export interface CatalogItem {
  kind: "addon" | "package";
  /** Unique across add-ons and packages, e.g. "addon:<uuid>". */
  key: string;
  id: string;
  name: string;
  unit: AddonUnit;
  variants: PriceVariant[];
  /** Names of the add-ons a package contains (empty for an add-on). */
  includes: string[];
}

/**
 * The items an owner can pick: active ones that have at least one price. An item with no variant
 * has no price and could not be charged, so it is left out rather than offered and then failing.
 * Packages come first, then add-ons, each in the owner's own sort order.
 */
export function buildCatalog(addons: Addon[], packages: Package[]): CatalogItem[] {
  const pkgs: CatalogItem[] = packages
    .filter((p) => p.is_active && p.variants.length > 0)
    .map((p) => ({
      kind: "package" as const,
      key: `package:${p.id}`,
      id: p.id,
      name: p.name,
      unit: p.unit,
      variants: p.variants,
      includes: packageIncludes(p, addons),
    }));
  const adds: CatalogItem[] = addons
    .filter((a) => a.is_active && a.variants.length > 0)
    .map((a) => ({
      kind: "addon" as const,
      key: `addon:${a.id}`,
      id: a.id,
      name: a.name,
      unit: a.unit,
      variants: a.variants,
      includes: [],
    }));
  return [...pkgs, ...adds];
}

/** "₹500 per person / day" — the item's standard price, for the picker list. */
export function priceHint(item: CatalogItem): string {
  const base = item.variants[0]?.base_price ?? 0;
  const more = item.variants.length > 1 ? " +" : "";
  return `₹${base.toLocaleString("en-IN")}${more} ${UNIT_LABELS[item.unit]}`;
}

export interface PriceCatalogInput {
  item: CatalogItem;
  variantKey?: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  seasons: PriceSeason[];
  /** Headcount / quantity typed by the owner. Leave out to use the guest count (per-person units) or 1. */
  quantity?: number;
}

export interface PricedCatalogItem {
  line: QuoteLine;
  /** One row per price segment, so an item that spans a season change keeps each exact price. */
  rows: ExtraRow[];
  total: number;
  /** A season applies to some night but the owner set no price for it, so the base price was used. */
  usedFallback: boolean;
}

/**
 * Price one catalog item for a stay. Returns null when it cannot be priced: no dates, check-out not
 * after check-in, or the item has no price.
 */
export function priceCatalogItem(input: PriceCatalogInput): PricedCatalogItem | null {
  const { item } = input;
  if (!input.checkIn || !input.checkOut || nightsBetween(input.checkIn, input.checkOut) < 1) return null;
  const quantity =
    input.quantity !== undefined && Number.isFinite(input.quantity) && input.quantity >= 1
      ? Math.floor(input.quantity)
      : undefined;
  let line: QuoteLine;
  try {
    line = priceLine({
      kind: item.kind,
      item: { id: item.id, name: item.name, unit: item.unit, variants: item.variants },
      variantKey: input.variantKey,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests,
      seasons: input.seasons,
      quantityOverride: quantity,
      includes: item.includes,
    });
  } catch {
    return null;
  }
  // "Bonfire (Standard)" reads badly on an invoice; only name a variant when there is a real choice.
  const label = line.variant_label && line.variant_label.trim().toLowerCase() !== "standard" ? line.variant_label : null;
  const rows = lineToCharges({ ...line, variant_label: label });
  const total = rows.reduce((s, r) => s + r.qty * r.unit_price, 0);
  return { line, rows, total, usedFallback: line.used_fallback };
}
