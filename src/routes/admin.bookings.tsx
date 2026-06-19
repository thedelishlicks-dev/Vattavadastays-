import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search, Plus, Loader2, X, IndianRupee, Utensils, MessageCircle, Check, LogOut,
  Trash2, ChevronRight, Phone, Clock, CheckCircle2, Users, Calendar, BedDouble,
  Tag, Pencil, Hotel, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings, useBookingGroups } from "@/hooks/useBookings";
import {
  useBookingCharges, useAddCharge, useDeleteCharge,
  useGroupCharges, useAddGroupCharge, useDeleteGroupCharge,
} from "@/hooks/useBookingCharges";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { confirmationLink, directionsLink, paymentReminderLink, dayBeforeReminderLink, telLink, guestTrackingUrl } from "@/lib/whatsapp";
import { BookingInvoice } from "@/components/BookingInvoice";
import type { Booking, BookingGroup, BookingCharge, BookingStatus } from "@/types/database";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsAdmin,
});

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const STATUS_FILTERS = ["all", "pending", "confirmed", "completed", "cancelled"] as const;
type FilterStatus = (typeof STATUS_FILTERS)[number];

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: "Pending", color: "bg-amber-100 text-amber-800", dot: "bg-amber-400" },
  confirmed: { label: "Confirmed", color: "bg-green-100 text-green-800", dot: "bg-green-500" },
  completed: { label: "Completed", color: "bg-stone-100 text-stone-600", dot: "bg-stone-400" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700", dot: "bg-red-400" },
};

const CHARGE_PRESETS = [
  { description: "Breakfast", unit_price: 200 },
  { description: "Lunch", unit_price: 300 },
  { description: "Dinner", unit_price: 350 },
  { description: "Full board (all meals)", unit_price: 750 },
  { description: "Bonfire", unit_price: 500 },
  { description: "Trekking guide", unit_price: 800 },
  { description: "Laundry", unit_price: 150 },
  { description: "Extra blanket", unit_price: 100 },
];

async function getUnavailableDates(roomId: string, checkIn: string, checkOut: string): Promise<string[]> {
  const dates: string[] = [];
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  if (dates.length === 0) return [];
  const { data, error } = await supabase
    .from("availability")
    .select("date, is_available")
    .eq("room_id", roomId)
    .in("date", dates);
  if (error) throw error;
  return (data ?? []).filter((row) => row.is_available === false).map((row) => row.date);
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ChargesList({
  charges, chargesTotal, onDelete, groupId, bookingId,
}: {
  charges: BookingCharge[];
  chargesTotal: number;
  onDelete: (id: string) => void;
  groupId?: string;
  bookingId?: string;
}) {
  const groupChargeMutation = useAddGroupCharge();
  const singleChargeMutation = useAddCharge();
  const adding = groupId ? groupChargeMutation.isPending : singleChargeMutation.isPending;
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!desc.trim()) { setError("Description required"); return; }
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (!q || q <= 0 || !p || p < 0) { setError("Valid qty and price required"); return; }
    setError("");
    try {
      if (groupId) {
        await groupChargeMutation.mutateAsync({ group_id: groupId, description: desc, qty: q, unit_price: p });
      } else if (bookingId) {
        await singleChargeMutation.mutateAsync({ booking_id: bookingId, description: desc, qty: q, unit_price: p });
      }
      setDesc(""); setQty("1"); setPrice("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add charge");
    }
  };

  return (
    <div className="space-y-4">
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
          <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className="w-14 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="Qty" />
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="₹ Price" />
          <button onClick={handleAdd} disabled={adding} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1 shrink-0">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      {charges.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Utensils className="h-6 w-6 mx-auto mb-2 opacity-30" />No extra charges yet
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
              <button onClick={() => onDelete(c.id)} className="h-7 w-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
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

// ---------------------------------------------------------------------------
// Add Multi-Room Booking Modal
// FIX: extra guest charge now calculated above room.max_guests, not hardcoded 2
// ---------------------------------------------------------------------------

function AddGroupBookingModal({ propertyId, rooms, onClose, onSaved }: {
  propertyId: string;
  rooms: { id: string; name: string; base_price: number; extra_guest_price: number; max_guests: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    guest_name: "",
    guest_phone: "+91 ",
    guest_email: "",
    check_in: "",
    check_out: "",
    guest_count: 2 as number | string,
    status: "confirmed" as BookingStatus,
  });
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([rooms[0]?.id ?? ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({});
  const queryClient = useQueryClient();
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const nights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0;
    return Math.max(0, (new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) / 86400000);
  }, [form.check_in, form.check_out]);

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId)
        ? prev.length > 1 ? prev.filter((id) => id !== roomId) : prev
        : [...prev, roomId]
    );
    setConflicts((prev) => { const next = { ...prev }; delete next[roomId]; return next; });
  };

  const guestCount = Number(form.guest_count) || 1;
  const selectedRooms = rooms.filter((r) => selectedRoomIds.includes(r.id));

  const roomTotals = useMemo(() => selectedRooms.map((r) => {
    const base = r.base_price * nights;
    // FIX: extra charge above room.max_guests, not hardcoded 2
    const extra = Math.max(0, guestCount - r.max_guests) * (r.extra_guest_price ?? 0) * nights;
    return { room: r, roomPrice: base, extraCharge: extra, total: base + extra };
  }), [selectedRooms, nights, guestCount]);

  const grandTotal = roomTotals.reduce((s, r) => s + r.total, 0);
  const hasConflicts = Object.values(conflicts).some((dates) => dates.length > 0);

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError("Guest name is required"); return; }
    if (nights <= 0) { setError("Check-out must be after check-in"); return; }
    if (selectedRoomIds.length === 0) { setError("Select at least one room"); return; }

    setSaving(true); setError(""); setConflicts({});

    try {
      const conflictResults = await Promise.all(
        selectedRoomIds.map(async (roomId) => {
          const blockedDates = await getUnavailableDates(roomId, form.check_in, form.check_out);
          return { roomId, blockedDates };
        })
      );

      const newConflicts: Record<string, string[]> = {};
      for (const { roomId, blockedDates } of conflictResults) {
        if (blockedDates.length > 0) newConflicts[roomId] = blockedDates;
      }

      if (Object.keys(newConflicts).length > 0) {
        setConflicts(newConflicts); setSaving(false); return;
      }

      if (selectedRoomIds.length === 1) {
        const rt = roomTotals[0];
        const { error: err } = await supabase.from("bookings").insert({
          property_id: propertyId,
          room_id: rt.room.id,
          guest_name: form.guest_name,
          guest_phone: form.guest_phone,
          guest_email: form.guest_email || null,
          guest_count: guestCount,
          check_in: form.check_in,
          check_out: form.check_out,
          room_price: rt.roomPrice,
          extra_guest_charge: rt.extraCharge,
          total_amount: rt.total,
          advance_amount: 0,
          discount_amount: 0,
          status: form.status,
          is_paid: false,
        });
        if (err) throw err;
      } else {
        const { data: groupData, error: groupErr } = await supabase
          .from("booking_groups")
          .insert({
            property_id: propertyId,
            group_reference: "GRP-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
            guest_name: form.guest_name,
            guest_phone: form.guest_phone,
            guest_email: form.guest_email || null,
            guest_count: guestCount,
            check_in: form.check_in,
            check_out: form.check_out,
            total_amount: grandTotal,
            advance_amount: 0,
            discount_amount: 0,
            status: form.status,
            is_paid: false,
          })
          .select()
          .single();
        if (groupErr) throw groupErr;

        const bookingInserts = roomTotals.map((rt) => ({
          property_id: propertyId,
          room_id: rt.room.id,
          guest_name: form.guest_name,
          guest_phone: form.guest_phone,
          guest_email: form.guest_email || null,
          guest_count: guestCount,
          check_in: form.check_in,
          check_out: form.check_out,
          room_price: rt.roomPrice,
          extra_guest_charge: rt.extraCharge,
          total_amount: rt.total,
          advance_amount: 0,
          discount_amount: 0,
          status: form.status,
          is_paid: false,
          group_id: groupData.id,
        }));
        const { error: bookErr } = await supabase.from("bookings").insert(bookingInserts);
        if (bookErr) throw bookErr;
      }

      queryClient.invalidateQueries({ queryKey: ["bookings", propertyId], exact: false });
      queryClient.invalidateQueries({ queryKey: ["bookingGroups", propertyId], exact: false });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-card rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Add Booking</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Guest details</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Guest name *</label><input value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} className={inputCls} placeholder="Full name" /></div>
              <div><label className={labelCls}>Phone</label><input type="tel" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)} className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>Email</label><input type="email" value={form.guest_email} onChange={(e) => set("guest_email", e.target.value)} className={inputCls} placeholder="Optional" /></div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stay dates</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Check-in</label><input type="date" value={form.check_in} onChange={(e) => { set("check_in", e.target.value); setConflicts({}); }} className={inputCls} /></div>
              <div><label className={labelCls}>Check-out</label><input type="date" value={form.check_out} onChange={(e) => { set("check_out", e.target.value); setConflicts({}); }} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Total guests</label><input type="number" min={1} max={50} value={form.guest_count} onChange={(e) => set("guest_count", e.target.value === "" ? "" : parseInt(e.target.value) || 1)} className={inputCls} /></div>
              <div><label className={labelCls}>Status</label><select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>{["pending", "confirmed"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select rooms <span className="normal-case text-primary font-normal">(tap to add/remove)</span></p>
            <div className="space-y-2">
              {rooms.map((r) => {
                const selected = selectedRoomIds.includes(r.id);
                // FIX: extra charge above r.max_guests
                const extraCharge = nights > 0 ? Math.max(0, guestCount - r.max_guests) * r.extra_guest_price * nights : 0;
                const roomTotal = nights > 0 ? r.base_price * nights + extraCharge : 0;
                const roomConflicts = conflicts[r.id] ?? [];
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRoom(r.id)}
                    className={[
                      "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                      roomConflicts.length > 0
                        ? "border-destructive/50 bg-destructive/5"
                        : selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                    ].join(" ")}
                  >
                    <div className={["h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors", selected ? "border-primary bg-primary" : "border-border"].join(" ")}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        ₹{r.base_price.toLocaleString("en-IN")}/night · {r.max_guests} guests included
                        {r.extra_guest_price > 0 ? ` · +₹${r.extra_guest_price}/extra guest` : ""}
                      </div>
                      {roomConflicts.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-destructive font-medium">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Not available: {roomConflicts.slice(0, 3).join(", ")}{roomConflicts.length > 3 ? ` +${roomConflicts.length - 3} more` : ""}
                        </div>
                      )}
                    </div>
                    {selected && nights > 0 && roomConflicts.length === 0 && (
                      <div className="text-sm font-semibold text-primary shrink-0">₹{roomTotal.toLocaleString("en-IN")}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {nights > 0 && selectedRooms.length > 0 && !hasConflicts && (
            <div className="rounded-xl bg-primary-light/40 border border-border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{selectedRooms.length} room{selectedRooms.length > 1 ? "s" : ""} · {nights} night{nights > 1 ? "s" : ""}</p>
              {roomTotals.map((rt) => (
                <div key={rt.room.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate mr-2">{rt.room.name}</span>
                  <span className="font-medium shrink-0">₹{rt.total.toLocaleString("en-IN")}</span>
                </div>
              ))}
              {selectedRooms.length > 1 && (
                <div className="flex justify-between text-sm font-semibold text-primary border-t border-border pt-2 mt-1">
                  <span>Total</span><span>₹{grandTotal.toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {hasConflicts && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Some rooms are not available for the selected dates. Please adjust dates or deselect conflicting rooms.
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || hasConflicts}
              className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Checking availability…" : selectedRoomIds.length > 1 ? `Book ${selectedRoomIds.length} rooms` : "Add booking"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group booking card
// ---------------------------------------------------------------------------

function GroupBookingCard({ group, roomNameMap, onClick }: { group: BookingGroup; roomNameMap: Record<string, string>; onClick: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const discount = Number(group.discount_amount ?? 0);
  const advance = Number(group.advance_amount ?? 0);
  const balance = Math.max(0, Number(group.total_amount) - discount - advance);
  const bookings = group.bookings ?? [];
  return (
    <div className="bg-card border border-primary/20 rounded-2xl overflow-hidden shadow-sm">
      <button onClick={onClick} className="w-full text-left p-4 hover:bg-muted/30 transition-colors group">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hotel className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-semibold text-foreground truncate">{group.guest_name}</span>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium shrink-0">{bookings.length} rooms</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{group.guest_phone || "No phone"} · {group.group_reference}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill status={group.status} />
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5 shrink-0" /><span>{group.check_in}</span></div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5 shrink-0" /><span>{group.check_out}</span></div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5 shrink-0" /><span>{group.guest_count} guests</span></div>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">Total <span className="font-semibold text-foreground">₹{(Number(group.total_amount) - discount).toLocaleString("en-IN")}</span>{discount > 0 && <span className="ml-1.5 text-green-600 font-medium">-₹{discount.toLocaleString("en-IN")} disc</span>}</div>
          {advance > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary">Adv ₹{advance.toLocaleString("en-IN")}</span>
              {balance > 0 ? <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">₹{balance.toLocaleString("en-IN")} due</span> : <span className="text-xs font-semibold text-primary bg-primary-light/60 rounded-full px-2 py-0.5">Paid ✓</span>}
            </div>
          ) : <span className="text-xs text-muted-foreground italic">No advance recorded</span>}
        </div>
      </button>
      <div className="border-t border-border">
        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors">
          <span>{expanded ? "Hide" : "Show"} {bookings.length} rooms</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {expanded && (
          <div className="px-4 pb-3 space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <div className="flex items-center gap-2"><BedDouble className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-medium">{roomNameMap[b.room_id] ?? "Unknown room"}</span></div>
                <span className="text-muted-foreground">₹{Number(b.total_amount).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Group Guest Modal
// ---------------------------------------------------------------------------

function EditGroupGuestModal({ group, onClose, onSaved }: { group: BookingGroup; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ guest_name: group.guest_name ?? "", guest_phone: group.guest_phone ?? "", guest_email: group.guest_email ?? "", guest_count: group.guest_count as number | string });
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError("Guest name is required"); return; }
    setSaving(true); setError("");
    try {
      const { error: groupErr } = await supabase.from("booking_groups").update({ guest_name: form.guest_name.trim(), guest_phone: (form.guest_phone as string).trim(), guest_email: (form.guest_email as string).trim() || null, guest_count: Number(form.guest_count) || 1 }).eq("id", group.id);
      if (groupErr) throw groupErr;
      const { error: bookingsErr } = await supabase.from("bookings").update({ guest_name: form.guest_name.trim(), guest_phone: (form.guest_phone as string).trim(), guest_email: (form.guest_email as string).trim() || null, guest_count: Number(form.guest_count) || 1 }).eq("group_id", group.id);
      if (bookingsErr) throw bookingsErr;
      queryClient.invalidateQueries({ queryKey: ["bookingGroups"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false });
      onSaved();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-card rounded-t-3xl md:rounded-2xl shadow-2xl">
        <div className="md:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border" /></div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div><h2 className="font-display text-base font-semibold">Edit Guest Details</h2><p className="text-xs text-muted-foreground mt-0.5">{group.group_reference}</p></div>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className={labelCls}>Guest name *</label><input value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} className={inputCls} placeholder="Full name" autoFocus /></div>
          <div><label className={labelCls}>Phone</label><input type="tel" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)} className={inputCls} placeholder="+91 98765 43210" /></div>
          <div><label className={labelCls}>Email</label><input type="email" value={form.guest_email} onChange={(e) => set("guest_email", e.target.value)} className={inputCls} placeholder="guest@email.com" /></div>
          <div><label className={labelCls}>Number of guests</label><input type="number" min={1} max={50} value={form.guest_count} onChange={(e) => set("guest_count", e.target.value === "" ? "" : parseInt(e.target.value) || 1)} className={inputCls} /></div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group booking detail modal
// ---------------------------------------------------------------------------

type GroupModalTab = "overview" | "charges" | "invoice";

function GroupBookingDetailModal({ group, roomNameMap, property, onClose, onRefresh }: {
  group: BookingGroup;
  roomNameMap: Record<string, string>;
  property: ReturnType<typeof useOwnerProperty>["data"];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<GroupModalTab>("overview");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [showEditGroupGuest, setShowEditGroupGuest] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const queryClient = useQueryClient();
  const { data: charges = [] } = useGroupCharges(group.id);
  const { mutateAsync: deleteGroupCharge } = useDeleteGroupCharge();
  const bookings = group.bookings ?? [];
  const discount = Number(group.discount_amount ?? 0);
  const advance = Number(group.advance_amount ?? 0);
  const chargesTotal = charges.reduce((s, c) => s + c.qty * c.unit_price, 0);
  const balance = Math.max(0, Number(group.total_amount) + chargesTotal - discount - advance);
  const ownerPhone = property?.owner_phone ?? "";
  const canAct = !["cancelled", "completed"].includes(group.status);

  const handleStatus = async (status: string) => {
    setUpdatingStatus(true);
    await supabase.from("booking_groups").update({ status }).eq("id", group.id);
    await supabase.from("bookings").update({ status }).eq("group_id", group.id);
    queryClient.invalidateQueries({ queryKey: ["bookingGroups"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false });
    onRefresh(); setUpdatingStatus(false);
  };

  const handleSavePayment = async (amount: number, method: string, ref: string) => {
    const newAdvance = advance + amount;
    const isPaid = newAdvance >= Number(group.total_amount) + chargesTotal - discount;
    const newStatus = group.status === "pending" ? "confirmed" : group.status;
    await supabase.from("booking_groups").update({ advance_amount: newAdvance, payment_method: method, ...(ref ? { payment_reference: ref } : {}), is_paid: isPaid, status: newStatus }).eq("id", group.id);
    if (newStatus !== group.status) await supabase.from("bookings").update({ status: newStatus }).eq("group_id", group.id);
    queryClient.invalidateQueries({ queryKey: ["bookingGroups"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false });
    onRefresh(); setShowPaymentForm(false);
  };

  const handleSaveDiscount = async (amount: number, reason: string) => {
    await supabase.from("booking_groups").update({ discount_amount: amount, discount_reason: reason || null }).eq("id", group.id);
    queryClient.invalidateQueries({ queryKey: ["bookingGroups"], exact: false });
    onRefresh(); setShowDiscountForm(false);
  };

  // Sum room_price / extra_guest_charge across ALL rooms in the group —
  // using only bookings[0] here would show one room's charges paired with
  // the group's pooled guest_count/total_amount, which is misleading
  // (e.g. "7 guests" next to a single room's ₹500 extra charge).
  const groupRoomPriceTotal = bookings.reduce((sum, b) => sum + Number(b.room_price ?? 0), 0);
  const groupExtraGuestTotal = bookings.reduce((sum, b) => sum + Number(b.extra_guest_charge ?? 0), 0);
  const groupNights = bookings[0]?.nights ?? 0; // same stay dates across all rooms in a group

  const invoiceBooking = {
    ...bookings[0],
    guest_name: group.guest_name,
    guest_phone: group.guest_phone,
    guest_email: group.guest_email,
    check_in: group.check_in,
    check_out: group.check_out,
    guest_count: group.guest_count,
    nights: groupNights,
    room_price: groupRoomPriceTotal,
    extra_guest_charge: groupExtraGuestTotal,
    total_amount: group.total_amount,
    advance_amount: group.advance_amount,
    discount_amount: group.discount_amount,
    discount_reason: group.discount_reason,
    payment_method: group.payment_method,
    payment_reference: group.payment_reference,
    is_paid: group.is_paid,
    status: group.status,
  } as Booking;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full md:max-w-lg bg-card rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
          <div className="md:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border" /></div>
          <div className="px-5 pt-3 pb-4 border-b border-border">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2"><h2 className="font-display text-lg font-semibold">{group.guest_name}</h2><span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{bookings.length} rooms</span></div>
                <div className="flex items-center gap-2 mt-1"><StatusPill status={group.status} /><span className="text-xs text-muted-foreground font-mono">{group.group_reference}</span></div>
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center -mt-1"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {group.status === "pending" && <ActionChip onClick={() => handleStatus("confirmed")} loading={updatingStatus} icon={<Check className="h-3.5 w-3.5" />} label="Confirm all" color="green" />}
              {group.status === "confirmed" && <ActionChip onClick={() => handleStatus("completed")} loading={updatingStatus} icon={<LogOut className="h-3.5 w-3.5" />} label="Complete all" color="amber" />}
              <button onClick={() => setShowEditGroupGuest(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"><Pencil className="h-3.5 w-3.5" /> Edit Guest</button>
              {group.guest_phone && <a href={telLink(group.guest_phone)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"><Phone className="h-3.5 w-3.5" /> Call</a>}
              {group.guest_phone && <a href={`https://wa.me/${group.guest_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 bg-[#25D366]/5 text-[#128C7E] px-3 py-1.5 text-xs font-medium hover:bg-[#25D366]/10 transition-colors"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
            </div>
          </div>
          <div className="flex border-b border-border px-5">
            {([{ key: "overview", label: "Overview" }, { key: "charges", label: "Charges" }, { key: "invoice", label: "Invoice" }] as { key: GroupModalTab; label: string }[]).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={["px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px", tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"].join(" ")}>
                {t.label}{t.key === "charges" && charges.length > 0 && <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">{charges.length}</span>}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === "overview" && (
              <div className="p-5 space-y-4">
                <Section title="Stay details">
                  <Row label="Check-in" value={group.check_in} /><Row label="Check-out" value={group.check_out} /><Row label="Guests" value={`${group.guest_count}`} />
                  {group.guest_phone && <Row label="Phone" value={group.guest_phone} />}{group.guest_email && <Row label="Email" value={group.guest_email} />}
                </Section>
                <Section title={`Rooms (${bookings.length})`}>
                  {bookings.map((b, i) => (
                    <div key={b.id} className={i > 0 ? "border-t border-border pt-2 mt-2" : ""}>
                      <div className="flex justify-between text-sm"><span className="font-medium">{roomNameMap[b.room_id] ?? "Unknown room"}</span><span className="font-medium">₹{Number(b.total_amount).toLocaleString("en-IN")}</span></div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5"><span>{b.nights} night{b.nights > 1 ? "s" : ""}</span><StatusPill status={b.status} /></div>
                    </div>
                  ))}
                </Section>
                <Section title="Payment summary">
                  <Row label="Rooms total" value={`₹${Number(group.total_amount).toLocaleString("en-IN")}`} />
                  {chargesTotal > 0 && <Row label="Extra charges" value={`₹${chargesTotal.toLocaleString("en-IN")}`} />}
                  {discount > 0 && <Row label={`Discount${group.discount_reason ? ` (${group.discount_reason})` : ""}`} value={`-₹${discount.toLocaleString("en-IN")}`} highlight="green" />}
                  {advance > 0 && <Row label="Advance paid" value={`₹${advance.toLocaleString("en-IN")}`} highlight="green" />}
                  {group.payment_reference && <Row label="Reference" value={group.payment_reference} small />}
                  <div className="border-t border-border pt-2 mt-1"><Row label="Balance due" value={balance === 0 ? "Fully paid ✓" : `₹${balance.toLocaleString("en-IN")}`} highlight={balance === 0 ? "green" : "amber"} bold /></div>
                </Section>
                {canAct && !showDiscountForm && !showPaymentForm && <button onClick={() => setShowDiscountForm(true)} className="w-full rounded-xl border border-green-200 bg-green-50/50 py-3 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors flex items-center justify-center gap-2"><Tag className="h-4 w-4" />{discount > 0 ? `Edit discount (₹${discount.toLocaleString("en-IN")})` : "Add discount"}</button>}
                {showDiscountForm && <GroupDiscountForm group={group} discount={discount} onSaved={handleSaveDiscount} onCancel={() => setShowDiscountForm(false)} />}
                {!showPaymentForm && !showDiscountForm && balance > 0 && <button onClick={() => setShowPaymentForm(true)} className="w-full rounded-xl border border-primary/30 bg-primary-light/40 py-3 text-sm font-medium text-primary hover:bg-primary-light/60 transition-colors flex items-center justify-center gap-2"><IndianRupee className="h-4 w-4" />{advance > 0 ? "Record part payment" : "Record advance payment"}</button>}
                {!showPaymentForm && !showDiscountForm && balance === 0 && <div className="w-full rounded-xl border border-primary/20 bg-primary-light/20 py-3 text-sm font-medium text-primary text-center">Fully paid ✓</div>}
                {showPaymentForm && <GroupPaymentForm group={group} advance={advance} discount={discount} chargesTotal={chargesTotal} onSaved={handleSavePayment} onCancel={() => setShowPaymentForm(false)} />}
                {group.guest_phone && (
                  <Section title="Send to guest">
                    <div className="space-y-2">
                      <WALink href={paymentReminderLink({ guestPhone: group.guest_phone, guestName: group.guest_name, totalAmount: Number(group.total_amount), advancePaid: advance, checkIn: group.check_in, propertyName: property?.name ?? "", upiId: undefined, ownerPhone, trackingUrl: guestTrackingUrl(window.location.origin, group.guest_phone) })} label="💰 Payment reminder" />
                      <WALink href={dayBeforeReminderLink({ guestPhone: group.guest_phone, guestName: group.guest_name, propertyName: property?.name ?? "", checkInTime: property?.check_in_time ?? "2:00 PM", ownerPhone })} label="🌿 Day-before reminder" />
                    </div>
                  </Section>
                )}
                {canAct && <GroupCancelButton groupId={group.id} onCancelled={() => { onRefresh(); onClose(); }} />}
              </div>
            )}
            {tab === "charges" && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-muted/50 p-3 text-center"><div className="text-xs text-muted-foreground">Rooms</div><div className="font-semibold text-sm mt-0.5">₹{Number(group.total_amount).toLocaleString("en-IN")}</div></div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center"><div className="text-xs text-muted-foreground">Extras</div><div className="font-semibold text-sm mt-0.5 text-amber-700">₹{chargesTotal.toLocaleString("en-IN")}</div></div>
                  <div className="rounded-xl bg-primary-light/40 border border-border p-3 text-center"><div className="text-xs text-muted-foreground">Balance</div><div className={`font-semibold text-sm mt-0.5 ${balance === 0 ? "text-primary" : "text-amber-700"}`}>₹{balance.toLocaleString("en-IN")}</div></div>
                </div>
                {discount > 0 && <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2 flex justify-between text-sm"><span className="text-green-800">Discount</span><span className="font-semibold text-green-700">-₹{discount.toLocaleString("en-IN")}</span></div>}
                <ChargesList charges={charges} chargesTotal={chargesTotal} groupId={group.id} onDelete={(id) => deleteGroupCharge({ id, groupId: group.id })} />
              </div>
            )}
            {tab === "invoice" && (
              <div className="p-5">
                <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 mb-4 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Group booking · {group.group_reference}</p>
                  {bookings.map((b) => (
                    <div key={b.id} className="flex justify-between text-sm"><span className="text-muted-foreground">{roomNameMap[b.room_id] ?? "Unknown room"}</span><span className="font-medium">₹{Number(b.total_amount).toLocaleString("en-IN")}</span></div>
                  ))}
                </div>
                <BookingInvoice booking={invoiceBooking} roomName={bookings.map((b) => roomNameMap[b.room_id] ?? "Unknown room").join(", ")} property={property ?? null} charges={charges} chargesTotal={chargesTotal} advance={advance} balance={balance} guestView={false} />
              </div>
            )}
          </div>
        </div>
      </div>
      {showEditGroupGuest && <EditGroupGuestModal group={group} onClose={() => setShowEditGroupGuest(false)} onSaved={() => { setShowEditGroupGuest(false); onRefresh(); }} />}
    </>
  );
}

function GroupDiscountForm({ group, discount, onSaved, onCancel }: { group: BookingGroup; discount: number; onSaved: (amount: number, reason: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(discount > 0 ? String(discount) : ""); const [reason, setReason] = useState(group.discount_reason ?? ""); const [error, setError] = useState("");
  const handleSave = () => { const amt = parseFloat(amount) || 0; if (amt < 0) { setError("Cannot be negative"); return; } if (amt > Number(group.total_amount)) { setError("Cannot exceed total"); return; } onSaved(amt, reason.trim()); };
  return (
    <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 space-y-3">
      <div className="text-sm font-medium text-green-900">{discount > 0 ? "Edit discount" : "Add discount"}</div>
      <div><label className={labelCls}>Discount amount (₹)</label><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="e.g. 1000" autoFocus /></div>
      <div><label className={labelCls}>Reason (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Group booking" /></div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2"><button onClick={onCancel} className="flex-1 rounded-full border border-border py-2 text-sm hover:bg-muted">Cancel</button><button onClick={handleSave} className="flex-1 rounded-full bg-green-600 text-white py-2 text-sm font-medium hover:opacity-90">Save</button></div>
    </div>
  );
}

function GroupPaymentForm({ group, advance, discount, chargesTotal, onSaved, onCancel }: { group: BookingGroup; advance: number; discount: number; chargesTotal: number; onSaved: (amount: number, method: string, ref: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(""); const [method, setMethod] = useState(group.payment_method ?? "UPI"); const [ref, setRef] = useState(""); const [error, setError] = useState("");
  const newPayment = parseFloat(amount) || 0; const grandTotal = Number(group.total_amount) + chargesTotal; const maxAllowed = Math.max(0, grandTotal - discount - advance); const newAdvance = advance + newPayment; const bal = Math.max(0, grandTotal - discount - newAdvance);
  const handleSave = () => { if (!newPayment || newPayment <= 0) { setError("Enter a valid amount"); return; } if (newPayment > maxAllowed) { setError(`Maximum is ₹${maxAllowed.toLocaleString("en-IN")}`); return; } onSaved(newPayment, method, ref.trim()); };
  return (
    <div className="rounded-xl border border-primary/20 bg-primary-light/20 p-4 space-y-3">
      <div className="text-sm font-medium">{advance > 0 ? "Record part payment" : "Record advance payment"}</div>
      {advance > 0 && <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between"><span className="text-muted-foreground">Already recorded</span><span className="font-medium text-primary">₹{advance.toLocaleString("en-IN")}</span></div>}
      {discount > 0 && <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-medium text-green-600">-₹{discount.toLocaleString("en-IN")}</span></div>}
      {chargesTotal > 0 && <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between"><span className="text-muted-foreground">Extra charges</span><span className="font-medium text-amber-700">+₹{chargesTotal.toLocaleString("en-IN")}</span></div>}
      <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between"><span className="text-muted-foreground">Remaining balance</span><span className="font-medium text-amber-700">₹{maxAllowed.toLocaleString("en-IN")}</span></div>
      <div><label className={labelCls}>Amount received (₹) *</label><input type="number" min={0} max={maxAllowed} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus /></div>
      <div className="grid grid-cols-2 gap-2"><div><label className={labelCls}>Method</label><select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{["UPI", "Bank Transfer", "Cash", "Cash on Arrival"].map((m) => <option key={m} value={m}>{m}</option>)}</select></div><div><label className={labelCls}>Reference</label><input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} placeholder="Optional" /></div></div>
      {newPayment > 0 && <div className="rounded-lg bg-background px-3 py-2 space-y-1"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Total paid after this</span><span className="font-semibold text-primary">₹{newAdvance.toLocaleString("en-IN")}</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Balance remaining</span><span className={`font-semibold ${bal === 0 ? "text-primary" : "text-amber-700"}`}>{bal === 0 ? "Fully paid ✓" : `₹${bal.toLocaleString("en-IN")}`}</span></div></div>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2"><button onClick={onCancel} className="flex-1 rounded-full border border-border py-2 text-sm hover:bg-muted">Cancel</button><button onClick={handleSave} className="flex-1 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90">Save</button></div>
    </div>
  );
}

function GroupCancelButton({ groupId, onCancelled }: { groupId: string; onCancelled: () => void }) {
  const [confirming, setConfirming] = useState(false); const [loading, setLoading] = useState(false); const queryClient = useQueryClient();
  const handleCancel = async () => { setLoading(true); await supabase.from("booking_groups").update({ status: "cancelled" }).eq("id", groupId); await supabase.from("bookings").update({ status: "cancelled" }).eq("group_id", groupId); queryClient.invalidateQueries({ queryKey: ["bookingGroups"], exact: false }); queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false }); onCancelled(); };
  if (!confirming) return <button onClick={() => setConfirming(true)} className="w-full rounded-xl border border-destructive/20 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">Cancel all rooms</button>;
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <p className="text-sm text-destructive font-medium">Cancel all rooms in this booking? Cannot be undone.</p>
      <div className="flex gap-2"><button onClick={() => setConfirming(false)} className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted">Keep</button><button onClick={handleCancel} disabled={loading} className="flex-1 rounded-lg bg-destructive text-white py-2 text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cancel all</button></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single booking card + detail modal
// ---------------------------------------------------------------------------

function BookingCard({ booking, roomName, onClick }: { booking: Booking; roomName: string; onClick: () => void }) {
  const discount = Number(booking.discount_amount ?? 0); const advance = Number(booking.advance_amount ?? 0); const balance = Math.max(0, Number(booking.total_amount) - discount - advance); const isActive = !["cancelled", "completed"].includes(booking.status);
  return (
    <button onClick={onClick} className="w-full text-left bg-card border border-border rounded-2xl p-4 hover:shadow-md hover:border-primary/30 transition-all active:scale-[0.99] group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0"><div className="font-semibold text-foreground truncate">{booking.guest_name}</div><div className="text-xs text-muted-foreground mt-0.5">{booking.guest_phone || <span className="italic text-amber-600">No phone — tap to edit</span>}</div></div>
        <div className="flex items-center gap-2 shrink-0"><StatusPill status={booking.status} /><ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><BedDouble className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{roomName}</span></div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5 shrink-0" /><span>{booking.guest_count} guest{booking.guest_count > 1 ? "s" : ""}</span></div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5 shrink-0" /><span>{booking.check_in}</span></div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5 shrink-0" /><span>{booking.check_out} · {booking.nights}N</span></div>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="text-xs text-muted-foreground">Total <span className="font-semibold text-foreground">₹{(Number(booking.total_amount) - discount).toLocaleString("en-IN")}</span>{discount > 0 && <span className="ml-1.5 text-green-600 font-medium">-₹{discount.toLocaleString("en-IN")} disc</span>}</div>
        {isActive && (advance > 0 ? (<div className="flex items-center gap-2"><span className="text-xs text-primary">Adv ₹{advance.toLocaleString("en-IN")}</span>{balance > 0 ? <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">₹{balance.toLocaleString("en-IN")} due</span> : <span className="text-xs font-semibold text-primary bg-primary-light/60 rounded-full px-2 py-0.5">Paid ✓</span>}</div>) : <span className="text-xs text-muted-foreground italic">No advance recorded</span>)}
      </div>
      {booking.status === "pending" && advance === 0 && booking.payment_method !== "Cash on Arrival" && (<div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 flex items-center gap-1.5"><IndianRupee className="h-3 w-3 shrink-0" />Guest may have paid — tap to record advance</div>)}
    </button>
  );
}

type ModalTab = "overview" | "charges" | "invoice";

function BookingDetailModal({ booking, roomName, rooms, property, onClose, onStatusChange, onPaymentSaved }: {
  booking: Booking; roomName: string;
  rooms: { id: string; name: string; base_price: number; extra_guest_price: number; max_guests: number }[];
  property: ReturnType<typeof useOwnerProperty>["data"]; onClose: () => void; onStatusChange: (id: string, status: string) => Promise<void>; onPaymentSaved: () => void;
}) {
  const [tab, setTab] = useState<ModalTab>("overview"); const [updating, setUpdating] = useState(false); const [showEditGuest, setShowEditGuest] = useState(false); const [showEditStay, setShowEditStay] = useState(false);
  const { data: charges = [] } = useBookingCharges(booking.id); const { mutateAsync: deleteCharge } = useDeleteCharge();
  const discount = Number(booking.discount_amount ?? 0); const advance = Number(booking.advance_amount ?? 0); const chargesTotal = charges.reduce((s, c) => s + c.qty * c.unit_price, 0); const balance = Math.max(0, Number(booking.total_amount) + chargesTotal - discount - advance);
  const ownerPhone = property?.owner_phone ?? ""; const lat = property?.location_lat; const lng = property?.location_lng; const canEditStay = !["completed", "cancelled"].includes(booking.status);
  const upiId = (() => { const entry = (property?.shared_amenities ?? []).find((a) => a.startsWith("__upi:")); return entry ? decodeURIComponent(entry.slice("__upi:".length)) : undefined; })();
  const handleStatus = async (status: string) => { setUpdating(true); await onStatusChange(booking.id, status); setUpdating(false); };
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full md:max-w-lg bg-card rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
          <div className="md:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border" /></div>
          <div className="px-5 pt-3 pb-4 border-b border-border">
            <div className="flex items-start justify-between"><div><h2 className="font-display text-lg font-semibold">{booking.guest_name}</h2><div className="flex items-center gap-2 mt-1"><StatusPill status={booking.status} /><span className="text-xs text-muted-foreground">{booking.id.slice(0, 8).toUpperCase()}</span></div></div><button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center -mt-1"><X className="h-4 w-4" /></button></div>
            <div className="flex gap-2 mt-3 flex-wrap">
              {booking.status === "pending" && <ActionChip onClick={() => handleStatus("confirmed")} loading={updating} icon={<Check className="h-3.5 w-3.5" />} label="Confirm" color="green" />}
              {booking.status === "confirmed" && <ActionChip onClick={() => handleStatus("completed")} loading={updating} icon={<LogOut className="h-3.5 w-3.5" />} label="Complete" color="amber" />}
              <button onClick={() => setShowEditGuest(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"><Pencil className="h-3.5 w-3.5" /> Edit Guest</button>
              {canEditStay && <button onClick={() => setShowEditStay(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"><Pencil className="h-3.5 w-3.5" /> Edit Stay</button>}
              <a href={telLink(booking.guest_phone)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"><Phone className="h-3.5 w-3.5" /> Call</a>
              <a href={confirmationLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", roomName, checkIn: booking.check_in, checkOut: booking.check_out, ownerPhone, trackingUrl: guestTrackingUrl(window.location.origin, booking.guest_phone) })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 bg-[#25D366]/5 text-[#128C7E] px-3 py-1.5 text-xs font-medium hover:bg-[#25D366]/10 transition-colors"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
              {lat && lng && <a href={directionsLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", lat, lng, ownerPhone })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"><MessageCircle className="h-3.5 w-3.5 text-[#25D366]" /> Directions</a>}
            </div>
          </div>
          <div className="flex border-b border-border px-5">
            {([{ key: "overview", label: "Overview" }, { key: "charges", label: "Charges" }, { key: "invoice", label: "Invoice" }] as { key: ModalTab; label: string }[]).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={["px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px", tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"].join(" ")}>
                {t.label}{t.key === "charges" && charges.length > 0 && <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">{charges.length}</span>}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === "overview" && <OverviewTab booking={booking} roomName={roomName} property={property} advance={advance} discount={discount} balance={balance} chargesTotal={chargesTotal} onPaymentSaved={onPaymentSaved} ownerPhone={ownerPhone} upiId={upiId} />}
            {tab === "charges" && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-muted/50 p-3 text-center"><div className="text-xs text-muted-foreground">Room</div><div className="font-semibold text-sm mt-0.5">₹{Number(booking.total_amount).toLocaleString("en-IN")}</div></div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-center"><div className="text-xs text-muted-foreground">Extras</div><div className="font-semibold text-sm mt-0.5 text-amber-700">₹{chargesTotal.toLocaleString("en-IN")}</div></div>
                  <div className="rounded-xl bg-primary-light/40 border border-border p-3 text-center"><div className="text-xs text-muted-foreground">Balance</div><div className={`font-semibold text-sm mt-0.5 ${balance === 0 ? "text-primary" : "text-amber-700"}`}>₹{balance.toLocaleString("en-IN")}</div></div>
                </div>
                {discount > 0 && <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-2 flex justify-between text-sm"><span className="text-green-800">Discount</span><span className="font-semibold text-green-700">-₹{discount.toLocaleString("en-IN")}</span></div>}
                <ChargesList charges={charges} chargesTotal={chargesTotal} bookingId={booking.id} onDelete={(id) => deleteCharge({ id, bookingId: booking.id })} />
              </div>
            )}
            {tab === "invoice" && <div className="p-5"><BookingInvoice booking={booking} roomName={roomName} property={property ?? null} charges={charges} chargesTotal={chargesTotal} advance={advance} balance={balance} guestView={false} /></div>}
          </div>
        </div>
      </div>
      {showEditGuest && <EditGuestModal booking={booking} onClose={() => setShowEditGuest(false)} onSaved={() => { setShowEditGuest(false); onPaymentSaved(); }} />}
      {showEditStay && <EditStayModal booking={booking} rooms={rooms} onClose={() => setShowEditStay(false)} onSaved={() => { setShowEditStay(false); onPaymentSaved(); }} />}
    </>
  );
}

function ActionChip({ onClick, loading, icon, label, color }: { onClick: () => void; loading: boolean; icon: React.ReactNode; label: string; color: "green" | "blue" | "amber" }) {
  const colors = { green: "bg-green-600 text-white hover:bg-green-700", blue: "bg-blue-600 text-white hover:bg-blue-700", amber: "bg-amber-500 text-white hover:bg-amber-600" };
  return <button onClick={onClick} disabled={loading} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${colors[color]}`}>{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}{label}</button>;
}

function EditGuestModal({ booking, onClose, onSaved }: { booking: Booking; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ guest_name: booking.guest_name ?? "", guest_phone: booking.guest_phone ?? "", guest_email: booking.guest_email ?? "", guest_count: booking.guest_count as number | string });
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const queryClient = useQueryClient(); const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError("Guest name is required"); return; }
    setSaving(true); setError("");
    try { const { error: err } = await supabase.from("bookings").update({ guest_name: form.guest_name.trim(), guest_phone: (form.guest_phone as string).trim(), guest_email: (form.guest_email as string).trim() || null, guest_count: Number(form.guest_count) || 1 }).eq("id", booking.id); if (err) throw err; queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false }); onSaved(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-card rounded-t-3xl md:rounded-2xl shadow-2xl">
        <div className="md:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border" /></div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border"><div><h2 className="font-display text-base font-semibold">Edit Guest Details</h2><p className="text-xs text-muted-foreground mt-0.5">{booking.id.slice(0, 8).toUpperCase()}</p></div><button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button></div>
        <div className="p-5 space-y-3">
          <div><label className={labelCls}>Guest name *</label><input value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} className={inputCls} placeholder="Full name" autoFocus /></div>
          <div><label className={labelCls}>Phone</label><input type="tel" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)} className={inputCls} placeholder="+91 98765 43210" /></div>
          <div><label className={labelCls}>Email</label><input type="email" value={form.guest_email} onChange={(e) => set("guest_email", e.target.value)} className={inputCls} placeholder="guest@email.com" /></div>
          <div><label className={labelCls}>Number of guests</label><input type="number" min={1} max={20} value={form.guest_count} onChange={(e) => set("guest_count", e.target.value === "" ? "" : parseInt(e.target.value) || 1)} className={inputCls} /></div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1"><button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button><button onClick={handleSave} disabled={saving} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save</button></div>
        </div>
      </div>
    </div>
  );
}

function EditStayModal({ booking, rooms, onClose, onSaved }: {
  booking: Booking;
  rooms: { id: string; name: string; base_price: number; extra_guest_price: number; max_guests: number }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ room_id: booking.room_id ?? rooms[0]?.id ?? "", check_in: booking.check_in ?? "", check_out: booking.check_out ?? "", guest_count: booking.guest_count as number | string });
  const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const queryClient = useQueryClient(); const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const nights = useMemo(() => { if (!form.check_in || !form.check_out) return 0; return Math.max(0, (new Date(form.check_out as string).getTime() - new Date(form.check_in as string).getTime()) / 86400000); }, [form.check_in, form.check_out]);
  const selectedRoom = rooms.find((r) => r.id === form.room_id);
  const guestCount = Number(form.guest_count) || 1;
  const newTotal = useMemo(() => {
    if (!selectedRoom || nights === 0) return 0;
    const roomCost = selectedRoom.base_price * nights;
    // FIX: extra charge above room.max_guests, not hardcoded 2
    const extraCharge = Math.max(0, guestCount - selectedRoom.max_guests) * (selectedRoom.extra_guest_price ?? 0) * nights;
    return roomCost + extraCharge;
  }, [selectedRoom, nights, guestCount]);
  const hasChanges = form.room_id !== booking.room_id || form.check_in !== booking.check_in || form.check_out !== booking.check_out || guestCount !== booking.guest_count;
  const handleSave = async () => {
    if (nights <= 0) { setError("Check-out must be after check-in"); return; }
    setSaving(true); setError("");
    try {
      const roomCost = (selectedRoom?.base_price ?? 0) * nights;
      // FIX: extra charge above room.max_guests
      const extraCharge = Math.max(0, guestCount - (selectedRoom?.max_guests ?? 2)) * (selectedRoom?.extra_guest_price ?? 0) * nights;
      const { error: err } = await supabase.from("bookings").update({ room_id: form.room_id, check_in: form.check_in, check_out: form.check_out, guest_count: guestCount, room_price: roomCost, extra_guest_charge: extraCharge, total_amount: newTotal }).eq("id", booking.id);
      if (err) throw err;
      queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false }); onSaved();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-card rounded-t-3xl md:rounded-2xl shadow-2xl">
        <div className="md:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-border" /></div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border"><div><h2 className="font-display text-base font-semibold">Edit Stay Details</h2><p className="text-xs text-muted-foreground mt-0.5">Total will be recalculated</p></div><button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button></div>
        <div className="p-5 space-y-3">
          <div><label className={labelCls}>Room</label><select value={form.room_id} onChange={(e) => set("room_id", e.target.value)} className={inputCls}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name} — ₹{r.base_price.toLocaleString("en-IN")}/night · {r.max_guests} guests included</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className={labelCls}>Check-in</label><input type="date" value={form.check_in as string} onChange={(e) => set("check_in", e.target.value)} className={inputCls} /></div><div><label className={labelCls}>Check-out</label><input type="date" value={form.check_out as string} onChange={(e) => set("check_out", e.target.value)} className={inputCls} /></div></div>
          <div><label className={labelCls}>Number of guests</label><input type="number" min={1} max={20} value={form.guest_count} onChange={(e) => set("guest_count", e.target.value === "" ? "" : parseInt(e.target.value) || 1)} className={inputCls} /></div>
          {nights > 0 && selectedRoom && (
            <div className="rounded-xl border border-border p-3 space-y-1">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{nights}N · room</span><span>₹{(selectedRoom.base_price * nights).toLocaleString("en-IN")}</span></div>
              {guestCount > selectedRoom.max_guests && <div className="flex justify-between text-sm text-muted-foreground"><span>{guestCount - selectedRoom.max_guests} extra guest{guestCount - selectedRoom.max_guests > 1 ? "s" : ""}</span><span>₹{(Math.max(0, guestCount - selectedRoom.max_guests) * (selectedRoom.extra_guest_price ?? 0) * nights).toLocaleString("en-IN")}</span></div>}
              <div className="flex justify-between text-sm font-semibold text-primary border-t border-border pt-1 mt-1"><span>New total</span><span>₹{newTotal.toLocaleString("en-IN")}</span></div>
            </div>
          )}
          {Number(booking.advance_amount) > 0 && hasChanges && nights > 0 && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">⚠️ Advance of ₹{Number(booking.advance_amount).toLocaleString("en-IN")} already recorded. New balance will be ₹{Math.max(0, newTotal - Number(booking.discount_amount ?? 0) - Number(booking.advance_amount)).toLocaleString("en-IN")}.</div>}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1"><button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button><button onClick={handleSave} disabled={saving || !hasChanges} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save changes</button></div>
        </div>
      </div>
    </div>
  );
}

function DiscountForm({ booking, discount, onSaved, onCancel }: { booking: Booking; discount: number; onSaved: () => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(discount > 0 ? String(discount) : ""); const [reason, setReason] = useState(booking.discount_reason ?? ""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const handleSave = async () => { const amt = parseFloat(amount) || 0; if (amt < 0) { setError("Cannot be negative"); return; } if (amt > Number(booking.total_amount)) { setError("Cannot exceed total"); return; } setSaving(true); setError(""); try { const { error: err } = await supabase.from("bookings").update({ discount_amount: amt, discount_reason: reason.trim() || null }).eq("id", booking.id); if (err) throw err; queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false }); onSaved(); } catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); } };
  const handleRemove = async () => { setSaving(true); await supabase.from("bookings").update({ discount_amount: 0, discount_reason: null }).eq("id", booking.id); queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false }); onSaved(); };
  return (
    <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 space-y-3">
      <div className="text-sm font-medium text-green-900">{discount > 0 ? "Edit discount" : "Add discount"}</div>
      <div><label className={labelCls}>Discount amount (₹)</label><input type="number" min={0} max={Number(booking.total_amount)} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="e.g. 500" autoFocus /></div>
      <div><label className={labelCls}>Reason (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} placeholder="e.g. Regular guest" /></div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">{discount > 0 && <button onClick={handleRemove} disabled={saving} className="px-3 rounded-full border border-destructive/30 text-destructive text-xs py-2 hover:bg-destructive/5 disabled:opacity-50">Remove</button>}<button onClick={onCancel} className="flex-1 rounded-full border border-border py-2 text-sm hover:bg-muted">Cancel</button><button onClick={handleSave} disabled={saving} className="flex-1 rounded-full bg-green-600 text-white py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save</button></div>
    </div>
  );
}

function OverviewTab({ booking, roomName, property, advance, discount, balance, chargesTotal, onPaymentSaved, ownerPhone, upiId }: {
  booking: Booking; roomName: string; property: ReturnType<typeof useOwnerProperty>["data"]; advance: number; discount: number; balance: number; chargesTotal: number; onPaymentSaved: () => void; ownerPhone: string; upiId?: string;
}) {
  const [showPaymentForm, setShowPaymentForm] = useState(false); const [showDiscountForm, setShowDiscountForm] = useState(false);
  return (
    <div className="p-5 space-y-4">
      <Section title="Stay details">
        <Row label="Room" value={roomName} /><Row label="Check-in" value={booking.check_in} /><Row label="Check-out" value={booking.check_out} /><Row label="Nights" value={`${booking.nights}`} /><Row label="Guests" value={`${booking.guest_count}`} />
        {booking.guest_phone && <Row label="Phone" value={booking.guest_phone} />}{booking.guest_email && <Row label="Email" value={booking.guest_email} />}
        {booking.payment_method && <Row label="Payment method" value={booking.payment_method} />}
        {booking.checked_in_at && <Row label="Checked in at" value={new Date(booking.checked_in_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />}
        {booking.checked_out_at && <Row label="Checked out at" value={new Date(booking.checked_out_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} />}
      </Section>
      <Section title="Payment summary">
        <Row label="Room total" value={`₹${Number(booking.total_amount).toLocaleString("en-IN")}`} />
        {chargesTotal > 0 && <Row label="Extra charges" value={`₹${chargesTotal.toLocaleString("en-IN")}`} />}
        {discount > 0 && <Row label={`Discount${booking.discount_reason ? ` (${booking.discount_reason})` : ""}`} value={`-₹${discount.toLocaleString("en-IN")}`} highlight="green" />}
        {advance > 0 && <Row label="Advance paid" value={`₹${advance.toLocaleString("en-IN")}`} highlight="green" />}
        {booking.payment_reference && <Row label="Reference" value={booking.payment_reference} small />}
        <div className="border-t border-border pt-2 mt-1"><Row label="Balance due" value={balance === 0 ? "Fully paid ✓" : `₹${balance.toLocaleString("en-IN")}`} highlight={balance === 0 ? "green" : "amber"} bold /></div>
      </Section>
      {!showDiscountForm && !showPaymentForm && !["cancelled", "completed"].includes(booking.status) && <button onClick={() => setShowDiscountForm(true)} className="w-full rounded-xl border border-green-200 bg-green-50/50 py-3 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors flex items-center justify-center gap-2"><Tag className="h-4 w-4" />{discount > 0 ? `Edit discount (₹${discount.toLocaleString("en-IN")})` : "Add discount"}</button>}
      {showDiscountForm && <DiscountForm booking={booking} discount={discount} onSaved={() => { setShowDiscountForm(false); onPaymentSaved(); }} onCancel={() => setShowDiscountForm(false)} />}
      {!showPaymentForm && !showDiscountForm && balance > 0 && <button onClick={() => setShowPaymentForm(true)} className="w-full rounded-xl border border-primary/30 bg-primary-light/40 py-3 text-sm font-medium text-primary hover:bg-primary-light/60 transition-colors flex items-center justify-center gap-2"><IndianRupee className="h-4 w-4" />{advance > 0 ? "Record part payment" : "Record advance payment"}</button>}
      {!showPaymentForm && !showDiscountForm && balance === 0 && <div className="w-full rounded-xl border border-primary/20 bg-primary-light/20 py-3 text-sm font-medium text-primary text-center">Fully paid ✓</div>}
      {showPaymentForm && <RecordPaymentForm booking={booking} advance={advance} discount={discount} chargesTotal={chargesTotal} onSaved={() => { setShowPaymentForm(false); onPaymentSaved(); }} onCancel={() => setShowPaymentForm(false)} />}
      <Section title="Send to guest">
        <div className="space-y-2">
          <WALink href={paymentReminderLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, totalAmount: Number(booking.total_amount), advancePaid: Number(booking.advance_amount ?? 0), checkIn: booking.check_in, propertyName: property?.name ?? "", upiId, ownerPhone, trackingUrl: guestTrackingUrl(window.location.origin, booking.guest_phone) })} label="💰 Payment reminder" />
          <WALink href={dayBeforeReminderLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property?.name ?? "", checkInTime: property?.check_in_time ?? "2:00 PM", ownerPhone })} label="🌿 Day-before reminder" />
        </div>
      </Section>
      {!["cancelled", "completed"].includes(booking.status) && <CancelButton bookingId={booking.id} onCancelled={onPaymentSaved} />}
    </div>
  );
}

function WALink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted transition-colors"><MessageCircle className="h-4 w-4 text-[#25D366]" />{label}</a>;
}

function CancelButton({ bookingId, onCancelled }: { bookingId: string; onCancelled: () => void }) {
  const [confirming, setConfirming] = useState(false); const [loading, setLoading] = useState(false); const queryClient = useQueryClient();
  const handleCancel = async () => { setLoading(true); const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", bookingId); if (!error) { queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false }); } setLoading(false); onCancelled(); };
  if (!confirming) return <button onClick={() => setConfirming(true)} className="w-full rounded-xl border border-destructive/20 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">Cancel booking</button>;
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
      <p className="text-sm text-destructive font-medium">Are you sure? This cannot be undone.</p>
      <div className="flex gap-2"><button onClick={() => setConfirming(false)} className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-muted">Keep</button><button onClick={handleCancel} disabled={loading} className="flex-1 rounded-lg bg-destructive text-white py-2 text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">{loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Cancel</button></div>
    </div>
  );
}

function RecordPaymentForm({ booking, advance, discount, chargesTotal, onSaved, onCancel }: { booking: Booking; advance: number; discount: number; chargesTotal: number; onSaved: () => void; onCancel: () => void }) {
  const suggested = Math.round(Number(booking.total_amount) * 0.25);
  const [amount, setAmount] = useState(""); const [method, setMethod] = useState(booking.payment_method ?? "UPI"); const [ref, setRef] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const queryClient = useQueryClient(); const grandTotal = Number(booking.total_amount) + chargesTotal; const newPayment = parseFloat(amount) || 0; const newAdvanceTotal = advance + newPayment; const maxAllowed = Math.max(0, grandTotal - discount - advance); const bal = Math.max(0, grandTotal - discount - newAdvanceTotal);
  const handleSave = async () => {
    if (!newPayment || newPayment <= 0) { setError("Enter a valid amount"); return; }
    if (newPayment > maxAllowed) { setError(maxAllowed <= 0 ? "Already fully paid" : `Maximum is ₹${maxAllowed.toLocaleString("en-IN")}`); return; }
    setSaving(true); setError("");
    try { const { error: err } = await supabase.from("bookings").update({ advance_amount: newAdvanceTotal, payment_method: method, ...(ref.trim() ? { payment_reference: ref.trim() } : {}), is_paid: newAdvanceTotal >= grandTotal - discount, status: booking.status === "pending" ? "confirmed" : booking.status }).eq("id", booking.id); if (err) throw err; queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false }); onSaved(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };
  return (
    <div className="rounded-xl border border-primary/20 bg-primary-light/20 p-4 space-y-3">
      <div className="text-sm font-medium">{advance > 0 ? "Record part payment" : "Record advance payment"}</div>
      {advance > 0 && <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between"><span className="text-muted-foreground">Already recorded</span><span className="font-medium text-primary">₹{advance.toLocaleString("en-IN")}</span></div>}
      {discount > 0 && <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-medium text-green-600">-₹{discount.toLocaleString("en-IN")}</span></div>}
      {chargesTotal > 0 && <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between"><span className="text-muted-foreground">Extra charges</span><span className="font-medium text-amber-700">+₹{chargesTotal.toLocaleString("en-IN")}</span></div>}
      <div className="text-xs text-muted-foreground bg-background rounded-lg px-3 py-2 flex justify-between"><span>Suggested (25%)</span><span className="font-medium">₹{suggested.toLocaleString("en-IN")}</span></div>
      <div className="text-xs bg-background rounded-lg px-3 py-2 flex justify-between"><span className="text-muted-foreground">Remaining balance</span><span className="font-medium text-amber-700">₹{maxAllowed.toLocaleString("en-IN")}</span></div>
      <div><label className={labelCls}>{advance > 0 ? "New payment (₹) *" : "Amount received (₹) *"}</label><input type="number" min={0} max={maxAllowed} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} autoFocus /></div>
      <div className="grid grid-cols-2 gap-2"><div><label className={labelCls}>Method</label><select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>{["UPI", "Bank Transfer", "Cash", "Cash on Arrival"].map((m) => <option key={m} value={m}>{m}</option>)}</select></div><div><label className={labelCls}>Reference</label><input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} placeholder="Optional" /></div></div>
      {newPayment > 0 && <div className="rounded-lg bg-background px-3 py-2 space-y-1"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Total paid after this</span><span className="font-semibold text-primary">₹{newAdvanceTotal.toLocaleString("en-IN")}</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Balance remaining</span><span className={`font-semibold ${bal === 0 ? "text-primary" : "text-amber-700"}`}>{bal === 0 ? "Fully paid ✓" : `₹${bal.toLocaleString("en-IN")}`}</span></div></div>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2"><button onClick={onCancel} className="flex-1 rounded-full border border-border py-2 text-sm hover:bg-muted">Cancel</button><button onClick={handleSave} disabled={saving} className="flex-1 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save</button></div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><div className="text-xs uppercase tracking-wider font-medium text-muted-foreground">{title}</div><div className="bg-muted/30 rounded-xl border border-border px-4 py-3 space-y-2">{children}</div></div>;
}

function Row({ label, value, highlight, bold, small }: { label: string; value: string; highlight?: "green" | "amber"; bold?: boolean; small?: boolean }) {
  const valColor = highlight === "green" ? "text-primary" : highlight === "amber" ? "text-amber-700" : "text-foreground";
  return <div className={`flex justify-between items-center ${small ? "text-xs" : "text-sm"}`}><span className="text-muted-foreground">{label}</span><span className={`${valColor} ${bold ? "font-semibold" : "font-medium"}`}>{value}</span></div>;
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

function BookingsAdmin() {
  const { data: property } = useOwnerProperty();
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings(property?.id ?? "");
  const { data: groups = [], isLoading: groupsLoading } = useBookingGroups(property?.id ?? "");
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [activeGroup, setActiveGroup] = useState<BookingGroup | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [q, setQ] = useState("");
  const [hideCancelled, setHideCancelled] = useState(true);

  const rooms = (property?.rooms ?? []).filter((r) => r.is_active);
  const roomNameMap = useMemo(() => { const map: Record<string, string> = {}; (property?.rooms ?? []).forEach((r) => { map[r.id] = r.name; }); return map; }, [property]);

  const groupBookingIds = useMemo(() => { const ids = new Set<string>(); groups.forEach((g) => (g.bookings ?? []).forEach((b) => ids.add(b.id))); return ids; }, [groups]);
  const standaloneBookings = useMemo(() => bookings.filter((b) => !groupBookingIds.has(b.id)), [bookings, groupBookingIds]);

  const filteredStandalone = useMemo(() => standaloneBookings.filter((b) => {
    const viewingCancelled = filterStatus === "cancelled";
    if (!viewingCancelled && hideCancelled && b.status === "cancelled") return false;
    if (filterStatus !== "all" && b.status !== filterStatus) return false;
    if (q && !`${b.guest_name} ${b.guest_phone}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [standaloneBookings, filterStatus, q, hideCancelled]);

  const filteredGroups = useMemo(() => groups.filter((g) => {
    const viewingCancelled = filterStatus === "cancelled";
    if (!viewingCancelled && hideCancelled && g.status === "cancelled") return false;
    if (filterStatus !== "all" && g.status !== filterStatus) return false;
    if (q && !`${g.guest_name} ${g.guest_phone}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [groups, filterStatus, q, hideCancelled]);

  const stats = useMemo(() => {
    const activeStandalone = standaloneBookings.filter((b) => !["cancelled", "completed"].includes(b.status));
    const activeGroups = groups.filter((g) => !["cancelled", "completed"].includes(g.status));
    const outstandingStandalone = activeStandalone.reduce((s, b) => s + Math.max(0, Number(b.total_amount) - Number(b.discount_amount ?? 0) - Number(b.advance_amount ?? 0)), 0);
    const outstandingGroups = activeGroups.reduce((s, g) => s + Math.max(0, Number(g.total_amount) - Number(g.discount_amount ?? 0) - Number(g.advance_amount ?? 0)), 0);
    return { active: activeStandalone.length + activeGroups.length, outstanding: outstandingStandalone + outstandingGroups };
  }, [standaloneBookings, groups]);

  const updateStatus = async (id: string, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "completed") updates.checked_out_at = new Date().toISOString();
    await supabase.from("bookings").update(updates).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id], exact: false });
    setActiveBooking((prev) => prev?.id === id ? { ...prev, status: newStatus as BookingStatus, ...updates } : prev);
    if (newStatus === "confirmed" && property) {
      const booking = bookings.find((b) => b.id === id);
      if (booking) {
        const waUrl = confirmationLink({ guestPhone: booking.guest_phone, guestName: booking.guest_name, propertyName: property.name, roomName: roomNameMap[booking.room_id] ?? "your room", checkIn: booking.check_in, checkOut: booking.check_out, ownerPhone: property.owner_phone ?? "", trackingUrl: guestTrackingUrl(window.location.origin, booking.guest_phone) });
        const a = document.createElement("a"); a.href = waUrl; a.target = "_blank"; a.rel = "noreferrer"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    }
  };

  const handleCancelAndClose = () => { handleRefresh(); setActiveBooking(null); };
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id], exact: false });
    queryClient.invalidateQueries({ queryKey: ["bookingGroups", property?.id], exact: false });
  };

  const isLoading = bookingsLoading || groupsLoading;
  const totalItems = filteredGroups.length + filteredStandalone.length;

  if (isLoading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />)}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="font-display text-2xl md:text-3xl font-semibold">Bookings</h1><p className="text-sm text-muted-foreground">Tap any booking to view details.</p></div>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"><Plus className="h-4 w-4" /> Add</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-primary-light flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5 text-primary" /></div><div><div className="text-xs text-muted-foreground">Active</div><div className="font-display text-2xl font-semibold">{stats.active}</div></div></div>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><IndianRupee className="h-5 w-5 text-amber-600" /></div><div><div className="text-xs text-muted-foreground">Outstanding</div><div className="font-display text-xl font-semibold text-amber-700">₹{stats.outstanding.toLocaleString("en-IN")}</div></div></div>
      </div>

      <div className="space-y-2">
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guest or phone…" className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm" /></div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)} className={["shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors", filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:bg-muted"].join(" ")}>
              {s === "all" ? "All" : (STATUS_CONFIG[s]?.label ?? s)}
            </button>
          ))}
        </div>
        {filterStatus !== "cancelled" && (
          <button onClick={() => setHideCancelled((v) => !v)} className={["self-start text-xs px-3 py-1.5 rounded-full border font-medium transition-colors", hideCancelled ? "bg-muted border-border text-muted-foreground" : "bg-red-50 border-red-200 text-red-600"].join(" ")}>
            {hideCancelled ? "Show cancelled" : "Hide cancelled"}
          </button>
        )}
      </div>

      {totalItems === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">No bookings match these filters.</div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((g) => <GroupBookingCard key={g.id} group={g as BookingGroup} roomNameMap={roomNameMap} onClick={() => setActiveGroup(g as BookingGroup)} />)}
          {filteredStandalone.map((b) => <BookingCard key={b.id} booking={b as Booking} roomName={roomNameMap[b.room_id] ?? "Unknown room"} onClick={() => setActiveBooking(b as Booking)} />)}
        </div>
      )}

      {showAdd && property && <AddGroupBookingModal propertyId={property.id} rooms={rooms} onClose={() => setShowAdd(false)} onSaved={() => { handleRefresh(); setShowAdd(false); }} />}
      {activeBooking && <BookingDetailModal booking={activeBooking} roomName={roomNameMap[activeBooking.room_id] ?? "Unknown room"} rooms={rooms} property={property} onClose={() => setActiveBooking(null)} onStatusChange={updateStatus} onPaymentSaved={handleCancelAndClose} />}
      {activeGroup && <GroupBookingDetailModal group={activeGroup} roomNameMap={roomNameMap} property={property} onClose={() => setActiveGroup(null)} onRefresh={handleRefresh} />}
    </div>
  );
}
