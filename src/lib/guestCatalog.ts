// src/lib/guestCatalog.ts
//
// What a guest sees of the owner's add-ons and packages: names, what is included and a "from"
// price. Information only: nothing here is booked or charged (extras are added by the owner,
// see catalogExtras.ts). Pure functions so the wording rules are testable.

import { CATEGORY_LABELS, UNIT_LABELS, type Addon, type AddonCategory, type Package, type PriceVariant } from "./quotes";

/** JSON from the database may predate a field; make it safe to read. */
export function safeVariants(raw: unknown): PriceVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => ({
    key: String(v?.key ?? "standard"),
    label: String(v?.label ?? "Standard"),
    base_price: Number(v?.base_price ?? 0),
    season_prices: v?.season_prices && typeof v.season_prices === "object" ? v.season_prices : {},
  }));
}

/** Lowest listed price, ignoring unset (0) variants. null = owner has not set a price. */
export function fromPrice(variants: PriceVariant[]): { amount: number; several: boolean } | null {
  const prices = variants.map((v) => v.base_price).filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return null;
  return { amount: Math.min(...prices), several: new Set(prices).size > 1 };
}

export function priceText(variants: PriceVariant[], unit: keyof typeof UNIT_LABELS): string {
  const p = fromPrice(variants);
  if (!p) return "Price on request";
  return `${p.several ? "from " : ""}₹${p.amount.toLocaleString("en-IN")} ${UNIT_LABELS[unit] ?? ""}`.trim();
}

export type GuestPackage = { id: string; name: string; description: string | null; price: string; included: string[] };
export type GuestAddonGroup = { category: AddonCategory; label: string; items: { id: string; name: string; price: string }[] };

/** Packages, each with the names of what it includes (items that are no longer active are skipped). */
export function guestPackages(packages: Package[], addons: Addon[]): GuestPackage[] {
  const byId = new Map(addons.map((a) => [a.id, a.name]));
  return [...packages]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description?.trim() ? p.description.trim() : null,
      price: priceText(p.variants, p.unit),
      included: p.included.map((i) => byId.get(i.addon_id)).filter((n): n is string => !!n),
    }));
}

const CATEGORY_ORDER: AddonCategory[] = ["food", "activity", "facility", "transport", "other"];

export function guestAddonGroups(addons: Addon[]): GuestAddonGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category] ?? "Other",
    items: addons
      .filter((a) => a.category === category)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({ id: a.id, name: a.name, price: priceText(a.variants, a.unit) })),
  })).filter((g) => g.items.length > 0);
}
