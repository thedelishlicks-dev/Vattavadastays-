// src/lib/commissionLedger.ts — what the Agents page lists and adds up. Pure functions.
//
// Rules (each fixes a problem the code review found):
//  - A commission is OWED only once the booking is confirmed or completed. Pending
//    requests auto-expire after the hold, so counting them made "owed" jump around;
//    they are shown separately as "awaiting confirmation".
//  - A cancelled booking owes nothing, so it is hidden — UNLESS the commission was
//    already paid out. That money left the owner's pocket for a stay that never
//    happened, so it stays visible, flagged, to be recovered or written off.
//  - The rooms of a multi-room booking carry no commission of their own; the group does.

export type CommissionKind = "booking" | "group";

export interface CommissionItem {
  id: string;
  kind: CommissionKind;
  agent_id: string;
  guest_name: string;
  check_in: string;
  roomLabel: string; // "2 rooms" for groups, blank for single bookings
  commission_amount: number;
  commission_paid: boolean;
  commission_paid_date: string | null;
  status: string;
}

interface Row {
  id: string;
  source?: string | null;
  agent_id?: string | null;
  commission_amount?: number | string | null;
  commission_paid?: boolean | null;
  commission_paid_date?: string | null;
  guest_name: string;
  check_in: string;
  status: string;
}
export interface LedgerGroupRow extends Row { bookings?: { id: string }[] | null }

export const OWED_STATUSES = ["confirmed", "completed"];

export function buildLedgerItems(bookings: Row[], groups: LedgerGroupRow[]): CommissionItem[] {
  const memberIds = new Set<string>();
  groups.forEach((g) => (g.bookings ?? []).forEach((b) => memberIds.add(b.id)));

  const keep = (r: Row) =>
    r.source === "agent" && !!r.agent_id && r.commission_amount != null &&
    (r.status !== "cancelled" || !!r.commission_paid);

  const fromBookings: CommissionItem[] = bookings
    .filter((b) => !memberIds.has(b.id) && keep(b))
    .map((b) => ({
      id: b.id, kind: "booking", agent_id: b.agent_id as string, guest_name: b.guest_name, check_in: b.check_in,
      roomLabel: "", commission_amount: Number(b.commission_amount), commission_paid: !!b.commission_paid,
      commission_paid_date: b.commission_paid_date ?? null, status: b.status,
    }));
  const fromGroups: CommissionItem[] = groups
    .filter(keep)
    .map((g) => ({
      id: g.id, kind: "group", agent_id: g.agent_id as string, guest_name: g.guest_name, check_in: g.check_in,
      roomLabel: `${(g.bookings ?? []).length} rooms`, commission_amount: Number(g.commission_amount),
      commission_paid: !!g.commission_paid, commission_paid_date: g.commission_paid_date ?? null, status: g.status,
    }));

  return [...fromBookings, ...fromGroups].sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime());
}

export interface AgentTotals {
  /** Confirmed / completed and not yet paid: what the owner owes. */
  owed: number;
  /** Not yet paid and still only a request: not owed yet. */
  pending: number;
  /** Paid out on stays that went ahead. */
  paid: number;
  /** Paid out on stays that were then cancelled. */
  paidOnCancelled: number;
}

export function summarizeItems(items: CommissionItem[]): AgentTotals {
  const t: AgentTotals = { owed: 0, pending: 0, paid: 0, paidOnCancelled: 0 };
  for (const i of items) {
    if (i.status === "cancelled") { if (i.commission_paid) t.paidOnCancelled += i.commission_amount; continue; }
    if (i.commission_paid) t.paid += i.commission_amount;
    else if (OWED_STATUSES.includes(i.status)) t.owed += i.commission_amount;
    else t.pending += i.commission_amount;
  }
  return t;
}

/** What deleting an agent will erase, for the confirmation message (counts every status). */
export function agentDeletePreview(bookings: Row[], groups: LedgerGroupRow[], agentId: string) {
  const memberIds = new Set<string>();
  groups.forEach((g) => (g.bookings ?? []).forEach((b) => memberIds.add(b.id)));
  const rows = [
    ...bookings.filter((b) => !memberIds.has(b.id)),
    ...groups,
  ].filter((r) => r.agent_id === agentId && r.commission_amount != null);
  let unpaid = 0, paid = 0;
  for (const r of rows) (r.commission_paid ? (paid += Number(r.commission_amount)) : (unpaid += Number(r.commission_amount)));
  return { records: rows.length, unpaid, paid };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function deleteAgentMessage(name: string, p: { records: number; unpaid: number; paid: number }): string {
  if (p.records === 0) return `Delete ${name}? They have no commission records. This cannot be undone.`;
  return (
    `Delete ${name} AND their commission records?\n\n` +
    `This erases the commission on ${p.records} booking${p.records === 1 ? "" : "s"}: ` +
    `${inr(p.unpaid)} unpaid and ${inr(p.paid)} already paid.\n\n` +
    `The bookings themselves stay. This cannot be undone — tap Cancel and export the ledger first if you need a record.`
  );
}
