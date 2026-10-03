// src/components/RoomPricingFields.tsx
//
// ONE implementation of the three per-room price fields (base price, extra
// guest charge, weekend multiplier), their validation, and the live price
// preview. Used by BOTH the Rooms editor and the Pricing editor so the two
// entrances can never drift apart (different rounding, different limits,
// different wording) the way two hand-written forms did.
//
// Values are kept as the text the owner typed so a field can be cleared and
// retyped without snapping back to 0/1; parsePricing() converts at save.

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

export type PricingText = {
  base_price: string;
  extra_guest_price: string;
  weekend_multiplier: string;
};

export type PricingValues = {
  base_price: number;
  extra_guest_price: number;
  weekend_multiplier: number;
};

type RoomPricingSource = {
  base_price?: number | string | null;
  extra_guest_price?: number | string | null;
  weekend_multiplier?: number | string | null;
};

export function pricingTextFromRoom(room?: RoomPricingSource | null): PricingText {
  return {
    base_price: room?.base_price != null ? String(room.base_price) : "2500",
    extra_guest_price: room?.extra_guest_price != null ? String(room.extra_guest_price) : "500",
    weekend_multiplier: String(room?.weekend_multiplier ?? 1),
  };
}

export type ParsedPricing = { ok: true; values: PricingValues } | { ok: false; error: string };

/** Single source of truth for pricing validation. Whole-rupee prices. */
export function parsePricing(text: PricingText): ParsedPricing {
  const base = Math.round(parseFloat(text.base_price));
  const extra = text.extra_guest_price.trim() === "" ? 0 : Math.round(parseFloat(text.extra_guest_price));
  const multiplierRaw = text.weekend_multiplier.trim() === "" ? 1 : parseFloat(text.weekend_multiplier);

  if (!base || base <= 0) return { ok: false, error: "Base price must be greater than 0" };
  if (isNaN(extra) || extra < 0) return { ok: false, error: "Extra guest price must be 0 or more" };
  if (isNaN(multiplierRaw) || multiplierRaw < 1 || multiplierRaw > 5) {
    return { ok: false, error: "Weekend multiplier must be between 1 and 5" };
  }
  return {
    ok: true,
    values: {
      base_price: base,
      extra_guest_price: extra,
      weekend_multiplier: Math.round(multiplierRaw * 100) / 100,
    },
  };
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function RoomPricingFields({
  value,
  onChange,
  maxGuests,
  showPreview = true,
}: {
  value: PricingText;
  onChange: (key: keyof PricingText, v: string) => void;
  /** The room's own max guests — extra-guest charge applies beyond this. */
  maxGuests?: number | string;
  showPreview?: boolean;
}) {
  const parsed = parsePricing(value);
  const weekday = parsed.ok ? parsed.values.base_price : Math.round(parseFloat(value.base_price)) || 0;
  const multiplier = parsed.ok ? parsed.values.weekend_multiplier : 1;
  const extra = parsed.ok ? parsed.values.extra_guest_price : 0;
  const weekend = Math.round(weekday * multiplier);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Base price / night (₹) *</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value.base_price}
          placeholder="e.g. 2500"
          onChange={(e) => onChange("base_price", e.target.value)}
          className={inputCls}
        />
        <p className="text-xs text-muted-foreground mt-1">Weekday rate — applies Sun to Thu.</p>
      </div>

      <div>
        <label className={labelCls}>Extra guest charge / night (₹)</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value.extra_guest_price}
          placeholder="0"
          onChange={(e) => onChange("extra_guest_price", e.target.value)}
          className={inputCls}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {maxGuests
            ? `Charged per guest beyond ${maxGuests} (this room's max guests). `
            : "Charged per guest beyond this room's max guests. "}
          Set 0 to disable.
        </p>
      </div>

      <div>
        <label className={labelCls}>Weekend multiplier (Fri – Sat)</label>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={5}
          step={0.05}
          value={value.weekend_multiplier}
          placeholder="1"
          onChange={(e) => onChange("weekend_multiplier", e.target.value)}
          className={`${inputCls} max-w-[160px]`}
        />
        <p className="text-xs text-muted-foreground mt-1">e.g. 1.25 = 25% higher on Fri–Sat.</p>
      </div>

      {showPreview && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Price preview</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Weekday (Sun–Thu)</span>
            <span className="font-semibold">{fmt(weekday)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Weekend (Fri–Sat)</span>
            <span className="font-semibold">{fmt(weekend)}</span>
          </div>
          {extra > 0 && (
            <div className="flex justify-between border-t border-border pt-2 mt-2">
              <span className="text-muted-foreground">Per extra guest / night</span>
              <span className="font-semibold">+{fmt(extra)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
