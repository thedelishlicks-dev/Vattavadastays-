import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useCreateAgent, useUpdateAgent } from "@/hooks/useAgents";
import type { Agent, CommissionType } from "@/types/database";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

interface AgentFormModalProps {
  propertyId: string;
  agent: Agent | null;
  onClose: () => void;
  /** Called after a successful save, with the created/updated agent — lets
   * callers (e.g. the booking form) auto-select the agent that was just added. */
  onSaved?: (agent: Agent) => void;
}

export function AgentFormModal({ propertyId, agent, onClose, onSaved }: AgentFormModalProps) {
  const isEdit = !!agent;
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const [form, setForm] = useState({
    name: agent?.name ?? "",
    phone: agent?.phone ?? "",
    default_commission_type: (agent?.default_commission_type ?? "percentage") as CommissionType,
    default_commission_value: (agent?.default_commission_value ?? 10) as number | "",
    notes: agent?.notes ?? "",
  });
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const saving = createAgent.isPending || updateAgent.isPending;

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Agent name is required");
      return;
    }
    // Coerce here, not on every keystroke — the field holds "" while the
    // person is mid-edit (e.g. clearing the value to type a new one) and
    // that must never be allowed to reach the DB as NaN/null, since
    // default_commission_value is a NOT NULL column.
    const commissionValue = form.default_commission_value === "" ? 0 : form.default_commission_value;
    if (Number.isNaN(commissionValue) || commissionValue < 0) {
      setError("Enter a valid commission value");
      return;
    }
    if (form.default_commission_type === "percentage" && commissionValue > 100) {
      setError("Percentage commission can't exceed 100%");
      return;
    }
    setError("");
    try {
      const payload = { ...form, default_commission_value: commissionValue };
      const saved = isEdit
        ? await updateAgent.mutateAsync({ id: agent.id, propertyId, ...payload })
        : await createAgent.mutateAsync({ propertyId, ...payload });
      onSaved?.(saved);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-card rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">{isEdit ? "Edit agent" : "Add agent"}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="Agent or agency name" />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} placeholder="Optional" />
          </div>

          <div className="space-y-2">
            <label className={labelCls}>Default commission</label>
            <div className="flex gap-2">
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                {(["percentage", "flat"] as CommissionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set("default_commission_type", t)}
                    className={[
                      "px-3 py-2 text-sm font-medium transition-colors",
                      form.default_commission_type === t ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                    ].join(" ")}
                  >
                    {t === "percentage" ? "%" : "₹ flat"}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={form.default_commission_type === "percentage" ? 100 : undefined}
                step={form.default_commission_type === "percentage" ? 0.5 : 1}
                value={form.default_commission_value}
                onChange={(e) => {
                  if (e.target.value === "") {
                    set("default_commission_value", "");
                    return;
                  }
                  const parsed = parseFloat(e.target.value);
                  set("default_commission_value", Number.isNaN(parsed) ? "" : parsed);
                }}
                className={`${inputCls} flex-1`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {form.default_commission_type === "percentage"
                ? "Applied to the room rate of each booking this agent brings in."
                : "Flat amount per booking this agent brings in, regardless of room rate."}
            </p>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputCls} min-h-[70px] resize-none`} placeholder="Optional" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save changes" : "Add agent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
