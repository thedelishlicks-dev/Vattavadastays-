import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import {
  Search, Phone, MessageCircle, Check, X, Plus, Loader2,
  ChevronDown, IndianRupee, Utensils, Flame, Printer,
  ClipboardList, LogIn, LogOut, Trash2, Copy,
} from "lucide-react";
import { StatusPill, PaymentPill } from "@/admin/components";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings } from "@/hooks/useBookings";
import { useBookingCharges, useAddCharge, useDeleteCharge } from "@/hooks/useBookingCharges";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import {
  confirmationLink, directionsLink,
  paymentReminderLink, dayBeforeReminderLink, telLink,
} from "@/lib/whatsapp";
import type { Booking, BookingCharge, BookingStatus } from "@/types/database";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsAdmin,
});

const STATUSES: ("all" | BookingStatus)[] = [
  "all", "pending", "confirmed", "checked_in", "completed", "cancelled",
];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

// ─── SUGGESTED CHARGE PRESETS ─────────────────────────────────────────────
const CHARGE_PRESETS = [
  { description: "Breakfast", unit_price: 200 },
  { description: "Lunch", unit_price: 300 },
  { description: "Dinner", unit_price: 350 },
  { description: "Full Board (all meals)", unit_price: 750 },
  { description: "Bonfire", unit_price: 500 },
  { description: "Trekking guide", unit_price: 800 },
  { description: "Laundry", unit_price: 150 },
  { description: "Extra blanket", unit_price: 100 },
  { description: "Room service", unit_price: 200 },
];

// ─── RECORD PAYMENT MODAL ─────────────────────────────────────────────────
function RecordPaymentModal({
  booking,
  onClose,
  onSaved,
}: {
  booking: Booking;
  onClose: () => void;
  onSaved: () => void;
}) {
  const suggested = Math.round(Number(booking.total_amount) * 0.25);
  const [amount, setAmount] = useState(String(suggested));
  const [method, setMethod] = useState(booking.payment_method ?? "UPI");
  const [ref, setRef] = useState(booking.payment_reference ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount"); return; }
    setSaving(true);
    setError("");
    try {
      const isFullyPaid = amt >= Number(booking.total_amount);
      const { error: err } = await supabase
        .from("bookings")
        .update({
          advance_amount: amt,
          payment_method: method,
          payment_reference: ref || null,
          is_paid: isFullyPaid,
          status: booking.status === "pending" ? "confirmed" : booking.status,
        })
        .eq("id", booking.id);
      if (err) throw err;
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const balance = Math.max(0, Number(booking.total_amount) - (parseFloat(amount) || 0));

  return (
    <Modal title="Record Payment" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-primary-light/40 border border-border p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total booking amount</span>
            <span className="font-semibold">₹{Number(booking.total_amount).toLocaleString("en-IN")}</span>
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>Suggested advance (25%)</span>
            <span>₹{suggested.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div>
          <label className={labelCls}>Amount received (₹) *</label>
          <input
            type="number" min={0} value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls} placeholder="Enter actual amount received"
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>Payment method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {["UPI", "Bank Transfer", "Cash on Arrival", "Cash"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Transaction / UPI reference</label>
          <input
            value={ref} onChange={(e) => setRef(e.target.value)}
            className={inputCls} placeholder="e.g. UPI ref no, bank txn ID"
          />
        </div>

        {parseFloat(amount) > 0 && (
          <div className="rounded-xl border border-border p-3 text-sm space-y-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Advance paid</span>
              <span className="text-primary font-medium">₹{(parseFloat(amount) || 0).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
              <span>Balance due on arrival</span>
              <span className={balance === 0 ? "text-primary" : "text-amber-600"}>
                ₹{balance.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
        <ModalFooter onClose={onClose} onSave={handleSave} saving={saving} label="Save payment" />
      </div>
    </Modal>
  );
}

// ─── ADD CHARGES MODAL ────────────────────────────────────────────────────
function AddChargesModal({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
  const { data: charges = [], isLoading } = useBookingCharges(booking.id);
  const { mutateAsync: addCharge, isPending: adding } = useAddCharge();
  const { mutateAsync: deleteCharge } = useDeleteCharge();

  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  const chargesTotal = charges.reduce((s, c) => s + c.qty * c.unit_price, 0);
  const balance = Math.max(
    0,
    Number(booking.total_amount) + chargesTotal - Number(booking.advance_amount ?? 0)
  );

  const handleAdd = async () => {
    if (!desc.trim()) { setError("Description required"); return; }
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (!q || q <= 0) { setError("Valid quantity required"); return; }
    if (!p || p < 0) { setError("Valid price required"); return; }
    setError("");
    try {
      await addCharge({ booking_id: booking.id, description: desc, qty: q, unit_price: p });
      setDesc(""); setQty("1"); setPrice("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add charge");
    }
  };

  const applyPreset = (preset: { description: string; unit_price: number }) => {
    setDesc(preset.description);
    setPrice(String(preset.unit_price));
  };

  return (
    <Modal title="Add On-Property Charges" onClose={onClose} wide>
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted/50 p-2">
            <div className="text-muted-foreground">Room total</div>
            <div className="font-semibold">₹{Number(booking.total_amount).toLocaleString("en-IN")}</div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-2">
            <div className="text-muted-foreground">Extras</div>
            <div className="font-semibold text-amber-700">₹{chargesTotal.toLocaleString("en-IN")}</div>
          </div>
          <div className="rounded-lg bg-primary-light/40 border border-border p-2">
            <div className="text-muted-foreground">Balance due</div>
            <div className="font-semibold text-primary">₹{balance.toLocaleString("en-IN")}</div>
          </div>
        </div>

        {/* Presets */}
        <div>
          <p className={labelCls}>Quick add</p>
          <div className="flex flex-wrap gap-1.5">
            {CHARGE_PRESETS.map((p) => (
              <button
                key={p.description}
                onClick={() => applyPreset(p)}
                className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted transition-colors"
              >
                {p.description} · ₹{p.unit_price}
              </button>
            ))}
          </div>
        </div>

        {/* Add form */}
        <div className="grid grid-cols-5 gap-2 items-end">
          <div className="col-span-2">
            <label className={labelCls}>Description *</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls} placeholder="e.g. Dinner" />
          </div>
          <div>
            <label className={labelCls}>Qty</label>
            <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Price (₹)</label>
            <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} placeholder="350" />
          </div>
          <button
            onClick={handleAdd} disabled={adding}
            className="h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Charges list */}
        {isLoading ? (
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
        ) : charges.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground border border-dashed border-border rounded-xl">
            No extra charges yet. Add meals, activities, or services above.
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2 text-right">Unit</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2">{c.description}</td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{c.qty}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">₹{c.unit_price.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-right font-medium">₹{(c.qty * c.unit_price).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => deleteCharge({ id: c.id, bookingId: booking.id })}
                        className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={3} className="px-3 py-2 text-sm font-medium">Extras total</td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-700">
                    ₹{chargesTotal.toLocaleString("en-IN")}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}

// ─── INVOICE MODAL ────────────────────────────────────────────────────────
function InvoiceModal({
  booking,
  charges,
  roomName,
  property,
  onClose,
}: {
  booking: Booking;
  charges: BookingCharge[];
  roomName: string;
  property: ReturnType<typeof useOwnerProperty>["data"];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const chargesTotal = charges.reduce((s, c) => s + c.qty * c.unit_price, 0);
  const subtotal = Number(booking.total_amount) + chargesTotal;
  const advance = Number(booking.advance_amount ?? 0);
  const balance = Math.max(0, subtotal - advance);

  const invoiceNum = `INV-${new Date(booking.created_at).getFullYear()}-${booking.id.slice(0, 6).toUpperCase()}`;
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const invoiceText = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `INVOICE ${invoiceNum}`,
    `${property?.name ?? "VattavadaStays"}`,
    `Date: ${today}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Guest: ${booking.guest_name}`,
    `Phone: ${booking.guest_phone}`,
    `Room: ${roomName}`,
    `Check-in: ${booking.check_in}`,
    `Check-out: ${booking.check_out}`,
    `Nights: ${booking.nights}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Room charge     ₹${Number(booking.room_price).toLocaleString("en-IN")}`,
    booking.extra_guest_charge > 0 ? `Extra guests    ₹${Number(booking.extra_guest_charge).toLocaleString("en-IN")}` : null,
    ...charges.map((c) => `${c.description.padEnd(16)}₹${(c.qty * c.unit_price).toLocaleString("en-IN")}`),
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Subtotal        ₹${subtotal.toLocaleString("en-IN")}`,
    advance > 0 ? `Advance paid   -₹${advance.toLocaleString("en-IN")}` : null,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `BALANCE DUE     ₹${balance.toLocaleString("en-IN")}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    property?.owner_phone ? `Call: +91 ${property.owner_phone.replace(/\D/g, "").slice(-10)}` : null,
  ].filter(Boolean).join("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(invoiceText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const waLink = property?.owner_whatsapp
    ? `https://wa.me/${property.owner_whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(invoiceText)}`
    : null;

  return (
    <Modal title={`Invoice — ${invoiceNum}`} onClose={onClose} wide>
      {/* Print-friendly invoice */}
      <div ref={printRef} className="print-area rounded-xl border border-border bg-white p-5 text-sm space-y-3 font-mono">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div>
            <div className="font-display font-semibold text-lg non-mono">{property?.name ?? "VattavadaStays"}</div>
            {property?.area && <div className="text-xs text-muted-foreground non-mono">{property.area}, Kerala</div>}
          </div>
          <div className="text-right">
            <div className="font-semibold">{invoiceNum}</div>
            <div className="text-xs text-muted-foreground">{today}</div>
          </div>
        </div>

        {/* Guest info */}
        <div className="grid grid-cols-2 gap-3 text-xs border-b border-border pb-3">
          <div>
            <div className="text-muted-foreground mb-0.5">Guest</div>
            <div className="font-medium">{booking.guest_name}</div>
            <div>{booking.guest_phone}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Stay</div>
            <div className="font-medium">{roomName}</div>
            <div>{booking.check_in} → {booking.check_out}</div>
            <div className="text-muted-foreground">{booking.nights} night{booking.nights > 1 ? "s" : ""} · {booking.guest_count} guest{booking.guest_count > 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-1">
          <InvoiceLine label="Room charge" amount={Number(booking.room_price)} />
          {Number(booking.extra_guest_charge) > 0 && (
            <InvoiceLine label="Extra guest charge" amount={Number(booking.extra_guest_charge)} />
          )}
          {charges.map((c) => (
            <InvoiceLine
              key={c.id}
              label={`${c.description}${c.qty > 1 ? ` ×${c.qty}` : ""}`}
              amount={c.qty * c.unit_price}
              sub
            />
          ))}
        </div>

        {/* Totals */}
        <div className="border-t border-border pt-2 space-y-1">
          <InvoiceLine label="Subtotal" amount={subtotal} bold />
          {advance > 0 && (
            <InvoiceLine label="Advance paid" amount={-advance} color="text-primary" />
          )}
          <div className="border-t border-border pt-1 mt-1">
            <InvoiceLine
              label="BALANCE DUE"
              amount={balance}
              bold
              color={balance === 0 ? "text-primary" : "text-amber-700"}
              large
            />
          </div>
        </div>

        {/* Payment info */}
        {(booking.payment_method || booking.payment_reference) && (
          <div className="border-t border-border pt-2 text-xs text-muted-foreground">
            {booking.payment_method && <span>Method: {booking.payment_method}</span>}
            {booking.payment_reference && <span className="ml-3">Ref: {booking.payment_reference}</span>}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border pt-2 text-xs text-muted-foreground text-center">
          {property?.owner_name && <span>Issued by {property.owner_name}</span>}
          {property?.owner_phone && <span className="ml-2">· +91 {property.owner_phone.replace(/\D/g, "").slice(-10)}</span>}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleCopy}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy text"}
        </button>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] text-white py-2.5 text-sm font-medium hover:opacity-90"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Send on WhatsApp
          </a>
        )}
        <button
          onClick={handlePrint}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90"
        >
          <Printer className="h-3.5 w-3.5" />
          Print / PDF
        </button>
      </div>

      <style>{`
        @media print {
          body > *:not(.print-area) { display: none !important; }
          .print-area { display: block !important; }
        }
      `}</style>
    </Modal>
  );
}

function InvoiceLine({
  label,
  amount,
  bold,
  large,
  color,
  sub,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  large?: boolean;
  color?: string;
  sub?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center ${sub ? "pl-3 text-muted-foreground" : ""} ${large ? "text-base" : "text-sm"}`}>
      <span className={bold ? "font-semibold" : ""}>{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${color ?? ""} tabular-nums`}>
        {amount < 0 ? "-" : ""}₹{Math.abs(amount).toLocaleString("en-IN")}
      </span>
    </div>
  );
}

// ─── ADD BOOKING MODAL (unchanged logic, kept compact) ────────────────────
type BookingForm = {
  guest_name: string; guest_phone: string; guest_email: string;
  room_id: string; check_in: string; check_out: string;
  guest_count: number; payment_method: string; is_paid: boolean;
  status: BookingStatus;
};

const emptyBookingForm = (): BookingForm => ({
  guest_name: "", guest_phone: "+91 ", guest_email: "",
  room_id: "", check_in: "", check_out: "",
  guest_count: 2, payment_method: "Cash on Arrival",
  is_paid: false, status: "confirmed",
});

function AddBookingModal({
  propertyId, rooms, onClose, onSaved,
}: {
  propertyId: string;
  rooms: { id: string; name: string; base_price: number; extra_guest_price: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BookingForm>({ ...emptyBookingForm(), room_id: rooms[0]?.id ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof BookingForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const nights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0;
    return Math.max(0, (new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) / 86400000);
  }, [form.check_in, form.check_out]);

  const selectedRoom = rooms.find((r) => r.id === form.room_id);
  const total = useMemo(() => {
    if (!selectedRoom || nights === 0) return 0;
    const extra = Math.max(0, form.guest_count - 2) * (selectedRoom.extra_guest_price ?? 0);
    return (selectedRoom.base_price + extra) * nights;
  }, [selectedRoom, nights, form.guest_count]);

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError("Guest name required"); return; }
    if (!form.room_id) { setError("Select a room"); return; }
    if (nights <= 0) { setError("Check-out must be after check-in"); return; }
    setSaving(true); setError("");
    try {
      const { error: err } = await supabase.from("bookings").insert({
        property_id: propertyId, room_id: form.room_id,
        guest_name: form.guest_name, guest_phone: form.guest_phone,
        guest_email: form.guest_email || null, guest_count: form.guest_count,
        check_in: form.check_in, check_out: form.check_out,
        room_price: selectedRoom?.base_price ?? 0,
        extra_guest_charge: Math.max(0, form.guest_count - 2) * (selectedRoom?.extra_guest_price ?? 0),
        total_amount: total, payment_method: form.payment_method,
        is_paid: form.is_paid, status: form.status, advance_amount: 0,
      });
      if (err) throw err;
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-card rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Add Booking</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Guest name *</label>
              <input value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} className={inputCls} placeholder="Full name" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Room *</label>
            <select value={form.room_id} onChange={(e) => set("room_id", e.target.value)} className={inputCls}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} — ₹{r.base_price.toLocaleString("en-IN")}/night</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Check-in *</label>
              <input type="date" value={form.check_in} onChange={(e) => set("check_in", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Check-out *</label>
              <input type="date" value={form.check_out} onChange={(e) => set("check_out", e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Guests</label>
              <input type="number" min={1} max={20} value={form.guest_count} onChange={(e) => set("guest_count", parseInt(e.target.value) || 1)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value as BookingStatus)} className={inputCls}>
                {(["pending", "confirmed", "checked_in", "completed", "cancelled"] as BookingStatus[]).map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </div>
          {nights > 0 && selectedRoom && (
            <div className="rounded-xl bg-primary-light/40 border border-border p-3 text-sm">
              <div className="flex justify-between font-semibold font-display">
                <span>Total</span>
                <span>₹{total.toLocaleString("en-IN")}</span>
              </div>
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

// ─── SHARED MODAL SHELL ───────────────────────────────────────────────────
function Modal({
  title, children, onClose, wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative w-full ${wide ? "md:max-w-2xl" : "md:max-w-md"} bg-card rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onClose, onSave, saving, label,
}: {
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="flex gap-2">
      <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
      <button onClick={onSave} disabled={saving} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

// ─── BOOKING ROW ACTIONS ──────────────────────────────────────────────────
type ActiveModal =
  | { type: "payment"; booking: Booking }
  | { type: "charges"; booking: Booking }
  | { type: "invoice"; booking: Booking }
  | null;

function BookingActions({
  booking,
  property,
  roomName,
  onStatusChange,
  onOpenModal,
}: {
  booking: Booking;
  property: ReturnType<typeof useOwnerProperty>["data"];
  roomName: string;
  onStatusChange: (id: string, status: string) => void;
  onOpenModal: (modal: ActiveModal) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const ownerPhone = property?.owner_phone ?? "";
  const lat = property?.location_lat;
  const lng = property?.location_lng;

  const advance = Number(booking.advance_amount ?? 0);
  const balance = Math.max(0, Number(booking.total_amount) - advance);

  return (
    <div className="flex items-center justify-end gap-1" ref={ref}>
      {/* Quick status transitions */}
      {booking.status === "pending" && (
        <button
          title="Confirm booking"
          onClick={() => onStatusChange(booking.id, "confirmed")}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-primary/10 hover:border-primary text-xs"
        >
          <Check className="h-3.5 w-3.5 text-primary" />
        </button>
      )}
      {booking.status === "confirmed" && (
        <button
          title="Check in guest"
          onClick={() => onStatusChange(booking.id, "checked_in")}
          className="h-8 px-2 inline-flex items-center gap-1 rounded-md border border-border hover:bg-primary/10 text-xs font-medium text-primary"
        >
          <LogIn className="h-3 w-3" /> In
        </button>
      )}
      {booking.status === "checked_in" && (
        <button
          title="Check out guest"
          onClick={() => onStatusChange(booking.id, "completed")}
          className="h-8 px-2 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-medium text-amber-700"
        >
          <LogOut className="h-3 w-3" /> Out
        </button>
      )}

      {/* Phone */}
      <a
        href={telLink(booking.guest_phone)}
        title="Call guest"
        className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted text-xs"
      >
        <Phone className="h-3.5 w-3.5" />
      </a>

      {/* Actions dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="h-8 px-2 inline-flex items-center gap-0.5 rounded-md border border-border hover:bg-muted text-xs"
          title="More actions"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        {open && (
          <div className="absolute right-0 bottom-9 z-20 w-56 bg-card border border-border rounded-xl shadow-lg py-1 text-sm">
            {/* Payment section */}
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Payments
            </div>
            <button
              onClick={() => { setOpen(false); onOpenModal({ type: "payment", booking }); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"
            >
              <IndianRupee className="h-3.5 w-3.5 text-primary" />
              Record payment
              {advance > 0 && <span className="ml-auto text-xs text-primary">₹{advance.toLocaleString("en-IN")}</span>}
            </button>

            {/* Charges section */}
            <div className="border-t border-border mt-1 pt-1 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              On-property
            </div>
            <button
              onClick={() => { setOpen(false); onOpenModal({ type: "charges", booking }); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"
            >
              <Utensils className="h-3.5 w-3.5 text-amber-600" />
              Add charges
            </button>

            {/* Invoice */}
            <div className="border-t border-border mt-1 pt-1 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Invoice
            </div>
            <button
              onClick={() => { setOpen(false); onOpenModal({ type: "invoice", booking }); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"
            >
              <ClipboardList className="h-3.5 w-3.5 text-foreground" />
              View / print invoice
              {balance > 0 && <span className="ml-auto text-xs text-amber-600">₹{balance.toLocaleString("en-IN")} due</span>}
            </button>

            {/* WhatsApp templates */}
            <div className="border-t border-border mt-1 pt-1 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              WhatsApp
            </div>
            <a
              href={confirmationLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", roomName, checkIn: booking.check_in, checkOut: booking.check_out, ownerPhone })}
              target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted"
            >
              <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" /> ✅ Booking confirmed
            </a>
            {lat && lng && (
              <a
                href={directionsLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", lat, lng, ownerPhone })}
                target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted"
              >
                <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" /> 📍 Send directions
              </a>
            )}
            <a
              href={paymentReminderLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, amount: balance, checkIn: booking.check_in, propertyName: property?.name ?? "" })}
              target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted"
            >
              <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" /> 💰 Payment reminder
            </a>
            <a
              href={dayBeforeReminderLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", checkInTime: property?.check_in_time ?? "2:00 PM", ownerPhone })}
              target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-muted"
            >
              <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" /> 🌿 Day-before reminder
            </a>

            {/* Cancel */}
            {booking.status !== "cancelled" && booking.status !== "completed" && (
              <>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => { setOpen(false); onStatusChange(booking.id, "cancelled"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-destructive/10 text-destructive text-left"
                >
                  <X className="h-3.5 w-3.5" /> Cancel booking
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────
function BookingsAdmin() {
  const { data: property } = useOwnerProperty();
  const { data: bookings = [], isLoading } = useBookings(property?.id ?? "");
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const [q, setQ] = useState("");

  const rooms = property?.rooms ?? [];

  const roomNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    rooms.forEach((r) => { map[r.id] = r.name; });
    return map;
  }, [rooms]);

  const filtered = useMemo(() =>
    bookings.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (q && !`${b.guest_name} ${b.guest_phone} ${b.id}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }), [bookings, status, q]);

  // Stats bar
  const stats = useMemo(() => {
    const active = bookings.filter((b) => !["cancelled", "completed"].includes(b.status));
    const outstanding = active.reduce((s, b) =>
      s + Math.max(0, Number(b.total_amount) - Number(b.advance_amount ?? 0)), 0);
    return { active: active.length, outstanding };
  }, [bookings]);

  const updateStatus = async (id: string, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "checked_in") updates.checked_in_at = new Date().toISOString();
    if (newStatus === "completed") updates.checked_out_at = new Date().toISOString();
    await supabase.from("bookings").update(updates).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id] });
  };

  const handleModalSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id] });
    setActiveModal(null);
  };

  if (isLoading) return <div className="h-48 rounded-xl bg-muted animate-pulse" />;

  // Fetch charges for active invoice/charge modal
  const activeBookingId =
    activeModal?.type === "invoice" || activeModal?.type === "charges"
      ? activeModal.booking.id
      : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Bookings</h1>
          <p className="text-sm text-muted-foreground">All inquiries and confirmed stays.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add booking
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary-light flex items-center justify-center">
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Active bookings</div>
            <div className="font-display text-xl font-semibold">{stats.active}</div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
            <IndianRupee className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Balance outstanding</div>
            <div className="font-display text-xl font-semibold text-amber-700">
              ₹{stats.outstanding.toLocaleString("en-IN")}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-3 grid md:grid-cols-3 gap-3">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search guest, phone, or booking ID"
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | BookingStatus)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Guest</th>
                <th className="px-4 py-2.5 font-medium">Room</th>
                <th className="px-4 py-2.5 font-medium">Check-in</th>
                <th className="px-4 py-2.5 font-medium">Check-out</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Advance</th>
                <th className="px-4 py-2.5 font-medium">Balance</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const advance = Number(b.advance_amount ?? 0);
                const balance = Math.max(0, Number(b.total_amount) - advance);
                return (
                  <tr key={b.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.guest_name}</div>
                      <div className="text-xs text-muted-foreground">{b.guest_phone}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {roomNameMap[b.room_id] ?? <span className="text-muted-foreground text-xs">{b.room_id.slice(0, 8)}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{b.check_in}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{b.check_out}</td>
                    <td className="px-4 py-3 font-medium">
                      ₹{Number(b.total_amount).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      {advance > 0
                        ? <span className="text-primary font-medium">₹{advance.toLocaleString("en-IN")}</span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {balance > 0
                        ? <span className="text-amber-700 font-medium">₹{balance.toLocaleString("en-IN")}</span>
                        : <span className="text-primary text-xs font-medium">Paid ✓</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={b.status as BookingStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <BookingActions
                        booking={b as Booking}
                        property={property}
                        roomName={roomNameMap[b.room_id] ?? b.room_id}
                        onStatusChange={updateStatus}
                        onOpenModal={setActiveModal}
                      />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    No bookings match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && property && (
        <AddBookingModal
          propertyId={property.id}
          rooms={rooms.filter((r) => r.is_active)}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ["bookings", property?.id] }); setShowAddModal(false); }}
        />
      )}

      {activeModal?.type === "payment" && (
        <RecordPaymentModal
          booking={activeModal.booking}
          onClose={() => setActiveModal(null)}
          onSaved={handleModalSaved}
        />
      )}

      {activeModal?.type === "charges" && (
        <AddChargesModal
          booking={activeModal.booking}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === "invoice" && (
        <InvoiceModalWrapper
          booking={activeModal.booking}
          roomName={roomNameMap[activeModal.booking.room_id] ?? activeModal.booking.room_id}
          property={property}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

// Wrapper to load charges then show invoice
function InvoiceModalWrapper({
  booking, roomName, property, onClose,
}: {
  booking: Booking;
  roomName: string;
  property: ReturnType<typeof useOwnerProperty>["data"];
  onClose: () => void;
}) {
  const { data: charges = [] } = useBookingCharges(booking.id);
  return (
    <InvoiceModal
      booking={booking}
      charges={charges}
      roomName={roomName}
      property={property}
      onClose={onClose}
    />
  );
}
