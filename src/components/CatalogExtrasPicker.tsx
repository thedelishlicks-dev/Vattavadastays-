import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import { priceCatalogItem, priceHint, type ExtraRow } from "@/lib/catalogExtras";
import { nightsBetween } from "@/lib/quotes";

const fieldCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

interface Props {
  propertyId: string;
  /** The stay the item is priced for. */
  checkIn: string;
  checkOut: string;
  guests: number;
  /** Receives the priced rows (one per price segment). May be async; a thrown error is shown here. */
  onAdd: (rows: ExtraRow[]) => void | Promise<void>;
}

/**
 * "Add from your catalog": pick one of the property's add-ons or packages (Property → Add-ons),
 * see exactly what it will cost for this stay, and add it as extra charges. Same prices as the
 * Quote Builder. Renders nothing when the owner has no priced add-ons or packages, so screens
 * can keep their free-text extras as they are.
 */
export function CatalogExtrasPicker({ propertyId, checkIn, checkOut, guests, onAdd }: Props) {
  const { items, seasons, hasCatalog } = useCatalogItems(propertyId);
  const [itemKey, setItemKey] = useState("");
  const [variantKey, setVariantKey] = useState("");
  const [qty, setQty] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const item = items.find((i) => i.key === itemKey) ?? null;
  // Changing the item starts from its defaults: first variant, default quantity.
  useEffect(() => {
    setVariantKey(item?.variants[0]?.key ?? "");
    setQty("");
    setError("");
  }, [itemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const quantity = qty.trim() === "" ? undefined : parseInt(qty, 10);
  const priced = useMemo(
    () => (item ? priceCatalogItem({ item, variantKey, checkIn, checkOut, guests, seasons, quantity }) : null),
    [item, variantKey, checkIn, checkOut, guests, seasons, quantity],
  );

  if (!hasCatalog) return null;

  const perPerson = item?.unit === "per_person" || item?.unit === "per_person_day";
  const defaultQty = perPerson ? Math.max(1, guests || 1) : 1;

  const handleAdd = async () => {
    if (!priced) return;
    setAdding(true);
    setError("");
    try {
      await onAdd(priced.rows);
      setItemKey("");
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Could not add this item. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const packages = items.filter((i) => i.kind === "package");
  const addons = items.filter((i) => i.kind === "addon");

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Add from your catalog</p>
      <select value={itemKey} onChange={(e) => setItemKey(e.target.value)} className={fieldCls} aria-label="Add-on or package">
        <option value="">Choose an add-on or package…</option>
        {packages.length > 0 && (
          <optgroup label="Packages">
            {packages.map((i) => <option key={i.key} value={i.key}>{i.name} — {priceHint(i)}</option>)}
          </optgroup>
        )}
        {addons.length > 0 && (
          <optgroup label="Add-ons">
            {addons.map((i) => <option key={i.key} value={i.key}>{i.name} — {priceHint(i)}</option>)}
          </optgroup>
        )}
      </select>

      {item && item.variants.length > 1 && (
        <select value={variantKey} onChange={(e) => setVariantKey(e.target.value)} className={fieldCls} aria-label="Option">
          {item.variants.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>
      )}

      {item && item.includes.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Includes: {item.includes.join(" · ")}</p>
      )}

      {item && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground shrink-0" htmlFor="catalog-extra-qty">{perPerson ? "People" : "Qty"}</label>
          <input
            id="catalog-extra-qty"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={String(defaultQty)}
            className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      )}

      {item && !priced && (
        <p className="text-xs text-amber-700">{nights < 1 ? "Choose the stay dates first so this can be priced." : "This item has no price set. Add one in Property → Add-ons."}</p>
      )}

      {item && priced && (
        <div className="rounded-lg bg-background border border-border px-3 py-2 space-y-1">
          {priced.rows.map((r, i) => (
            <div key={i} className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground min-w-0 break-words">{r.description}{r.qty > 1 ? ` × ${r.qty}` : ""} <span className="text-[11px]">(₹{r.unit_price.toLocaleString("en-IN")} each)</span></span>
              <span className="font-medium shrink-0">₹{(r.qty * r.unit_price).toLocaleString("en-IN")}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
            <span>Total</span><span>₹{priced.total.toLocaleString("en-IN")}</span>
          </div>
          {priced.usedFallback && (
            <p className="text-[11px] text-amber-700">A season applies but no seasonal price is set for this item, so the standard price is used.</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {item && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={!priced || adding}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add to extras
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Priced for {nights > 0 ? `${nights} night${nights > 1 ? "s" : ""}` : "the chosen dates"} · {Math.max(1, guests || 1)} guest{Math.max(1, guests || 1) > 1 ? "s" : ""}, at today's catalog prices. It will not change if the stay changes later.
      </p>
    </div>
  );
}
