import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin/policies")({
  component: AdminPolicies,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";
const textareaCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none";

// Cancellation policy presets
const CANCELLATION_PRESETS = [
  { label: "Flexible", value: "Full refund if cancelled 24 hours before check-in. No refund for no-shows." },
  { label: "Moderate", value: "Full refund if cancelled 5 days before check-in. 50% refund if cancelled within 5 days. No refund for no-shows." },
  { label: "Strict", value: "50% refund if cancelled 7 days before check-in. No refund within 7 days of check-in." },
  { label: "Non-refundable", value: "This booking is non-refundable. No cancellations or modifications accepted." },
];

// House rules presets
const HOUSE_RULE_PRESETS = [
  "No smoking inside the property",
  "No loud music after 10 PM",
  "Pets not allowed",
  "Outside guests not permitted without prior permission",
  "Please conserve water and electricity",
  "Campfire only in designated areas",
  "Respect local wildlife — do not feed animals",
  "No single-use plastics inside the property",
];

type PoliciesForm = {
  check_in_time: string;
  check_out_time: string;
  cancellation_policy: string;
  house_rules: string;
};

// We store cancellation_policy and house_rules in shared_amenities as sentinels
// since they aren't columns — consistent with meals approach
function parsePolicies(
  check_in_time: string | null,
  check_out_time: string | null,
  shared_amenities: string[] | null
): PoliciesForm {
  const get = (prefix: string) => {
    const entry = (shared_amenities ?? []).find((a) => a.startsWith(prefix));
    return entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
  };
  return {
    check_in_time: check_in_time ?? "2:00 PM",
    check_out_time: check_out_time ?? "11:00 AM",
    cancellation_policy: get("__cancel:"),
    house_rules: get("__rules:"),
  };
}

function encodePolicies(form: PoliciesForm, existing: string[]): string[] {
  const filtered = existing.filter(
    (a) => !a.startsWith("__cancel:") && !a.startsWith("__rules:")
  );
  const entries: string[] = [];
  if (form.cancellation_policy)
    entries.push(`__cancel:${encodeURIComponent(form.cancellation_policy)}`);
  if (form.house_rules)
    entries.push(`__rules:${encodeURIComponent(form.house_rules)}`);
  return [...filtered, ...entries];
}

function AdminPolicies() {
  const { data: property, isLoading } = useOwnerProperty();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<PoliciesForm>({
    check_in_time: "2:00 PM",
    check_out_time: "11:00 AM",
    cancellation_policy: "",
    house_rules: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (property) {
      setForm(parsePolicies(
        property.check_in_time,
        property.check_out_time,
        property.shared_amenities ?? []
      ));
    }
  }, [property?.id]);

  const set = <K extends keyof PoliciesForm>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleRule = (rule: string) => {
    const lines = form.house_rules
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const exists = lines.some((l) => l === rule);
    const updated = exists
      ? lines.filter((l) => l !== rule)
      : [...lines, rule];
    set("house_rules", updated.join("\n"));
  };

  const ruleLines = form.house_rules
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const handleSave = async () => {
    if (!property) return;
    setSaving(true);
    setError("");
    try {
      const updatedAmenities = encodePolicies(form, property.shared_amenities ?? []);
      const { error: err } = await supabase
        .from("properties")
        .update({
          check_in_time: form.check_in_time,
          check_out_time: form.check_out_time,
          shared_amenities: updatedAmenities,
        })
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
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Policies</h1>
        <p className="text-sm text-muted-foreground">
          Check-in times, cancellation policy, and house rules shown to guests.
        </p>
      </div>

      {/* Check-in / Check-out */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">Check-in & Check-out</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Check-in time</label>
            <input
              value={form.check_in_time}
              onChange={(e) => set("check_in_time", e.target.value)}
              className={inputCls}
              placeholder="e.g. 2:00 PM"
            />
          </div>
          <div>
            <label className={labelCls}>Check-out time</label>
            <input
              value={form.check_out_time}
              onChange={(e) => set("check_out_time", e.target.value)}
              className={inputCls}
              placeholder="e.g. 11:00 AM"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          These appear in WhatsApp booking confirmation messages and the guest page.
        </p>
      </div>

      {/* Cancellation policy */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">Cancellation Policy</h2>

        <div className="flex flex-wrap gap-2">
          {CANCELLATION_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set("cancellation_policy", p.value)}
              className={[
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                form.cancellation_policy === p.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <label className={labelCls}>Policy text (editable)</label>
          <textarea
            value={form.cancellation_policy}
            onChange={(e) => set("cancellation_policy", e.target.value)}
            rows={4}
            className={textareaCls}
            placeholder="Describe your cancellation and refund policy..."
          />
        </div>
      </div>

      {/* House rules */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">House Rules</h2>

        <div className="flex flex-wrap gap-2">
          {HOUSE_RULE_PRESETS.map((rule) => {
            const active = ruleLines.includes(rule);
            return (
              <button
                key={rule}
                onClick={() => toggleRule(rule)}
                className={[
                  "text-xs px-3 py-1.5 rounded-full border transition-colors text-left",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted",
                ].join(" ")}
              >
                {rule}
              </button>
            );
          })}
        </div>

        <div>
          <label className={labelCls}>Rules (one per line, editable)</label>
          <textarea
            value={form.house_rules}
            onChange={(e) => set("house_rules", e.target.value)}
            rows={6}
            className={textareaCls}
            placeholder={"No smoking inside\nNo loud music after 10 PM\n..."}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Click presets above to toggle, or type your own rules below.
          </p>
        </div>

        {ruleLines.length > 0 && (
          <div className="rounded-lg bg-muted/40 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
            {ruleLines.map((r, i) => (
              <p key={i} className="text-sm text-foreground">• {r}</p>
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
          Save policies
        </button>
        {saved && <span className="text-sm text-primary font-medium">Saved ✓</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
