import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { UtensilsCrossed, Loader2, Coffee, Truck } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { type MealsConfig, type BreakfastPlan, parseMealsConfig, encodeMealsConfig, defaultMealsConfig } from "@/lib/meals";

export const Route = createFileRoute("/admin/meals")({
  component: AdminMeals,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const BREAKFAST_OPTIONS: { value: BreakfastPlan; label: string }[] = [
  { value: "included", label: "Included in room rate" },
  { value: "paid", label: "Available, paid" },
  { value: "unavailable", label: "Not offered" },
];

function AdminMeals() {
  const { data: property, isLoading } = useOwnerProperty();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<MealsConfig>(defaultMealsConfig());
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
          Let guests know what's on offer before they book. This is informational only —
          when a guest actually orders food during their stay, add it as a charge on that
          booking's <span className="font-medium text-foreground">Extras</span> tab, same as
          any other add-on. Prices here are just what guests see up front; nothing is
          auto-charged.
        </p>
      </div>

      {/* Breakfast */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Coffee className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Breakfast</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {BREAKFAST_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => set("breakfast", opt.value)}
              className={[
                "px-3 py-1.5 rounded-full text-xs border transition-colors",
                config.breakfast === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {config.breakfast === "paid" && (
          <div>
            <label className={labelCls}>Note for guests (e.g. price, timing)</label>
            <input
              value={config.breakfast_note}
              onChange={(e) => set("breakfast_note", e.target.value)}
              className={inputCls}
              placeholder="e.g. ₹150/person/day — let us know at check-in"
            />
          </div>
        )}
      </div>

      {/* Lunch / dinner via in-house kitchen */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Lunch &amp; dinner</h2>
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => set("kitchen_available", !config.kitchen_available)}
            className={[
              "w-10 h-6 rounded-full transition-colors relative cursor-pointer shrink-0",
              config.kitchen_available ? "bg-primary" : "bg-muted-foreground/30",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
                config.kitchen_available ? "translate-x-5" : "translate-x-1",
              ].join(" ")}
            />
          </div>
          <span className="text-sm font-medium">In-house kitchen serves lunch/dinner on order</span>
        </label>

        {config.kitchen_available && (
          <div>
            <label className={labelCls}>Note for guests (menu style, rough pricing)</label>
            <input
              value={config.kitchen_note}
              onChange={(e) => set("kitchen_note", e.target.value)}
              className={inputCls}
              placeholder="e.g. Home-style Kerala meals on order, ₹200–350/person"
            />
          </div>
        )}
      </div>

      {/* Delivery */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Food delivery</h2>
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => set("delivery_available", !config.delivery_available)}
            className={[
              "w-10 h-6 rounded-full transition-colors relative cursor-pointer shrink-0",
              config.delivery_available ? "bg-primary" : "bg-muted-foreground/30",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
                config.delivery_available ? "translate-x-5" : "translate-x-1",
              ].join(" ")}
            />
          </div>
          <span className="text-sm font-medium">We arrange food delivery for guests</span>
        </label>

        {config.delivery_available && (
          <div>
            <label className={labelCls}>Note for guests</label>
            <input
              value={config.delivery_note}
              onChange={(e) => set("delivery_note", e.target.value)}
              className={inputCls}
              placeholder="e.g. We can arrange delivery from nearby restaurants on request"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
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
