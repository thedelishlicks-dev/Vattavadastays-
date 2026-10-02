import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  Loader2,
  Check,
  X,
  Pencil,
  ExternalLink,
  IndianRupee,
  Download,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings, useBookingGroups } from "@/hooks/useBookings";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import type { Booking, BookingGroup } from "@/types/database";

export const Route = createFileRoute("/admin/payments")({
  component: AdminPayments,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
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

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type FilterTab = "outstanding" | "paid" | "all";
type SortKey = "checkin" | "guest" | "total" | "collected" | "balance";

function paymentStatus(item: LedgerItem): { label: string; cls: string } {
  if (item.is_paid) return { label: "Paid", cls: "bg-green-100 text-green-800" };
  if (item.advance_amount > 0) return { label: "Partial", cls: "bg-amber-100 text-amber-800" };
  return { label: "Unpaid", cls: "bg-red-100 text-red-700" };
}

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
//  "full"    → "Mark fully paid": records the remaining balance as a real
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
  onDone: () => void;
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
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {mode === "full" ? "Mark fully paid" : "Correct collected amount"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.guest_name}
              {item.roomLabel ? ` · ${item.roomLabel}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm space-y-1">
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

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "full" ? "Confirm payment" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminPayments() {
  const { data: property, isLoading } = useOwnerProperty();
  const { data: bookings = [] } = useBookings(property?.id ?? "");
  const { data: groups = [] } = useBookingGroups(property?.id ?? "");
  const queryClient = useQueryClient();

  const navigate = useNavigate();
  const [payModal, setPayModal] = useState<{ item: LedgerItem; mode: "full" | "correct" } | null>(null);

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
        is_paid: b.is_paid,
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
        is_paid: g.is_paid,
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
    const csv = [header, ...rows, totalsRow].map((r) => r.map(csvEscape).join(",")).join("\n");
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

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (
      sortDir === "asc" ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3" />
      )
    ) : null;

  const thCls = "px-4 py-2.5 font-medium whitespace-nowrap select-none";
  const thSortCls = `${thCls} cursor-pointer hover:text-foreground`;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Track collections and outstanding balances across all bookings.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Collected</p>
          <p className="font-display text-2xl font-semibold text-primary">
            ₹{stats.totalCollected.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.fullyPaid} fully paid · {stats.partPaid} part paid
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
          <p className="font-display text-2xl font-semibold text-destructive">
            ₹{stats.totalOutstanding.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{stats.unpaid} not started</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-muted-foreground mb-1">Total billed</p>
          <p className="font-display text-2xl font-semibold">
            ₹{stats.totalBilled.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Room total + charges − discounts</p>
        </div>
      </div>

      {/* Monthly summary — fixed-size trend chart + one-month-at-a-time
          scrubber, instead of a table that adds a row every month forever. */}
      {monthlyStats.length > 0 && scrubMonth && (
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold text-sm">Monthly Summary</h2>
            <p className="text-xs text-muted-foreground mt-0.5">By check-in date.</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            {trendData.length > 1 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">
                    Last {trendData.length} months
                  </span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: "var(--primary)" }}
                      />
                      Collected
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: "var(--destructive)", opacity: 0.7 }}
                      />
                      Outstanding
                    </span>
                  </div>
                </div>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} barGap={4}>
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={44}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`
                        }
                      />
                      <Tooltip
                        cursor={{ fill: "var(--muted)" }}
                        formatter={(value: number) => `₹${Number(value).toLocaleString("en-IN")}`}
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="Collected" fill="var(--primary)" radius={[3, 3, 0, 0]} />
                      <Bar
                        dataKey="Outstanding"
                        fill="var(--destructive)"
                        fillOpacity={0.7}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Single-month detail with prev/next — browse any month without
                the page growing a permanent row for it. */}
            <div className={trendData.length > 1 ? "border-t border-border pt-3" : ""}>
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setScrubIndex((i) => Math.min(i + 1, monthlyStats.length - 1))}
                  disabled={scrubIndex >= monthlyStats.length - 1}
                  className="h-7 w-7 shrink-0 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Older month"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <div className="flex-1 text-center min-w-0">
                  <div className="text-sm font-semibold">{monthLabel(scrubMonth.monthKey)}</div>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-1 text-xs">
                    <span className="text-muted-foreground">{scrubMonth.count} bookings</span>
                    <span className="text-muted-foreground">
                      Billed ₹{scrubMonth.billed.toLocaleString("en-IN")}
                    </span>
                    <span className="text-primary font-medium">
                      Collected ₹{scrubMonth.collected.toLocaleString("en-IN")}
                    </span>
                    <span className="text-destructive font-medium">
                      Outstanding{" "}
                      {scrubMonth.outstanding > 0
                        ? `₹${scrubMonth.outstanding.toLocaleString("en-IN")}`
                        : "₹0"}
                    </span>
                    <span className={`font-semibold ${pctColorCls(collectedPct(scrubMonth))}`}>
                      {collectedPct(scrubMonth)}% collected
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setScrubIndex((i) => Math.max(i - 1, 0))}
                  disabled={scrubIndex <= 0}
                  className="h-7 w-7 shrink-0 rounded-full border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Newer month"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="text-center mt-2">
                <button
                  onClick={() => setMonthFilter(scrubMonth.monthKey)}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  View {monthLabel(scrubMonth.monthKey)} in ledger →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ledger */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">
            Payment Ledger
            {monthFilter && (
              <span className="ml-2 font-normal text-xs text-muted-foreground">
                · {monthLabel(monthFilter)}
              </span>
            )}
          </h2>
          <button
            onClick={exportCsv}
            disabled={sortedItems.length === 0}
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-border overflow-hidden shrink-0">
            {(
              [
                { key: "outstanding", label: "Outstanding" },
                { key: "paid", label: "Paid" },
                { key: "all", label: "All" },
              ] as { key: FilterTab; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setFilterTab(t.key)}
                className={[
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  filterTab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guest or phone…"
              className="w-full rounded-full border border-border bg-background pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {monthFilter && (
            <button
              onClick={() => setMonthFilter(null)}
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              {monthLabel(monthFilter)} <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {sortedItems.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            {filterTab === "outstanding" ? (
              <>
                <IndianRupee className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-0.5">No outstanding payments.</p>
              </>
            ) : (
              <>
                <Receipt className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-medium">Nothing here yet.</p>
              </>
            )}
          </div>
        ) : (
          // Horizontal-scroll fix: the old markup put overflow-hidden directly
          // on the div wrapping <table>, which just clips overflow instead of
          // scrolling it. The scrollable element now needs its own
          // overflow-x-auto wrapper, separate from the outer rounded-corner
          // clipping container.
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1220px]">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
                  <tr>
                    <th
                      className={`${thSortCls} sticky left-0 z-10 bg-muted/50`}
                      onClick={() => toggleSort("guest")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Guest {sortIcon("guest")}
                      </span>
                    </th>
                    <th className={thSortCls} onClick={() => toggleSort("checkin")}>
                      <span className="inline-flex items-center gap-1">
                        Check-in {sortIcon("checkin")}
                      </span>
                    </th>
                    <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">
                      Room total
                    </th>
                    <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">
                      Discount
                    </th>
                    <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">
                      Charges
                    </th>
                    <th className={`${thSortCls} text-right`} onClick={() => toggleSort("total")}>
                      <span className="inline-flex items-center gap-1 justify-end w-full">
                        Gross total {sortIcon("total")}
                      </span>
                    </th>
                    <th
                      className={`${thSortCls} text-right`}
                      onClick={() => toggleSort("collected")}
                    >
                      <span className="inline-flex items-center gap-1 justify-end w-full">
                        Collected {sortIcon("collected")}
                      </span>
                    </th>
                    <th className={`${thSortCls} text-right`} onClick={() => toggleSort("balance")}>
                      <span className="inline-flex items-center gap-1 justify-end w-full">
                        Balance due {sortIcon("balance")}
                      </span>
                    </th>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Method</th>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Reference</th>
                    <th className="px-4 py-2.5 font-medium whitespace-nowrap">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => {
                    const balance = balanceOf(item);
                    const status = paymentStatus(item);
                    return (
                      <tr key={`${item.kind}-${item.id}`} className="border-t border-border">
                        <td className="px-4 py-3 sticky left-0 z-10 bg-card">
                          <div className="font-medium flex items-center gap-1.5">
                            {item.guest_name}
                            {item.roomLabel && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                {item.roomLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{item.guest_phone}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {item.check_in}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          ₹{item.total_amount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-green-600">
                          {item.discount_amount > 0
                            ? `-₹${item.discount_amount.toLocaleString("en-IN")}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-amber-700">
                          {item.charges_total > 0
                            ? `+₹${item.charges_total.toLocaleString("en-IN")}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                          ₹{grossTotal(item).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-primary">
                          ₹{item.advance_amount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-semibold">
                          ₹{balance.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {item.payment_method ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {item.payment_reference ?? "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {balance > 0 || !item.is_paid ? (
                              <button
                                onClick={() => setPayModal({ item, mode: "full" })}
                                className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <Check className="h-3 w-3" /> Mark fully paid
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground px-2">Settled</span>
                            )}
                            <button
                              onClick={() => setPayModal({ item, mode: "correct" })}
                              title="Correct collected amount"
                              aria-label="Correct collected amount"
                              className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openBooking(item)}
                              title="Open booking"
                              aria-label="Open booking"
                              className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Payment setup moved to Settings — one home for UPI / accepted methods */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Wallet className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            UPI ID and accepted payment methods are now in <strong className="text-foreground">Settings → Payment setup</strong>.
          </p>
        </div>
        <Link
          to="/admin/settings"
          className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Open
        </Link>
      </div>

      {payModal && (
        <PaymentActionModal
          item={payModal.item}
          mode={payModal.mode}
          onClose={() => setPayModal(null)}
          onDone={() => {
            refreshAfterPayment();
            setPayModal(null);
          }}
        />
      )}
    </div>
  );
}
