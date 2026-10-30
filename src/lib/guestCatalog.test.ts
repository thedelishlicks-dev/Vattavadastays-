import test from "node:test";
import assert from "node:assert/strict";
import { fromPrice, guestAddonGroups, guestPackages, priceText, safeVariants } from "./guestCatalog";
import type { Addon, Package } from "./quotes";

const v = (base_price: number, label = "Standard") => ({ key: label.toLowerCase(), label, base_price, season_prices: {} });
const addon = (id: string, name: string, category: Addon["category"], base: number, sort_order = 0): Addon =>
  ({ id, name, category, unit: "per_person", variants: [v(base)], is_active: true, sort_order });

test("from price: lowest set price, 'from' only when variants differ", () => {
  assert.deepEqual(fromPrice([v(500)]), { amount: 500, several: false });
  assert.deepEqual(fromPrice([v(900, "Deluxe"), v(500, "Standard")]), { amount: 500, several: true });
  assert.equal(fromPrice([v(0)]), null);
  assert.equal(fromPrice([]), null);
});

test("price text", () => {
  assert.equal(priceText([v(1500)], "per_person_day"), "₹1,500 per person / day");
  assert.equal(priceText([v(900, "Deluxe"), v(500)], "per_group"), "from ₹500 per group");
  assert.equal(priceText([v(0)], "per_stay"), "Price on request");
});

test("variants from the database are made safe", () => {
  assert.deepEqual(safeVariants(null), []);
  assert.deepEqual(safeVariants([{ label: "X", base_price: "250" }]), [{ key: "standard", label: "X", base_price: 250, season_prices: {} }]);
});

test("add-ons are grouped by category in a fixed order, empty groups left out", () => {
  const groups = guestAddonGroups([addon("a", "Trek", "activity", 300), addon("b", "Bonfire", "facility", 500), addon("c", "Dinner", "food", 400, 2), addon("d", "Lunch", "food", 400, 1)]);
  assert.deepEqual(groups.map((g) => g.category), ["food", "activity", "facility"]);
  assert.deepEqual(groups[0].items.map((i) => i.name), ["Lunch", "Dinner"]);
});

test("packages list what they include and skip items that are not in the active list", () => {
  const pkg: Package = { id: "p", name: "Honeymoon", description: "  Candle-lit dinner  ", unit: "per_group", included: [{ addon_id: "a", variant_key: null }, { addon_id: "gone", variant_key: null }], variants: [v(4000)], is_active: true, sort_order: 0 };
  const [p] = guestPackages([pkg], [addon("a", "Dinner", "food", 400)]);
  assert.equal(p.description, "Candle-lit dinner");
  assert.deepEqual(p.included, ["Dinner"]);
  assert.equal(p.price, "₹4,000 per group");
});
