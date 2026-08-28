import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Loader2, Pencil, Trash2, Phone, Handshake } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAgents, useDeleteAgent } from "@/hooks/useAgents";
import { AgentFormModal } from "@/components/AgentFormModal";
import type { Agent, CommissionType } from "@/types/database";

export const Route = createFileRoute("/admin/agents")({
  component: AdminAgents,
});

function commissionLabel(type: CommissionType, value: number) {
  return type === "percentage" ? `${value}%` : `₹${value.toLocaleString("en-IN")} flat`;
}

function AdminAgents() {
  const { data: property, isLoading } = useOwnerProperty();
  const { data: agents = [], isLoading: agentsLoading } = useAgents(property?.id ?? "");
  const [modalAgent, setModalAgent] = useState<Agent | "new" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteAgent = useDeleteAgent();

  const handleDelete = async (agent: Agent) => {
    if (!property) return;
    if (!confirm(`Remove ${agent.name}? Past bookings tied to this agent keep their commission records.`)) return;
    setDeletingId(agent.id);
    try {
      await deleteAgent.mutateAsync({ id: agent.id, propertyId: property.id });
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground">
            Booking agents and their default commission rates.
          </p>
        </div>
        <button
          onClick={() => setModalAgent("new")}
          className="shrink-0 flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add agent
        </button>
      </div>

      {agentsLoading ? (
        <div className="h-32 rounded-xl bg-muted animate-pulse" />
      ) : agents.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
          <Handshake className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">No agents yet</p>
          <p className="text-xs text-muted-foreground">
            Add an agent to track commission on bookings they bring in.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{agent.name}</p>
                  <span className="text-xs bg-primary-light/60 text-primary px-2 py-0.5 rounded-full font-medium">
                    {commissionLabel(agent.default_commission_type, agent.default_commission_value)}
                  </span>
                </div>
                {agent.phone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="h-3 w-3" /> {agent.phone}
                  </p>
                )}
                {agent.notes && (
                  <p className="text-xs text-muted-foreground mt-1">{agent.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setModalAgent(agent)}
                  className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
                  aria-label={`Edit ${agent.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(agent)}
                  disabled={deletingId === agent.id}
                  className="h-8 w-8 rounded-full hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label={`Remove ${agent.name}`}
                >
                  {deletingId === agent.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAgent && property && (
        <AgentFormModal
          propertyId={property.id}
          agent={modalAgent === "new" ? null : modalAgent}
          onClose={() => setModalAgent(null)}
        />
      )}
    </div>
  );
}
