import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search, Plus, Loader2, X, IndianRupee, Utensils,
  MessageCircle, Check, LogIn, LogOut,
  Trash2, ChevronRight, Phone, Clock,
  CheckCircle2, Users, Calendar, BedDouble,
} from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings } from "@/hooks/useBookings";
import { useBookingCharges, useAddCharge, useDeleteCharge } from "@/hooks/useBookingCharges";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import {
  confirmationLink, directionsLink,
  paymentReminderLink, dayBeforeReminderLink, telLink,
} from "@/lib/whatsapp";
import { BookingInvoice } from "@/components/BookingInvoice";
import type { Booking, BookingCharge, BookingStatus } from "@/types/database";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsAdmin,
});

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const STATUS_FILTERS = ["all", "pending", "confirmed", "checked_in", "completed", "cancelled"] as const;
type FilterStatus = typeof STATUS_FILTERS[number];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:    { label: "Pending",    color: "bg-amber-100 text-amber-800",  dot: "bg-amber-400" },
  confirmed:  { label: "Confirmed",  color: "bg-green-100 text-green-800",  dot: "bg-green-500" },
  checked_in: { label: "Checked In", color: "bg-blue-100 text-blue-800",    dot: "bg-blue-500"  },
  completed:  { label: "Completed",  color: "bg-stone-100 text-stone-600",  dot: "bg-stone-400" },
  cancelled:  { label: "Cancelled",  color: "bg-red-100 text-red-700",      dot: "bg-red-400"   },
};

const CHARGE_PRESETS = [
  { description: "Breakfast",              unit_price: 200 },
  { description: "Lunch",                  unit_price: 300 },
  { description: "Dinner",                 unit_price: 350 },
  { description: "Full board (all meals)", unit_price: 750 },
  { description: "Bonfire",                unit_price: 500 },
  { description: "Trekking guide",         unit_price: 800 },
  { description: "Laundry",                unit_price: 150 },
  { description: "Extra blanket",          unit_price: 100 },
];

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function BookingCard({ booking, roomName, onClick }: {
  booking: Booking; roomName: string; onClick: () => void;
}) {
  const advance = Number(booking.advance_amount ?? 0);
  const balance = Math.max(0, Number(booking.total_amount) - advance);
  const isActive = !["cancelled", "completed"].includes(booking.status);

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-2xl p-4 hover:shadow-md hover:border-primary/30 transition-all active:scale-[0.99] group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">{booking.guest_name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{booking.guest_phone}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={booking.status} />
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BedDouble className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{roomName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>{booking.guest_count} guest{booking.guest_count > 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>{booking.check_in}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{booking.check_out} · {booking.nights}N</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground">
          Total <span className="font-semibold text-foreground">₹{Number(booking.total_amount).toLocaleString("en-IN")}</span>
        </div>
        {isActive && (
          advance > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary">Adv ₹{advance.toLocaleString("en-IN")}</span>
              {balance > 0
                ? <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">₹{balance.toLocaleString("en-IN")} due</span>
                : <span className="text-xs font-semibold text-primary bg-primary-light/60 rounded-full px-2 py.0.5">Paid ✓</span>
              }
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">No advance recorded</span>
          )
        )}
      </div>

      {/* Gap 1 — nudge owner to record payment for pending bookings with no advance */}
      {booking.status === "pending" && advance === 0 && booking.payment_method !== "Cash on Arrival" && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 flex items-center gap-1.5">
          <IndianRupee className="h-3 w-3 shrink-0" />
          Guest may have paid — tap to record advance
        </div>
      )}
    </button>
  );
}

type ModalTab = "overview" | "charges" | "invoice";

function BookingDetailModal({
  booking, roomName, property, onClose, onStatusChange, onPaymentSaved,
}: {
  booking: Booking; roomName: string;
  property: ReturnType<typeof useOwnerProperty>["data"];
  onClose: () => void;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onPaymentSaved: () => void;
}) {
  const [tab, setTab] = useState<ModalTab>("overview");
  const [updating, setUpdating] = useState(false);
  const { data: charges = [] } = useBookingCharges(booking.id);

  const advance = Number(booking.advance_amount ?? 0);
  const chargesTotal = charges.reduce((s, c) => s + c.qty * c.unit_price, 0);
  const balance = Math.max(0, Number(booking.total_amount) + chargesTotal - advance);
  const ownerPhone = property?.owner_phone ?? "";
  const lat = property?.location_lat;
  const lng = property?.location_lng;

  const upiId = (() => {
    const entry = (property?.shared_amenities ?? []).find((a) => a.startsWith("__upi:"));
    return entry ? decodeURIComponent(entry.slice("__upi:".length)) : undefined;
  })();

  const handleStatus = async (status: string) => {
    setUpdating(true);
    await onStatusChange(booking.id, status);
    setUpdating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-card rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-5 pt-3 pb-4 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">{booking.guest_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <StatusPill status={booking.status} />
                <span className="text-xs text-muted-foreground">{booking.id.slice(0, 8).toUpperCase()}</span>
              </div>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center -mt-1">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap">
            {booking.status === "pending" && (
              <ActionChip onClick={() => handleStatus("confirmed")} loading={updating} icon={<Check className="h-3.5 w-3.5" />} label="Confirm" color="green" />
            )}
            {booking.status === "confirmed" && (
              <ActionChip onClick={() => handleStatus("checked_in")} loading={updating} icon={<LogIn className="h-3.5 w-3.5" />} label="Check In" color="blue" />
            )}
            {booking.status === "checked_in" && (
              <ActionChip onClick={() => handleStatus("completed")} loading={updating} icon={<LogOut className="h-3.5 w-3.5" />} label="Check Out" color="amber" />
            )}
            <a href={telLink(booking.guest_phone)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
            <a href={confirmationLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", roomName, checkIn: booking.check_in, checkOut: booking.check_out, ownerPhone })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 bg-[#25D366]/5 text-[#128C7E] px-3 py-1.5 text-xs font-medium hover:bg-[#25D366]/10 transition-colors">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            {lat && lng && (
              <a href={directionsLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", lat, lng, ownerPhone })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
                <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" /> Directions
              </a>
            )}
          </div>
        </div>

        <div className="flex border-b border-border px-5">
          {([
            { key: "overview", label: "Overview" },
            { key: "charges",  label: "Charges"  },
            { key: "invoice",  label: "Invoice"  },
          ] as { key: ModalTab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={["px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px", tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"].join(" ")}
            >
              {t.label}
              {t.key === "charges" && charges.length > 0 && (
                <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">{charges.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === "overview" && <OverviewTab booking={booking} roomName={roomName} property={property} advance={advance} balance={balance} chargesTotal={chargesTotal} onPaymentSaved={onPaymentSaved} ownerPhone={ownerPhone} upiId={upiId} />}
          {tab === "charges"  && <ChargesTab booking={booking} charges={charges} chargesTotal={chargesTotal} advance={advance} balance={balance} />}
          {tab === "invoice"  && (
            <div className="p-5">
              <BookingInvoice
                booking={booking}
                roomName={roomName}
                property={property ?? null}
                charges={charges}
                chargesTotal={chargesTotal}
                advance={advance}
                balance={balance}
                guestView={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionChip({ onClick, loading, icon, label, color }: {
  onClick: () => void; loading: boolean; icon: React.ReactNode; label: string; color: "green" | "blue" | "amber";
}) {
  const colors = { green: "bg-green-600 text-white hover:bg-green-700", blue: "bg-blue-600 text-white hover:bg-blue-700", amber: "bg-amber-500 text-white hover:bg-amber-600" };
  return (
    <button onClick={onClick} disabled={loading} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${colors[color]}`}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function OverviewTab({ booking, roomName, property, advance, balance, chargesTotal, onPaymentSaved, ownerPhone, upiId }: {
  booking: Booking; roomName: string; property: ReturnType<typeof useOwnerProperty>["data"];
  advance: number; balance: number; chargesTotal: number; onPaymentSaved: () => void; ownerPhone: string; upiId?: string;
}) {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  return (
    <div className="p-5 space-y-4">
      <Section title="Stay details">
        <Row label="Room"           value={roomName} />
        <Row label="Check-in"       value={booking.check_in} />
        <Row label="Check-out"      value={booking.check_out} />
        <Row label="Nights"         value={`${booking.nights}`} />
        <Row label="Guests"         value={`${booking.guest_count}`} />
        {booking.payment_method    && <Row label="Payment method" value={booking.payment_method} />}
        {booking.checked_in_at     && <Row label="Checked in at"  value={new Date(booking.checked_in_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />}
        {booking.checked_out_at    && <Row label="Checked out at" value={new Date(booking.checked_out_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />}
      </Section>

      <Section title="Payment summary">
        <Row label="Room total" value={`₹${Number(booking.total_amount).toLocaleString("en-IN")}`} />
        {chargesTotal > 0 && <Row label="Extra charges" value={`₹${chargesTotal.toLocaleString("en-IN")}`} />}
        {advance > 0      && <Row label="Advance paid"  value={`₹${advance.toLocaleString("en-IN")}`} highlight="green" />}
        {booking.payment_reference && <Row label="Reference" value={booking.payment_reference} small />}
        <div className="border-t border-border pt-2 mt-1">
          <Row label="Balance due" value={balance === 0 ? "Fully paid ✓" : `₹${balance.toLocaleString("en-IN")}`} highlight={balance === 0 ? "green" : "amber"} bold />
        </div>
      </Section>

      {!showPaymentForm ? (
        <button onClick={() => setShowPaymentForm(true)} className="w-full rounded-xl border border-primary/30 bg-primary-light/40 py-3 text-sm font-medium text-primary hover:bg-primary-light/60 transition-colors flex items-center justify-center gap-2">
          <IndianRupee className="h-4 w-4" />
          {advance > 0 ? "Record part payment" : "Record advance payment"}
        </button>
      ) : (
        <RecordPaymentForm booking={booking} advance={advance} onSaved={() => { setShowPaymentForm(false); onPaymentSaved(); }} onCancel={() => setShowPaymentForm(false)} />
      )}

      <Section title="Send to guest">
        <div className="space-y-2">
          <WALink href={paymentReminderLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, totalAmount: Number(booking.total_amount), advancePaid: Number(booking.advance_amount ?? 0), checkIn: booking.check_in, propertyName: property?.name ?? "", upiId, ownerPhone })} label="💰 Payment reminder" />
          <WALink href={dayBeforeReminderLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", checkInTime: property?.check_in_time ?? "2:00 PM", ownerPhone })} label="🌿 Day-before reminder" />
        </div>
      </Section>

      {!["cancelled", "completed"].includes(booking.status) && (
        <CancelButton bookingId={booking.id} onCancelled={onPaymentSaved} />
      )}
    </div>
  );
}

function WALink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted transition-colors">
      <MessageCircle className="h-4 w-4 text-[#25D366]" />{label}
    </a>
  );
}

function CancelButton({ bookingId, onCancelled }: { bookingId: string; onCancelled: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleCancel = async () => {
    setLoading(true);
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
    onCancelled();
  };
  if (!confirming) return (
    <button onClick={() => setConfirming(true)} className="w-full rounded-xl border border-destructive/20 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">Cancel booking</button>
  );
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <p className="text-sm text-destructive font-medium">Are you sure? This cannot be undone.</p>
      <div className="flex gap-2">
        <button onClick={() => setConfirming(false)} className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted">Keep</button>
        <button onClick={handleCancel} disabled={loading} className="flex-1 rounded-lg bg-destructive text-white py-2 text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cancel
        </button>
      </div>
    </div>
  );
}

function RecordPaymentForm({ booking, advance, onSaved, onCancel }: {
  booking: Booking; advance: number; onSaved: () => void; onCancel: () => void;
}) {
  const suggested = Math.round(Number(booking.total_amount) * 0.25);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(booking.payment_method ?? "UPI");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const newPayment = parseFloat(amount) || 0;
  const newAdvanceTotal = advance + newPayment;
  const bal = Math.max(0, Number(booking.total_amount) - newAdvanceTotal);

  const handleSave = async () => {
    if (!newPayment || newPayment <= 0) { setError("Enter a valid amount"); return; }
    setSaving(true); setError("");
    try {
      const { error: err } = await supabase.from("bookings").update({
        advance_amount: newAdvanceTotal,
        payment_method: method,
        ...(ref.trim() ? { payment_reference: ref.trim() } : {}),
        is_paid: newAdvanceTotal >= Number(booking.total_amount),
        status: booking.status === "pending" ? "confirmed" : booking.status,
      }).eq("id", booking.id);
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary-light/20 p-4 space-y-3">
      <div className="text-sm font-medium">
        {advance > 0 ? "Record part payment" : "Record advance payment"}
      </div>

      {advance > 0 && (
        <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between">
          <span className="text-muted-foreground">Already recorded</span>
          <span className="font-medium text-primary">₹{advance.toLocaleString("en-IN")}</span>
        </div>
      )}

      <div className="text-xs text-muted-foreground bg-background rounded-lg px-3 py-2 flex justify-between">
        <span>Suggested advance (25%)</span>
        <span className="font-medium">₹{suggested.toLocaleString("en-IN")}</span>
      </div>

      <div>
        <label className={labelCls}>
          {advance > 0 ? "New payment received (₹) *" : "Amount received (₹) *"}
        </label>
        <input
          type="number" min={0} value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputCls}
          placeholder={advance > 0 ? "This instalment only" : "Actual amount received"}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {["UPI", "Bank Transfer", "Cash", "Cash on Arrival"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Txn reference</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      {newPayment > 0 && (
        <div className="rounded-lg bg-background px-3 py-2 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total paid after this</span>
            <span className="font-semibold text-primary">₹{newAdvanceTotal.toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Balance remaining</span>
            <span className={`font-semibold ${bal === 0 ? "text-primary" : "text-amber-700"}`}>
              {bal === 0 ? "Fully paid ✓" : `₹${bal.toLocaleString("en-IN")}`}
            </span>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-full border border-border py-2 text-sm hover:bg-muted">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="flex-1 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
        </button>
      </div>
    </div>
  );
}

function ChargesTab({ booking, charges, chargesTotal, advance, balance }: {
  booking: Booking; charges: BookingCharge[];
  chargesTotal: number; advance: number; balance: number;
}) {
  const { mutateAsync: addCharge, isPending: adding } = useAddCharge();
  const { mutateAsync: deleteCharge } = useDeleteCharge();
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!desc.trim()) { setError("Description required"); return; }
    const q = parseFloat(qty); const p = parseFloat(price);
    if (!q || q <= 0 || !p || p < 0) { setError("Valid qty and price required"); return; }
    setError("");
    try {
      await addCharge({ booking_id: booking.id, description: desc, qty: q, unit_price: p });
      setDesc(""); setQty("1"); setPrice("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-muted/50 p-3 text-center">
          <div className="text-xs text-muted-foreground">Room</div>
          <div className="font-semibold text-sm mt-0.5">₹{Number(booking.total_amount).toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center">
          <div className="text-xs text-muted-foreground">Extras</div>
          <div className="font-semibold text-sm mt-0.5 text-amber-700">₹{chargesTotal.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded-xl bg-primary-light/40 border border-border p-3 text-center">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className={`font-semibold text-sm mt-0.5 ${balance === 0 ? "text-primary" : "text-amber-700"}`}>₹{balance.toLocaleString("en-IN")}</div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Quick add</p>
        <div className="flex flex-wrap gap-1.5">
          {CHARGE_PRESETS.map((p) => (
            <button key={p.description} onClick={() => { setDesc(p.description); setPrice(String(p.unit_price)); }} className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted transition-colors">
              {p.description} · ₹{p.unit_price}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border p-3 space-y-2">
        <input value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls} placeholder="Description e.g. Dinner" />
        <div className="flex gap-2">
          <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} w-20`} placeholder="Qty" />
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} flex-1`} placeholder="Price ₹" />
          <button onClick={handleAdd} disabled={adding} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1 shrink-0">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      {charges.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Utensils className="h-6 w-6 mx-auto mb-2 opacity-30" />
          No extra charges yet
        </div>
      ) : (
        <div className="space-y-2">
          {charges.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.description}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{c.qty > 1 ? `${c.qty} × ₹${c.unit_price.toLocaleString("en-IN")}` : `₹${c.unit_price.toLocaleString("en-IN")}`}</div>
              </div>
              <div className="font-semibold text-sm shrink-0">₹{(c.qty * c.unit_price).toLocaleString("en-IN")}</div>
              <button onClick={() => deleteCharge({ id: c.id, bookingId: booking.id })} className="h-7 w-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex justify-between items-center px-4 py-2 rounded-xl bg-amber-50 border border-amber-100">
            <span className="text-sm text-amber-800">Extras total</span>
            <span className="font-semibold text-amber-800">₹{chargesTotal.toLocaleString("en-IN")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">{title}</div>
      <div className="bg-muted/30 rounded-xl border border-border px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight, bold, small }: {
  label: string; value: string; highlight?: "green" | "amber"; bold?: boolean; small?: boolean;
}) {
  const valColor = highlight === "green" ? "text-primary" : highlight === "amber" ? "text-amber-700" : "text-foreground";
  return (
    <div className={`flex justify-between items-center ${small ? "text-xs" : "text-sm"}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`${valColor} ${bold ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

function AddBookingModal({ propertyId, rooms, onClose, onSaved }: {
  propertyId: string;
  rooms: { id: string; name: string; base_price: number; extra_guest_price: number }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ guest_name: "", guest_phone: "+91 ", room_id: rooms[0]?.id ?? "", check_in: "", check_out: "", guest_count: 2, status: "confirmed" as BookingStatus });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const nights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0;
    return Math.max(0, (new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) / 86400000);
  }, [form.check_in, form.check_out]);

  const selectedRoom = rooms.find((r) => r.id === form.room_id);
  const total = useMemo(() => {
    if (!selectedRoom || nights === 0) return 0;
    return (selectedRoom.base_price + Math.max(0, form.guest_count - 2) * (selectedRoom.extra_guest_price ?? 0)) * nights;
  }, [selectedRoom, nights, form.guest_count]);

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError("Guest name required"); return; }
    if (nights <= 0) { setError("Check-out must be after check-in"); return; }
    setSaving(true); setError("");
    try {
      const { error: err } = await supabase.from("bookings").insert({
        property_id: propertyId, room_id: form.room_id, guest_name: form.guest_name,
        guest_phone: form.guest_phone, guest_count: form.guest_count,
        check_in: form.check_in, check_out: form.check_out,
        room_price: (selectedRoom?.base_price ?? 0) * nights,
        extra_guest_charge: Math.max(0, form.guest_count - 2) * (selectedRoom?.extra_guest_price ?? 0) * nights,
        total_amount: total, advance_amount: 0, status: form.status, is_paid: false,
      });
      if (err) throw err;
      onSaved();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-card rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Add Booking</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Guest name *</label><input value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} className={inputCls} placeholder="Full name" /></div>
            <div><label className={labelCls}>Phone</label><input type="tel" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)} className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Room</label>
            <select value={form.room_id} onChange={(e) => set("room_id", e.target.value)} className={inputCls}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} — ₹{r.base_price.toLocaleString("en-IN")}/night</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Check-in</label><input type="date" value={form.check_in} onChange={(e) => set("check_in", e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Check-out</label><input type="date" value={form.check_out} onChange={(e) => set("check_out", e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Guests</label><input type="number" min={1} max={20} value={form.guest_count} onChange={(e) => set("guest_count", parseInt(e.target.value) || 1)} className={inputCls} /></div>
            <div><label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                {["pending", "confirmed"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          {nights > 0 && selectedRoom && (
            <div className="rounded-xl bg-primary-light/40 border border-border p-3 flex justify-between text-sm">
              <span className="text-muted-foreground">{nights}N · {form.guest_count} guests</span>
              <span className="font-display font-semibold text-primary">₹{total.toLocaleString("en-IN")}</span>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add booking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingsAdmin() {
  const { data: property } = useOwnerProperty();
  const { data: bookings = [], isLoading } = useBookings(property?.id ?? "");
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [q, setQ] = useState("");

  const rooms = property?.rooms ?? [];
  const roomNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    rooms.forEach((r) => { map[r.id] = r.name; });
    return map;
  }, [rooms]);

  const filtered = useMemo(() =>
    bookings.filter((b) => {
      if (filterStatus !== "all" && b.status !== filterStatus) return false;
      if (q && !`${b.guest_name} ${b.guest_phone}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }), [bookings, filterStatus, q]);

  const stats = useMemo(() => {
    const active = bookings.filter((b) => !["cancelled", "completed"].includes(b.status));
    const outstanding = active.reduce((s, b) => s + Math.max(0, Number(b.total_amount) - Number(b.advance_amount ?? 0)), 0);
    return { active: active.length, outstanding };
  }, [bookings]);

  const updateStatus = async (id: string, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "checked_in") updates.checked_in_at = new Date().toISOString();
    if (newStatus === "completed")  updates.checked_out_at = new Date().toISOString();
    await supabase.from("bookings").update(updates).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id] });
    setActiveBooking((prev) => prev?.id === id ? { ...prev, status: newStatus as BookingStatus, ...updates } : prev);

    // Gap 5 — auto prompt WhatsApp confirmation when owner confirms a booking
    if (newStatus === "confirmed" && property) {
      const booking = bookings.find((b) => b.id === id);
      if (booking) {
        const waUrl = confirmationLink({
          guestPhone: booking.guest_phone,
          guestName: booking.guest_name,
          propertyName: property.name,
          roomName: roomNameMap[booking.room_id] ?? "your room",
          checkIn: booking.check_in,
          checkOut: booking.check_out,
          ownerPhone: property.owner_phone ?? "",
        });
        window.open(waUrl, "_blank");
      }
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id] });
  };

  if (isLoading) return (
    <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />)}</div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Bookings</h1>
          <p className="text-sm text-muted-foreground">Tap any booking to view details.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary-light flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Active</div>
            <div className="font-display text-2xl font-semibold">{stats.active}</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <IndianRupee className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Outstanding</div>
            <div className="font-display text-xl font-semibold text-amber-700">₹{stats.outstanding.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guest or phone…" className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)} className={["shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors", filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"].join(" ")}>
              {s === "all" ? "All" : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">No bookings match these filters.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <BookingCard key={b.id} booking={b as Booking} roomName={roomNameMap[b.room_id] ?? "Unknown room"} onClick={() => setActiveBooking(b as Booking)} />
          ))}
        </div>
      )}

      {showAdd && property && (
        <AddBookingModal propertyId={property.id} rooms={rooms.filter((r) => r.is_active)} onClose={() => setShowAdd(false)} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["bookings", property?.id] }); setShowAdd(false); }} />
      )}

      {activeBooking && (
        <BookingDetailModal booking={activeBooking} roomName={roomNameMap[activeBooking.room_id] ?? "Unknown room"} property={property} onClose={() => setActiveBooking(null)} onStatusChange={updateStatus} onPaymentSaved={handleRefresh} />
      )}
    </div>
  );
}
