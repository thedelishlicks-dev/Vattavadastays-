import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Phone, MessageCircle, Check, X } from "lucide-react";
import { BOOKINGS, type AdminBooking, type BookingStatus } from "@/admin/mockData";
import { StatusPill, PaymentPill } from "@/admin/components";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsAdmin,
});

const STATUSES: ("all" | BookingStatus)[] = ["all", "pending", "confirmed", "completed", "cancelled"];

function BookingsAdmin() {
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const [room, setRoom] = useState<string>("all");
  const [q, setQ] = useState("");

  const rooms = useMemo(() => Array.from(new Set(BOOKINGS.map((b) => b.room))), []);

  const filtered = useMemo(() => {
    return BOOKINGS.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (room !== "all" && b.room !== room) return false;
      if (q && !`${b.guest} ${b.id} ${b.phone}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [status, room, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Bookings</h1>
        <p className="text-sm text-muted-foreground">All inquiries and confirmed stays.</p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-4 grid md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
            <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
          ))}
        </select>
        <select
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All rooms</option>
          {rooms.map((r) => (
            <option key={r} value={r}>{r}</option>
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
                <th className="px-4 py-2.5 font-medium">Payment</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => <Row key={b.id} b={b} />)}
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
    </div>
  );
}

function Row({ b }: { b: AdminBooking }) {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3">
        <div className="font-medium">{b.guest}</div>
        <div className="text-xs text-muted-foreground">{b.phone} · {b.id}</div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{b.room}</td>
      <td className="px-4 py-3 whitespace-nowrap">{b.checkIn}</td>
      <td className="px-4 py-3 whitespace-nowrap">{b.checkOut}</td>
      <td className="px-4 py-3">{b.guests}</td>
      <td className="px-4 py-3 font-medium">₹{b.amount.toLocaleString("en-IN")}</td>
      <td className="px-4 py-3"><PaymentPill status={b.payment} /></td>
      <td className="px-4 py-3"><StatusPill status={b.status} /></td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <IconBtn title="Confirm"><Check className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title="Mark paid">₹</IconBtn>
          <IconBtn title="Call"><Phone className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title="WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title="Cancel"><X className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </td>
    </tr>
  );
}

function IconBtn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button
      title={title}
      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted text-xs"
    >
      {children}
    </button>
  );
}
