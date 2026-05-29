import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  propertyId: string;
  rooms: { id: string; name: string; base_price: number; max_guests: number }[];
  onClose: () => void;
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export function AddBookingModal({ propertyId, rooms, onClose }: Props) {
  const qc = useQueryClient();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [paymentRef, setPaymentRef] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [status, setStatus] = useState<"confirmed" | "pending">("confirmed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const room = rooms.find((r) => r.id === roomId);

  // Derive nights + total from selected dates and room
  const nights = (() => {
    if (!checkIn || !checkOut) return 0;
    const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000;
    return Math.max(0, diff);
  })();

  const extraGuests = Math.max(0, guestCount - 2); // assume 2 base guests
  const roomPrice = (room?.base_price ?? 0) * nights;
  const extraCharge = extraGuests * 300 * nights; // ₹300/extra guest — adjust if you have extra_guest_price on the room
  const total = roomPrice + extraCharge;

  const handleSave = async () => {
    if (!guestName.trim() || !guestPhone.trim() || !checkIn || !checkOut || nights <= 0) {
      setError("Fill in guest name, phone, and valid check-in / check-out dates.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase.from("bookings").insert({
        property_id: propertyId,
        room_id: roomId,
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim(),
        guest_email: guestEmail.trim() || null,
        guest_count: guestCount,
        check_in: checkIn,
        check_out: checkOut,
        room_price: roomPrice,
        extra_guest_charge: extraCharge,
        total_amount: total,
        status,
        payment_method: paymentMethod,
        payment_reference: paymentRef.trim() || null,
        is_paid: isPaid,
      });
      if (err) throw err;
      qc.invalidateQueries({ queryKey: ["bookings"], exact: false });
      setDone(true);
      setTimeout(onClose, 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Add booking</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Room */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Room
            </label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className={`mt-1.5 ${inputCls}`}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Check-in
              </label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className={`mt-1.5 ${inputCls}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Check-out
              </label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className={`mt-1.5 ${inputCls}`}
              />
            </div>
          </div>

          {/* Guest details */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Guest name
            </label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Full name"
              className={`mt-1.5 ${inputCls}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Phone
              </label>
              <input
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="+91 …"
                className={`mt-1.5 ${inputCls}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Guests
              </label>
              <input
                type="number"
                min={1}
                max={room?.max_guests ?? 10}
                value={guestCount}
                onChange={(e) => setGuestCount(Number(e.target.value))}
                className={`mt-1.5 ${inputCls}`}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Email (optional)
            </label>
            <input
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="guest@example.com"
              className={`mt-1.5 ${inputCls}`}
            />
          </div>

          {/* Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "confirmed" | "pending")}
                className={`mt-1.5 ${inputCls}`}
              >
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Payment
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={`mt-1.5 ${inputCls}`}
              >
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Payment reference (optional)
            </label>
            <input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="UPI txn ID / ref"
              className={`mt-1.5 ${inputCls}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPaid"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              className="rounded border-border accent-primary"
            />
            <label htmlFor="isPaid" className="text-sm">
              Mark as paid
            </label>
          </div>

          {/* Amount summary */}
          {nights > 0 && (
            <div className="rounded-xl bg-primary-light/60 border border-border p-4 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Room ({nights} night{nights !== 1 ? "s" : ""})
                </span>
                <span>₹{roomPrice.toLocaleString("en-IN")}</span>
              </div>
              {extraCharge > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Extra guests ({extraGuests} × ₹300)</span>
                  <span>₹{extraCharge.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                <span>Total</span>
                <span>₹{total.toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-full border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || done}
            className="px-5 py-2 text-sm rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {done ? "Added ✓" : "Add booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
