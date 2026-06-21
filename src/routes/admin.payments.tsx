import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Wallet, Loader2, Check, IndianRupee } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAuth } from "@/hooks/useAuth";
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

function parseUpiId(shared_amenities: string[] | null): string {
  const entry = (shared_amenities ?? []).find((a) => a.startsWith("__upi:"));
  return entry ? decodeURIComponent(entry.slice("__upi:".length)) : "";
}

function encodeUpiId(upiId: string, existing: string[]): string[] {
  const filtered = existing.filter((a) => !a.startsWith("__upi:"));
  if (!upiId.trim()) return filtered;
  return [...filtered, `__upi:${encodeURIComponent(upiId.trim())}`];
}

// ---------------------------------------------------------------------------
// Unified "outstanding item" shape so standalone bookings and booking_groups
// can be rendered/toggled/summed identically. This is the core fix: the old
// version only looked at useBookings() and silently ignored booking_groups
// entirely, plus it forgot to subtract discount_amount.
// ---------------------------------------------------------------------------

type OutstandingItem = {
  id: string;
  kind: "booking" | "group";
  guest_name: string;
  guest_phone: string | null;
  check_in: string;
  total_amount: number;
  discount_amount: number;
  advance_amount: number;
  payment_method: string | null;
  is_paid: boolean;
  status: string;
  roomLabel: string; // "2 rooms" for groups, blank for single bookings
};

function balanceOf(item: Pick<OutstandingItem, "total_amount" | "discount_amount" | "advance_amount">) {
  return Math.max(0, Number(item.total_amount) - Number(item.discount_amount) - Number(item.advance_amount));
}

function AdminPayments() {
  const { data: property, isLoading } = useOwnerProperty();
  const { user } = useAuth();
  const { data: bookings = [] } = useBookings(property?.id ?? "");
  const { data: groups = [] } = useBookingGroups(property?.id ?? "");
  const queryClient = useQueryClient();

  const [upiId, setUpiId] = useState("");
  const [acceptedMethods, setAcceptedMethods] = useState<string[]>(["UPI", "Cash on Arrival"]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedConfig, setSavedConfig] = useState(false);
  const [configError, setConfigError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (property) {
      setUpiId(parseUpiId(property.shared_amenities ?? []));
      const methodEntry = (property.shared_amenities ?? []).find((a) =>
        a.startsWith("__pmethods:"),
      );
      if (methodEntry) {
        try {
          setAcceptedMethods(
            JSON.parse(decodeURIComponent(methodEntry.slice("__pmethods:".length))),
          );
        } catch {
          // keep default
        }
      }
    }
  }, [property?.id, property?.shared_amenities]);

  const toggleMethod = (m: string) =>
    setAcceptedMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const handleSaveConfig = async () => {
    if (!property) return;
    setSavingConfig(true);
    setConfigError("");
    try {
      const base = encodeUpiId(upiId, property.shared_amenities ?? []);
      const withMethods = [
        ...base.filter((a) => !a.startsWith("__pmethods:")),
        `__pmethods:${encodeURIComponent(JSON.stringify(acceptedMethods))}`,
      ];
      const { error: err } = await supabase
        .from("properties")
        .update({ shared_amenities: withMethods })
        .eq("id", property.id);
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["ownerProperty", user?.id] });
      setSavedConfig(true);
      setTimeout(() => setSavedConfig(false), 2500);
    } catch (e: unknown) {
      setConfigError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingConfig(false);
    }
  };

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

  // FIX: outstanding/collected now combine standalone bookings AND booking
  // groups, subtract discount_amount, and use a consistent status filter
  // (exclude cancelled only — matches the idea that a completed-but-unpaid
  // stay is still money owed, not money written off).
  const items: OutstandingItem[] = useMemo(() => {
    const fromBookings: OutstandingItem[] = standaloneBookings
      .filter((b) => b.status !== "cancelled")
      .map((b) => ({
        id: b.id,
        kind: "booking",
        guest_name: b.guest_name,
        guest_phone: b.guest_phone,
        check_in: b.check_in,
        total_amount: Number(b.total_amount),
        discount_amount: Number(b.discount_amount ?? 0),
        advance_amount: Number(b.advance_amount ?? 0),
        payment_method: b.payment_method,
        is_paid: b.is_paid,
        status: b.status,
        roomLabel: "",
      }));

    const fromGroups: OutstandingItem[] = (groups as BookingGroup[])
      .filter((g) => g.status !== "cancelled")
      .map((g) => ({
        id: g.id,
        kind: "group",
        guest_name: g.guest_name,
        guest_phone: g.guest_phone,
        check_in: g.check_in,
        total_amount: Number(g.total_amount),
        discount_amount: Number(g.discount_amount ?? 0),
        advance_amount: Number(g.advance_amount ?? 0),
        payment_method: g.payment_method,
        is_paid: g.is_paid,
        status: g.status,
        roomLabel: `${(g.bookings ?? []).length} rooms`,
      }));

    return [...fromBookings, ...fromGroups];
  }, [standaloneBookings, groups]);

  const unpaidItems = useMemo(
    () =>
      items
        .filter((i) => !i.is_paid)
        .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime()),
    [items],
  );

  const stats = useMemo(() => {
    const totalCollected = items.reduce((s, i) => s + i.advance_amount, 0);
    const totalOutstanding = items.reduce((s, i) => s + balanceOf(i), 0);
    const fullyPaid = items.filter((i) => i.is_paid).length;
    const partPaid = items.filter((i) => !i.is_paid && i.advance_amount > 0).length;
    return { totalCollected, totalOutstanding, fullyPaid, partPaid };
  }, [items]);

  const togglePaid = async (item: OutstandingItem) => {
    setTogglingId(item.id);
    // FIX: never overwrite advance_amount — it holds the cumulative partial
    // payments recorded in admin.bookings.tsx. Only flip the is_paid flag.
    const table = item.kind === "group" ? "booking_groups" : "bookings";
    await supabase.from(table).update({ is_paid: !item.is_paid }).eq("id", item.id);
    if (item.kind === "group") {
      // keep child bookings' is_paid flag in sync for consistency elsewhere
      await supabase.from("bookings").update({ is_paid: !item.is_paid }).eq("group_id", item.id);
    }
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id], exact: false });
    queryClient.invalidateQueries({ queryKey: ["bookingGroups", property?.id], exact: false });
    setTogglingId(null);
  };

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Configure payment methods and track outstanding balances.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
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
        </div>
      </div>

      {/* Payment config */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-sm">Payment Settings</h2>

        <div>
          <label className={labelCls}>UPI ID</label>
          <input
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            className={inputCls}
            placeholder="yourname@upi"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Shown to guests in payment reminder messages.
          </p>
        </div>

        <div>
          <label className={labelCls}>Accepted payment methods</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {PAYMENT_METHODS.map((m) => {
              const active = acceptedMethods.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => toggleMethod(m)}
                  className={[
                    "text-sm px-3 py-1.5 rounded-full border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted",
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
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {savingConfig && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save settings
          </button>
          {savedConfig && <span className="text-sm text-primary font-medium">Saved ✓</span>}
          {configError && <span className="text-sm text-destructive">{configError}</span>}
        </div>
      </div>

      {/* Outstanding bookings */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm">Outstanding Payments</h2>

        {unpaidItems.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <IndianRupee className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-medium">All caught up!</p>
            <p className="text-xs text-muted-foreground mt-0.5">No outstanding payments.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Guest</th>
                  <th className="px-4 py-2.5 font-medium">Check-in</th>
                  <th className="px-4 py-2.5 font-medium">Balance due</th>
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <th className="px-4 py-2.5 font-medium text-right">Mark paid</th>
                </tr>
              </thead>
              <tbody>
                {unpaidItems.map((item) => (
                  <tr key={`${item.kind}-${item.id}`} className="border-t border-border">
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 text-muted-foreground">{item.check_in}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">
                        ₹{balanceOf(item).toLocaleString("en-IN")}
                      </div>
                      {item.advance_amount > 0 && (
                        <div className="text-xs text-primary mt-0.5">
                          Adv ₹{item.advance_amount.toLocaleString("en-IN")}
                        </div>
                      )}
                      {item.discount_amount > 0 && (
                        <div className="text-xs text-green-600 mt-0.5">
                          -₹{item.discount_amount.toLocaleString("en-IN")} disc
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {item.payment_method ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => togglePaid(item)}
                        disabled={togglingId === item.id}
                        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                      >
                        {togglingId === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
