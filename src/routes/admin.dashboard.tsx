import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  IndianRupee,
  MessageSquare,
  Ban,
  Plus,
  Send,
  CheckCircle2,
  Circle,
  ChevronRight,
  Image,
  BedDouble,
  CreditCard,
  ScrollText,
  Sparkles,
  Clock,
  DoorOpen,
} from "lucide-react";
import { StatusPill } from "@/admin/components";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { useBookings, useBookingGroups, useBookingTotal } from "@/hooks/useBookings";
import { useMemo, useState } from "react";
import { BlockDatesModal } from "@/components/BlockDatesModal";
import { AddBookingModal } from "@/components/AddBookingModal";
import { WhatsAppReminderModal } from "@/components/WhatsAppReminderModal";
import { extractUPIId } from "@/utils/upi";
import type { Property } from "@/hooks/useProperty";

export const Route = createFileRoute("/admin/dashboard")({
  component: DashboardPage,
});

type Modal = "block" | "add" | "whatsapp" | null;

// ---------------------------------------------------------------------------
// First-run checklist
//
// Ordered as a path, not a pile: four ESSENTIALS a property needs before it
// can take its first booking (room → photo → payment → policy), then two
// OPTIONAL polish items (logo, hero image). The first unfinished step is
// highlighted as "Next" so a new owner always knows exactly one thing to do.
//
// (The old "Set room availability" step was dropped: it used the exact same
// test as "Add a room" — rooms.length > 0 — so it could never be completed
// separately and just made the list look longer.)
// ---------------------------------------------------------------------------

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  href: string;
  optional?: boolean;
};

function buildChecklist(property: Property | undefined): ChecklistItem[] {
  const amenities = property?.shared_amenities ?? [];
  const rooms = property?.rooms ?? [];
  const hasRoomPhoto = rooms.some((r) => r.images && r.images.length > 0);
  const hasUpi = amenities.some((a) => a.startsWith("__upi:"));
  const hasCancelPolicy = amenities.some((a) => a.startsWith("__cancel:"));

  return [
    {
      id: "rooms",
      label: "Add your first room",
      description: "Name, guests and nightly price — guests can't book without a room",
      icon: BedDouble,
      done: rooms.length > 0,
      href: "/admin/rooms",
    },
    {
      id: "room_photo",
      label: "Add a room photo",
      description: "Rooms with photos get far more bookings",
      icon: Image,
      done: hasRoomPhoto,
      href: "/admin/rooms",
    },
    {
      id: "upi",
      label: "Add your UPI ID",
      description: "So guests know where to send the advance (Settings → Payment setup)",
      icon: CreditCard,
      done: hasUpi,
      href: "/admin/settings",
    },
    {
      id: "policy",
      label: "Set your cancellation policy",
      description: "Guests see this before they book",
      icon: ScrollText,
      done: hasCancelPolicy,
      href: "/admin/policies",
    },
    {
      id: "logo",
      label: "Upload your logo",
      description: "Shown in the header and as your app icon",
      icon: Sparkles,
      done: !!property?.logo_url,
      href: "/admin/settings",
      optional: true,
    },
    {
      id: "hero",
      label: "Add a hero image",
      description: "The big photo guests see first on your booking page",
      icon: Image,
      done: !!property?.hero_image,
      href: "/admin/settings",
      optional: true,
    },
  ];
}

function ChecklistRow({ item, isNext }: { item: ChecklistItem; isNext: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      className={[
        "flex items-center gap-3 px-4 py-3 transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] hover:bg-muted/40",
        item.done ? "opacity-50" : "",
        isNext ? "bg-primary/5" : "",
      ].join(" ")}
    >
      <div className="shrink-0">
        {item.done ? (
          <CheckCircle2 className="h-5 w-5 text-primary animate-in zoom-in-75 duration-200" />
        ) : (
          <Circle className={`h-5 w-5 ${isNext ? "text-primary" : "text-muted-foreground"}`} />
        )}
      </div>
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${item.done ? "line-through" : ""}`}>{item.label}</div>
        <div className="text-xs text-muted-foreground">{item.description}</div>
      </div>
      {isNext ? (
        <span className="shrink-0 rounded-full bg-primary text-primary-foreground text-xs font-medium px-3 py-1">
          Next
        </span>
      ) : (
        !item.done && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </Link>
  );
}

function OnboardingChecklist({ property }: { property: Property | undefined }) {
  const [copied, setCopied] = useState(false);
  const items = buildChecklist(property);
  const essentials = items.filter((i) => !i.optional);
  const polish = items.filter((i) => i.optional);
  const essentialsDone = essentials.filter((i) => i.done).length;
  const allEssentialsDone = essentialsDone === essentials.length;
  const allDone = items.every((i) => i.done);

  if (allDone) return null;

  const pct = Math.round((essentialsDone / essentials.length) * 100);
  const nextId = items.find((i) => !i.done)?.id;
  const bookingUrl = property?.subdomain ? `https://${property.subdomain}.stayidom.in` : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still shown and selectable */
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-[var(--shadow-neu-flat)]">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold text-sm">
              {allEssentialsDone ? "You're ready for bookings" : "Get your property ready"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {allEssentialsDone
                ? "Finish the optional touches below to make your page shine"
                : `${essentialsDone} of ${essentials.length} essentials done`}
            </p>
          </div>
          <span className="text-sm font-semibold text-primary">{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden shadow-[var(--shadow-neu-inset-sm)]">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-[var(--ease-smooth)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        Essentials to take bookings
      </div>
      <div className="divide-y divide-border">
        {essentials.map((item) => (
          <ChecklistRow key={item.id} item={item} isNext={item.id === nextId} />
        ))}
      </div>

      <div className="px-4 pt-4 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium border-t border-border">
        Optional polish
      </div>
      <div className="divide-y divide-border">
        {polish.map((item) => (
          <ChecklistRow key={item.id} item={item} isNext={item.id === nextId} />
        ))}
      </div>

      <div className="px-4 py-3 bg-primary-light/30 border-t border-border">
        {allEssentialsDone && bookingUrl ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Your booking page — share it with guests</p>
              <p className="text-sm font-medium truncate">{bookingUrl.replace("https://", "")}</p>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-muted"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Finish the four essentials and your booking page is ready to share.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Needs your attention — replaces the old 4-card KPI grid as the first thing
// an owner sees. Surfaces pending bookings (awaiting owner confirmation) and
// today's check-ins (needs the room ready), since those are the two things
// an owner actually needs to act on today. Unlike a stats grid, this section
// is silent (renders nothing) when there's nothing to act on, rather than
// showing "0" / "—" placeholders that read as broken.
// ---------------------------------------------------------------------------

type AttentionRow = {
  id: string;
  kind: "pending" | "checkin";
  guestName: string;
  checkIn: string;
  checkOut: string;
  isGroup: boolean;
};

function useAttentionRows(
  bookings: ReturnType<typeof useBookings>["data"] = [],
  groups: ReturnType<typeof useBookingGroups>["data"] = [],
  today: string,
) {
  return useMemo(() => {
    // Only pending requests whose check-in hasn't already passed count as
    // "needs your attention today" — a pending booking with a check-in
    // weeks in the past isn't a decision waiting on the owner, it's a
    // stale/abandoned request. Those still show up on the Bookings page
    // (via the Pending filter with "By month"), just not here, so this
    // list doesn't grow without bound.
    const pending: AttentionRow[] = [
      ...bookings
        .filter((b) => b.status === "pending" && b.check_in >= today)
        .map((b) => ({
          id: b.id,
          kind: "pending" as const,
          guestName: b.guest_name,
          checkIn: b.check_in,
          checkOut: b.check_out,
          isGroup: false,
        })),
      ...groups
        .filter((g) => g.status === "pending" && g.check_in >= today)
        .map((g) => ({
          id: g.id,
          kind: "pending" as const,
          guestName: g.guest_name,
          checkIn: g.check_in,
          checkOut: g.check_out,
          isGroup: true,
        })),
    ];

    const checkinsToday: AttentionRow[] = [
      ...bookings
        .filter((b) => b.status === "confirmed" && b.check_in === today)
        .map((b) => ({
          id: b.id,
          kind: "checkin" as const,
          guestName: b.guest_name,
          checkIn: b.check_in,
          checkOut: b.check_out,
          isGroup: false,
        })),
      ...groups
        .filter((g) => g.status === "confirmed" && g.check_in === today)
        .map((g) => ({
          id: g.id,
          kind: "checkin" as const,
          guestName: g.guest_name,
          checkIn: g.check_in,
          checkOut: g.check_out,
          isGroup: true,
        })),
    ];

    // Pending requests are the most time-sensitive (a guest is waiting on a
    // decision), so they lead; today's check-ins follow.
    return [...pending, ...checkinsToday];
  }, [bookings, groups, today]);
}

function AttentionSection({ rows }: { rows: AttentionRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="animate-in fade-in slide-in-from-top-2 duration-300 [--tw-ease:var(--ease-smooth)] border border-primary/30 rounded-xl overflow-hidden shadow-[var(--shadow-neu-flat)]">
      <div className="px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground bg-primary-light/20">
        Needs your attention
      </div>
      <div className="divide-y divide-border">
        {rows.map((row) => {
          const isPending = row.kind === "pending";
          // Plain <a>, not <Link>: the Bookings page reads bookingId/groupId
          // from window.location.search (see admin.bookings.tsx) to open
          // the exact booking's detail modal on load, rather than landing
          // on the default Upcoming view where an unrelated guest happens
          // to be on top.
          return (
            <a
              key={`${row.kind}-${row.id}`}
              href={`/admin/bookings?${(() => { const prop = new URLSearchParams(window.location.search).get("property"); return prop ? `property=${encodeURIComponent(prop)}&` : ""; })()}${row.isGroup ? "groupId" : "bookingId"}=${row.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] hover:bg-muted/40 hover:pl-5"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {isPending ? (
                  <Clock className="h-4 w-4 text-primary" />
                ) : (
                  <DoorOpen className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {isPending ? "Booking request" : "Checking in today"} — {row.guestName}
                  {row.isGroup && (
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground align-middle">
                      multi-room
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {row.checkIn} → {row.checkOut}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent bookings — stacked rows instead of a wide table. A 5-column table
// on a narrow phone either needs horizontal scroll (easy to miss — the
// status pill was getting cut off at the screen edge) or shrinks illegibly.
// Stacking guest/dates on one line and status/amount on the next needs no
// scroll and no minimum width.
// ---------------------------------------------------------------------------

type ChargeLine = { qty: number; unit_price: number };

function chargesSum(charges?: ChargeLine[] | null): number {
  return (charges ?? []).reduce((s, c) => s + c.qty * c.unit_price, 0);
}

function RecentBookings({
  recent,
  roomNameMap,
}: {
  recent: Array<{
    id: string;
    guest_name: string;
    room_id: string | null;
    check_in: string;
    check_out: string;
    status: string;
    total_amount: number;
    discount_amount?: number;
    booking_charges?: ChargeLine[] | null;
  }>;
  roomNameMap: Record<string, string>;
}) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-[var(--shadow-neu-flat)]">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="font-medium">Recent bookings</h2>
        <Link to="/admin/bookings" className="text-xs text-primary hover:underline">
          View all →
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="px-4 py-10 text-center text-muted-foreground text-sm">
          No bookings yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {recent.map((b) => {
            const netAmount = Math.max(
              0,
              Number(b.total_amount) + chargesSum(b.booking_charges) - Number(b.discount_amount ?? 0),
            );
            return (
              <div key={b.id} className="px-4 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{b.guest_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {roomNameMap[b.room_id ?? ""] ?? "—"} · {b.check_in} → {b.check_out}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium text-sm">₹{netAmount.toLocaleString("en-IN")}</div>
                    {Number(b.discount_amount ?? 0) > 0 && (
                      <div className="text-[10px] text-green-600">
                        -₹{Number(b.discount_amount).toLocaleString("en-IN")} disc
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2">
                  <StatusPill status={b.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

function DashboardPage() {
  const { data: property, isLoading: propLoading } = useOwnerProperty();
  // Every figure on this screen is "this month", "upcoming" or "today", so it
  // only needs bookings from the start of last month onward — not the whole
  // history. "Total bookings" comes from a count-only request instead.
  const windowFrom = useMemo(() => {
    const d = new Date();
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);
  const { data: bookings = [], isLoading: bookLoading } = useBookings(property?.id ?? "", { from: windowFrom });
  const { data: groups = [], isLoading: groupsLoading } = useBookingGroups(property?.id ?? "", { from: windowFrom, slim: true });
  const { data: bookingTotal } = useBookingTotal(property?.id ?? "");
  const [modal, setModal] = useState<Modal>(null);

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  // A booking that belongs to a group is represented by the group row, not
  // its own row, so it isn't double-counted below (same rule as
  // admin.bookings.tsx / admin.payments.tsx).
  const groupBookingIds = useMemo(() => {
    const ids = new Set<string>();
    groups.forEach((g) => (g.bookings ?? []).forEach((b) => ids.add(b.id)));
    return ids;
  }, [groups]);
  const standaloneBookings = useMemo(
    // group_id check too: with a date window, a room of a group could fall inside
    // the window while its group row doesn't — never count it as standalone.
    () => bookings.filter((b) => !groupBookingIds.has(b.id) && !b.group_id),
    [bookings, groupBookingIds],
  );

  const stats = useMemo(() => {
    const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const revenueOf = (b: {
      check_in?: string;
      status: string;
      total_amount: number;
      discount_amount?: number;
      booking_charges?: ChargeLine[] | null;
    }) => {
      if (b.check_in?.slice(0, 7) !== thisMonth) return 0;
      if (b.status !== "confirmed" && b.status !== "completed") return 0;
      return Math.max(0, Number(b.total_amount) + chargesSum(b.booking_charges) - Number(b.discount_amount ?? 0));
    };

    const upcoming =
      standaloneBookings.filter((b) => b.check_in >= today && b.status !== "cancelled").length +
      groups.filter((g) => g.check_in >= today && g.status !== "cancelled").length;

    const monthlyRevenue =
      standaloneBookings.reduce((sum, b) => sum + revenueOf(b), 0) +
      groups.reduce((sum, g) => sum + revenueOf(g), 0);

    return { upcoming, monthlyRevenue };
  }, [standaloneBookings, groups, today]);

  const attentionRows = useAttentionRows(bookings, groups, today);

  const recent = [...bookings]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);
  const isLoading = propLoading || bookLoading || groupsLoading;

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
          extra_guest_price: r.extra_guest_price ?? 0,
          weekend_multiplier: r.weekend_multiplier ?? 1,
          max_guests: r.max_guests ?? 2,
        })),
    [property],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // Only show the stats strip once there's real booking history — an empty
  // "0" / "—" row on a brand-new property reads as broken, not as "no data
  // yet". The onboarding checklist already covers guidance for that state.
  // The count covers ALL history, so a property in its off-season (nothing in
  // the window) doesn't suddenly look brand new.
  const totalBookings = bookingTotal ?? bookings.length;
  const hasBookingHistory = totalBookings > 0 || groups.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Home</h1>
        <p className="text-sm text-muted-foreground">
          Snapshot of bookings, revenue, and inquiries.
        </p>
      </div>

      <OnboardingChecklist property={property as Property | undefined} />

      <AttentionSection rows={attentionRows} />

      <div className="bg-card border border-border rounded-xl p-4 shadow-[var(--shadow-neu-flat)]">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Quick actions
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionBtn icon={Ban} label="Block dates" onClick={() => setModal("block")} />
          <ActionBtn icon={Plus} label="Add booking" onClick={() => setModal("add")} />
          <ActionBtn
            icon={Send}
            label="Send WhatsApp reminder"
            onClick={() => setModal("whatsapp")}
          />
        </div>
      </div>

      {hasBookingHistory && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-[var(--shadow-neu-flat)]">
          <div className="flex divide-x divide-border">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Upcoming
              </div>
              <div className="mt-1.5 font-display text-xl font-semibold">{stats.upcoming}</div>
            </div>
            <div className="flex-1 px-4">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <IndianRupee className="h-3.5 w-3.5" /> This month
              </div>
              <div className="mt-1.5 font-display text-xl font-semibold">
                ₹{stats.monthlyRevenue.toLocaleString("en-IN")}
              </div>
            </div>
            <div className="flex-1 pl-4">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" /> Total bookings
              </div>
              <div className="mt-1.5 font-display text-xl font-semibold">{totalBookings}</div>
            </div>
          </div>
        </div>
      )}

      <RecentBookings recent={recent} roomNameMap={roomNameMap} />

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
          property={property}
          rooms={activeRooms}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
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
            check_in_time: property.check_in_time ?? null,
            location_lat: property.location_lat ?? null,
            location_lng: property.location_lng ?? null,
            landmark_description: property.landmark_description ?? null,
          }}
          onClose={() => setModal(null)}
        />
      )}
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
      className="neu-interactive press-scale inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs md:text-sm font-medium transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-primary" /> {label}
    </button>
  );
}
