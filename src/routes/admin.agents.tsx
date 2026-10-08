import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Phone,
  Handshake,
  ChevronDown,
  ChevronRight,
  Check,
  Download,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAgents, useDeleteAgent } from "@/hooks/useAgents";
import { useBookings, useBookingGroups } from "@/hooks/useBookings";
import { AgentFormModal } from "@/components/AgentFormModal";
import { supabase } from "@/lib/supabase";
import type { Agent, Booking, BookingGroup, CommissionType } from "@/types/database";

export const Route = createFileRoute("/admin/agents")({
  component: AdminAgents,
});

// ---------------------------------------------------------------------------
// Agents & Commissions — one page, one card per agent.
//
// This merges the old Agents page (add / edit / remove, default rate) and the
// old Commissions page (what's owed, mark paid, CSV). Both listed the same
// agents, so an owner had to hop between two screens to answer "who is this
// agent, and what do I owe them?". Now each card answers both:
//   header  → name · default rate · phone/notes · total owed · edit / remove
//   expand  → that agent's bookings, each with Mark paid
// /admin/commissions still exists and redirects here.
// ---------------------------------------------------------------------------

// Unified "commission item" so standalone agent-bookings and agent
// booking_groups are listed / toggled / summed identically (same pattern as
// the unification in admin.payments.tsx, applied to commission).
type CommissionItem = {
  id: string;
  kind: "booking" | "group";
  agent_id: string;
  guest_name: string;
  check_in: string;
  roomLabel: string; // "2 rooms" for groups, blank for single bookings
  commission_amount: number;
  commission_paid: boolean;
  commission_paid_date: string | null;
  status: string;
};

function commissionLabel(type: CommissionType, value: number) {
  return type === "percentage" ? `${value}%` : `₹${value.toLocaleString("en-IN")} flat`;
}

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function AdminAgents() {
  const { data: property, isLoading: propLoading } = useOwnerProperty();
  const { data: agents = [], isLoading: agentsLoading } = useAgents(property?.id ?? "");
  const { data: bookings = [] } = useBookings(property?.id ?? "");
  const { data: groups = [] } = useBookingGroups(property?.id ?? "", { slim: true });
  const queryClient = useQueryClient();
  const deleteAgent = useDeleteAgent();

  const [modalAgent, setModalAgent] = useState<Agent | "new" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const toggleExpanded = (agentId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });

  // A booking that belongs to a group is represented by the group row for
  // commission purposes (group commission is stored once on booking_groups,
  // not split across member rows) — same de-duplication as admin.payments.tsx.
  const groupBookingIds = useMemo(() => {
    const ids = new Set<string>();
    (groups as BookingGroup[]).forEach((g) => (g.bookings ?? []).forEach((b) => ids.add(b.id)));
    return ids;
  }, [groups]);

  const items: CommissionItem[] = useMemo(() => {
    const fromBookings: CommissionItem[] = (bookings as Booking[])
      .filter((b) => !groupBookingIds.has(b.id))
      .filter((b) => b.source === "agent" && b.agent_id && b.commission_amount != null)
      .map((b) => ({
        id: b.id,
        kind: "booking",
        agent_id: b.agent_id as string,
        guest_name: b.guest_name,
        check_in: b.check_in,
        roomLabel: "",
        commission_amount: Number(b.commission_amount),
        commission_paid: b.commission_paid,
        commission_paid_date: b.commission_paid_date ?? null,
        status: b.status,
      }));

    const fromGroups: CommissionItem[] = (groups as BookingGroup[])
      .filter((g) => g.source === "agent" && g.agent_id && g.commission_amount != null)
      .map((g) => ({
        id: g.id,
        kind: "group",
        agent_id: g.agent_id as string,
        guest_name: g.guest_name,
        check_in: g.check_in,
        roomLabel: `${(g.bookings ?? []).length} rooms`,
        commission_amount: Number(g.commission_amount),
        commission_paid: g.commission_paid,
        commission_paid_date: g.commission_paid_date ?? null,
        status: g.status,
      }));

    // Cancelled bookings never owed commission — exclude them so a
    // cancellation doesn't inflate an agent's outstanding total.
    return [...fromBookings, ...fromGroups]
      .filter((i) => i.status !== "cancelled")
      .sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime());
  }, [bookings, groups, groupBookingIds]);

  const itemsByAgent = useMemo(() => {
    const map = new Map<string, CommissionItem[]>();
    items.forEach((i) => {
      const list = map.get(i.agent_id) ?? [];
      list.push(i);
      map.set(i.agent_id, list);
    });
    return map;
  }, [items]);

  const thisMonth = thisMonthKey();

  const agentRows = useMemo(() => {
    return (agents as Agent[])
      .map((agent) => {
        const agentItems = itemsByAgent.get(agent.id) ?? [];
        const bookingsThisMonth = agentItems.filter((i) => i.check_in?.slice(0, 7) === thisMonth).length;
        // "Owed" is the unpaid balance across all time — a commission doesn't
        // stop being owed because the calendar month rolled over.
        const commissionOwed = agentItems
          .filter((i) => !i.commission_paid)
          .reduce((s, i) => s + i.commission_amount, 0);
        return { agent, items: agentItems, bookingsThisMonth, commissionOwed };
      })
      .sort((a, b) => b.commissionOwed - a.commissionOwed || a.agent.name.localeCompare(b.agent.name));
  }, [agents, itemsByAgent, thisMonth]);

  const totalOwed = agentRows.reduce((s, r) => s + r.commissionOwed, 0);

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

  const togglePaid = async (item: CommissionItem) => {
    setTogglingId(item.id);
    setActionError("");
    const table = item.kind === "group" ? "booking_groups" : "bookings";
    const nextPaid = !item.commission_paid;
    const { error } = await supabase
      .from(table)
      .update({
        commission_paid: nextPaid,
        commission_paid_date: nextPaid ? new Date().toISOString() : null,
      })
      .eq("id", item.id);
    if (error) setActionError(error.message || "Couldn't update commission — please try again.");
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id], exact: false });
    queryClient.invalidateQueries({ queryKey: ["bookingGroups", property?.id], exact: false });
    setTogglingId(null);
  };

  const exportCsv = () => {
    const header = ["Agent", "Guest", "Check-in", "Rooms", "Commission", "Paid", "Paid date"];
    const rows = agentRows.flatMap((row) =>
      row.items.map((i) => [
        row.agent.name,
        i.guest_name,
        i.check_in,
        i.roomLabel || "1 room",
        i.commission_amount.toFixed(2),
        i.commission_paid ? "Yes" : "No",
        i.commission_paid_date ? i.commission_paid_date.slice(0, 10) : "",
      ]),
    );
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-ledger-${thisMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (propLoading || agentsLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Agents & Commissions</h1>
          <p className="text-sm text-muted-foreground">
            Your booking agents, their commission rates, and what you owe each.
          </p>
        </div>
        <button
          onClick={() => setModalAgent("new")}
          className="shrink-0 flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add agent
        </button>
      </div>

      {agentRows.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total commission owed</p>
            <p className="font-display text-2xl font-semibold text-primary">₹{totalOwed.toLocaleString("en-IN")}</p>
          </div>
          <button
            onClick={exportCsv}
            disabled={items.length === 0}
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {agentRows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
          <Handshake className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">No agents yet</p>
          <p className="text-xs text-muted-foreground">
            Add an agent to track commission on bookings they bring in.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {agentRows.map(({ agent, items: agentItems, bookingsThisMonth, commissionOwed }) => {
            const isExpanded = expanded.has(agent.id);
            const hasItems = agentItems.length > 0;
            return (
              <div key={agent.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-stretch">
                  {/* Tap the name area to open the agent's bookings */}
                  <button
                    onClick={() => toggleExpanded(agent.id)}
                    disabled={!hasItems}
                    aria-expanded={isExpanded}
                    className="flex-1 min-w-0 flex items-start gap-2 p-4 text-left hover:bg-muted/40 disabled:hover:bg-transparent"
                  >
                    {hasItems ? (
                      isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
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
                      {agent.notes && <p className="text-xs text-muted-foreground mt-1">{agent.notes}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {hasItems
                          ? `${bookingsThisMonth} booking${bookingsThisMonth === 1 ? "" : "s"} this month`
                          : "No bookings yet"}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-start gap-1 p-3 shrink-0">
                    <div className="text-right pr-1 pt-1">
                      <p className="font-semibold text-sm">₹{commissionOwed.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-muted-foreground">owed</p>
                    </div>
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
                      {deletingId === agent.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {isExpanded && hasItems && (
                  <div className="border-t border-border divide-y divide-border">
                    {agentItems.map((item) => (
                      <div key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            <span className="truncate">{item.guest_name}</span>
                            {item.roomLabel && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                {item.roomLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{item.check_in}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-medium">₹{item.commission_amount.toLocaleString("en-IN")}</span>
                          <button
                            onClick={() => togglePaid(item)}
                            disabled={togglingId === item.id}
                            className={[
                              "h-8 px-3 inline-flex items-center gap-1.5 rounded-full border text-xs font-medium transition-colors disabled:opacity-50",
                              item.commission_paid
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-primary/10 text-primary border-primary/20 hover:bg-primary hover:text-primary-foreground",
                            ].join(" ")}
                          >
                            {togglingId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            {item.commission_paid ? "Paid" : "Mark paid"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
