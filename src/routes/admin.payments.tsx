import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { csvCell } from "@/lib/csv";
import { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  Check,
  X,
  Pencil,
  ExternalLink,
  IndianRupee,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from "lucide-react";
import { Modal, ModalActions, Button, StatusChip, EmptyState, fieldCls, type Tone } from "@/components/ds";
import { MiniBarChart } from "@/components/MiniBarChart";
import { PageHeader } from "@/admin/formKit";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings, useBookingGroups } from "@/hooks/useBookings";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import type { Booking, BookingGroup } from "@/types/database";

export const Route = createFileRoute("/admin/payments")({
  component: AdminPayments,
});

const inputCls = fieldCls;
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const PAYMENT_METHODS = ["UPI", "Bank Transfer", "Cash on Arrival"];

// ---------------------------------------------------------------------------
// Unified ledger row so standalone bookings and booking_groups can be
// rendered/toggled/summed identically. This mirrors the BookingListItem
// pattern in admin.bookings.tsx on purpose: this page's numbers must match
// that page's numbers, or an owner ends up doing accounting against two
// different "outstanding" figures for the same business.
// ---------------------------------------------------------------------------

type LedgerItem = {
  id: string;
  kind: "booking" | "group";
  guest_name: string;
  guest_phone: string | null;
  check_in: string;
  status: string;
  total_amount: number;
  discount_amount: number;
  charges_total: number;
  advance_amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  is_paid: boolean;
  roomLabel: string; // "2 rooms" for groups, blank for single bookings
};

function chargesSum(charges?: { qty: number; unit_price: number }[] | null): number {
  return (charges ?? []).reduce((s, c) => s + c.qty * c.unit_price, 0);
}

/**
 * Gross amount owed for the stay: room total + extra charges (food, laundry,
 * bonfire, etc.) minus discount. This MUST match amountDueFor() in
 * admin.bookings.tsx.
 *
 * BUG FIXED: the old version of this page computed the balance as just
 * total_amount - discount - advance, completely ignoring booking_charges.
 * That's why "Outstanding" here (₹1,18,513) never matched "Outstanding" on
 * the Bookings page (₹1,26,038) — the ₹7,525 gap is exactly the sum of
 * unbilled extra charges that this page was silently dropping.
 */
function grossTotal(
  item: Pick<LedgerItem, "total_amount" | "discount_amount" | "charges_total">,
): number {
  return Math.max(0, Number(item.total_amount) + item.charges_total - Number(item.discount_amount));
}

function balanceOf(
  item: Pick<LedgerItem, "total_amount" | "discount_amount" | "charges_total" | "advance_amount">,
): number {
  return Math.max(0, grossTotal(item) - Number(item.advance_amount));
}

type FilterTab = "outstanding" | "paid" | "all";
type SortKey = "checkin" | "guest" | "total" | "collected" | "balance";

function paymentStatus(item: LedgerItem): { label: string; tone: Tone } {
  if (item.is_paid) return { label: "Paid", tone: "green" };
  if (item.advance_amount > 0) return { label: "Partial", tone: "amber" };
  return { label: "Unpaid", tone: "rose" };
}

const AVATAR_TONE: Record<Tone, string> = {
  green: "bg-[#dcfce7] text-[#166534]",
  blue: "bg-[#dbeafe] text-[#1e3a8a]",
  amber: "bg-[#fef3c7] text-[#92400e]",
  rose: "bg-[#ffe4e6] text-[#9f1239]",
  grey: "bg-muted text-foreground/80",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const SORT_LABELS: Record<SortKey, string> = {
  checkin: "Check-in date",
  guest: "Guest name",
  total: "Total billed",
  collected: "Collected",
  balance: "Balance due",
};

// ---------------------------------------------------------------------------
// Monthly summary — bucketed by check-in date (the same date the Dashboard's
// "Monthly revenue" KPI uses), not by the date money actually arrived.
//
// Why check-in date and not payment date: a booking's advance_amount is a
// running total on the row itself, not a dated log of each individual
// payment, so there's no reliable way yet to say "₹X came in during June"
// for a guest who paid a deposit in May and the balance in June. What this
// CAN answer honestly is "how is June's business doing" — which of June's
// bookings are billed, collected, and still outstanding. If real cash-flow
// timing ever matters (bank reconciliation, GST filing against actual
// receipts), that needs a proper dated payments table — this is the
// same-day version of that.
// ---------------------------------------------------------------------------

type MonthSummary = {
  monthKey: string; // "2026-06"
  count: number;
  billed: number;
  collected: number;
  outstanding: number;
};

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Compact axis label, e.g. "Jun '26" — used only in the trend chart. */
function monthShortLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function collectedPct(m: Pick<MonthSummary, "billed" | "collected">): number {
  return m.billed > 0 ? Math.round((m.collected / m.billed) * 100) : 100;
}

function pctColorCls(pct: number): string {
  if (pct >= 90) return "text-green-700";
  if (pct >= 60) return "text-amber-700";
  return "text-destructive";
}

// ---------------------------------------------------------------------------
// Payment action modal — the ONLY payment writes on this page.
//
//  "full"   → "Mark fully paid": records the remaining balance as a real
//              payment (advance_amount += balance) with a method + optional
//              reference, flips is_paid, and confirms a pending booking.
//              This mirrors handleSavePayment / RecordPaymentForm in
//              admin.bookings.tsx on purpose, so a payment recorded here is
//              indistinguishable from one recorded there. (The old "Mark
//              paid" toggle only flipped is_paid and left advance_amount
//              behind, so a booking could read "Paid" with ₹0 collected.)
//
//  "correct" → fixes a mistaken total. Replaces the old "Mark unpaid"
//              toggle: sets advance_amount to the amount actually received
//              and derives is_paid from it, so the two can never disagree.
// ---------------------------------------------------------------------------

function PaymentActionModal({
  item,
  mode,
  onClose,
  onDone,
}: {
  item: LedgerItem;
  mode: "full" | "correct";
  onClose: () => void;
  /** `confirmed` is true when this payment moved a pending booking to confirmed. */
  onDone: (confirmed: boolean) => void;
}) {
  const gross = grossTotal(item);
  const balance = balanceOf(item);
  const [method, setMethod] = useState(item.payment_method ?? "UPI");
  const [ref, setRef] = useState("");
  const [collected, setCollected] = useState(String(item.advance_amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const table = item.kind === "group" ? "booking_groups" : "bookings";
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const save = async () => {
    setError("");
    let patch: Record<string, unknown>;
    let childPatch: Record<string, unknown>;

    if (mode === "full") {
      const newStatus = item.status === "pending" ? "confirmed" : item.status;
      const hold = newStatus !== "pending" ? { hold_expires_at: null } : {};
      patch = {
        advance_amount: Number(item.advance_amount) + balance,
        payment_method: method,
        ...(ref.trim() ? { payment_reference: ref.trim() } : {}),
        is_paid: true,
        status: newStatus,
        ...hold,
      };
      childPatch = { is_paid: true, status: newStatus, ...hold };
    } else {
      const value = Math.round(parseFloat(collected));
      if (isNaN(value) || value < 0) { setError("Enter an amount of 0 or more"); return; }
      if (value > gross) { setError(`Can't be more than the total of ${fmt(gross)}`); return; }
      patch = { advance_amount: value, is_paid: value >= gross };
      childPatch = { is_paid: value >= gross };
    }

    setSaving(true);
    try {
      const { error: err } = await supabase.from(table).update(patch).eq("id", item.id);
      if (err) throw err;
      if (item.kind === "group") {
        // keep child bookings' flags in sync (same as the old toggle did)
        const { error: childErr } = await supabase.from("bookings").update(childPatch).eq("group_id", item.id);
        if (childErr) throw childErr;
      }
      onDone(mode === "full" && item.status === "pending");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={mode === "full" ? "Mark fully paid" : "Correct collected amount"}
      subtitle={`${item.guest_name}${item.roomLabel ? ` · ${item.roomLabel}` : ""}`}
      onClose={onClose}
      footer={
        <>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ModalActions>
            <Button variant="soft" size="lg" onClick={onClose}>Cancel</Button>
            <Button size="lg" className="flex-1" onClick={save} loading={saving}>{mode === "full" ? "Confirm payment" : "Save"}</Button>
          </ModalActions>
        </>
      }
    >
        <div className="rounded-2xl bg-muted/60 px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Gross total</span><span className="font-medium">{fmt(gross)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Collected so far</span><span className="font-medium text-primary">{fmt(item.advance_amount)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Balance due</span><span className="font-semibold">{fmt(balance)}</span></div>
        </div>

        {mode === "full" ? (
          <>
            <p className="text-sm">
              {balance > 0
                ? <>This records <strong>{fmt(balance)}</strong> as received and marks the booking fully paid.</>
                : <>No balance is left — this will just mark the booking as settled.</>}
            </p>
            <div>
              <label className={labelCls}>Payment method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                {[...new Set([method, ...PAYMENT_METHODS])].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Reference (optional)</label>
              <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} placeholder="UPI ref / receipt no." />
            </div>
          </>
        ) : (
          <div>
            <label className={labelCls}>Total amount actually received (₹)</label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={collected}
              onChange={(e) => setCollected(e.target.value)}
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use this to fix a mistaken entry. Set 0 to mark the booking unpaid.
            </p>
          </div>
        )}
    </Modal>
  );
}

function AdminPayments() {
  const { data: property, isLoading } = useOwnerProperty();
  const { data: bookings = [], isFetched: bookFetched } = useBookings(property?.id ?? "");
  const { data: groups = [], isFetched: groupsFetched } = useBookingGroups(property?.id ?? "", { slim: true });
  const queryClient = useQueryClient();

  const navigate = useNavigate();
  const [payModal, setPayModal] = useState<{ item: LedgerItem; mode: "full" | "correct" } | null>(null);
  // Set when "Mark fully paid" confirmed a pending booking, so the owner is reminded to send the guest their confirmation.
  const [justConfirmed, setJustConfirmed] = useState<{ id: string; kind: "booking" | "group"; guest: string } | null>(null);

  const [filterTab, setFilterTab] = useState<FilterTab>("outstanding");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("checkin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [monthFilter, setMonthFilter] = useState<string | null>(null);

  // A booking that belongs to a group is represented by the group row, not
  // its own row, so we don't double-count it in stats or the table below.
  const groupBookingIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((g) => (g.bookings ?? []).forEach((b) => ids.add(b.id)));
    return ids;
  }, [groups]);

  const standaloneBookings = useMemo(
    () => (bookings as Booking[]).filter((b) => !groupBookingIds.has(b.id)),
    [bookings, groupBookingIds],
  );

  // Combines standalone bookings AND booking groups, includes extra charges,
  // subtracts discount_amount, and excludes only cancelled bookings — same
  // rules as the Bookings page so the two "Outstanding" figures agree.
  const items: LedgerItem[] = useMemo(() => {
    const fromBookings: LedgerItem[] = standaloneBookings
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        kind: "booking",
        guest_name: b.guest_name,
        guest_phone: b.guest_phone,
        check_in: b.check_in,
        status: b.status,
        total_amount: Number(b.total_amount),
        discount_amount: Number(b.discount_amount ?? 0),
        charges_total: chargesSum(b.booking_charges),
        advance_amount: Number(b.advance_amount ?? 0),
        payment_method: b.payment_method ?? null,
        payment_reference: b.payment_reference ?? null,
        // Derived from the real numbers, not the stored flag: the flag goes stale
        // when extras/discount/dates change after the last payment was recorded.
        is_paid: Math.max(0, Number(b.total_amount) + chargesSum(b.booking_charges) - Number(b.discount_amount ?? 0) - Number(b.advance_amount ?? 0)) === 0,
        roomLabel: "",
      }));

    const fromGroups: LedgerItem[] = (groups as BookingGroup[])
      .filter((g) => g.status !== "cancelled")
      .map((g) => ({
        id: g.id,
        kind: "group",
        guest_name: g.guest_name,
        guest_phone: g.guest_phone,
        check_in: g.check_in,
        status: g.status,
        total_amount: Number(g.total_amount),
        discount_amount: Number(g.discount_amount ?? 0),
        charges_total: chargesSum(g.booking_charges),
        advance_amount: Number(g.advance_amount ?? 0),
        payment_method: g.payment_method ?? null,
        payment_reference: g.payment_reference ?? null,
        // Derived from the real numbers, not the stored flag: the flag goes stale
        // when extras/discount/dates change after the last payment was recorded.
        is_paid: Math.max(0, Number(g.total_amount) + chargesSum(g.booking_charges) - Number(g.discount_amount ?? 0) - Number(g.advance_amount ?? 0)) === 0,
        roomLabel: `${(g.bookings ?? []).length} rooms`,
      }));

    return [...fromBookings, ...fromGroups];
  }, [standaloneBookings, groups]);

  // Stats are computed over the FULL ledger (not the filtered/searched view)
  // so the two headline numbers always reflect the whole business, no matter
  // what the table below is currently scoped to.
  const stats = useMemo(() => {
    const totalCollected = items.reduce((s, i) => s + i.advance_amount, 0);
    const totalOutstanding = items.reduce((s, i) => s + balanceOf(i), 0);
    const totalBilled = items.reduce((s, i) => s + grossTotal(i), 0);
    const fullyPaid = items.filter((i) => i.is_paid).length;
    const partPaid = items.filter((i) => !i.is_paid && i.advance_amount > 0).length;
    const unpaid = items.filter((i) => !i.is_paid && i.advance_amount === 0).length;
    return { totalCollected, totalOutstanding, totalBilled, fullyPaid, partPaid, unpaid };
  }, [items]);

  // One entry per check-in month, most recent first — feeds the trend chart
  // and the month-scrubber below. This is never rendered as a one-row-per-
  // month table, so it doesn't grow the page as history piles up.
  const monthlyStats = useMemo(() => {
    const map = new Map<string, MonthSummary>();
    items.forEach((i) => {
      const key = i.check_in.slice(0, 7);
      const entry = map.get(key) ?? {
        monthKey: key,
        count: 0,
        billed: 0,
        collected: 0,
        outstanding: 0,
      };
      entry.count += 1;
      entry.billed += grossTotal(i);
      entry.collected += i.advance_amount;
      entry.outstanding += balanceOf(i);
      map.set(key, entry);
    });
    return [...map.values()].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [items]);

  // Fixed-size trend: always just the most recent 6 months that have data,
  // oldest to newest left-to-right, no matter how much history exists
  // overall — this is what keeps the summary from growing forever.
  const trendData = useMemo(
    () =>
      monthlyStats
        .slice(0, 6)
        .slice()
        .reverse()
        .map((m) => ({
          month: monthShortLabel(m.monthKey),
          Collected: m.collected,
          Outstanding: m.outstanding,
        })),
    [monthlyStats],
  );

  // Scrubber steps through monthlyStats one month at a time — index 0 is the
  // most recent month. Clamped whenever the month list's size changes (e.g. a
  // new booking lands in a month that didn't exist before).
  const [scrubIndex, setScrubIndex] = useState(0);
  useEffect(() => {
    setScrubIndex((i) => Math.min(i, Math.max(0, monthlyStats.length - 1)));
  }, [monthlyStats.length]);
  const scrubMonth = monthlyStats[scrubIndex] ?? null;

  const filteredItems = useMemo(() => {
    let list = items;
    if (filterTab === "outstanding") list = list.filter((i) => !i.is_paid);
    else if (filterTab === "paid") list = list.filter((i) => i.is_paid);
    if (monthFilter) list = list.filter((i) => i.check_in.slice(0, 7) === monthFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) => i.guest_name.toLowerCase().includes(q) || (i.guest_phone ?? "").includes(q),
      );
    }
    return list;
  }, [items, filterTab, monthFilter, search]);

  const sortedItems = useMemo(() => {
    const arr = [...filteredItems];
    const dirMul = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case "guest":
          return a.guest_name.localeCompare(b.guest_name) * dirMul;
        case "total":
          return (grossTotal(a) - grossTotal(b)) * dirMul;
        case "collected":
          return (a.advance_amount - b.advance_amount) * dirMul;
        case "balance":
          return (balanceOf(a) - balanceOf(b)) * dirMul;
        case "checkin":
        default:
          return a.check_in.localeCompare(b.check_in) * dirMul;
      }
    });
    return arr;
  }, [filteredItems, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Money columns read best biggest-first; text/date columns read best
      // smallest/earliest-first.
      setSortDir(key === "balance" || key === "collected" || key === "total" ? "desc" : "asc");
    }
  };

  const refreshAfterPayment = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["bookingGroups"], exact: false });
  };

  // Opens the guest's booking in the Bookings page (which handles the
  // ?bookingId= / ?groupId= deep links) — the full payment history/form lives there.
  const openBooking = (item: LedgerItem) => {
    const prop = new URLSearchParams(window.location.search).get("property");
    navigate({
      to: "/admin/bookings",
      search: {
        ...(prop ? { property: prop } : {}),
        ...(item.kind === "group" ? { groupId: item.id } : { bookingId: item.id }),
      },
    } as never);
  };

  const exportCsv = () => {
    const header = [
      "Guest",
      "Phone",
      "Check-in",
      "Rooms",
      "Total Amount",
      "Discount",
      "Extra Charges",
      "Gross Total",
      "Collected",
      "Balance Due",
      "Payment Method",
      "Reference",
      "Status",
    ];
    const rows = sortedItems.map((i) => [
      i.guest_name,
      i.guest_phone ?? "",
      i.check_in,
      i.roomLabel || "1 room",
      i.total_amount.toFixed(2),
      i.discount_amount.toFixed(2),
      i.charges_total.toFixed(2),
      grossTotal(i).toFixed(2),
      i.advance_amount.toFixed(2),
      balanceOf(i).toFixed(2),
      i.payment_method ?? "",
      i.payment_reference ?? "",
      paymentStatus(i).label,
    ]);
    const sum = (f: (i: LedgerItem) => number) => sortedItems.reduce((s, i) => s + f(i), 0);
    const totalsRow = [
      "",
      "",
      "",
      "TOTAL",
      sum((i) => i.total_amount).toFixed(2),
      sum((i) => i.discount_amount).toFixed(2),
      sum((i) => i.charges_total).toFixed(2),
      sum((i) => grossTotal(i)).toFixed(2),
      sum((i) => i.advance_amount).toFixed(2),
      sum((i) => balanceOf(i)).toFixed(2),
      "",
      "",
      "",
    ];
    const csv = [header, ...rows, totalsRow].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toLocaleDateString("en-CA");
    const scope = monthFilter ?? dateStr;
    a.download = `payments-ledger-${filterTab}-${scope}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || (!!property?.id && (!bookFetched || !groupsFetched))) {
    return <div className="h-48 rounded-3xl bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Payments" subtitle="Track collections and outstanding balances across all bookings." />

      {justConfirmed && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-900">
          <span>✅ {justConfirmed.guest}'s booking is now confirmed. Send them the confirmation and tracking link.</span>
          <span className="flex items-center gap-3">
            <a href={`/admin/bookings?${justConfirmed.kind === "group" ? "groupId" : "bookingId"}=${encodeURIComponent(justConfirmed.id)}${new URLSearchParams(window.location.search).get("property") ? `&property=${encodeURIComponent(new URLSearchParams(window.location.search).get("property") ?? "")}` : ""}`} className="rounded-full bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:opacity-90">Open booking</a>
            <button type="button" onClick={() => setJustConfirmed(null)} className="text-xs underline">Dismiss</button>
          </span>
        </div>
      )}

      {/* Headline: one big number, two quiet cards beside it */}
      <div className="space-y-3">
        <div className="rounded-3xl bg-[var(--section-soft)] px-6 py-5">
          <p className="text-sm text-[var(--section-ink)]">Collected</p>
          <p className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums text-[var(--section-ink)]">₹{stats.totalCollected.toLocaleString("en-IN")}</p>
          <p className="mt-1 text-sm text-[var(--section-ink)]/80">{stats.fullyPaid} fully paid · {stats.partPaid} part paid</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl bg-[#ffe4e6] px-5 py-4">
            <p className="text-sm text-[#9f1239]">Outstanding</p>
            <p className="text-2xl font-semibold tabular-nums text-[#881337]">₹{stats.totalOutstanding.toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-xs text-[#9f1239]">{stats.unpaid} not started</p>
          </div>
          <div className="rounded-3xl bg-card border border-border/60 px-5 py-4">
            <p className="text-sm text-muted-foreground">Total billed</p>
            <p className="text-2xl font-semibold tabular-nums">₹{stats.totalBilled.toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Rooms + extras − discounts</p>
          </div>
        </div>
      </div>

      {/* Monthly summary: fixed-size trend + one month at a time */}
      {monthlyStats.length > 0 && scrubMonth && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Monthly summary</h2>
            <p className="text-xs text-muted-foreground mt-0.5">By check-in date.</p>
          </div>

          <div className="rounded-3xl bg-card border border-border/60 p-4 space-y-4">
            {trendData.length > 1 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Last {trendData.length} months</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} />Collected</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--destructive)", opacity: 0.7 }} />Outstanding</span>
                  </div>
                </div>
                <MiniBarChart data={trendData} />
              </div>
            )}

            <div className={trendData.length > 1 ? "border-t border-border/60 pt-3" : ""}>
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setScrubIndex((i) => Math.min(i + 1, monthlyStats.length - 1))}
                  disabled={scrubIndex >= monthlyStats.length - 1}
                  className="h-9 w-9 shrink-0 rounded-full bg-card flex items-center justify-center hover:bg-card/70 disabled:opacity-30"
                  aria-label="Older month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex-1 text-center min-w-0">
                  <div className="text-base font-semibold">{monthLabel(scrubMonth.monthKey)}</div>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1 text-xs">
                    <span className="text-muted-foreground">{scrubMonth.count} bookings</span>
                    <span className="text-muted-foreground">Billed ₹{scrubMonth.billed.toLocaleString("en-IN")}</span>
                    <span className="text-primary font-medium">Collected ₹{scrubMonth.collected.toLocaleString("en-IN")}</span>
                    <span className="text-destructive font-medium">Outstanding {scrubMonth.outstanding > 0 ? `₹${scrubMonth.outstanding.toLocaleString("en-IN")}` : "₹0"}</span>
                    <span className={`font-semibold ${pctColorCls(collectedPct(scrubMonth))}`}>{collectedPct(scrubMonth)}% collected</span>
                  </div>
                </div>
                <button
                  onClick={() => setScrubIndex((i) => Math.max(i - 1, 0))}
                  disabled={scrubIndex <= 0}
                  className="h-9 w-9 shrink-0 rounded-full bg-card flex items-center justify-center hover:bg-card/70 disabled:opacity-30"
                  aria-label="Newer month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="text-center mt-3">
                <button onClick={() => setMonthFilter(scrubMonth.monthKey)} className="text-sm text-primary hover:underline font-semibold">
                  View {monthLabel(scrubMonth.monthKey)} in the list →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ledger as a list: avatar, name, amount and status; actions underneath */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            Payments
            {monthFilter && <span className="ml-2 font-normal text-sm text-muted-foreground">· {monthLabel(monthFilter)}</span>}
          </h2>
          <Button variant="soft" size="sm" onClick={exportCsv} disabled={sortedItems.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 rounded-full bg-muted p-1 gap-1">
            {([
              { key: "outstanding", label: "Outstanding" },
              { key: "paid", label: "Paid" },
              { key: "all", label: "All" },
            ] as { key: FilterTab; label: string }[]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={["rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors", filterTab === tab.key ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-card/60"].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guest or phone…"
              aria-label="Search guest or phone"
              className="w-full rounded-full border-0 bg-muted pl-10 pr-4 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
          </div>
          <select
            aria-label="Sort by"
            value={sortKey}
            onChange={(e) => {
              const k = e.target.value as SortKey;
              setSortKey(k);
              setSortDir(k === "balance" || k === "collected" || k === "total" ? "desc" : "asc");
            }}
            className="rounded-full border-0 bg-muted px-4 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => <option key={k} value={k}>Sort: {SORT_LABELS[k]}</option>)}
          </select>
          {monthFilter && (
            <button onClick={() => setMonthFilter(null)} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3.5 py-2 text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
              {monthLabel(monthFilter)} <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {sortedItems.length === 0 ? (
          filterTab === "outstanding"
            ? <EmptyState icon={IndianRupee} title="All caught up" hint="No outstanding payments." />
            : <EmptyState icon={Receipt} title="Nothing here yet" />
        ) : (
          <ul className="space-y-1">
            {sortedItems.map((item) => {
              const balance = balanceOf(item);
              const status = paymentStatus(item);
              return (
                <li key={`${item.kind}-${item.id}`} className="rounded-3xl px-2 py-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3.5">
                    <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${AVATAR_TONE[status.tone]}`}>{initials(item.guest_name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">
                        {item.guest_name}
                        {item.roomLabel && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{item.roomLabel}</span>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.check_in}{item.payment_method ? ` · ${item.payment_method}` : ""}{item.payment_reference ? ` · ${item.payment_reference}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-semibold tabular-nums">₹{grossTotal(item).toLocaleString("en-IN")}</p>
                      <StatusChip tone={status.tone}>{status.label}</StatusChip>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-[3.625rem]">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Collected ₹{item.advance_amount.toLocaleString("en-IN")}
                      {balance > 0 && <> · <span className="font-semibold text-foreground">₹{balance.toLocaleString("en-IN")} due</span></>}
                      {item.discount_amount > 0 && <> · −₹{item.discount_amount.toLocaleString("en-IN")} discount</>}
                      {item.charges_total > 0 && <> · +₹{item.charges_total.toLocaleString("en-IN")} extras</>}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      {balance > 0 || !item.is_paid ? (
                        <Button size="sm" onClick={() => setPayModal({ item, mode: "full" })}><Check className="h-3.5 w-3.5" /> Mark fully paid</Button>
                      ) : (
                        <span className="px-2 text-xs text-muted-foreground">Settled</span>
                      )}
                      <button onClick={() => setPayModal({ item, mode: "correct" })} title="Correct collected amount" aria-label="Correct collected amount" className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-muted text-foreground/80 hover:bg-muted/70"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => openBooking(item)} title="Open booking" aria-label="Open booking" className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-muted text-foreground/80 hover:bg-muted/70"><ExternalLink className="h-4 w-4" /></button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Payment setup moved to Settings — one home for UPI / accepted methods */}
      <div className="rounded-3xl bg-card border border-border/60 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Wallet className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">UPI ID and accepted payment methods are in <strong className="text-foreground">Property → Settings → Payment setup</strong>.</p>
        </div>
        <Link to="/admin/settings" className="shrink-0 rounded-full bg-card px-4 py-2 text-sm font-semibold hover:bg-card/70">Open</Link>
      </div>

      {payModal && (
        <PaymentActionModal
          item={payModal.item}
          mode={payModal.mode}
          onClose={() => setPayModal(null)}
          onDone={(confirmed) => {
            refreshAfterPayment();
            if (confirmed) setJustConfirmed({ id: payModal.item.id, kind: payModal.item.kind, guest: payModal.item.guest_name });
            setPayModal(null);
          }}
        />
      )}
    </div>
  );
}
