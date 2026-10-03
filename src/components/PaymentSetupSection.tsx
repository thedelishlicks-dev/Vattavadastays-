// src/components/PaymentSetupSection.tsx
//
// UPI ID + accepted payment methods. This used to sit at the very bottom of
// the Payments page (a ledger/report screen), which is why owners following
// the dashboard checklist item "Add your UPI ID" had trouble finding it.
// It now lives in Settings, and the Payments page just links here.
//
// Storage is unchanged: `__upi:` and `__pmethods:` sentinels in
// properties.shared_amenities (same encoding as before, so existing data
// and the guest-facing readers in src/utils/upi.ts keep working).

import { useEffect, useState } from "react";
import { Wallet, Loader2, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAuth } from "@/hooks/useAuth";
import { updateSharedAmenities, withSentinel } from "@/lib/propertyConfig";

const PAYMENT_METHODS = ["UPI", "Bank Transfer", "Cash on Arrival"];
const DEFAULT_METHODS = ["UPI", "Cash on Arrival"];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

function readUpi(shared: string[]): string {
  const entry = shared.find((a) => a.startsWith("__upi:"));
  return entry ? decodeURIComponent(entry.slice("__upi:".length)) : "";
}

function readMethods(shared: string[]): string[] {
  const entry = shared.find((a) => a.startsWith("__pmethods:"));
  if (!entry) return DEFAULT_METHODS;
  try {
    const parsed = JSON.parse(decodeURIComponent(entry.slice("__pmethods:".length)));
    return Array.isArray(parsed) ? parsed : DEFAULT_METHODS;
  } catch {
    return DEFAULT_METHODS;
  }
}

export function PaymentSetupSection() {
  const { data: property } = useOwnerProperty();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [upiId, setUpiId] = useState("");
  const [methods, setMethods] = useState<string[]>(DEFAULT_METHODS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!property) return;
    const shared = property.shared_amenities ?? [];
    setUpiId(readUpi(shared));
    setMethods(readMethods(shared));
  }, [property?.id, property?.shared_amenities]);

  const toggleMethod = (m: string) =>
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const handleSave = async () => {
    if (!property) return;
    setSaving(true);
    setError("");
    try {
      await updateSharedAmenities(property.id, (latest) => {
        const withUpi = withSentinel(
          latest,
          "__upi:",
          upiId.trim() ? encodeURIComponent(upiId.trim()) : null,
        );
        return withSentinel(withUpi, "__pmethods:", encodeURIComponent(JSON.stringify(methods)));
      });
      queryClient.invalidateQueries({ queryKey: ["ownerProperty", user?.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!property) return null;

  // type="button" everywhere: this section is rendered on the Settings page,
  // which has its own <form> elsewhere, and must never submit it.
  return (
    <div id="payment-setup" className="bg-card border border-border rounded-xl p-5 space-y-4">
      <h2 className="font-semibold text-sm flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" /> Payment setup
      </h2>

      <div>
        <label className={labelCls}>UPI ID</label>
        <input
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          className={inputCls}
          placeholder="yourname@upi"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Shown to guests in payment reminder messages and on the booking page.
        </p>
      </div>

      <div>
        <label className={labelCls}>Accepted payment methods</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {PAYMENT_METHODS.map((m) => {
            const active = methods.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMethod(m)}
                className={[
                  "text-sm px-3 py-1.5 rounded-full border transition-colors",
                  active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted",
                ].join(" ")}
              >
                {active && <Check className="inline h-3 w-3 mr-1" />}
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save payment setup
        </button>
        {saved && <span className="text-sm text-primary font-medium">Saved ✓</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
