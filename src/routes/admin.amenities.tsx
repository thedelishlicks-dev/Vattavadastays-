import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin/amenities")({
  component: AdminAmenities,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

const PROPERTY_AMENITY_OPTIONS = [
  { key: "parking", label: "Parking" },
  { key: "wifi", label: "WiFi" },
  { key: "swimming_pool", label: "Swimming Pool" },
  { key: "bonfire", label: "Bonfire" },
  { key: "garden", label: "Garden" },
  { key: "bbq", label: "BBQ / Grill" },
  { key: "trekking", label: "Trekking Access" },
  { key: "campfire_area", label: "Campfire Area" },
  { key: "common_kitchen", label: "Common Kitchen" },
  { key: "laundry", label: "Laundry" },
  { key: "pet_friendly", label: "Pet Friendly" },
  { key: "wheelchair", label: "Wheelchair Accessible" },
  { key: "generator", label: "Generator Backup" },
  { key: "solar", label: "Solar Power" },
  { key: "ev_charging", label: "EV Charging" },
  { key: "pickup", label: "Pickup / Drop" },
];

const ROOM_AMENITY_LABELS: Record<string, string> = {
  ac: "AC", tv: "TV", balcony: "Balcony", attach_bath: "Attach Bath",
  heater: "Heater", hot_water: "Hot Water", kitchen: "Kitchenette",
  view: "Valley View", wifi: "WiFi", wardrobe: "Wardrobe",
  mini_fridge: "Mini Fridge", work_desk: "Work Desk",
};

function AdminAmenities() {
  const { data: property, isLoading } = useOwnerProperty();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // FIX: depend on both property?.id and property?.shared_amenities so the
  // list re-syncs if the query refetches after a save (id stays the same but
  // shared_amenities content changes).
  useEffect(() => {
    if (property) {
      const real = (property.shared_amenities ?? []).filter(
        (a) => !a.startsWith("__")
      );
      setSelected(real);
    }
  }, [property?.id, property?.shared_amenities]);

  const toggle = (key: string) =>
    setSelected((s) =>
      s.includes(key) ? s.filter((x) => x !== key) : [...s, key]
    );

  const addCustom = () => {
    const t = custom.trim().toLowerCase();
    if (t && !selected.includes(t)) setSelected((s) => [...s, t]);
    setCustom("");
  };

  const removeCustom = (key: string) => setSelected((s) => s.filter((x) => x !== key));

  const customAmenities = selected.filter(
    (a) => !PROPERTY_AMENITY_OPTIONS.find((o) => o.key === a)
  );

  const handleSave = async () => {
    if (!property) return;
    setSaving(true);
    setError("");
    try {
      // Preserve sentinel keys (meals config, policies, UPI etc.)
      const sentinels = (property.shared_amenities ?? []).filter((a) => a.startsWith("__"));
      const { error: err } = await supabase
        .from("properties")
        .update({ shared_amenities: [...selected, ...sentinels] })
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

  const rooms = (property?.rooms ?? []).filter((r) => r.is_active);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Amenities</h1>
        <p className="text-sm text-muted-foreground">
          Property-wide amenities shown on the guest booking page.
        </p>
      </div>

      {/* Property amenities */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">Property Amenities</h2>

        <div className="flex flex-wrap gap-2">
          {PROPERTY_AMENITY_OPTIONS.map(({ key, label }) => {
            const active = selected.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={[
                  "text-sm px-3 py-1.5 rounded-full border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-muted",
                ].join(" ")}
              >
                {active && <Check className="inline h-3 w-3 mr-1" />}
                {label}
              </button>
            );
          })}
        </div>

        {customAmenities.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {customAmenities.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-primary text-primary-foreground"
              >
                {a}
                <button onClick={() => removeCustom(a)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Add custom amenity"
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={addCustom}
            className="px-3 rounded-lg border border-border bg-background hover:bg-muted text-sm"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave} disabled={saving}
          className="rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save amenities
        </button>
        {saved && <span className="text-sm text-primary font-medium">Saved ✓</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      {/* Per-room summary (read-only) */}
      {rooms.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Room Amenities</h2>
            <span className="text-xs text-muted-foreground">Edit from Rooms tab</span>
          </div>
          {rooms.map((room) => (
            <div key={room.id} className="bg-card border border-border rounded-xl p-4">
              <p className="font-medium text-sm mb-2">{room.name}</p>
              {room.room_amenities && room.room_amenities.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {room.room_amenities.map((a) => (
                    <span
                      key={a}
                      className="text-xs bg-primary-light/60 text-primary px-2.5 py-1 rounded-full"
                    >
                      {ROOM_AMENITY_LABELS[a] ?? a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No room amenities set.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
