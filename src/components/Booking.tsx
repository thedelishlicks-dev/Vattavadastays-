import { useMemo, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isSameDay,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight, Minus, Plus, Users } from "lucide-react";

const NIGHTLY = 2000;
const CLEANING = 300;

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

export function Booking() {
  const [month, setMonth] = useState(new Date(2026, 4, 1)); // May 2026
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [guests, setGuests] = useState(2);

  const days = useMemo(() => buildMonthDays(month), [month]);
  const today = new Date();

  const handlePick = (d: Date) => {
    if (isBefore(d, new Date(today.toDateString()))) return;
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(d);
      setCheckOut(null);
      return;
    }
    if (isBefore(d, checkIn) || isSameDay(d, checkIn)) {
      setCheckIn(d);
      return;
    }
    setCheckOut(d);
  };

  const nights =
    checkIn && checkOut ? Math.max(0, differenceInCalendarDays(checkOut, checkIn)) : 0;
  const subtotal = nights * NIGHTLY;
  const total = nights ? subtotal + CLEANING : 0;

  const inRange = (d: Date) => {
    if (!checkIn) return false;
    if (checkOut) return !isBefore(d, checkIn) && !isAfter(d, checkOut);
    return isSameDay(d, checkIn);
  };

  return (
    <section id="booking" className="py-20 md:py-28 bg-primary-light/40">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            Reserve your stay
          </span>
          <h2 className="mt-3 text-3xl md:text-5xl font-semibold">Book Bleaf Mud House</h2>
        </div>

        <div className="grid lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Calendar */}
          <div className="lg:col-span-3 bg-card rounded-2xl border border-border p-5 md:p-7 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setMonth(addMonths(month, -1))}
                className="h-10 w-10 rounded-full hover:bg-accent flex items-center justify-center"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="font-display text-xl font-semibold">
                {format(month, "MMMM yyyy")}
              </div>
              <button
                onClick={() => setMonth(addMonths(month, 1))}
                className="h-10 w-10 rounded-full hover:bg-accent flex items-center justify-center"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                const disabled =
                  isBefore(d, new Date(today.toDateString())) || !isSameMonth(d, month);
                const selected = inRange(d);
                const isStart = checkIn && isSameDay(d, checkIn);
                const isEnd = checkOut && isSameDay(d, checkOut);
                return (
                  <button
                    key={i}
                    disabled={disabled}
                    onClick={() => handlePick(d)}
                    className={[
                      "aspect-square rounded-lg text-sm font-medium transition-colors",
                      disabled
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "hover:bg-primary-light",
                      selected && !isStart && !isEnd
                        ? "bg-primary-light text-primary"
                        : "",
                      isStart || isEnd
                        ? "bg-primary text-primary-foreground hover:bg-primary"
                        : "",
                    ].join(" ")}
                  >
                    {format(d, "d")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-5 md:p-7 shadow-[var(--shadow-soft)] flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold">₹2,000</span>
              <span className="text-muted-foreground text-sm">/ night</span>
            </div>

            <div className="mt-5 grid grid-cols-2 rounded-xl border border-border overflow-hidden">
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

            <div className="mt-3 rounded-xl border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Guests
              </div>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  {guests} {guests === 1 ? "guest" : "guests"}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setGuests((g) => Math.max(1, g - 1))}
                    className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-accent"
                    aria-label="Decrease guests"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setGuests((g) => Math.min(6, g + 1))}
                    className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-accent"
                    aria-label="Increase guests"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  ₹2,000 × {nights} {nights === 1 ? "night" : "nights"}
                </span>
                <span className="text-foreground">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Cleaning fee</span>
                <span className="text-foreground">₹{nights ? CLEANING : 0}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between font-display text-lg font-semibold">
                <span>Total</span>
                <span>₹{total.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <button
              disabled={!nights}
              className="mt-6 w-full rounded-full bg-primary py-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              Request Booking
            </button>
            <p className="mt-3 text-xs text-muted-foreground text-center">
              You won't be charged yet
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
