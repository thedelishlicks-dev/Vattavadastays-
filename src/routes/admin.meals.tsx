import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { UtensilsCrossed, Loader2, Plus, X } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin/meals")({
  component: AdminMeals,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

type MealPackage = {
  id: string;
  name: string;
  description: string;
  price: number;
  per: "person" | "room";
};

type MealsConfig = {
  breakfast_included: boolean;
  breakfast_price: number;
  packages: MealPackage[];
};

const defaultConfig = (): MealsConfig => ({
  breakfast_included: false,
  breakfast_price: 0,
  packages: [],
});

const emptyPackage = (): MealPackage => ({
  id: crypto.randomUUID(),
  name: "",
  description: "",
  price: 0,
  per: "person",
});

// Stored as JSON in properties.shared_amenities under a sentinel key "__meals_config"
function parseMealsConfig(shared_amenities: string[] | null): MealsConfig {
  if (!shared_amenities) return defaultConfig();
  const sentinel = shared_amenities.find((a) => a.startsWith("__meals:"));
  if (!sentinel) return defaultConfig();
  try {
    return JSON.parse(decodeURIComponent(sentinel.slice("__meals:".length)));
  } catch {
    return defaultConfig();
  }
}

function encodeMealsConfig(config: MealsConfig, existing: string[]): string[] {
  const filtered = existing.filter((a) => !a.startsWith("__meals:"));
  return [...filtered, `__meals:${encodeURIComponent(JSON.stringify(config))}`];
}

function AdminMeals() {
  const { data: property, isLoading } = useOwnerProperty();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<MealsConfig>(defaultConfig());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (property) {
      setConfig(parseMealsConfig(property.shared_amenities ?? []));
    }
  }, [property]);

  const set = <K extends keyof MealsConfig>(k: K, v: MealsConfig[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));

  const addPackage = () =>
    setConfig((c) => ({ ...c, packages: [...c.packages, emptyPackage()] }));

  const removePackage = (id: string) =>
    setConfig((c) => ({ ...c, packages: c.packages.filter((p) => p.id !== id) }));

  const updatePackage = (id: string, k: keyof MealPackage, v: unknown) =>
    setConfig((c) => ({
      ...c,
      packages: c.packages.map((p) => (p.id === id ? { ...p, [k]: v } : p)),
    }));

  const handleSave = async () => {
    if (!property) return;
    setSaving(true);
    setError("");
    try {
      const updated = encodeMealsConfig(config, property.shared_amenities ?? []);
      const { error: err } = await supabase
        .from("properties")
        .update({ shared_amenities: updated })
        .eq("id", property.id);
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["ownerProperty", user?.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Meals</h1>
        <p className="text-sm text-muted-foreground">
          Configure meal offerings shown to guests on the booking page.
        </p>
      </div>

      {/* Breakfast */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">Breakfast</h2>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => set("breakfast_included", !config.breakfast_included)}
            className={[
              "w-10 h-6 rounded-full transition-colors relative cursor-pointer",
              config.breakfast_included ? "bg-primary" : "bg-muted-foreground/30",
            ].join(" ")}
          >
            <span className={[
              "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
              config.breakfast_included ? "translate-x-5" : "translate-x-1",
            ].join(" ")} />
          </div>
          <span className="text-sm font-medium">
            {config.breakfast_included ? "Breakfast included in room rate" : "Breakfast not included"}
          </span>
        </label>

        {!config.breakfast_included && (
          <div>
            <label className={labelCls}>Breakfast add-on price per person (₹)</label>
            <input
              type="number" min={0} value={config.breakfast_price}
              onChange={(e) => set("breakfast_price", parseInt(e.target.value) || 0)}
              className={`${inputCls} max-w-[200px]`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Set 0 to hide breakfast option from guests.
            </p>
          </div>
        )}
      </div>

      {/* Meal packages */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Meal Packages</h2>
          <button
            onClick={addPackage}
            className="inline-flex items-center gap-1.5 text-xs rounded-full border border-border px-3 py-1.5 hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Add package
          </button>
        </div>

        {config.packages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <UtensilsCrossed className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No meal packages yet.</p>
            <p className="text-xs mt-0.5">Add packages like "Full Board" or "Dinner Add-on".</p>
          </div>
        ) : (
          <div className="space-y-4">
            {config.packages.map((pkg) => (
              <div key={pkg.id} className="rounded-lg border border-border p-4 space-y-3 relative">
                <button
                  onClick={() => removePackage(pkg.id)}
                  className="absolute top-3 right-3 h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>

                <div className="grid grid-cols-2 gap-3 pr-8">
                  <div>
                    <label className={labelCls}>Package name *</label>
                    <input
                      value={pkg.name}
                      onChange={(e) => updatePackage(pkg.id, "name", e.target.value)}
                      className={inputCls} placeholder="e.g. Full Board"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Price (₹) *</label>
                    <input
                      type="number" min={0} value={pkg.price}
                      onChange={(e) => updatePackage(pkg.id, "price", parseInt(e.target.value) || 0)}
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Description</label>
                  <input
                    value={pkg.description}
                    onChange={(e) => updatePackage(pkg.id, "description", e.target.value)}
                    className={inputCls} placeholder="e.g. Breakfast, lunch and dinner"
                  />
                </div>

                <div>
                  <label className={labelCls}>Charged per</label>
                  <div className="flex gap-2">
                    {(["person", "room"] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => updatePackage(pkg.id, "per", opt)}
                        className={[
                          "px-3 py-1.5 rounded-full text-xs border transition-colors",
                          pkg.per === opt
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted",
                        ].join(" ")}
                      >
                        Per {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave} disabled={saving}
          className="rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save meals
        </button>
        {saved && <span className="text-sm text-primary font-medium">Saved ✓</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
