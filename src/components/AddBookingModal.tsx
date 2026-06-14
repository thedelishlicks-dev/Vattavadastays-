import { useState, useMemo } from "react";
import { Plus, Loader2, X, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import type { BookingStatus } from "@/types/database";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

interface Room {
  id: string;
  name: string;
  base_price: number;
  extra_guest_price: number;
}

interface AddBookingModalProps {
  propertyId: string;
  rooms: Room[];
  onClose: () => void;
  onSaved?: () => void;
}

export function AddBookingModal({ propertyId, rooms, onClose, onSaved }: AddBookingModalProps) {
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
  };

  const guestCount = Number(form.guest_count) || 1;
  const selectedRooms = rooms.filter((r) => selectedRoomIds.includes(r.id));

  const roomTotals = useMemo(() => selectedRooms.map((r) => {
    const base = r.base_price * nights;
    const extra = Math.max(0, guestCount - 2) * (r.extra_guest_price ?? 0) * nights;
    return { room: r, roomPrice: base, extraCharge: extra, total: base + extra };
  }), [selectedRooms, nights, guestCount]);

  const grandTotal = roomTotals.reduce((s, r) => s + r.total, 0);

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError("Guest name is required"); return; }
    if (nights <= 0) { setError("Check-out must be after check-in"); return; }
    if (selectedRoomIds.length === 0) { setError("Select at least one room"); return; }
    setSaving(true);
    setError("");
    try {
      if (selectedRoomIds.length === 1) {
        const rt = roomTotals[0];
        const { error: err } = await supabase.from("bookings").insert({
          property_id: propertyId, room_id: rt.room.id,
          guest_name: form.guest_name, guest_phone: form.guest_phone,
          guest_email: form.guest_email || null, guest_count: guestCount,
          check_in: form.check_in, check_out: form.check_out,
          room_price: rt.roomPrice, extra_guest_charge: rt.extraCharge,
          total_amount: rt.total, advance_amount: 0, discount_amount: 0,
          status: form.status, is_paid: false,
        });
        if (err) throw err;
      } else {
        const { data: groupData, error: groupErr } = await supabase
          .from("booking_groups")
          .insert({
            property_id: propertyId,
            group_reference: "GRP-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
            guest_name: form.guest_name, guest_phone: form.guest_phone,
            guest_email: form.guest_email || null, guest_count: guestCount,
            check_in: form.check_in, check_out: form.check_out,
            total_amount: grandTotal, advance_amount: 0, discount_amount: 0,
            status: form.status, is_paid: false,
          })
          .select()
          .single();
        if (groupErr) throw groupErr;
        const bookingInserts = roomTotals.map((rt) => ({
          property_id: propertyId, room_id: rt.room.id,
          guest_name: form.guest_name, guest_phone: form.guest_phone,
          guest_email: form.guest_email || null, guest_count: guestCount,
          check_in: form.check_in, check_out: form.check_out,
          room_price: rt.roomPrice, extra_guest_charge: rt.extraCharge,
          total_amount: rt.total, advance_amount: 0, discount_amount: 0,
          status: form.status, is_paid: false, group_id: groupData.id,
        }));
        const { error: bookErr } = await supabase.from("bookings").insert(bookingInserts);
        if (bookErr) throw bookErr;
      }
      queryClient.invalidateQueries({ queryKey: ["bookings", propertyId], exact: false });
      queryClient.invalidateQueries({ queryKey: ["bookingGroups", propertyId], exact: false });
      onSaved?.();
      onClose();
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
          {/* Guest details */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Guest details</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Guest name *</label><input value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} className={inputCls} placeholder="Full name" /></div>
              <div><label className={labelCls}>Phone</label><input type="tel" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)} className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>Email</label><input type="email" value={form.guest_email} onChange={(e) => set("guest_email", e.target.value)} className={inputCls} placeholder="Optional" /></div>
          </div>

          {/* Stay dates */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stay dates</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Check-in</label><input type="date" value={form.check_in} onChange={(e) => set("check_in", e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Check-out</label><input type="date" value={form.check_out} onChange={(e) => set("check_out", e.target.value)} className={inputCls} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Total guests</label><input type="number" min={1} max={50} value={form.guest_count} onChange={(e) => set("guest_count", e.target.value === "" ? "" : parseInt(e.target.value) || 1)} className={inputCls} /></div>
              <div><label className={labelCls}>Status</label><select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>{["pending", "confirmed"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
            </div>
          </div>

          {/* Room selection */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select rooms <span className="normal-case text-primary font-normal">(tap to add/remove)</span></p>
            <div className="space-y-2">
              {rooms.map((r) => {
                const selected = selectedRoomIds.includes(r.id);
                const roomTotal = nights > 0 ? (r.base_price + Math.max(0, guestCount - 2) * (r.extra_guest_price ?? 0)) * nights : 0;
                return (
                  <button key={r.id} type="button" onClick={() => toggleRoom(r.id)} className={["w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all", selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"].join(" ")}>
                    <div className={["h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors", selected ? "border-primary bg-primary" : "border-border"].join(" ")}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">₹{r.base_price.toLocaleString("en-IN")}/night{r.extra_guest_price > 0 ? ` · +₹${r.extra_guest_price}/extra guest` : ""}</div>
                    </div>
                    {selected && nights > 0 && <div className="text-sm font-semibold text-primary shrink-0">₹{roomTotal.toLocaleString("en-IN")}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          {nights > 0 && selectedRooms.length > 0 && (
            <div className="rounded-xl bg-primary-light/40 border border-border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{selectedRooms.length} room{selectedRooms.length > 1 ? "s" : ""} · {nights} night{nights > 1 ? "s" : ""}</p>
              {roomTotals.map((rt) => (
                <div key={rt.room.id} className="flex justify-between text-sm"><span className="text-muted-foreground truncate mr-2">{rt.room.name}</span><span className="font-medium shrink-0">₹{rt.total.toLocaleString("en-IN")}</span></div>
              ))}
              {selectedRooms.length > 1 && (
                <div className="flex justify-between text-sm font-semibold text-primary border-t border-border pt-2 mt-1"><span>Total</span><span>₹{grandTotal.toLocaleString("en-IN")}</span></div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {selectedRoomIds.length > 1 ? `Book ${selectedRoomIds.length} rooms` : "Add booking"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
