import { useMemo, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  addDays,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProperty } from "@/hooks/useProperty";
import { useQuery } from "@tanstack/react-query";
import { getSubdomain } from "@/lib/subdomain";
import { isSameDayTurnoverSafe, getBlockedDatesForRooms } from "@/lib/bookingAvailability";

function buildMonthDays(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  let d = start;
  while (!isAfter(d, end)) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

type DateState = "available" | "partial" | "booked" | "past" | "out-of-month";

type Props = {
  checkIn: Date | null;
  checkOut: Date | null;
  setCheckIn: (d: Date | null) => void;
  setCheckOut: (d: Date | null) => void;
};

export function Availability({ checkIn, checkOut, setCheckIn, setCheckOut }: Props) {
  const [month, setMonth] = useState(new Date());
  const days = useMemo(() => buildMonthDays(month), [month]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const subdomain = getSubdomain();

  const { data: property } = useProperty(subdomain);
  const turnoverSafe = useMemo(() => isSameDayTurnoverSafe(property), [property]);

  const activeRoomIds = useMemo(
    () => (property?.rooms ?? []).filter((r) => r.is_active).map((r) => r.id),
    [property]
  );

  // Dates the owner has manually blocked (maintenance, personal use, etc. —
  // see BlockDatesModal on the dashboard) need to count as occupied here,
  // exactly like a real booking would. Without this, this "pick your
  // dates" calendar showed a blocked room's dates as fully available to
  // guests — they'd only find out it was actually unavailable at the very
  // end of the booking form, when useCreateBooking's own check (which DOES
  // look at manual blocks) rejects it. getBlockedDatesForRooms already
  // covers both real bookings AND manual blocks in one call (and already
  // applies the same turnover widening this file used to duplicate by
  // hand) — it's the same function the owner-side calendar paints from, so
  // this view can never disagree with what the owner sees as blocked.
  const { data: blockedByRoom = {} } = useQuery({
    queryKey: ["blocked-dates", activeRoomIds.join(","), turnoverSafe],
    queryFn: () => {
      const from = format(new Date(), "yyyy-MM-dd");
      const to = format(addMonths(new Date(), 6), "yyyy-MM-dd");
      return getBlockedDatesForRooms(activeRoomIds, from, to, turnoverSafe);
    },
    enabled: activeRoomIds.length > 0,
  });

  const totalRooms = activeRoomIds.length;

  // Map each date → set of room_ids that are occupied (booked OR manually
  // blocked) on that date. Inverted from blockedByRoom (room → dates)
  // since the rest of this component reasons per-date (how many of the
  // property's rooms are free today), not per-room.
  const bookedDateCounts = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    Object.entries(blockedByRoom).forEach(([roomId, dates]) => {
      dates.forEach((d) => {
        if (!counts[d]) counts[d] = new Set();
        counts[d].add(roomId);
      });
    });
    return counts;
  }, [blockedByRoom]);

  const getDateState = (date: Date): DateState => {
    if (!isSameMonth(date, month)) return "out-of-month";
    const d = date;
    d.setHours(0, 0, 0, 0);
    if (isBefore(d, today)) return "past";
    if (totalRooms === 0) return "available";
    const bookedCount = bookedDateCounts[format(date, "yyyy-MM-dd")]?.size ?? 0;
    if (bookedCount === 0) return "available";
    if (bookedCount >= totalRooms) return "booked";
    return "partial";
  };

  /** True if every active room is occupied on this date (aggregate, not room-specific). */
  const isFullyBooked = (dateStr: string) => {
    if (totalRooms === 0) return false;
    return (bookedDateCounts[dateStr]?.size ?? 0) >= totalRooms;
  };

  const handlePick = (d: Date) => {
    const state = getDateState(d);
    if (state === "past" || state === "out-of-month") return;

    // A day showing "fully booked" can still be picked as a CANDIDATE
    // checkout date — some of those rooms may just be starting new stays
    // that day, which doesn't stop a different room's existing stay from
    // ending same day. Only applies when the property's actual
    // check-in/check-out times leave a cleaning gap (turnoverSafe). The
    // interior-range scan below (which excludes this day when safe) is
    // what actually decides if the chosen range is genuinely free.
    const isCandidateCheckout = turnoverSafe && !!checkIn && !checkOut && isAfter(d, checkIn);
    if (state === "booked" && !isCandidateCheckout) return;

    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(d);
      setCheckOut(null);
      return;
    }
    if (isBefore(d, checkIn) || isSameDay(d, checkIn)) {
      setCheckIn(d);
      return;
    }

    // Validate every night of the proposed range has at least one room
    // free. This check was previously MISSING entirely — a guest could
    // pick check-in/check-out dates that individually looked fine while a
    // night in between was fully booked, with zero warning (the actual
    // per-room booking attempt would only fail later, if at all — see the
    // useCreateBooking.ts fix for why "at all" was a real risk). Widen
    // through the checkout day itself when turnover isn't safe, matching
    // getConflictingDates() and the owner-side picker.
    const validateThrough = turnoverSafe ? d : addDays(d, 1);
    for (let cur = new Date(checkIn); isBefore(cur, validateThrough); cur = addDays(cur, 1)) {
      if (isFullyBooked(format(cur, "yyyy-MM-dd"))) return;
    }

    setCheckOut(d);
  };

  const inRange = (d: Date) => {
    if (!checkIn) return false;
    if (checkOut) return !isBefore(d, checkIn) && !isAfter(d, checkOut);
    return isSameDay(d, checkIn);
  };

  const nights =
    checkIn && checkOut ? Math.max(0, differenceInCalendarDays(checkOut, checkIn)) : 0;

  return (
    <section id="availability" className="py-16 md:py-24 bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            Step 1
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold">Pick your dates</h2>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-card rounded-2xl border border-border p-5 md:p-7 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setMonth(addMonths(month, -1))}
                className="press-scale h-10 w-10 rounded-full hover:bg-accent flex items-center justify-center transition-colors duration-[var(--duration-fast)]"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="font-display text-xl font-semibold">
                {format(month, "MMMM yyyy")}
              </div>
              <button
                onClick={() => setMonth(addMonths(month, 1))}
                className="press-scale h-10 w-10 rounded-full hover:bg-accent flex items-center justify-center transition-colors duration-[var(--duration-fast)]"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                const rawState = getDateState(d);
                const isStart = checkIn && isSameDay(d, checkIn);
                const isEnd = checkOut && isSameDay(d, checkOut);
                const isCandidateCheckout = turnoverSafe && !!checkIn && !checkOut && isAfter(d, checkIn);
                // A day showing "fully booked" only because every room
                // happens to have a new stay starting then is still a
                // valid checkout date for a different existing stay
                // (same-day turnover, when the property's times allow it).
                // Don't show it as blocked while it's a checkout candidate —
                // handlePick's interior-range scan decides the real answer.
                const state: DateState = rawState === "booked" && isCandidateCheckout ? "available" : rawState;
                const selected = inRange(d);
                const isSelectable = state === "available" || state === "partial";

                let cellCls =
                  "aspect-square rounded-lg text-sm font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] relative ";

                if (state === "out-of-month") {
                  cellCls += "text-muted-foreground/20 cursor-default";
                } else if (state === "past") {
                  cellCls += "text-muted-foreground/30 cursor-default line-through";
                } else if (state === "booked") {
                  // Red — fully booked
                  cellCls += "bg-red-50 text-red-300 cursor-not-allowed";
                } else if (isStart || isEnd) {
                  // Selected start/end — primary green. Ease-out (decelerate, no overshoot)
                  // reads calmer here than the snappy/bouncy curve used for button presses.
                  cellCls += "press-scale bg-primary text-primary-foreground hover:bg-primary cursor-pointer shadow-[var(--shadow-neu-flat)] animate-in zoom-in-95 fade-in duration-250 [--tw-ease:var(--ease-smooth)]";
                } else if (selected) {
                  // In-range highlight
                  cellCls += "press-scale bg-primary-light text-primary cursor-pointer";
                } else if (state === "partial") {
                  // Amber — some rooms available
                  cellCls += "press-scale bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer";
                } else {
                  // Green — fully available
                  cellCls += "press-scale text-foreground hover:bg-primary-light cursor-pointer";
                }

                return (
                  <button
                    key={i}
                    disabled={!isSelectable && !selected}
                    onClick={() => handlePick(d)}
                    title={
                      state === "booked" && !isStart && !isEnd
                        ? "Fully booked"
                        : state === "partial"
                        ? "Some rooms available"
                        : undefined
                    }
                    className={cellCls}
                  >
                    {format(d, "d")}
                    {/* Dot indicator for partial availability */}
                    {state === "partial" && !selected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-background border border-border" />
                Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-200" />
                Limited rooms
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-red-50 border border-red-200" />
                Fully booked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-primary" />
                Selected
              </span>
            </div>
          </div>

          <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-5 md:p-7 shadow-[var(--shadow-soft)]">
            <div className="grid grid-cols-2 rounded-xl border border-border overflow-hidden">
              <div className="p-3 border-r border-border">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Check-in
                </div>
                <div className="mt-1 text-sm font-medium">
                  {checkIn ? format(checkIn, "MMM d, yyyy") : "Select date"}
                </div>
              </div>
              <div className="p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Check-out
                </div>
                <div className="mt-1 text-sm font-medium">
                  {checkOut ? format(checkOut, "MMM d, yyyy") : "Select date"}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl bg-primary-light/60 border border-border p-4 text-sm">
              <div className="font-medium text-foreground">
                {nights ? `${nights} night${nights > 1 ? "s" : ""} selected` : "No dates selected"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {nights
                  ? "Continue below to choose your rooms."
                  : "Select check-in and check-out dates to see available rooms."}
              </p>
            </div>

            {totalRooms > 1 && (
              <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-xs text-amber-800">
                <span className="font-medium">Travelling as a group?</span> You can book multiple rooms — just add each one below.
              </div>
            )}

            <a
              href="#rooms"
              className="mt-5 block text-center w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Browse rooms
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
