import { useState } from "react";
import { Modal, ModalActions, Button, Field, TextInput, fieldCls } from "@/components/ds";
import { useCreateAgent, useUpdateAgent } from "@/hooks/useAgents";
import type { Agent, CommissionType } from "@/types/database";

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
    <Modal
      nested
      title={isEdit ? "Edit agent" : "Add agent"}
      onClose={onClose}
      footer={
        <>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalActions>
            <Button variant="soft" size="lg" onClick={onClose}>Cancel</Button>
            <Button size="lg" className="flex-1" onClick={handleSave} loading={saving}>{isEdit ? "Save changes" : "Add agent"}</Button>
          </ModalActions>
        </>
      }
    >
      <Field label="Name *">
        <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Agent or agency name" />
      </Field>
      <Field label="Phone">
        <TextInput type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Optional" />
      </Field>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Default commission</p>
        <div className="flex gap-2">
          <div className="flex shrink-0 rounded-full bg-muted p-1 gap-1">
            {(["percentage", "flat"] as CommissionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("default_commission_type", t)}
                className={[
                  "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  form.default_commission_type === t ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-card/60",
                ].join(" ")}
              >
                {t === "percentage" ? "%" : "₹ flat"}
              </button>
            ))}
          </div>
          <TextInput
            aria-label="Commission value"
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
            className="flex-1 min-w-0"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {form.default_commission_type === "percentage"
            ? "Applied to the room rate of each booking this agent brings in."
            : "Flat amount per booking this agent brings in, regardless of room rate."}
        </p>
      </div>

      <Field label="Notes">
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${fieldCls} min-h-[84px] resize-none`} placeholder="Optional" />
      </Field>
    </Modal>
  );
}
