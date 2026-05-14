import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tag, Pencil, X, Loader2, Check } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import type { Room } from "@/types/database";

export const Route = createFileRoute("/admin/pricing")({
  component: AdminPricing,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

type PricingForm = {
  base_price: number;
  extra_guest_price: number;
  weekend_multiplier: number;
};

function PricingDrawer({
  room,
  onClose,
  onSaved,
}: {
  room: Room;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PricingForm>({
    base_price: room.base_price,
    extra_guest_price: room.extra_guest_price,
    weekend_multiplier: room.weekend_multiplier ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof PricingForm, v: number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (form.base_price <= 0) { setError("Base price must be greater than 0"); return; }
    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("rooms")
        .update({
          base_price: form.base_price,
          extra_guest_price: form.extra_guest_price,
          weekend_multiplier: form.weekend_multiplier,
        })
        .eq("id", room.id);
      if (err) throw err;
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const weekendPrice = Math.round(form.base_price * form.weekend_multiplier);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-card shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display text-lg font-semibold">Edit Pricing</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{room.name}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className={labelCls}>Base price / night (₹) *</label>
            <input
              type="number" min={0} value={form.base_price}
              onChange={(e) => set("base_price", parseInt(e.target.value) || 0)}
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Weekday rate — applies Sun to Thu
            </p>
          </div>

          <div>
            <label className={labelCls}>Extra guest charge / night (₹)</label>
            <input
              type="number" min={0} value={form.extra_guest_price}
              onChange={(e) => set("extra_guest_price", parseInt(e.target.value) || 0)}
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Applied per guest beyond 2. Set 0 to disable.
            </p>
          </div>

          <div>
            <label className={labelCls}>Weekend multiplier (Fri – Sat)</label>
            <input
              type="number" min={1} max={5} step={0.05} value={form.weekend_multiplier}
              onChange={(e) => set("weekend_multiplier", parseFloat(e.target.value) || 1)}
              className={`${inputCls} max-w-[160px]`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              e.g. 1.25 = 25% higher on Fri–Sat
            </p>
          </div>

          {/* Live preview */}
          <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Price preview</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Weekday (Sun–Thu)</span>
              <span className="font-semibold">₹{form.base_price.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Weekend (Fri–Sat)</span>
              <span className="font-semibold">₹{weekendPrice.toLocaleString("en-IN")}</span>
            </div>
            {form.extra_guest_price > 0 && (
              <div className="flex justify-between border-t border-border pt-2 mt-2">
                <span className="text-muted-foreground">Per extra guest / night</span>
                <span className="font-semibold">+₹{form.extra_guest_price.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save pricing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPricing() {
  const { data: property, isLoading } = useOwnerProperty();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["ownerProperty", user?.id] });
    setEditingRoom(null);
  };

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  const rooms = (property?.rooms ?? []).filter((r) => r.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Set base rates, extra guest charges, and weekend premiums per room.
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Tag className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No active rooms</p>
          <p className="text-sm text-muted-foreground mt-1">Add rooms first from the Rooms section.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-3 font-medium">Room</th>
                <th className="px-4 py-3 font-medium">Base / night</th>
                <th className="px-4 py-3 font-medium">Weekend</th>
                <th className="px-4 py-3 font-medium">Extra guest</th>
                <th className="px-4 py-3 font-medium text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => {
                const weekendPrice = Math.round(room.base_price * (room.weekend_multiplier ?? 1));
                const hasMultiplier = (room.weekend_multiplier ?? 1) > 1;
                return (
                  <tr key={room.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{room.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{room.room_type}</div>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      ₹{room.base_price.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">₹{weekendPrice.toLocaleString("en-IN")}</span>
                      {hasMultiplier && (
                        <span className="ml-1.5 text-xs text-primary bg-primary-light/60 px-1.5 py-0.5 rounded-full">
                          ×{room.weekend_multiplier}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {room.extra_guest_price > 0
                        ? <span>₹{room.extra_guest_price.toLocaleString("en-IN")}/person</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditingRoom(room as Room)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
                        title="Edit pricing"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl bg-muted/40 border border-border p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-xs uppercase tracking-wider mb-2">How pricing works</p>
        <p>• <strong>Base price</strong> applies Sun–Thu nights.</p>
        <p>• <strong>Weekend multiplier</strong> auto-applies on Fri–Sat bookings.</p>
        <p>• <strong>Extra guest</strong> charge kicks in for guests beyond 2.</p>
        <p>• Override specific dates from the <strong>Calendar</strong> tab.</p>
      </div>

      {editingRoom && (
        <PricingDrawer
          room={editingRoom}
          onClose={() => setEditingRoom(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
