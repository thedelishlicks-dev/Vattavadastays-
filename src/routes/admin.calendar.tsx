import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ROOMS } from "@/data/rooms";
import { BOOKINGS } from "@/admin/mockData";

export const Route = createFileRoute("/admin/calendar")({
  component: CalendarAdmin,
});

type Cell = "available" | "booked" | "blocked";

function CalendarAdmin() {
  const [cursor, setCursor] = useState(new Date(2026, 4, 1)); // May 2026
  const [blocked, setBlocked] = useState<Record<string, true>>({});

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) }),
    [cursor],
  );

  const isBookedFor = (roomName: string, date: Date) => {
    const t = date.getTime();
    return BOOKINGS.some(
      (b) =>
        b.room === roomName &&
        b.status !== "cancelled" &&
        new Date(b.checkIn).getTime() <= t &&
        new Date(b.checkOut).getTime() > t,
    );
  };

  const cellState = (roomId: string, roomName: string, date: Date): Cell => {
    const key = `${roomId}-${format(date, "yyyy-MM-dd")}`;
    if (blocked[key]) return "blocked";
    if (isBookedFor(roomName, date)) return "booked";
    return "available";
  };

  const onCellClick = (roomId: string, date: Date, state: Cell) => {
    if (state === "booked") return;
    const key = `${roomId}-${format(date, "yyyy-MM-dd")}`;
    setBlocked((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Calendar</h1>
          <p className="text-sm text-muted-foreground">Tap a cell to block / unblock dates.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(addMonths(cursor, -1))}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="font-medium min-w-[140px] text-center">{format(cursor, "MMMM yyyy")}</div>
          <button
            onClick={() => setCursor(addMonths(cursor, 1))}
            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Legend color="bg-emerald-200" label="Available" />
        <Legend color="bg-rose-300" label="Booked" />
        <Legend color="bg-amber-200" label="Blocked" />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-muted/70 text-left px-3 py-2 font-medium min-w-[160px]">
                  Room
                </th>
                {days.map((d) => (
                  <th key={d.toISOString()} className="px-1 py-2 font-medium text-center w-8 text-muted-foreground">
                    <div>{format(d, "EEEEE")}</div>
                    <div className="font-semibold text-foreground">{format(d, "d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROOMS.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 font-medium whitespace-nowrap">
                    {r.name}
                  </td>
                  {days.map((d) => {
                    const state = cellState(r.id, r.name, d);
                    const cls =
                      state === "booked"
                        ? "bg-rose-300"
                        : state === "blocked"
                          ? "bg-amber-200"
                          : "bg-emerald-200/60 hover:bg-emerald-300";
                    return (
                      <td key={d.toISOString()} className="p-0.5">
                        <button
                          disabled={state === "booked"}
                          onClick={() => onCellClick(r.id, d, state)}
                          title={`${r.name} · ${format(d, "PP")} · ${state}`}
                          className={`h-7 w-7 rounded-sm ${cls} ${state === "booked" ? "cursor-not-allowed" : "cursor-pointer"}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${color}`} /> {label}
    </span>
  );
}
