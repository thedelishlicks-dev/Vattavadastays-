// ---------------------------------------------------------------------------
// Meal info — informational only, not a priced/booked line item.
//
// Design note: meal pricing is intentionally NOT collected from the guest
// at booking time and NOT baked into the quoted total. Real stays vary too
// much for a fixed guest-side price picker to be honest — breakfast is
// often complimentary, lunch/dinner usually follow a day-of menu, and
// delivery is arranged case by case. So this config only tells the guest
// what's on offer; when a guest actually orders something, the owner adds
// it as a normal entry on the booking's existing "Extras" tab (see
// ChargesList in admin.bookings.tsx) — the same place every other add-on
// charge goes. One mechanism for all extras, no parallel pricing system to
// keep in sync.
// ---------------------------------------------------------------------------

export type BreakfastPlan = "included" | "paid" | "unavailable";

export interface MealsConfig {
  breakfast: BreakfastPlan;
  /** Free text shown to guests, e.g. "₹150/person/day — arranged at check-in". Only shown when breakfast is "paid". */
  breakfast_note: string;
  /** In-house kitchen serving lunch/dinner on order. */
  kitchen_available: boolean;
  /** Free text, e.g. "Home-style Kerala meals on order, ₹200–350/person". */
  kitchen_note: string;
  /** Owner arranges food delivery from outside. */
  delivery_available: boolean;
  /** Free text, e.g. "We can arrange delivery from nearby restaurants on request." */
  delivery_note: string;
}

export const defaultMealsConfig = (): MealsConfig => ({
  breakfast: "unavailable",
  breakfast_note: "",
  kitchen_available: false,
  kitchen_note: "",
  delivery_available: false,
  delivery_note: "",
});

// Shape saved by the old (pre-simplification) meals editor — kept only so
// existing saved data migrates cleanly instead of silently resetting.
interface LegacyMealsConfig {
  breakfast_included: boolean;
  breakfast_price: number;
  packages: Array<{ name: string; description: string; price: number; per: "person" | "room" }>;
}

function migrateLegacy(legacy: LegacyMealsConfig): MealsConfig {
  const breakfast: BreakfastPlan = legacy.breakfast_included
    ? "included"
    : legacy.breakfast_price > 0
      ? "paid"
      : "unavailable";
  const packageNames = (legacy.packages ?? []).map((p) => p.name).filter(Boolean);
  return {
    breakfast,
    breakfast_note: breakfast === "paid" ? `₹${legacy.breakfast_price}/person/day` : "",
    kitchen_available: packageNames.length > 0,
    kitchen_note: packageNames.length > 0 ? `Available: ${packageNames.join(", ")}` : "",
    delivery_available: false,
    delivery_note: "",
  };
}

export function parseMealsConfig(shared_amenities: string[] | null | undefined): MealsConfig {
  const sentinel = (shared_amenities ?? []).find((a) => a.startsWith("__meals:"));
  if (!sentinel) return defaultMealsConfig();
  try {
    const parsed = JSON.parse(decodeURIComponent(sentinel.slice("__meals:".length)));
    // New shape has `breakfast`; old shape has `breakfast_included` + `packages`.
    if (typeof parsed.breakfast === "string") {
      return { ...defaultMealsConfig(), ...parsed };
    }
    return migrateLegacy(parsed as LegacyMealsConfig);
  } catch {
    return defaultMealsConfig();
  }
}

export function encodeMealsConfig(config: MealsConfig, existing: string[]): string[] {
  const filtered = existing.filter((a) => !a.startsWith("__meals:"));
  return [...filtered, `__meals:${encodeURIComponent(JSON.stringify(config))}`];
}

/** True if there's anything worth showing a guest at all. */
export function hasMealInfo(config: MealsConfig): boolean {
  return config.breakfast !== "unavailable" || config.kitchen_available || config.delivery_available;
}
