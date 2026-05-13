import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import { Search, Phone, MessageCircle, Check, X, Plus, Loader2, ChevronDown } from "lucide-react";
import { StatusPill, PaymentPill } from "@/admin/components";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings } from "@/hooks/useBookings";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import {
  confirmationLink,
  directionsLink,
  paymentReminderLink,
  dayBeforeReminderLink,
} from "@/lib/whatsapp";
import type { Booking } from "@/types/database";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsAdmin,
});

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
const STATUSES: ("all" | BookingStatus)[] = ["all", "pending", "confirmed", "completed", "cancelled"];

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

type BookingForm = {
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  room_id: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  payment_method: string;
  is_paid: boolean;
  status: BookingStatus;
};

const emptyBookingForm = (): BookingForm => ({
  guest_name: "",
  guest_phone: "",
  guest_email: "",
  room_id: "",
  check_in: "",
  check_out: "",
  guest_count: 2,
  payment_method: "Cash on Arrival",
  is_paid: false,
  status: "confirmed",
});

function AddBookingModal({
  propertyId,
  rooms,
  onClose,
  onSaved,
}: {
  propertyId: string;
  rooms: { id: string; name: string; base_price: number; extra_guest_price: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BookingForm>({
    ...emptyBookingForm(),
    room_id: rooms[0]?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof BookingForm, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const selectedRoom = rooms.find((r) => r.id === form.room_id);

  const nights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0;
    const diff =
      (new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) /
      86400000;
    return Math.max(0, diff);
  }, [form.check_in, form.check_out]);

  const total = useMemo(() => {
    if (!selectedRoom || nights === 0) return 0;
    const extra = Math.max(0, form.guest_count - 2) * (selectedRoom.extra_guest_price ?? 0);
    return (selectedRoom.base_price + extra) * nights;
  }, [selectedRoom, nights, form.guest_count]);

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError("Guest name is required"); return; }
    if (!form.guest_phone.trim()) { setError("Phone is required"); return; }
    if (!form.room_id) { setError("Select a room"); return; }
    if (!form.check_in || !form.check_out) { setError("Check-in and check-out dates required"); return; }
    if (nights <= 0) { setError("Check-out must be after check-in"); return; }

    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase.from("bookings").insert({
        property_id: propertyId,
        room_id: form.room_id,
        guest_name: form.guest_name,
        guest_phone: form.guest_phone,
        guest_email: form.guest_email || null,
        guest_count: form.guest_count,
        check_in: form.check_in,
        check_out: form.check_out,
        room_price: selectedRoom?.base_price ?? 0,
        extra_guest_charge: Math.max(0, form.guest_count - 2) * (selectedRoom?.extra_guest_price ?? 0),
        total_amount: total,
        payment_method: form.payment_method,
        is_paid: form.is_paid,
        status: form.status,
      });
      if (err) throw err;
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-card rounded-t-2xl md:rounded-2xl shadow-xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Add Booking</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Guest name *</label>
              <input value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)}
                className={inputCls} placeholder="Full name" />
            </div>
            <div>
              <label className={labelCls}>Phone *</label>
              <input type="tel" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)}
                className={inputCls} placeholder="+91 98765 43210" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.guest_email} onChange={(e) => set("guest_email", e.target.value)}
              className={inputCls} placeholder="optional" />
          </div>

          <div>
            <label className={labelCls}>Room *</label>
            <select value={form.room_id} onChange={(e) => set("room_id", e.target.value)} className={inputCls}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — ₹{r.base_price.toLocaleString("en-IN")}/night
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Check-in *</label>
              <input type="date" value={form.check_in} onChange={(e) => set("check_in", e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Check-out *</label>
              <input type="date" value={form.check_out} onChange={(e) => set("check_out", e.target.value)}
                className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Number of guests</label>
            <input type="number" min={1} max={20} value={form.guest_count}
              onChange={(e) => set("guest_count", parseInt(e.target.value) || 1)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value as BookingStatus)} className={inputCls}>
                {(["pending", "confirmed", "completed", "cancelled"] as BookingStatus[]).map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Payment method</label>
              <select value={form.payment_method} onChange={(e) => set("payment_method", e.target.value)} className={inputCls}>
                {["UPI", "Bank Transfer", "Cash on Arrival"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div onClick={() => set("is_paid", !form.is_paid)}
              className={["w-10 h-6 rounded-full transition-colors relative cursor-pointer",
                form.is_paid ? "bg-primary" : "bg-muted-foreground/30"].join(" ")}>
              <span className={["absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
                form.is_paid ? "translate-x-5" : "translate-x-1"].join(" ")} />
            </div>
            <span className="text-sm font-medium">{form.is_paid ? "Payment received" : "Payment pending"}</span>
          </label>

          {nights > 0 && selectedRoom && (
            <div className="rounded-xl bg-primary-light/40 border border-border p-4 text-sm space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>₹{selectedRoom.base_price.toLocaleString("en-IN")} × {nights} night{nights > 1 ? "s" : ""}</span>
                <span>₹{(selectedRoom.base_price * nights).toLocaleString("en-IN")}</span>
              </div>
              {form.guest_count > 2 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Extra guests</span>
                  <span>₹{(Math.max(0, form.guest_count - 2) * (selectedRoom.extra_guest_price ?? 0) * nights).toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold font-display border-t border-border pt-2 mt-2">
                <span>Total</span>
                <span>₹{total.toLocaleString("en-IN")}</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add booking
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const [q, setQ] = useState("");

  const rooms = property?.rooms ?? [];

  const roomNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    rooms.forEach((r) => { map[r.id] = r.name; });
    return map;
  }, [rooms]);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (q && !`${b.guest_name} ${b.guest_phone} ${b.id}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [bookings, status, q]);

  const updateStatus = async (id: string, newStatus: string) => {
    await supabase.from("bookings").update({ status: newStatus }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id] });
  };

  const handleBookingSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings", property?.id] });
    setShowAddModal(false);
  };

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Bookings</h1>
          <p className="text-sm text-muted-foreground">All inquiries and confirmed stays.</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
          <Plus className="h-4 w-4" /> Add booking
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 md:p-4 grid md:grid-cols-3 gap-3">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search guest, phone, or booking ID"
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as "all" | BookingStatus)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
          ))}
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Guest</th>
                <th className="px-4 py-2.5 font-medium">Room</th>
                <th className="px-4 py-2.5 font-medium">Check-in</th>
                <th className="px-4 py-2.5 font-medium">Check-out</th>
                <th className="px-4 py-2.5 font-medium">Guests</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Paid</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{b.guest_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {b.guest_phone} · {b.id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {roomNameMap[b.room_id] ?? <span className="text-muted-foreground text-xs">{b.room_id.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{b.check_in}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{b.check_out}</td>
                  <td className="px-4 py-3">{b.guest_count}</td>
                  <td className="px-4 py-3 font-medium">
                    ₹{Number(b.total_amount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentPill status={b.is_paid ? "paid" : "unpaid"} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={b.status as any} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="Confirm" onClick={() => updateStatus(b.id, "confirmed")}>
                        <Check className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Cancel" onClick={() => updateStatus(b.id, "cancelled")}>
                        <X className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Call" onClick={() => window.open(`tel:${b.guest_phone}`)}>
                        <Phone className="h-3.5 w-3.5" />
                      </IconBtn>
                      <WhatsAppMenu booking={b} property={property} roomName={roomNameMap[b.room_id] ?? b.room_id} />
                    </div>
                  </td>
                </tr>
              ))}
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

      {showAddModal && property && (
        <AddBookingModal
          propertyId={property.id}
          rooms={rooms.filter((r) => r.is_active)}
          onClose={() => setShowAddModal(false)}
          onSaved={handleBookingSaved}
        />
      )}
    </div>
  );
}

function IconBtn({
  title, children, onClick,
}: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button title={title} onClick={onClick}
      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted text-xs">
      {children}
    </button>
  );
}

function WhatsAppMenu({
  booking: b,
  property,
  roomName,
}: {
  booking: Booking;
  property: ReturnType<typeof useOwnerProperty>["data"];
  roomName: string;
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

  const templates = [
    {
      label: "✅ Booking confirmed",
      href: confirmationLink({
        guestPhone: b.guest_phone,
        guestName: b.guest_name,
        propertyName: property?.name ?? "",
        roomName,
        checkIn: b.check_in,
        checkOut: b.check_out,
        ownerPhone,
      }),
    },
    ...(lat && lng
      ? [{
          label: "📍 Send directions",
          href: directionsLink({
            guestPhone: b.guest_phone,
            guestName: b.guest_name,
            propertyName: property?.name ?? "",
            lat,
            lng,
            ownerPhone,
          }),
        }]
      : []),
    {
      label: "💰 Payment reminder",
      href: paymentReminderLink({
        guestPhone: b.guest_phone,
        guestName: b.guest_name,
        amount: Number(b.total_amount),
        checkIn: b.check_in,
        propertyName: property?.name ?? "",
      }),
    },
    {
      label: "🌿 Day-before reminder",
      href: dayBeforeReminderLink({
        guestPhone: b.guest_phone,
        guestName: b.guest_name,
        propertyName: property?.name ?? "",
        checkInTime: property?.check_in_time ?? "2:00 PM",
        ownerPhone,
      }),
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button title="WhatsApp" onClick={() => setOpen((o) => !o)}
        className="h-8 inline-flex items-center gap-0.5 justify-center rounded-md border border-border hover:bg-muted px-2 text-xs">
        <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" />
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 bottom-9 z-20 w-52 bg-card border border-border rounded-xl shadow-lg py-1 text-sm">
          {templates.map((t) => (
            <a key={t.label} href={t.href} target="_blank" rel="noreferrer"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 hover:bg-muted truncate">
              {t.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
