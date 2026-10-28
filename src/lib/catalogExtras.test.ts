/**
 * Tests for picking catalog add-ons / packages as booking extras.
 *
 * Run: npx tsx --test src/lib/catalogExtras.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCatalog, priceCatalogItem, priceHint } from "./catalogExtras";
import type { Addon, Package, PriceSeason } from "./quotes";

const variant = (base: number, seasonPrices: Record<string, number> = {}, label = "Standard") => ({
  key: label.toLowerCase(), label, base_price: base, season_prices: seasonPrices,
});

const bonfire: Addon = { id: "a1", name: "Bonfire", category: "activity", unit: "per_group", variants: [variant(500)], is_active: true, sort_order: 0 };
const dinner: Addon = { id: "a2", name: "Dinner", category: "food", unit: "per_person_day", variants: [variant(300)], is_active: true, sort_order: 1 };
const trek: Addon = { id: "a3", name: "Trek guide", category: "activity", unit: "per_day", variants: [variant(800, { s1: 1000 })], is_active: true, sort_order: 2 };
const hidden: Addon = { ...bonfire, id: "a4", name: "Hidden", is_active: false };
const unpriced: Addon = { ...bonfire, id: "a5", name: "No price yet", variants: [] };
const pkg: Package = {
  id: "p1", name: "Romantic stay", description: null, unit: "per_group",
  included: [{ addon_id: "a1", variant_key: null }, { addon_id: "a2", variant_key: null }],
  variants: [variant(2500)], is_active: true, sort_order: 0,
};

const festive: PriceSeason = { id: "s1", name: "Christmas", start_date: "2026-12-24", end_date: "2026-12-25", recurs_yearly: false, priority: 1 };

test("catalog lists active, priced items only; packages first", () => {
  const items = buildCatalog([bonfire, dinner, hidden, unpriced], [pkg]);
  assert.deepEqual(items.map((i) => i.name), ["Romantic stay", "Bonfire", "Dinner"]);
});

test("a package lists the add-ons it contains", () => {
  const items = buildCatalog([bonfire, dinner], [pkg]);
  assert.deepEqual(items[0].includes, ["Bonfire", "Dinner"]);
});

test("a per-person-per-day add-on is guests × nights × price", () => {
  const item = buildCatalog([dinner], [])[0];
  const p = priceCatalogItem({ item, checkIn: "2026-11-10", checkOut: "2026-11-12", guests: 3, seasons: [] })!;
  assert.equal(p.rows.length, 1);
  assert.deepEqual(p.rows[0], { description: "Dinner", qty: 6, unit_price: 300 });
  assert.equal(p.total, 1800);
});

test("a per-group add-on is charged once, whatever the guests and nights", () => {
  const item = buildCatalog([bonfire], [])[0];
  const p = priceCatalogItem({ item, checkIn: "2026-11-10", checkOut: "2026-11-14", guests: 6, seasons: [] })!;
  assert.deepEqual(p.rows, [{ description: "Bonfire", qty: 1, unit_price: 500 }]);
});

test("a stay crossing a season change keeps each exact price as its own row", () => {
  const item = buildCatalog([trek], [])[0];
  // nights: 23 Dec (base 800), 24 and 25 Dec (Christmas 1000)
  const p = priceCatalogItem({ item, checkIn: "2026-12-23", checkOut: "2026-12-26", guests: 2, seasons: [festive] })!;
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows[0], { description: "Trek guide", qty: 1, unit_price: 800 });
  assert.deepEqual(p.rows[1], { description: "Trek guide · Christmas", qty: 2, unit_price: 1000 });
  assert.equal(p.total, 2800);
});

test("the owner's quantity replaces the guest count", () => {
  const item = buildCatalog([dinner], [])[0];
  const p = priceCatalogItem({ item, checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 5, seasons: [], quantity: 2 })!;
  assert.equal(p.rows[0].qty, 2);
  assert.equal(p.total, 600);
});

test("a nonsense quantity falls back to the default instead of charging zero", () => {
  const item = buildCatalog([dinner], [])[0];
  for (const quantity of [0, -3, NaN]) {
    const p = priceCatalogItem({ item, checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 4, seasons: [], quantity })!;
    assert.equal(p.rows[0].qty, 4);
  }
});

test("the 'Standard' variant is not written into the description, a real choice is", () => {
  const veg = { ...dinner, variants: [variant(300, {}, "Standard"), variant(450, {}, "Non-veg")] };
  const item = buildCatalog([veg], [])[0];
  const std = priceCatalogItem({ item, variantKey: "standard", checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 1, seasons: [] })!;
  const nv = priceCatalogItem({ item, variantKey: "non-veg", checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 1, seasons: [] })!;
  assert.equal(std.rows[0].description, "Dinner");
  assert.equal(nv.rows[0].description, "Dinner (Non-veg)");
  assert.equal(nv.rows[0].unit_price, 450);
});

test("a package's description names what it includes", () => {
  const item = buildCatalog([bonfire, dinner], [pkg])[0];
  const p = priceCatalogItem({ item, checkIn: "2026-11-10", checkOut: "2026-11-11", guests: 2, seasons: [] })!;
  assert.equal(p.rows[0].description, "Romantic stay — Bonfire, Dinner");
  assert.equal(p.total, 2500);
});

test("no dates, or check-out not after check-in, cannot be priced", () => {
  const item = buildCatalog([bonfire], [])[0];
  assert.equal(priceCatalogItem({ item, checkIn: "", checkOut: "", guests: 2, seasons: [] }), null);
  assert.equal(priceCatalogItem({ item, checkIn: "2026-11-10", checkOut: "2026-11-10", guests: 2, seasons: [] }), null);
  assert.equal(priceCatalogItem({ item, checkIn: "2026-11-12", checkOut: "2026-11-10", guests: 2, seasons: [] }), null);
});

test("a season with no price set for the item uses the base price and says so", () => {
  const noSeasonPrice = { ...bonfire, unit: "per_day" as const };
  const item = buildCatalog([noSeasonPrice], [])[0];
  const p = priceCatalogItem({ item, checkIn: "2026-12-24", checkOut: "2026-12-25", guests: 2, seasons: [festive] })!;
  assert.equal(p.usedFallback, true);
  assert.equal(p.rows[0].unit_price, 500);
});

test("priceHint shows the standard price and unit", () => {
  assert.equal(priceHint(buildCatalog([dinner], [])[0]), "₹300 per person / day");
});
