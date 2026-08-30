import { useEffect, useMemo, useState } from "react";
import {
  addMonths, endOfMonth, endOfWeek, format, isAfter, isBefore, isSameDay,
  isSameMonth, startOfMonth, startOfWeek, addDays, parseISO,
} from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { getBlockedDatesForRooms } from "@/lib/bookingAvailability";

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

type DateState = "available" | "blocked" | "past" | "out-of-month";

interface RoomAvailabilityCalendarProps {
  /** Rooms currently selected in the booking form. A date is shown as
   * blocked if ANY of these rooms is unavailable that day — a multi-room
   * booking needs every selected room free at once. */
  roomIds: string[];
  checkIn: string; // "" | "yyyy-MM-dd"
  checkOut: string; // "" | "yyyy-MM-dd"
  onChange: (checkIn: string, checkOut: string) => void;
  /**
   * Whether this property's actual check-in/check-out times leave enough
   * of a cleaning gap for same-day turnover (see isSameDayTurnoverSafe in
   * bookingAvailability.ts). When false, a day that's blocked because
   * another booking checks in that day can NOT be picked as this booking's
   * checkout date either — a full clear day is required between stays.
   */
  turnoverSafe: boolean;
}

export function RoomAvailabilityCalendar({ roomIds, checkIn, checkOut, onChange, turnoverSafe }: RoomAvailabilityCalendarProps) {
  const [month, setMonth] = useState(() => (checkIn ? parseISO(checkIn) : new Date()));
  const days = useMemo(() => buildMonthDays(month), [month]);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const gridStart = format(days[0], "yyyy-MM-dd");
  const gridEnd = format(days[days.length - 1], "yyyy-MM-dd");
  const roomKey = [...roomIds].sort().join(",");

  const [blockedByRoom, setBlockedByRoom] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (roomIds.length === 0) { setBlockedByRoom({}); return; }
    setLoading(true);
    getBlockedDatesForRooms(roomIds, gridStart, gridEnd, turnoverSafe)
      .then((res) => { if (!cancelled) setBlockedByRoom(res); })
      .catch(() => { if (!cancelled) setBlockedByRoom({}); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, gridStart, gridEnd, turnoverSafe]);

  const isDateBlocked = (dateStr: string) => roomIds.some((id) => blockedByRoom[id]?.has(dateStr));

  const getDateState = (date: Date): DateState => {
    if (!isSameMonth(date, month)) return "out-of-month";
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    if (isBefore(d, today)) return "past";
    return isDateBlocked(format(date, "yyyy-MM-dd")) ? "blocked" : "available";
  };

  const checkInDate = checkIn ? parseISO(checkIn) : null;
  const checkOutDate = checkOut ? parseISO(checkOut) : null;

  const inRange = (d: Date) => {
    if (!checkInDate) return false;
    if (checkOutDate) return !isBefore(d, checkInDate) && !isAfter(d, checkOutDate);
    return isSameDay(d, checkInDate);
  };

  const handlePick = (d: Date) => {
    const state = getDateState(d);
    if (state === "past" || state === "out-of-month") return;

    // A day can be "blocked" simply because ANOTHER booking's stay starts
    // that day — that's not automatically a reason to refuse it as OUR
    // checkout date. Same-day turnover (previous guest out at 11am, next
    // guest in at noon) is normal PROVIDED the property's actual
    // check-in/check-out times leave enough of a cleaning gap
    // (turnoverSafe, computed from isSameDayTurnoverSafe). When the
    // property doesn't have that gap, this exception must not apply — a
    // full clear day is required between stays, so the day stays blocked
    // for every purpose, exactly like it did before same-day-turnover
    // support existed.
    const isCandidateCheckout = turnoverSafe && !!checkInDate && !checkOutDate && isAfter(d, checkInDate);

    // Starting a fresh range, or re-picking after a complete range: begin a
    // new check-in. A blocked day can never become a check-in date — but it
    // CAN become a checkout date (see above).
    if (!checkInDate || (checkInDate && checkOutDate) || (state === "blocked" && !isCandidateCheckout)) {
      if (state === "blocked") return;
      onChange(format(d, "yyyy-MM-dd"), "");
      return;
    }
    if (isBefore(d, checkInDate) || isSameDay(d, checkInDate)) {
      onChange(format(d, "yyyy-MM-dd"), "");
      return;
    }
    // Picking an end date: validate every NIGHT of the proposed stay —
    // check-in inclusive, checkout EXCLUSIVE, matching eachDate() and
    // getConflictingDates() in bookingAvailability.ts. When turnover isn't
    // safe for this property, widen validation through the checkout day
    // itself too (addDays(d,1)) — without a cleaning gap, our checkout day
    // must also be free of any other booking's check-in.
    const validateThrough = turnoverSafe ? d : addDays(d, 1);
    const proposedNights: Date[] = [];
    for (let cur = new Date(checkInDate); isBefore(cur, validateThrough); cur = addDays(cur, 1)) proposedNights.push(new Date(cur));
    const rangeHasBlocked = proposedNights.some((rd) => isDateBlocked(format(rd, "yyyy-MM-dd")));
    if (rangeHasBlocked) return;
    onChange(format(checkInDate, "yyyy-MM-dd"), format(d, "yyyy-MM-dd"));
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setMonth((m) => addMonths(m, -1))} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold flex items-center gap-2">
          {format(month, "MMMM yyyy")}
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <button type="button" onClick={() => setMonth((m) => addMonths(m, 1))} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-muted-foreground mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          const rawState = getDateState(d);
          const isStart = checkInDate && isSameDay(d, checkInDate);
          const isEnd = checkOutDate && isSameDay(d, checkOutDate);
          const isCandidateCheckout = turnoverSafe && !!checkInDate && !checkOutDate && isAfter(d, checkInDate);
          // A day blocked only because another booking's stay STARTS there
          // is still a valid checkout date for a different booking
          // (same-day turnover). Don't show it as unavailable while it's
          // being considered as an end date — handlePick's night-by-night
          // check (excluding this day) decides if the range is actually free.
          const state: DateState = rawState === "blocked" && isCandidateCheckout ? "available" : rawState;
          const selected = inRange(d);

          let cellCls = "aspect-square rounded-md text-xs font-medium transition-colors ";
          if (state === "out-of-month") cellCls += "text-muted-foreground/20 cursor-default";
          else if (state === "past") cellCls += "text-muted-foreground/30 cursor-default line-through";
          else if (state === "blocked") cellCls += "bg-red-50 text-red-300 cursor-not-allowed";
          else if (isStart || isEnd) cellCls += "bg-primary text-primary-foreground cursor-pointer";
          else if (selected) cellCls += "bg-primary-light text-primary cursor-pointer";
          else cellCls += "text-foreground hover:bg-primary-light cursor-pointer";

          return (
            <button
              key={i}
              type="button"
              disabled={state === "past" || state === "out-of-month" || (state === "blocked" && !isStart && !isEnd)}
              onClick={() => handlePick(d)}
              title={state === "blocked" ? "Not available" : undefined}
              className={cellCls}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-background border border-border" />Available</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200" />Not available</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-primary" />Selected</span>
      </div>

      {roomIds.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">Select a room below to see its availability.</p>
      )}
    </div>
  );
}
