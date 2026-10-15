// src/components/RoomRatesEditor.tsx
//
// Seasonal / date-range rates for ONE room, inside the room editor drawer.
// Rates save immediately (their own table), independent of the drawer's
// "Save changes". The rules live in lib/roomRates.ts; the guest page, owner
// bookings and quotes all price through priceRoomStay(), so a rate added here
// changes every price the next time it loads.

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyDbError } from "@/lib/dbErrors";
import { useRoomRates, roomRatesKey } from "@/hooks/useRoomRates";
import { RoomAvailabilityCalendar } from "@/components/RoomAvailabilityCalendar";
import { describeRate, parseRate, rateBasePrice, type RateKind, type RoomRate } from "@/lib/roomRates";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const fmt = (d: string) => format(parseISO(d), "d MMM yyyy");

interface Props {
  propertyId: string;
  room: { id: string; name: string; base_price: number };
}

export function RoomRatesEditor({ propertyId, room }: Props) {
  const qc = useQueryClient();
  const { data: allRates = [], isLoading, isError } = useRoomRates(propertyId);
  const rates = useMemo(
    () => allRates.filter((r) => r.room_id === room.id || r.room_id === null),
    [allRates, room.id],
  );

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [kind, setKind] = useState<RateKind>("fixed");
  const [value, setValue] = useState("");
  const [allRooms, setAllRooms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setAdding(false); setLabel(""); setStart(""); setEnd(""); setKind("fixed"); setValue(""); setAllRooms(false); setError(""); };

  const parsed = parseRate({ label, start_date: start, end_date: end, kind, value });
  const preview =
    parsed.ok
      ? `${differenceInCalendarDays(parseISO(parsed.values.end_date), parseISO(parsed.values.start_date)) + 1} night(s) at ₹${rateBasePrice(
          { room_id: null, start_date: start, end_date: end, kind, value: parsed.values.value },
          room.base_price,
        ).toLocaleString("en-IN")}/night`
      : "";

  const handleAdd = async () => {
    if (!parsed.ok) { setError(parsed.error); return; }
    setSaving(true);
    setError("");
    try {
      const { error: err } = await supabase.from("room_rates").insert({
        property_id: propertyId,
        room_id: allRooms ? null : room.id,
        ...parsed.values,
      });
      if (err) throw err;
      await qc.invalidateQueries({ queryKey: roomRatesKey(propertyId) });
      reset();
    } catch (e) {
      setError(friendlyDbError(e, "Could not save this rate."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: RoomRate) => {
    if (!r.id) return;
    if (!window.confirm(`Remove ${r.label?.trim() ? `"${r.label}"` : "this rate"} (${fmt(r.start_date)} – ${fmt(r.end_date)})?`)) return;
    const { error: err } = await supabase.from("room_rates").delete().eq("id", r.id);
    if (err) { setError(friendlyDbError(err)); return; }
    qc.invalidateQueries({ queryKey: roomRatesKey(propertyId) });
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Seasonal rates</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Charge a different nightly price for peak or off-season dates (Christmas, April–May, Onam…). Nights outside
          these dates use the base price above. The Fri/Sat multiplier still applies on top.
        </p>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {isError && (
        <p className="text-xs text-destructive">
          Couldn’t load seasonal rates. If this keeps happening, the rates table may not be set up yet.
        </p>
      )}

      {rates.length > 0 && (
        <ul className="space-y-2">
          {rates.map((r) => {
            const nights = differenceInCalendarDays(parseISO(r.end_date), parseISO(r.start_date)) + 1;
            return (
              <li key={r.id ?? `${r.start_date}-${r.end_date}`} className="rounded-lg border border-border px-3 py-2 flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="font-medium truncate">
                    {r.label?.trim() || "Special rate"}
                    {r.room_id === null && <span className="ml-2 text-[10px] uppercase tracking-wider rounded-full bg-muted px-2 py-0.5 text-muted-foreground align-middle">All rooms</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{fmt(r.start_date)} – {fmt(r.end_date)} · {nights} night{nights > 1 ? "s" : ""}</div>
                  <div className="text-xs">{describeRate(r, room.base_price)}</div>
                </div>
                <button type="button" onClick={() => handleDelete(r)} className="h-8 w-8 shrink-0 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Remove rate">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="w-full rounded-lg border border-dashed border-border py-2.5 text-sm font-medium hover:bg-muted/50 flex items-center justify-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add seasonal rate
        </button>
      ) : (
        <div className="rounded-xl border border-border p-3 space-y-3 bg-muted/20">
          <div>
            <label className={labelCls}>Name (optional)</label>
            <input className={inputCls} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Christmas / New Year" />
          </div>

          <div>
            <label className={labelCls}>Pick the first and last night</label>
            <RoomAvailabilityCalendar
              roomIds={[room.id]}
              checkIn={start}
              checkOut={end}
              turnoverSafe
              softBlock
              inclusiveEnd
              onChange={(a, b) => { setStart(a); setEnd(b); }}
            />
            <div className="grid grid-cols-2 gap-3 text-sm mt-2">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">First night</div>
                <div className="mt-0.5 font-medium">{start ? fmt(start) : "Select date"}</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Last night</div>
                <div className="mt-0.5 font-medium">{end ? fmt(end) : start ? "Tap the last date (or the same date)" : "Select date"}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Price type</label>
              <select className={inputCls} value={kind} onChange={(e) => { setKind(e.target.value as RateKind); setValue(""); }}>
                <option value="fixed">Fixed ₹ per night</option>
                <option value="percent">% change on base price</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{kind === "fixed" ? "₹ per night" : "% (e.g. 30 or -20)"}</label>
              <input className={inputCls} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "fixed" ? String(room.base_price) : "30"} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={allRooms} onChange={(e) => setAllRooms(e.target.checked)} />
            Apply to <strong>all rooms</strong> of this property (percent works best for this)
          </label>

          {preview && <p className="text-xs text-muted-foreground">{preview}</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex-1 rounded-full border border-border py-2 text-sm hover:bg-muted">Cancel</button>
            <button type="button" onClick={handleAdd} disabled={saving || !parsed.ok} className="flex-1 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save rate
            </button>
          </div>
        </div>
      )}
      {!adding && error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">If two periods overlap, a room-specific rate beats an all-rooms rate, then the one that starts later wins.</p>
    </div>
  );
}
