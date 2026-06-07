import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Wallet, Loader2, Check, IndianRupee } from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useAuth } from "@/hooks/useAuth";
import { useBookings } from "@/hooks/useBookings";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

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

function AdminPayments() {
  const { data: property, isLoading } = useOwnerProperty();
  const { user } = useAuth();
  const { data: bookings = [] } = useBookings(property?.id ?? "");
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

  const togglePaid = async (bookingId: string, currentlyPaid: boolean) => {
    setTogglingId(bookingId);
    // FIX: never overwrite advance_amount — it holds the cumulative partial
    // payments recorded in admin.bookings.tsx. Only flip the is_paid flag.
    const updates = { is_paid: !currentlyPaid };
    await supabase.from("bookings").update(updates).eq("id", bookingId);
    queryClient.invalidateQueries({
      queryKey: ["bookings", property?.id],
      exact: false,
    });
    setTogglingId(null);
  };

  const unpaidBookings = useMemo(
    () =>
      bookings
        .filter((b) => !b.is_paid && b.status !== "cancelled")
        .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime()),
    [bookings],
  );

  const stats = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "cancelled");
    const totalCollected = active.reduce((s, b) => s + Number(b.advance_amount ?? 0), 0);
    const totalOutstanding = active.reduce(
      (s, b) => s + Math.max(0, Number(b.total_amount) - Number(b.advance_amount ?? 0)),
      0,
    );
    const fullyPaid = active.filter((b) => b.is_paid).length;
    const partPaid = active.filter((b) => !b.is_paid && Number(b.advance_amount ?? 0) > 0).length;
    return { totalCollected, totalOutstanding, fullyPaid, partPaid };
  }, [bookings]);

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

        {unpaidBookings.length === 0 ? (
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
                {unpaidBookings.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.guest_name}</div>
                      <div className="text-xs text-muted-foreground">{b.guest_phone}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{b.check_in}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">
                        ₹
                        {Math.max(
                          0,
                          Number(b.total_amount) - Number(b.advance_amount ?? 0),
                        ).toLocaleString("en-IN")}
                      </div>
                      {Number(b.advance_amount ?? 0) > 0 && (
                        <div className="text-xs text-primary mt-0.5">
                          Adv ₹{Number(b.advance_amount).toLocaleString("en-IN")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {b.payment_method ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => togglePaid(b.id, b.is_paid)}
                        disabled={togglingId === b.id}
                        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                      >
                        {togglingId === b.id ? (
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
