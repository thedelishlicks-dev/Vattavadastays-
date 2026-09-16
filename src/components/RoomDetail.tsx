import { useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { X, Minus, Plus, Coffee, UtensilsCrossed, Truck } from "lucide-react";
import type { Room } from "@/types/database";
import { parseMealsConfig, hasMealInfo } from "@/lib/meals";

type Props = {
  room: Room;
  checkIn: Date | null;
  checkOut: Date | null;
  /** Property's shared_amenities — used to surface meal info (see lib/meals.ts). Optional so this still renders fine if the caller hasn't loaded the property yet. */
  propertyAmenities?: string[] | null;
  onClose: () => void;
  onConfirm: (details: BookingDetails) => void;
};

export type BookingDetails = {
  room: Room;
  adults: number;
  children: number;
  nights: number;
  total: number;
  checkIn: string;
  checkOut: string;
  extraGuestCharge: number;
};

export function RoomDetail({ room, checkIn, checkOut, propertyAmenities, onClose, onConfirm }: Props) {
  const [adults, setAdults] = useState(room.max_guests);
  const [children, setChildren] = useState(0);

  const meals = useMemo(() => parseMealsConfig(propertyAmenities), [propertyAmenities]);

  // Defensive resync: if this component instance is ever reused for a
  // different room (e.g. no `key` prop upstream, or a future refactor),
  // reset the guest selections to that room's own defaults instead of
  // carrying over stale values from whichever room was open before.
  useEffect(() => {
    setAdults(room.max_guests);
    setChildren(0);
  }, [room.id, room.max_guests]);

  const nights =
    checkIn && checkOut
      ? Math.max(1, differenceInCalendarDays(checkOut, checkIn))
      : 1;

  const totals = useMemo(() => {
    const roomCost = room.base_price * nights;
    // Extra charge applies only above max_guests (the included capacity the owner set).
    // This already covers where an extra guest sleeps — most properties don't
    // charge a separate "extra bed" fee on top of the per-head charge. If a
    // guest wants a bed without adding a guest (e.g. splitting a bed for
    // kids), that's a one-off request the owner handles directly and adds
    // to the booking's Extras tab, same as any other add-on.
    const extraGuestCharge =
      Math.max(0, adults - room.max_guests) * (room.extra_guest_price ?? 0) * nights;
    const total = roomCost + extraGuestCharge;
    return { roomCost, extraGuestCharge, total };
  }, [room, nights, adults]);

  const Stepper = ({
    value,
    set,
    min = 0,
    max = 10,
    label,
  }: {
    value: number;
    set: (n: number) => void;
    min?: number;
    max?: number;
    label: string;
  }) => (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => set(Math.max(min, value - 1))}
          className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-accent"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-6 text-center text-sm font-medium">{value}</span>
        <button
          onClick={() => set(Math.min(max, value + 1))}
          className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-background w-full md:max-w-3xl md:rounded-2xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border bg-background">
          <div>
            <h3 className="font-display text-xl font-semibold">{room.name}</h3>
            <p className="text-xs text-muted-foreground">
              {room.room_type} · ₹{room.base_price}/night · up to {room.max_guests} guests included
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full hover:bg-accent flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {room.images?.[0] && (
            <img
              src={room.images[0]}
              alt={room.name}
              className="h-56 w-full object-cover rounded-xl"
            />
          )}

          <div>
            <h4 className="font-medium text-sm mb-2">Amenities</h4>
            <div className="flex flex-wrap gap-1.5">
              {[room.bed_type, ...(room.room_amenities ?? [])].map((a) => (
                <span
                  key={a}
                  className="text-xs rounded-full bg-secondary text-secondary-foreground px-2.5 py-1"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* Meal info — purely informational, not part of the price below.
              Real charges for anything ordered are added by the owner on
              the booking's Extras tab once the stay is underway. */}
          {hasMealInfo(meals) && (
            <div className="rounded-xl border border-border p-4 space-y-2.5">
              <h4 className="font-medium text-sm">Meals</h4>
              {meals.breakfast === "included" && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Coffee className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Breakfast is included in the room rate.</span>
                </div>
              )}
              {meals.breakfast === "paid" && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Coffee className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Breakfast available{meals.breakfast_note ? ` — ${meals.breakfast_note}` : ""}.</span>
                </div>
              )}
              {meals.kitchen_available && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <UtensilsCrossed className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Lunch/dinner from the in-house kitchen{meals.kitchen_note ? ` — ${meals.kitchen_note}` : ""}.</span>
                </div>
              )}
              {meals.delivery_available && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Truck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>Food delivery can be arranged{meals.delivery_note ? ` — ${meals.delivery_note}` : ""}.</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground/80 pt-0.5">
                Prices aren't fixed at booking — order what you like during your stay and
                it'll be added to your bill.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border p-4 space-y-3">
            <h4 className="font-medium text-sm">Guests</h4>

            {/* Adults stepper — max is room.max_guests (included) + reasonable overflow */}
            <Stepper
              value={adults}
              set={setAdults}
              min={1}
              max={room.max_guests + 4}
              label={`Adults (${room.max_guests} included in price)`}
            />
            <Stepper value={children} set={setChildren} max={4} label="Children" />

            {/* Show extra charge hint once adults exceed included capacity */}
            {adults > room.max_guests && (
              <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                {adults - room.max_guests} extra guest{adults - room.max_guests > 1 ? "s" : ""} above included capacity · ₹{((adults - room.max_guests) * (room.extra_guest_price ?? 0) * nights).toLocaleString("en-IN")} charge
              </div>
            )}
          </div>

          <div className="rounded-xl bg-primary-light/40 border border-border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Room ({nights} night{nights > 1 ? "s" : ""})</span>
              <span>₹{totals.roomCost.toLocaleString("en-IN")}</span>
            </div>
            {totals.extraGuestCharge > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Extra guests ({adults - room.max_guests} × ₹{room.extra_guest_price}/night)</span>
                <span>₹{totals.extraGuestCharge.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="border-t border-border pt-2 flex justify-between font-display text-lg font-semibold">
              <span>Total</span>
              <span>₹{totals.total.toLocaleString("en-IN")}</span>
            </div>
          </div>

          {!checkIn || !checkOut ? (
            <p className="text-center text-sm text-muted-foreground">
              Go back and select dates to continue.
            </p>
          ) : (
            <button
              onClick={() =>
                onConfirm({
                  room,
                  adults,
                  children,
                  nights,
                  total: totals.total,
                  checkIn: format(checkIn, "yyyy-MM-dd"),
                  checkOut: format(checkOut, "yyyy-MM-dd"),
                  extraGuestCharge: totals.extraGuestCharge,
                })
              }
              className="w-full rounded-full bg-primary py-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Continue to booking
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
