import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, IndianRupee, Percent, MessageSquare, Ban, Plus, Send } from "lucide-react";
import { StatusPill } from "@/admin/components";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings } from "@/hooks/useBookings";
import { useMemo } from "react";

export const Route = createFileRoute("/admin/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: property, isLoading: propLoading } = useOwnerProperty();
  const { data: bookings = [], isLoading: bookLoading } = useBookings(
    property?.id ?? "",
  );

  const today = new Date().toISOString().split("T")[0];

  const stats = useMemo(() => {
    const upcoming = bookings.filter(
      (b) => b.check_in >= today && b.status !== "cancelled"
    ).length;
    const monthlyRevenue = bookings
      .filter((b) => {
        const d = b.created_at?.slice(0, 7);
        const thisMonth = new Date().toISOString().slice(0, 7);
        return d === thisMonth && b.status !== "cancelled";
      })
      .reduce((sum, b) => sum + Number(b.total_amount), 0);
    return { upcoming, monthlyRevenue };
  }, [bookings, today]);

  const recent = bookings.slice(0, 6);
  const isLoading = propLoading || bookLoading;

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
          <ActionBtn icon={Ban} label="Block dates" />
          <ActionBtn icon={Plus} label="Add booking" />
          <ActionBtn icon={Send} label="Send WhatsApp reminder" />
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
                  <td className="px-4 py-3 text-muted-foreground">{b.room_id}</td>
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
    </div>
  );
}

function StatCard({
  icon: Icon, label, value,
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
  icon: Icon, label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs md:text-sm font-medium hover:bg-muted">
      <Icon className="h-4 w-4 text-primary" /> {label}
    </button>
  );
}
