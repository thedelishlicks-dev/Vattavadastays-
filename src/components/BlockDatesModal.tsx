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
import { saveFailMessage } from "@/lib/bookingActions";
import { blockRows, chunk, datesBetween, findBlockConflicts, partialSaveMessage } from "@/lib/blockDates";

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
  // Several rooms can be closed at once (a festival, maintenance of the whole property).
  const [roomIds, setRoomIds] = useState<Set<string>>(new Set(rooms[0] ? [rooms[0].id] : []));
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Range mode: tap the first and last day instead of every day in between.
  const [rangeMode, setRangeMode] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [acknowledgedConflict, setAcknowledgedConflict] = useState(false);

  const days = buildMonthDays(month);
  const today = new Date(new Date().toDateString());
  const selectedRoomIds = rooms.filter((r) => roomIds.has(r.id)).map((r) => r.id);
  const roomIdsKey = selectedRoomIds.join(",");
  const allSelected = rooms.length > 0 && selectedRoomIds.length === rooms.length;
  const turnoverSafe = useMemo(() => isSameDayTurnoverSafe(property), [property]);

  // For each chosen room, the dates that already have an active booking — so blocking them
  // doesn't silently shadow a real booking. This only ever WARNS; it never stops the click
  // (there can be legitimate reasons to mark a date while sorting out a double-booking).
  const { data: bookedByRoom = {} as Record<string, string[]> } = useQuery({
    queryKey: ["room-bookings-for-block", roomIdsKey, turnoverSafe],
    enabled: selectedRoomIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("room_id, check_in, check_out")
        .in("room_id", selectedRoomIds)
        .neq("status", "cancelled")
        .gte("check_out", format(today, "yyyy-MM-dd"));
      if (error) throw error;
      const byRoom: Record<string, Set<string>> = {};
      (data ?? []).forEach((b) => {
        const effectiveCheckOut = turnoverSafe ? b.check_out : addOneDay(b.check_out);
        const set = (byRoom[b.room_id] ??= new Set<string>());
        eachDate(b.check_in, effectiveCheckOut).forEach((d) => set.add(d));
      });
      return Object.fromEntries(Object.entries(byRoom).map(([k, v]) => [k, Array.from(v)])) as Record<string, string[]>;
    },
  });
  const bookedAny = useMemo(() => new Set(Object.values(bookedByRoom).flat()), [bookedByRoom]);

  const selectedList = useMemo(() => Array.from(selected).sort(), [selected]);
  const conflicts = useMemo(
    () => findBlockConflicts(selectedList, selectedRoomIds, bookedByRoom),
    [selectedList, roomIdsKey, bookedByRoom], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? "Room";
  const rowCount = selectedRoomIds.length * selected.size;

  const toggleRoom = (id: string) => {
    setRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); } else next.add(id);   // always keep at least one room
      return next;
    });
    setAcknowledgedConflict(false);
  };
  const toggleAllRooms = () => {
    setRoomIds(allSelected ? new Set(rooms[0] ? [rooms[0].id] : []) : new Set(rooms.map((r) => r.id)));
    setAcknowledgedConflict(false);
  };

  const toggleDay = (d: Date) => {
    if (isBefore(d, today)) return;
    if (!isSameMonth(d, month)) return;
    const key = format(d, "yyyy-MM-dd");
    setAcknowledgedConflict(false);
    if (rangeMode) {
      if (!anchor) { setAnchor(key); setSelected((prev) => new Set(prev).add(key)); return; }
      // second tap: add every day between the two taps
      const todayKey = format(today, "yyyy-MM-dd");
      setSelected((prev) => {
        const next = new Set(prev);
        datesBetween(anchor, key).filter((x) => x >= todayKey).forEach((x) => next.add(x));
        return next;
      });
      setAnchor(null);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectWholeMonth = () => {
    const todayKey = format(today, "yyyy-MM-dd");
    const first = format(startOfMonth(month), "yyyy-MM-dd");
    const last = format(endOfMonth(month), "yyyy-MM-dd");
    setAcknowledgedConflict(false);
    setSelected((prev) => {
      const next = new Set(prev);
      datesBetween(first, last).filter((x) => x >= todayKey).forEach((x) => next.add(x));
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedRoomIds.length === 0 || selected.size === 0) return;
    if (conflicts.length > 0 && !acknowledgedConflict) return;
    setSaving(true);
    setError("");
    const rows = blockRows(selectedRoomIds, selectedList, note);
    let saved = 0;
    try {
      for (const part of chunk(rows)) {
        const { error: err } = await supabase.from("availability").upsert(part, { onConflict: "room_id,date" });
        if (err) throw err;
        saved += part.length;
      }
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      const reason = saveFailMessage(e, "Couldn't save.");
      setError(saved > 0 ? partialSaveMessage(saved, rows.length, reason) : reason);
    } finally {
      // refresh everything that shows blocked dates, even after a partial save
      qc.invalidateQueries({ queryKey: ["bookings"], exact: false });
      qc.invalidateQueries({ queryKey: ["guest-bookings"], exact: false });
      // the guest-facing "pick your dates" calendar (Availability.tsx) and the owner's calendar page
      qc.invalidateQueries({ queryKey: ["blocked-dates"], exact: false });
      qc.invalidateQueries({ queryKey: ["availability-range"], exact: false });
      setSaving(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-200 fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in-95 duration-[var(--duration-lazy)] [--tw-ease:var(--ease-lazy)] bg-card border border-border rounded-2xl w-full max-w-md shadow-[var(--shadow-neu-raised)] flex flex-col max-h-[calc(100dvh-2rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Block dates</h2>
          </div>
          <button
            onClick={onClose}
            className="press-scale h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body scrolls on its own so the Save button below is always reachable (iPad / phone). */}
        <div className="p-5 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {/* Rooms */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Rooms
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {rooms.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAllRooms}
                  className={["press-scale rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", allSelected ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"].join(" ")}
                >
                  All rooms
                </button>
              )}
              {rooms.map((r) => {
                const on = roomIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRoom(r.id)}
                    aria-pressed={on}
                    className={["press-scale rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", on ? "bg-primary/10 text-primary border-primary" : "border-border text-muted-foreground hover:bg-muted"].join(" ")}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mini calendar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setMonth(addMonths(month, -1))}
                className="press-scale h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">{format(month, "MMMM yyyy")}</span>
              <button
                onClick={() => setMonth(addMonths(month, 1))}
                className="press-scale h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {/* Shortcuts */}
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setRangeMode((v) => !v); setAnchor(null); }}
                aria-pressed={rangeMode}
                className={["press-scale rounded-full border px-3 py-1 text-xs font-medium transition-colors", rangeMode ? "bg-primary/10 text-primary border-primary" : "border-border hover:bg-muted"].join(" ")}
              >
                {rangeMode ? (anchor ? "Tap the last day" : "Tap the first day") : "Select a range"}
              </button>
              <button type="button" onClick={selectWholeMonth} className="press-scale rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted transition-colors">
                Whole month
              </button>
              {selected.size > 0 && (
                <button type="button" onClick={() => { setSelected(new Set()); setAnchor(null); setAcknowledgedConflict(false); }} className="press-scale rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                  Clear
                </button>
              )}
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
                const isBooked = bookedAny.has(key);
                const isAnchor = anchor === key;
                return (
                  <button
                    key={i}
                    disabled={isPast || outOfMonth}
                    onClick={() => toggleDay(d)}
                    title={isBooked ? "Already has a booking on a chosen room" : undefined}
                    className={[
                      "relative aspect-square rounded-md text-xs font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)]",
                      outOfMonth ? "opacity-0 pointer-events-none" : "",
                      isPast ? "text-muted-foreground/40 cursor-not-allowed line-through" : "",
                      isSelected
                        ? "press-scale bg-red-500 text-white animate-in zoom-in-95 fade-in duration-200 [--tw-ease:var(--ease-smooth)]"
                        : !isPast && !outOfMonth
                          ? "press-scale hover:bg-muted"
                          : "",
                      isAnchor && !isSelected ? "ring-2 ring-red-400" : "",
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
              {selected.size} date{selected.size > 1 ? "s" : ""}
              {selectedRoomIds.length > 1 ? ` × ${selectedRoomIds.length} rooms` : ""} will be marked unavailable
              {bookedAny.size > 0 && (
                <span className="inline-flex items-center gap-1 ml-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500 inline-block" /> = already booked
                </span>
              )}
            </p>
          )}

          {conflicts.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
              <div className="flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Some of these dates already have a booking:{" "}
                  {conflicts.map((c) => `${roomName(c.roomId)} (${c.dates.join(", ")})`).join("; ")}.
                  Blocking a date doesn't cancel that booking — if you meant to free up the room, open that
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
              className="focus-glow mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-[var(--shadow-neu-inset-sm)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] focus:outline-none"
            />
          </div>

          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="press-scale px-4 py-2 text-sm rounded-full border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selected.size === 0 || selectedRoomIds.length === 0 || done || (conflicts.length > 0 && !acknowledgedConflict)}
            className="press-scale px-5 py-2 text-sm rounded-full bg-red-500 text-white shadow-[var(--shadow-neu-raised)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {done
              ? "Blocked ✓"
              : `Block ${rowCount > 0 ? rowCount : ""} night${rowCount !== 1 ? "s" : ""}${selectedRoomIds.length > 1 && rowCount > 0 ? " in total" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
