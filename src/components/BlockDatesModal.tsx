import { useState } from "react";
import { X, Ban, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
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
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  propertyId: string;
  rooms: { id: string; name: string }[];
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

export function BlockDatesModal({ propertyId, rooms, onClose }: Props) {
  const qc = useQueryClient();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const days = buildMonthDays(month);
  const today = new Date(new Date().toDateString());

  const toggleDay = (d: Date) => {
    if (isBefore(d, today)) return;
    if (!isSameMonth(d, month)) return;
    const key = format(d, "yyyy-MM-dd");
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
      setDone(true);
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Block dates</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted"
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
              }}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-medium">{format(month, "MMMM yyyy")}</span>
              <button
                onClick={() => setMonth(addMonths(month, 1))}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted"
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
                return (
                  <button
                    key={i}
                    disabled={isPast || outOfMonth}
                    onClick={() => toggleDay(d)}
                    className={[
                      "aspect-square rounded-md text-xs font-medium transition-colors",
                      outOfMonth ? "opacity-0 pointer-events-none" : "",
                      isPast ? "text-muted-foreground/40 cursor-not-allowed line-through" : "",
                      isSelected
                        ? "bg-red-500 text-white"
                        : !isPast && !outOfMonth
                          ? "hover:bg-muted"
                          : "",
                    ].join(" ")}
                  >
                    {format(d, "d")}
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
            </p>
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
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-full border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selected.size === 0 || done}
            className="px-5 py-2 text-sm rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
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
