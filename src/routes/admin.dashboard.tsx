import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, IndianRupee, Percent, MessageSquare, Ban, Plus, Send } from "lucide-react";
import { StatusPill } from "@/admin/components";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings } from "@/hooks/useBookings";
import { useMemo, useState } from "react";
import { BlockDatesModal } from "@/components/BlockDatesModal";
import { AddBookingModal } from "@/components/AddBookingModal";
import { WhatsAppReminderModal } from "@/components/WhatsAppReminderModal";
import { extractUPIId } from "@/utils/upi";

export const Route = createFileRoute("/admin/dashboard")({
  component: DashboardPage,
});

type Modal = "block" | "add" | "whatsapp" | null;

function DashboardPage() {
  const { data: property, isLoading: propLoading } = useOwnerProperty();
  const { data: bookings = [], isLoading: bookLoading } = useBookings(
    property?.id ?? "",
  );
  const [modal, setModal] = useState<Modal>(null);

  // FIX: use local date, not UTC, to avoid showing yesterday's date until 5:30 AM IST
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const stats = useMemo(() => {
    const upcoming = bookings.filter(
      (b) => b.check_in >= today && b.status !== "cancelled"
    ).length;

    // FIX: only count confirmed and completed bookings in revenue, not pending
    const monthlyRevenue = bookings
      .filter((b) => {
        const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
        return (
          b.check_in?.slice(0, 7) === thisMonth &&
          (b.status === "confirmed" || b.status === "completed")
        );
      })
      .reduce((sum, b) => sum + Number(b.total_amount), 0);

    return { upcoming, monthlyRevenue };
  }, [bookings, today]);

  const recent = [...bookings]
    .sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 6);

  const isLoading = propLoading || bookLoading;

  const roomNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (property?.rooms ?? []).forEach((r: { id: string; name: string }) => {
      map[r.id] = r.name;
    });
    return map;
  }, [property]);

  const activeRooms = useMemo(
    () =>
      (property?.rooms ?? [])
        .filter((r) => r.is_active)
        .map((r) => ({
          id: r.id,
          name: r.name,
          base_price: r.base_price ?? 0,
          max_guests: r.max_guests ?? 2,
        })),
    [property]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of bookings, revenue, and inquiries.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard icon={CalendarDays} label="Upcoming bookings" value={stats.upcoming} />
        <StatCard
          icon={IndianRupee}
          label="Monthly revenue"
          value={`₹${stats.monthlyRevenue.toLocaleString("en-IN")}`}
        />
        <StatCard icon={Percent} label="Occupancy rate" value="—" />
        <StatCard icon={MessageSquare} label="Total bookings" value={bookings.length} />
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Quick actions
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionBtn icon={Ban}  label="Block dates"            onClick={() => setModal("block")} />
          <ActionBtn icon={Plus} label="Add booking"            onClick={() => setModal("add")} />
          <ActionBtn icon={Send} label="Send WhatsApp reminder" onClick={() => setModal("whatsapp")} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-medium">Recent bookings</h2>
          <Link to="/admin/bookings" className="text-xs text-primary hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Guest</th>
                <th className="px-4 py-2.5 font-medium">Room</th>
                <th className="px-4 py-2.5 font-medium">Dates</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No bookings yet.
                  </td>
                </tr>
              )}
              {recent.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{b.guest_name}</div>
                    <div className="text-xs text-muted-foreground">{b.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {roomNameMap[b.room_id] ?? b.room_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {b.check_in} → {b.check_out}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={b.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    ₹{Number(b.total_amount).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "block" && property && (
        <BlockDatesModal
          propertyId={property.id}
          rooms={activeRooms}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "add" && property && (
        <AddBookingModal
          propertyId={property.id}
          rooms={activeRooms}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "whatsapp" && property && (
        <WhatsAppReminderModal
          bookings={bookings}
          roomNameMap={roomNameMap}
          property={{
            name: property.name,
            owner_phone: property.owner_phone ?? null,
            owner_whatsapp: property.owner_whatsapp ?? null,
            upiId: extractUPIId(property.shared_amenities ?? []),
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 font-display text-2xl md:text-3xl font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs md:text-sm font-medium hover:bg-muted transition-colors"
    >
      <Icon className="h-4 w-4 text-primary" /> {label}
    </button>
  );
}
