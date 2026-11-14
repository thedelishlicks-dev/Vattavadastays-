import { buildLedgerItems, summarizeItems, agentDeletePreview, deleteAgentMessage, type CommissionItem } from "@/lib/commissionLedger";
import { setCommissionPaid, saveFailMessage } from "@/lib/bookingActions";
import { csvCell } from "@/lib/csv";
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
import { useBookings, useBookingGroups, useBookingTotal, KEEP_OWED_COMMISSION_BOOKINGS, KEEP_OWED_COMMISSION_GROUPS } from "@/hooks/useBookings";
import { useHistoryWindow } from "@/hooks/useHistoryWindow";
import { HistoryWindowBar } from "@/components/HistoryWindowBar";
import { fetchAllRows } from "@/lib/paginate";
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

function commissionLabel(type: CommissionType, value: number) {
  return type === "percentage" ? `${value}%` : `₹${value.toLocaleString("en-IN")} flat`;
}

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Every agent booking and group of the property (optionally one agent's), whatever the page's
// history window is. Used where the answer must be complete: the delete warning and the CSV export.
async function fetchAgentRows(propertyId: string, agentId?: string) {
  const bookings = await fetchAllRows<any>((from, to) => {
    let q = supabase.from("bookings").select("*", { count: "exact" }).eq("property_id", propertyId).not("agent_id", "is", null);
    if (agentId) q = q.eq("agent_id", agentId);
    return q.order("id").range(from, to);
  });
  const groups = await fetchAllRows<any>((from, to) => {
    let q = supabase.from("booking_groups").select("*, bookings(id)", { count: "exact" }).eq("property_id", propertyId).not("agent_id", "is", null);
    if (agentId) q = q.eq("agent_id", agentId);
    return q.order("id").range(from, to);
  });
  return { bookings: bookings as Booking[], groups: groups as BookingGroup[] };
}

function AdminAgents() {
  const { data: property, isLoading: propLoading } = useOwnerProperty();
  const { data: agents = [], isLoading: agentsLoading } = useAgents(property?.id ?? "");
  // Only the last 6 months of stays load at first (more on request), plus every older agent stay whose
  // commission is still unpaid, so "owed" stays complete. See lib/historyWindow.ts.
  const win = useHistoryWindow();
  const { data: bookings = [], isFetching: bookFetching } = useBookings(property?.id ?? "", { from: win.from, alsoKeep: KEEP_OWED_COMMISSION_BOOKINGS, keepPrevious: true, withCharges: false });
  const { data: groups = [], isFetching: groupsFetching } = useBookingGroups(property?.id ?? "", { from: win.from, alsoKeep: KEEP_OWED_COMMISSION_GROUPS, keepPrevious: true, slim: true });
  const { data: bookingTotal } = useBookingTotal(property?.id ?? "");
  const hasMoreHistory = bookingTotal != null && bookingTotal > bookings.length;
  const [exporting, setExporting] = useState(false);
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

  // Which commissions are listed (cancelled hidden unless already paid out; a group once, not per room)
  // lives in lib/commissionLedger.ts, where it is tested.
  const items: CommissionItem[] = useMemo(
    () => buildLedgerItems(bookings as Booking[], groups as BookingGroup[]),
    [bookings, groups],
  );

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
        // "Owed" = unpaid commission on CONFIRMED / COMPLETED stays, across all time (it doesn't stop
        // being owed because the month rolled over). Pending requests are shown separately: they may
        // expire, so counting them made the total jump around.
        const totals = summarizeItems(agentItems);
        const commissionOwed = totals.owed;
        return { agent, items: agentItems, bookingsThisMonth, commissionOwed, totals };
      })
      .sort((a, b) => b.commissionOwed - a.commissionOwed || a.agent.name.localeCompare(b.agent.name));
  }, [agents, itemsByAgent, thisMonth]);

  const totalOwed = agentRows.reduce((s, r) => s + r.commissionOwed, 0);

  const handleDelete = async (agent: Agent) => {
    if (!property) return;
    // Say exactly what will be erased (it used to promise that records are kept, while they silently dropped out).
    // Counted from the agent's FULL history, not just the part of it this page has loaded.
    setDeletingId(agent.id);
    setActionError("");
    try {
      let preview;
      if (hasMoreHistory) {
        const full = await fetchAgentRows(property.id, agent.id);
        preview = agentDeletePreview(full.bookings, full.groups, agent.id);
      } else {
        preview = agentDeletePreview(bookings as Booking[], groups as BookingGroup[], agent.id);
      }
      if (!confirm(deleteAgentMessage(agent.name, preview))) return;
      await deleteAgent.mutateAsync({ id: agent.id, propertyId: property.id });
    } catch (e) {
      setActionError(saveFailMessage(e, "Couldn't delete the agent. Please try again — nothing was deleted."));
    } finally {
      setDeletingId(null);
    }
  };

  const togglePaid = async (item: CommissionItem) => {
    const nextPaid = !item.commission_paid;
    // The "Paid" pill is also the undo button; clearing a paid mark also clears its date, so ask first.
    if (!nextPaid && !confirm(`Mark ${item.guest_name}'s ₹${item.commission_amount.toLocaleString("en-IN")} commission as NOT paid? The paid date will be cleared.`)) return;
    setTogglingId(item.id);
    setActionError("");
    try {
      await setCommissionPaid(supabase, item.kind, item.id, nextPaid);
    } catch (e) {
      setActionError(saveFailMessage(e, "Couldn't update commission. Please try again — nothing was changed."));
    }
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id], exact: false });
    queryClient.invalidateQueries({ queryKey: ["bookingGroups", property?.id], exact: false });
    setTogglingId(null);
  };

  const exportCsv = async () => {
    const header = ["Agent", "Guest", "Check-in", "Rooms", "Commission", "Paid", "Paid date", "Booking status"];
    // The file holds ALL commissions, so when this page has loaded only recent history, fetch the rest for it.
    let byAgent = itemsByAgent;
    if (hasMoreHistory && property) {
      setExporting(true);
      setActionError("");
      try {
        const full = await fetchAgentRows(property.id);
        byAgent = new Map<string, CommissionItem[]>();
        for (const i of buildLedgerItems(full.bookings, full.groups)) {
          const list = byAgent.get(i.agent_id) ?? [];
          list.push(i);
          byAgent.set(i.agent_id, list);
        }
      } catch (e) {
        setActionError(saveFailMessage(e, "Couldn't load the full history for the export. Please try again."));
        return;
      } finally {
        setExporting(false);
      }
    }
    const rows = agentRows.flatMap((row) =>
      (byAgent.get(row.agent.id) ?? []).map((i) => [
        row.agent.name,
        i.guest_name,
        i.check_in,
        i.roomLabel || "1 room",
        i.commission_amount.toFixed(2),
        i.commission_paid ? "Yes" : "No",
        i.commission_paid_date ? i.commission_paid_date.slice(0, 10) : "",
        i.status,
      ]),
    );
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // The file holds ALL agent commissions to date, so it is named by the day it was exported (it used to claim the current month).
    a.download = `commission-ledger-${new Date().toLocaleDateString("en-CA")}.csv`;
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
          <h1 className="text-2xl md:text-3xl font-semibold">Agents & Commissions</h1>
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
        <div className="bg-card border border-border/60 rounded-3xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total commission owed (confirmed stays)</p>
            <p className="text-2xl font-semibold text-primary">₹{totalOwed.toLocaleString("en-IN")}</p>
          </div>
          <button
            onClick={exportCsv}
            disabled={items.length === 0 || exporting}
            className="shrink-0 flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/70 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
          </button>
        </div>
      )}

      <HistoryWindowBar
        from={win.from}
        hasMore={hasMoreHistory}
        loading={bookFetching || groupsFetching}
        onMore={win.loadMore}
        onAll={win.loadAll}
        note="older stays whose commission is still unpaid"
      />

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {agentRows.length === 0 ? (
        <div className="bg-card border border-border/60 rounded-3xl p-8 text-center space-y-2">
          <Handshake className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">No agents yet</p>
          <p className="text-xs text-muted-foreground">
            Add an agent to track commission on bookings they bring in.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {agentRows.map(({ agent, items: agentItems, bookingsThisMonth, commissionOwed, totals }) => {
            const isExpanded = expanded.has(agent.id);
            const hasItems = agentItems.length > 0;
            return (
              <div key={agent.id} className="bg-card border border-border/60 rounded-3xl overflow-hidden">
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
                          : hasMoreHistory
                            ? "No bookings in this period"
                            : "No bookings yet"}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-start gap-1 p-3 shrink-0">
                    <div className="text-right pr-1 pt-1">
                      <p className="font-semibold text-sm">₹{commissionOwed.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-muted-foreground">owed</p>
                      {totals.pending > 0 && (
                        <p className="text-[10px] text-muted-foreground">+ ₹{totals.pending.toLocaleString("en-IN")} awaiting confirmation</p>
                      )}
                      {totals.paidOnCancelled > 0 && (
                        <p className="text-[10px] text-amber-700">₹{totals.paidOnCancelled.toLocaleString("en-IN")} paid on cancelled stays</p>
                      )}
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
                            {item.status === "cancelled" && (
                              <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-100 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                Cancelled — paid
                              </span>
                            )}
                            {item.status === "pending" && (
                              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                Awaiting confirmation
                              </span>
                            )}
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
