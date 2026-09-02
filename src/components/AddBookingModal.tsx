import { useState, useMemo, useEffect, useRef } from "react";
import { Loader2, X, Check, ChevronDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useAgents } from "@/hooks/useAgents";
import { AgentFormModal } from "@/components/AgentFormModal";
import { RoomAvailabilityCalendar } from "@/components/RoomAvailabilityCalendar";
import { getConflictingDates, markDatesUnavailable, isSameDayTurnoverSafe, type TurnoverPolicyInput } from "@/lib/bookingAvailability";
import { confirmationLink, paymentReminderLink, guestTrackingUrl } from "@/lib/whatsapp";
import { extractUPIId } from "@/utils/upi";
import type { BookingStatus, BookingSource, Agent } from "@/types/database";

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const labelCls = "block text-xs font-medium text-muted-foreground mb-1";

const SOURCE_OPTIONS: { value: BookingSource; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "agent", label: "Agent" },
  { value: "walk_in", label: "Walk-in" },
];

/** Commission for a room-rate base, using an agent's default rate. */
function calcCommission(agent: Agent, roomRateBase: number): number {
  const raw =
    agent.default_commission_type === "percentage"
      ? roomRateBase * (agent.default_commission_value / 100)
      : agent.default_commission_value;
  return Math.round(raw * 100) / 100;
}

interface Room {
  id: string;
  name: string;
  base_price: number;
  extra_guest_price: number;
  max_guests: number;
}

interface AddBookingModalProps {
  propertyId: string;
  /** Needs at least check_in_time/check_out_time — used to determine
   * whether same-day turnover is safe for this property (see
   * isSameDayTurnoverSafe in bookingAvailability.ts). Also used, when
   * present, to auto-send the guest a WhatsApp tracking/confirmation
   * message right after the booking is saved — name/owner_phone/
   * owner_whatsapp/shared_amenities (for the UPI id) are all optional so
   * this still works for callers that only pass the turnover-policy shape. */
  property: TurnoverPolicyInput & {
    name?: string;
    owner_phone?: string | null;
    owner_whatsapp?: string | null;
    shared_amenities?: string[] | null;
  };
  rooms: Room[];
  onClose: () => void;
  onSaved?: () => void;
}

export function AddBookingModal({ propertyId, property, rooms, onClose, onSaved }: AddBookingModalProps) {
  const turnoverSafe = useMemo(() => isSameDayTurnoverSafe(property), [property]);
  const [form, setForm] = useState({
    guest_name: "",
    guest_phone: "+91 ",
    guest_email: "",
    check_in: "",
    check_out: "",
    guest_count: 2 as number | string,
    status: "confirmed" as BookingStatus,
    source: "direct" as BookingSource,
    agent_id: "" as string,
  });
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([rooms[0]?.id ?? ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<Record<string, string[]>>({});
  const queryClient = useQueryClient();
  // Hidden anchor, clicked programmatically right after a successful save —
  // same trick BookingForm.tsx uses for the guest→owner notify link. Opening
  // WhatsApp via window.open() after the async supabase calls above would
  // get blocked as a popup by most browsers; a real anchor click doesn't.
  const waRef = useRef<HTMLAnchorElement>(null);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const { data: agents = [] } = useAgents(propertyId);
  const [showNewAgentModal, setShowNewAgentModal] = useState(false);
  // Commission is auto-filled whenever the agent (or the room-rate total it's
  // based on) changes, but stays editable for one-off negotiated rates. Once
  // the owner types into the field directly we stop overwriting it — until
  // they pick a different agent, which resets to that agent's rate again.
  const [commissionAmount, setCommissionAmount] = useState<number | "">("");
  const [commissionEdited, setCommissionEdited] = useState(false);

  const selectedAgent = agents.find((a) => a.id === form.agent_id) ?? null;

  const nights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0;
    return Math.max(0, (new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) / 86400000);
  }, [form.check_in, form.check_out]);

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((prev) =>
      prev.includes(roomId)
        ? prev.length > 1 ? prev.filter((id) => id !== roomId) : prev
        : [...prev, roomId]
    );
    setConflicts((prev) => { const next = { ...prev }; delete next[roomId]; return next; });
  };

  const guestCount = Number(form.guest_count) || 1;
  const selectedRooms = rooms.filter((r) => selectedRoomIds.includes(r.id));
  const hasConflicts = Object.values(conflicts).some((dates) => dates.length > 0);

  const roomTotals = useMemo(() => selectedRooms.map((r) => {
    const base = r.base_price * nights;
    const extra = Math.max(0, guestCount - r.max_guests) * (r.extra_guest_price ?? 0) * nights;
    return { room: r, roomPrice: base, extraCharge: extra, total: base + extra };
  }), [selectedRooms, nights, guestCount]);

  const grandTotal = roomTotals.reduce((s, r) => s + r.total, 0);
  // Commission base is room rate only (not extra-guest charges), matching
  // the spec: "auto-fill using the agent's default rate, calculated from
  // the booking's room rate". Summed across rooms for multi-room bookings.
  const roomRateTotal = roomTotals.reduce((s, r) => s + r.roomPrice, 0);

  // Auto-fill commission from the selected agent's default rate whenever the
  // agent or the underlying room-rate total changes — unless the owner has
  // already typed a one-off value into the field for this agent selection.
  useEffect(() => {
    if (form.source !== "agent" || !selectedAgent) {
      setCommissionAmount("");
      return;
    }
    if (commissionEdited) return;
    setCommissionAmount(calcCommission(selectedAgent, roomRateTotal));
  }, [form.source, selectedAgent, roomRateTotal, commissionEdited]);

  const handleSelectAgent = (agentId: string) => {
    set("agent_id", agentId);
    setCommissionEdited(false); // fresh agent → re-derive suggested commission
  };

  const handleAgentCreated = (agent: Agent) => {
    handleSelectAgent(agent.id);
    setShowNewAgentModal(false);
  };

  const handleSourceChange = (source: BookingSource) => {
    set("source", source);
    if (source !== "agent") {
      set("agent_id", "");
      setCommissionEdited(false);
    }
  };

  const handleSave = async () => {
    if (!form.guest_name.trim()) { setError("Guest name is required"); return; }
    if (nights <= 0) { setError("Check-out must be after check-in"); return; }
    if (selectedRoomIds.length === 0) { setError("Select at least one room"); return; }
    if (form.source === "agent" && !form.agent_id) { setError("Select an agent, or add a new one"); return; }
    setSaving(true);
    setError("");
    setConflicts({});
    try {
      const conflictResults = await Promise.all(
        selectedRoomIds.map(async (roomId) => {
          const blockedDates = await getConflictingDates(roomId, form.check_in, form.check_out, property);
          return { roomId, blockedDates };
        })
      );
      const newConflicts: Record<string, string[]> = {};
      for (const { roomId, blockedDates } of conflictResults) {
        if (blockedDates.length > 0) newConflicts[roomId] = blockedDates;
      }
      if (Object.keys(newConflicts).length > 0) {
        setConflicts(newConflicts);
        setSaving(false);
        return;
      }

      const isAgentBooking = form.source === "agent" && !!form.agent_id;
      const finalCommission = isAgentBooking && commissionAmount !== "" ? Number(commissionAmount) : null;

      if (selectedRoomIds.length === 1) {
        const rt = roomTotals[0];
        const { error: err } = await supabase.from("bookings").insert({
          property_id: propertyId, room_id: rt.room.id,
          guest_name: form.guest_name, guest_phone: form.guest_phone,
          guest_email: form.guest_email || null, guest_count: guestCount,
          check_in: form.check_in, check_out: form.check_out,
          room_price: rt.roomPrice, extra_guest_charge: rt.extraCharge,
          total_amount: rt.total, advance_amount: 0, discount_amount: 0,
          status: form.status, is_paid: false,
          source: form.source,
          agent_id: isAgentBooking ? form.agent_id : null,
          commission_amount: finalCommission,
          commission_paid: false,
        });
        if (err) throw err;
      } else {
        // Multi-room: commission is calculated once for the whole booking
        // (on the summed room rate across all rooms) and stored on the
        // group, not split across individual room rows — same pattern
        // total_amount already uses. Member booking rows still carry
        // source/agent_id for traceability, but leave commission_amount
        // null so ledger sums never double-count a group's commission.
        const { data: groupData, error: groupErr } = await supabase
          .from("booking_groups")
          .insert({
            property_id: propertyId,
            group_reference: "GRP-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
            guest_name: form.guest_name, guest_phone: form.guest_phone,
            guest_email: form.guest_email || null, guest_count: guestCount,
            check_in: form.check_in, check_out: form.check_out,
            total_amount: grandTotal, advance_amount: 0, discount_amount: 0,
            status: form.status, is_paid: false,
            source: form.source,
            agent_id: isAgentBooking ? form.agent_id : null,
            commission_amount: finalCommission,
            commission_paid: false,
          })
          .select()
          .single();
        if (groupErr) throw groupErr;
        const bookingInserts = roomTotals.map((rt) => ({
          property_id: propertyId, room_id: rt.room.id,
          guest_name: form.guest_name, guest_phone: form.guest_phone,
          guest_email: form.guest_email || null, guest_count: guestCount,
          check_in: form.check_in, check_out: form.check_out,
          room_price: rt.roomPrice, extra_guest_charge: rt.extraCharge,
          total_amount: rt.total, advance_amount: 0, discount_amount: 0,
          status: form.status, is_paid: false, group_id: groupData.id,
          source: form.source,
          agent_id: isAgentBooking ? form.agent_id : null,
          commission_amount: null,
          commission_paid: false,
        }));
        const { error: bookErr } = await supabase.from("bookings").insert(bookingInserts);
        if (bookErr) throw bookErr;
      }

      // Keep the `availability` table in sync immediately, the same way the
      // guest-facing booking flow does — don't rely on the status-UPDATE
      // trigger, since this is an INSERT and the trigger won't fire for it.
      await Promise.all(
        selectedRoomIds.map((roomId) => markDatesUnavailable(roomId, form.check_in, form.check_out))
      );

      queryClient.invalidateQueries({ queryKey: ["bookings", propertyId], exact: false });
      queryClient.invalidateQueries({ queryKey: ["bookingGroups", propertyId], exact: false });

      // Auto-send the guest their tracking link on WhatsApp — same message
      // the owner used to send by hand. Skipped if there's no usable guest
      // phone number, or the property has no owner contact number to send
      // the message "from" (needed for the confirmed-booking template).
      const guestPhoneDigits = form.guest_phone.replace(/\D/g, "");
      const ownerPhone = property.owner_phone ?? property.owner_whatsapp ?? "";
      if (guestPhoneDigits.length >= 10 && property.name) {
        const trackingUrl = guestTrackingUrl(window.location.origin, form.guest_phone);
        const roomName = selectedRooms.map((r) => r.name).join(", ");
        const waLink =
          form.status === "confirmed"
            ? confirmationLink({
                guestPhone: form.guest_phone,
                guestName: form.guest_name,
                propertyName: property.name,
                roomName,
                checkIn: form.check_in,
                checkOut: form.check_out,
                ownerPhone,
                trackingUrl,
              })
            : paymentReminderLink({
                guestPhone: form.guest_phone,
                guestName: form.guest_name,
                totalAmount: grandTotal,
                advancePaid: 0,
                checkIn: form.check_in,
                propertyName: property.name,
                ownerPhone,
                upiId: extractUPIId(property.shared_amenities ?? null) ?? undefined,
                trackingUrl,
              });
        if (waRef.current) {
          waRef.current.href = waLink;
          waRef.current.click();
        }
      }

      onSaved?.();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Hidden anchor for WhatsApp without popup blocker — see waRef above */}
      <a ref={waRef} href="#" target="_blank" rel="noreferrer" className="hidden" aria-hidden="true" />
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-card rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Add Booking</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Guest details */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Guest details</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Guest name *</label><input value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} className={inputCls} placeholder="Full name" /></div>
              <div><label className={labelCls}>Phone</label><input type="tel" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)} className={inputCls} /></div>
            </div>
            <div><label className={labelCls}>Email</label><input type="email" value={form.guest_email} onChange={(e) => set("guest_email", e.target.value)} className={inputCls} placeholder="Optional" /></div>
          </div>

          {/* Booking source */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">How did this booking come in?</p>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSourceChange(opt.value)}
                  className={[
                    "flex-1 px-3 py-2 text-sm font-medium transition-colors",
                    form.source === opt.value ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.source === "agent" && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                <div>
                  <label className={labelCls}>Agent</label>
                  <div className="relative">
                    <select
                      value={form.agent_id}
                      onChange={(e) => {
                        if (e.target.value === "__new__") {
                          setShowNewAgentModal(true);
                        } else {
                          handleSelectAgent(e.target.value);
                        }
                      }}
                      className={`${inputCls} appearance-none pr-8`}
                    >
                      <option value="" disabled>Select an agent</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.default_commission_type === "percentage" ? `${a.default_commission_value}%` : `₹${a.default_commission_value} flat`})
                        </option>
                      ))}
                      <option value="__new__">+ Add new agent</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {form.agent_id && (
                  <div>
                    <label className={labelCls}>
                      Commission {roomRateTotal > 0 ? `(from ₹${roomRateTotal.toLocaleString("en-IN")} room rate)` : ""}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                      <input
                        type="number"
                        min={0}
                        value={commissionAmount}
                        onChange={(e) => {
                          setCommissionEdited(true);
                          setCommissionAmount(e.target.value === "" ? "" : parseFloat(e.target.value));
                        }}
                        className={`${inputCls} pl-7`}
                        placeholder="0"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Auto-filled from {selectedAgent?.name}'s default rate — editable for a one-off negotiated rate.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Room selection */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select rooms <span className="normal-case text-primary font-normal">(tap to add/remove)</span></p>
            <div className="space-y-2">
              {rooms.map((r) => {
                const selected = selectedRoomIds.includes(r.id);
                const extraCharge = nights > 0 ? Math.max(0, guestCount - r.max_guests) * (r.extra_guest_price ?? 0) * nights : 0;
                const roomTotal = nights > 0 ? r.base_price * nights + extraCharge : 0;
                const roomConflicts = conflicts[r.id] ?? [];
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleRoom(r.id)}
                    className={[
                      "w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                      roomConflicts.length > 0
                        ? "border-destructive/50 bg-destructive/5"
                        : selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                    ].join(" ")}
                  >
                    <div className={["h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors", selected ? "border-primary bg-primary" : "border-border"].join(" ")}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        ₹{r.base_price.toLocaleString("en-IN")}/night · {r.max_guests} guests included
                        {r.extra_guest_price > 0 ? ` · +₹${r.extra_guest_price}/extra guest` : ""}
                      </div>
                      {roomConflicts.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-destructive font-medium">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          Not available: {roomConflicts.slice(0, 3).join(", ")}{roomConflicts.length > 3 ? ` +${roomConflicts.length - 3} more` : ""}
                        </div>
                      )}
                    </div>
                    {selected && nights > 0 && roomConflicts.length === 0 && <div className="text-sm font-semibold text-primary shrink-0">₹{roomTotal.toLocaleString("en-IN")}</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stay dates */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stay dates</p>
            <RoomAvailabilityCalendar
              roomIds={selectedRoomIds}
              checkIn={form.check_in}
              checkOut={form.check_out}
              turnoverSafe={turnoverSafe}
              onChange={(checkIn, checkOut) => {
                set("check_in", checkIn);
                set("check_out", checkOut);
                setConflicts({});
              }}
            />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Check-in</div>
                <div className="mt-0.5 font-medium">{form.check_in || "Select date"}</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Check-out</div>
                <div className="mt-0.5 font-medium">{form.check_out || "Select date"}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Total guests</label><input type="number" min={1} max={50} value={form.guest_count} onChange={(e) => set("guest_count", e.target.value === "" ? "" : parseInt(e.target.value) || 1)} className={inputCls} /></div>
              <div><label className={labelCls}>Status</label><select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>{["pending", "confirmed"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select></div>
            </div>
          </div>

          {/* Summary */}
          {nights > 0 && selectedRooms.length > 0 && !hasConflicts && (
            <div className="rounded-xl bg-primary-light/40 border border-border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{selectedRooms.length} room{selectedRooms.length > 1 ? "s" : ""} · {nights} night{nights > 1 ? "s" : ""}</p>
              {roomTotals.map((rt) => (
                <div key={rt.room.id} className="flex justify-between text-sm"><span className="text-muted-foreground truncate mr-2">{rt.room.name}</span><span className="font-medium shrink-0">₹{rt.total.toLocaleString("en-IN")}</span></div>
              ))}
              {selectedRooms.length > 1 && (
                <div className="flex justify-between text-sm font-semibold text-primary border-t border-border pt-2 mt-1"><span>Total</span><span>₹{grandTotal.toLocaleString("en-IN")}</span></div>
              )}
              {form.source === "agent" && form.agent_id && commissionAmount !== "" && (
                <div className="flex justify-between text-xs text-muted-foreground border-t border-border pt-2 mt-1">
                  <span>Commission to {selectedAgent?.name}</span>
                  <span>₹{Number(commissionAmount).toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {hasConflicts && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Some rooms are not available for the selected dates. Please adjust dates or deselect conflicting rooms.
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || hasConflicts}
              className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Checking availability…" : selectedRoomIds.length > 1 ? `Book ${selectedRoomIds.length} rooms` : "Add booking"}
            </button>
          </div>
        </div>
      </div>

      {showNewAgentModal && (
        <AgentFormModal
          propertyId={propertyId}
          agent={null}
          onClose={() => setShowNewAgentModal(false)}
          onSaved={handleAgentCreated}
        />
      )}
    </div>
  );
}
