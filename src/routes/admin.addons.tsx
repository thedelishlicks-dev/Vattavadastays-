import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAddons, useDeleteRow, usePackages, useSaveRow, useSeasons } from "@/hooks/useCatalog";
import { PageHeader, Section, Field, inputCls } from "@/admin/formKit";
import {
  CATEGORY_LABELS,
  UNIT_LABELS,
  coverageGaps,
  formatINR,
  newVariant,
  type Addon,
  type AddonCategory,
  type AddonUnit,
  type Package,
  type PackageIncluded,
  type PriceSeason,
  type PriceVariant,
} from "@/lib/quotes";

export const Route = createFileRoute("/admin/addons")({
  component: AdminAddons,
});

function AdminAddons() {
  const { data: property, isLoading } = useOwnerProperty();
  if (isLoading || !property) return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  return <Catalog propertyId={property.id} />;
}

function Catalog({ propertyId }: { propertyId: string }) {
  const { data: seasons = [] } = useSeasons(propertyId);
  const { data: addons = [], isLoading: loadingAddons } = useAddons(propertyId);
  const { data: packages = [], isLoading: loadingPackages } = usePackages(propertyId);
  const [adding, setAdding] = useState<"addon" | "package" | null>(null);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Add-ons & Packages"
        subtitle="What you offer beyond the room — meals, campfire, kitchen, trekking — with an exact price for each season. These power the quotes you send guests; nothing here is shown to guests or charged automatically."
      />

      {seasons.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Prices change in peak season or festivals? Define your seasons once on the{" "}
          <Link to="/admin/pricing" className="underline text-foreground">Pricing page</Link>, then come back to set a
          price for each.
        </div>
      )}

      <Section title="Add-ons" description="Individual things guests can add. Use variants for Veg / Non-veg or with / without guide.">
        {loadingAddons && <div className="h-16 rounded-lg bg-muted animate-pulse" />}
        {addons.map((a) => (
          <ItemCard key={a.id} propertyId={propertyId} kind="addon" item={a} seasons={seasons} addons={addons} />
        ))}
        {adding === "addon" && (
          <ItemCard propertyId={propertyId} kind="addon" seasons={seasons} addons={addons} startOpen onClose={() => setAdding(null)} />
        )}
        {adding !== "addon" && (
          <AddButton label="Add add-on" onClick={() => setAdding("addon")} />
        )}
      </Section>

      <Section title="Packages" description="Bundles of add-ons sold at one price — e.g. “Weekend Escape: full-board + campfire + guided trek”.">
        {loadingPackages && <div className="h-16 rounded-lg bg-muted animate-pulse" />}
        {packages.map((p) => (
          <ItemCard key={p.id} propertyId={propertyId} kind="package" item={p} seasons={seasons} addons={addons} />
        ))}
        {adding === "package" && (
          <ItemCard propertyId={propertyId} kind="package" seasons={seasons} addons={addons} startOpen onClose={() => setAdding(null)} />
        )}
        {adding !== "package" && (
          <AddButton label="Add package" onClick={() => setAdding("package")} />
        )}
      </Section>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}

// ── One add-on / package card ───────────────────────────────────────────────

interface Draft {
  name: string;
  description: string;
  category: AddonCategory;
  unit: AddonUnit;
  variants: PriceVariant[];
  included: PackageIncluded[];
  is_active: boolean;
}

function initialDraft(kind: "addon" | "package", item?: Addon | Package): Draft {
  if (item) {
    return {
      name: item.name,
      description: kind === "package" ? ((item as Package).description ?? "") : "",
      category: kind === "addon" ? (item as Addon).category : "other",
      unit: item.unit,
      variants: item.variants.length ? item.variants : [newVariant("Standard")],
      included: kind === "package" ? (item as Package).included : [],
      is_active: item.is_active,
    };
  }
  return {
    name: "",
    description: "",
    category: "food",
    unit: kind === "addon" ? "per_person_day" : "per_person",
    variants: [newVariant("Standard")],
    included: [],
    is_active: true,
  };
}

function ItemCard({
  propertyId, kind, item, seasons, addons, startOpen = false, onClose,
}: {
  propertyId: string;
  kind: "addon" | "package";
  item?: Addon | Package;
  seasons: PriceSeason[];
  addons: Addon[];
  startOpen?: boolean;
  onClose?: () => void;
}) {
  const table = kind === "addon" ? "addons" : "packages";
  const save = useSaveRow(table);
  const remove = useDeleteRow(table);
  const [open, setOpen] = useState(startOpen);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(kind, item));
  const [error, setError] = useState("");

  const setVariant = (i: number, patch: Partial<PriceVariant>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) }));

  const setSeasonPrice = (i: number, seasonId: string, raw: string) =>
    setDraft((d) => ({
      ...d,
      variants: d.variants.map((v, idx) => {
        if (idx !== i) return v;
        const next = { ...v.season_prices };
        if (raw === "") delete next[seasonId];
        else next[seasonId] = Math.max(0, Number(raw));
        return { ...v, season_prices: next };
      }),
    }));

  const addVariant = () =>
    setDraft((d) => {
      const v = newVariant(`Option ${d.variants.length + 1}`);
      let key = v.key;
      let n = 2;
      while (d.variants.some((x) => x.key === key)) key = `${v.key}_${n++}`;
      return { ...d, variants: [...d.variants, { ...v, key }] };
    });

  const toggleIncluded = (addonId: string) =>
    setDraft((d) => ({
      ...d,
      included: d.included.some((i) => i.addon_id === addonId)
        ? d.included.filter((i) => i.addon_id !== addonId)
        : [...d.included, { addon_id: addonId, variant_key: null }],
    }));

  const close = () => {
    setOpen(false);
    setError("");
    setDraft(initialDraft(kind, item));
    onClose?.();
  };

  const handleSave = async () => {
    if (!draft.name.trim()) return setError("Give it a name");
    if (draft.variants.length === 0) return setError("Add at least one price");
    if (draft.variants.some((v) => !v.label.trim())) return setError("Every price option needs a label");
    if (kind === "package" && draft.included.length === 0) return setError("Pick at least one add-on to include");
    setError("");
    try {
      await save.mutateAsync({
        propertyId,
        id: item?.id,
        values:
          kind === "addon"
            ? { name: draft.name.trim(), category: draft.category, unit: draft.unit, variants: draft.variants, is_active: draft.is_active }
            : { name: draft.name.trim(), description: draft.description.trim() || null, unit: draft.unit, included: draft.included, variants: draft.variants, is_active: draft.is_active },
      });
      if (item) setOpen(false);
      else close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!window.confirm(`Delete "${item.name}"? Quotes already sent keep their prices.`)) return;
    try {
      await remove.mutateAsync({ propertyId, id: item.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  // ── collapsed summary
  const bases = (item?.variants ?? []).map((v) => v.base_price);
  const missing = item ? Object.values(coverageGaps([item], seasons)).reduce((s, n) => s + n, 0) : 0;
  const priceText =
    bases.length === 0 ? "" : Math.min(...bases) === Math.max(...bases)
      ? formatINR(bases[0])
      : `${formatINR(Math.min(...bases))} – ${formatINR(Math.max(...bases))}`;

  return (
    <div className={`rounded-lg border ${open ? "border-primary/40" : "border-border"} ${item && !item.is_active ? "opacity-60" : ""}`}>
      {item && !open && (
        <button onClick={() => setOpen(true)} className="w-full flex items-center justify-between gap-3 p-3 text-left">
          <div className="min-w-0">
            <div className="font-medium truncate">
              {item.name}
              {!item.is_active && <span className="ml-2 text-xs text-muted-foreground">(hidden)</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {priceText} · {UNIT_LABELS[item.unit]}
              {item.variants.length > 1 && ` · ${item.variants.map((v) => v.label).join(" / ")}`}
            </div>
            {missing > 0 && (
              <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
                <TriangleAlert className="h-3 w-3" /> {missing} season price{missing > 1 ? "s" : ""} not set
              </div>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {open && (
        <div className="p-3 space-y-4">
          <Field label="Name">
            <input
              className={inputCls}
              value={draft.name}
              placeholder={kind === "addon" ? "e.g. Campfire, Full-board meals, Guided trek" : "e.g. Weekend Escape"}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>

          {kind === "package" && (
            <Field label="Description (optional)">
              <input className={inputCls} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            {kind === "addon" && (
              <Field label="Category">
                <select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as AddonCategory })}>
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
            )}
            <Field label="Charged" hint={kind === "package" ? "Most bundles are “per person”." : undefined}>
              <select className={inputCls} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as AddonUnit })}>
                {Object.entries(UNIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>

          {kind === "package" && (
            <div className="space-y-2">
              <span className="text-xs font-medium">Includes</span>
              {addons.filter((a) => a.is_active).length === 0 ? (
                <p className="text-xs text-muted-foreground">Add some add-ons first, then bundle them here.</p>
              ) : (
                <div className="grid gap-1.5">
                  {addons.filter((a) => a.is_active).map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={draft.included.some((i) => i.addon_id === a.id)} onChange={() => toggleIncluded(a.id)} />
                      {a.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium">Prices</span>
              <p className="text-[11px] text-muted-foreground">
                Enter exact prices. Leave a season blank to use the base price. Add a second option for Veg / Non-veg.
              </p>
            </div>

            {draft.variants.map((v, i) => (
              <div key={v.key} className="rounded-md border border-border p-3 space-y-3 bg-muted/20">
                <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-end">
                  <Field label="Option">
                    <input className={inputCls} value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} />
                  </Field>
                  <Field label="Base ₹">
                    <input type="number" min={0} className={inputCls} value={v.base_price || ""} onChange={(e) => setVariant(i, { base_price: Math.max(0, Number(e.target.value) || 0) })} />
                  </Field>
                  {draft.variants.length > 1 && (
                    <button
                      onClick={() => setDraft((d) => ({ ...d, variants: d.variants.filter((_, idx) => idx !== i) }))}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-border text-destructive hover:bg-muted"
                      aria-label="Remove option"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {seasons.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {seasons.map((s) => {
                      const blank = v.season_prices[s.id] === undefined;
                      return (
                        <Field key={s.id} label={s.name}>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              className={`${inputCls} ${blank ? "border-amber-300" : ""}`}
                              placeholder={`Base ₹${v.base_price || 0}`}
                              value={v.season_prices[s.id] ?? ""}
                              onChange={(e) => setSeasonPrice(i, s.id, e.target.value)}
                            />
                            {blank && <TriangleAlert className="absolute right-2.5 top-3 h-4 w-4 text-amber-500 pointer-events-none" />}
                          </div>
                        </Field>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <button onClick={addVariant} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add option (e.g. Veg / Non-veg)
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
            Available when building quotes
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            {item && (
              <button onClick={handleDelete} disabled={remove.isPending} className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline mr-auto">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button onClick={close} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button
                onClick={handleSave}
                disabled={save.isPending}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
