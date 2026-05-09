import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Phone, MessageCircle, Check, X } from "lucide-react";
import { StatusPill, PaymentPill } from "@/admin/components";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings } from "@/hooks/useBookings";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin/bookings")({
  component: BookingsAdmin,
});

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
const STATUSES: ("all" | BookingStatus)[] = ["all", "pending", "confirmed", "completed", "cancelled"];

function BookingsAdmin() {
  const { data: property } = useOwnerProperty();
  const { data: bookings = [], isLoading } = useBookings(property?.id ?? "");
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const [q, setQ] = useState("");

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

  if (isLoading) {
    return <div className="h-48 rounded-xl bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Bookings</h1>
        <p className="text-sm text-muted-foreground">All inquiries and confirmed stays.</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 md:p-4 grid md:grid-cols-3 gap-3">
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
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Guest</th>
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
                    <StatusPill status={b.status} />
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
                      <IconBtn
                        title="WhatsApp"
                        onClick={() => window.open(`https://wa.me/${b.guest_phone.replace(/\D/g, "")}`)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
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

function IconBtn({
  title, children, onClick,
}: {
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted text-xs"
    >
      {children}
    </button>
  );
}
