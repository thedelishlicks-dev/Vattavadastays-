import { useMemo, useState } from "react";
import { X, Ban, Loader2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
} from "date-fns";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { eachDate, addOneDay, isSameDayTurnoverSafe, type TurnoverPolicyInput } from "@/lib/bookingAvailability";

interface Props {
  propertyId: string;
  rooms: { id: string; name: string }[];
  /** Used only to decide whether a booking's checkout day itself still
   * counts as occupied for the "already booked" warning below — same
   * turnover rule used everywhere else in the app (see
   * isSameDayTurnoverSafe). Optional so this still renders fine without
   * it; the warning just defaults to the stricter (no same-day turnover)
   * reading in that case. */
  property?: TurnoverPolicyInput | null;
  onClose: () => void;
}

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

export function BlockDatesModal({ propertyId, rooms, property, onClose }: Props) {
  const qc = useQueryClient();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [acknowledgedConflict, setAcknowledgedConflict] = useState(false);

  const days = buildMonthDays(month);
  const today = new Date(new Date().toDateString());
  const turnoverSafe = useMemo(() => isSameDayTurnoverSafe(property), [property]);

  // Dates this room already has an active booking on — so blocking them
  // "works" (the availability row still gets written) but doesn't do what
  // an owner picking them almost certainly means: it was silently letting
  // an owner block an already-booked date with zero indication anything
  // was off, when what they usually want in that situation is to look at
  // the existing booking instead (reschedule/cancel it), not shadow-block
  // over it. This only ever WARNS — it never blocks the click itself,
  // since there can be legitimate reasons to mark a double-booked date
  // (e.g. flagging it while sorting out which guest to move).
  const { data: bookedDates = new Set<string>() } = useQuery({
    queryKey: ["room-bookings-for-block", roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("check_in, check_out")
        .eq("room_id", roomId)
        .neq("status", "cancelled")
        .gte("check_out", format(today, "yyyy-MM-dd"));
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((b) => {
        const effectiveCheckOut = turnoverSafe ? b.check_out : addOneDay(b.check_out);
        eachDate(b.check_in, effectiveCheckOut).forEach((d) => set.add(d));
      });
      return set;
    },
    enabled: !!roomId,
  });

  const conflictDates = useMemo(
    () => Array.from(selected).filter((d) => bookedDates.has(d)).sort(),
    [selected, bookedDates],
  );

  const toggleDay = (d: Date) => {
    if (isBefore(d, today)) return;
    if (!isSameMonth(d, month)) return;
    const key = format(d, "yyyy-MM-dd");
    setAcknowledgedConflict(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!roomId || selected.size === 0) return;
    if (conflictDates.length > 0 && !acknowledgedConflict) return;
    setSaving(true);
    setError("");
    try {
      const rows = Array.from(selected).map((date) => ({
        room_id: roomId,
        date,
        is_available: false,
        note: note.trim() || null,
      }));
      const { error: err } = await supabase
        .from("availability")
        .upsert(rows, { onConflict: "room_id,date" });
      if (err) throw err;
      qc.invalidateQueries({ queryKey: ["bookings"], exact: false });
      qc.invalidateQueries({ queryKey: ["guest-bookings"], exact: false });
      // Also refresh the two other places that read blocked dates from a
      // separate cached query, so a newly-blocked date shows up right away
      // instead of only after a full reload: the guest-facing "pick your
      // dates" calendar (Availability.tsx) and the owner's own calendar
      // page (admin.calendar.tsx).
      qc.invalidateQueries({ queryKey: ["blocked-dates"], exact: false });
      qc.invalidateQueries({ queryKey: ["availability-range"], exact: false });
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-200 fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in-95 duration-[var(--duration-lazy)] [--tw-ease:var(--ease-lazy)] bg-card border border-border rounded-2xl w-full max-w-md shadow-[var(--shadow-neu-raised)]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Block dates</h2>
          </div>
          <button
            onClick={onClose}
            className="press-scale h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Room picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Room
            </label>
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setSelected(new Set());
                setAcknowledgedConflict(false);
              }}
              className="focus-glow mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-[var(--shadow-neu-inset-sm)] transition-all duration-[var(--duration-base)] ease-[var(--ease-smooth)] focus:outline-none"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mini calendar */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setMonth(addMonths(month, -1))}
                className="press-scale h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">{format(month, "MMMM yyyy")}</span>
              <button
                onClick={() => setMonth(addMonths(month, 1))}
                className="press-scale h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground mb-1">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((d, i) => {
                const isPast = isBefore(d, today);
                const outOfMonth = !isSameMonth(d, month);
                const key = format(d, "yyyy-MM-dd");
                const isSelected = selected.has(key);
                const isBooked = bookedDates.has(key);
                return (
                  <button
                    key={i}
                    disabled={isPast || outOfMonth}
                    onClick={() => toggleDay(d)}
                    title={isBooked ? "Already has a booking on this room" : undefined}
                    className={[
                      "relative aspect-square rounded-md text-xs font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)]",
                      outOfMonth ? "opacity-0 pointer-events-none" : "",
                      isPast ? "text-muted-foreground/40 cursor-not-allowed line-through" : "",
                      isSelected
                        ? "press-scale bg-red-500 text-white animate-in zoom-in-95 fade-in duration-200 [--tw-ease:var(--ease-smooth)]"
                        : !isPast && !outOfMonth
                          ? "press-scale hover:bg-muted"
                          : "",
                      isBooked && !isSelected ? "text-amber-700" : "",
                    ].join(" ")}
                  >
                    {format(d, "d")}
                    {isBooked && (
                      <span
                        className={[
                          "absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full",
                          isSelected ? "bg-white" : "bg-amber-500",
                        ].join(" ")}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected count */}
          {selected.size > 0 && (
            <p className="text-xs text-muted-foreground">
              {selected.size} date{selected.size > 1 ? "s" : ""} selected — will be marked
              unavailable
              {bookedDates.size > 0 && (
                <span className="inline-flex items-center gap-1 ml-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500 inline-block" /> = already booked
                </span>
              )}
            </p>
          )}

          {conflictDates.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  {conflictDates.length} of your selected date{conflictDates.length > 1 ? "s" : ""} already{" "}
                  {conflictDates.length > 1 ? "have" : "has"} a booking on this room ({conflictDates.join(", ")}).
                  Blocking it doesn't cancel that booking — if you meant to free up the room, open that
                  booking instead. Only continue if you're intentionally flagging it (e.g. sorting out a
                  double-booking).
                </span>
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledgedConflict}
                  onChange={(e) => setAcknowledgedConflict(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Block anyway
              </label>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Note (optional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Maintenance, personal use…"
              className="focus-glow mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-[var(--shadow-neu-inset-sm)] transition-all duration-[var(--duration-base)] ease-[var(--ease-smooth)] focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="press-scale px-4 py-2 text-sm rounded-full border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selected.size === 0 || done || (conflictDates.length > 0 && !acknowledgedConflict)}
            className="press-scale px-5 py-2 text-sm rounded-full bg-red-500 text-white shadow-[var(--shadow-neu-raised)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-snappy)] hover:bg-red-600 active:shadow-[var(--shadow-neu-pressed)] disabled:opacity-50 disabled:active:scale-100 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {done
              ? "Blocked ✓"
              : `Block ${selected.size > 0 ? selected.size : ""} date${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
