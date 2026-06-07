import { useMemo, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { X, Minus, Plus } from "lucide-react";
import type { Room } from "@/types/database";

type MealPlan = "None" | "Breakfast" | "Half Board" | "Full Board";
const MEAL_PRICES: Record<MealPlan, number> = {
  None: 0,
  Breakfast: 200,
  "Half Board": 450,
  "Full Board": 700,
};

type Props = {
  room: Room;
  checkIn: Date | null;
  checkOut: Date | null;
  onClose: () => void;
  onConfirm: (details: BookingDetails) => void;
};

export type BookingDetails = {
  room: Room;
  adults: number;
  children: number;
  extraBeds: number;
  meal: MealPlan;
  nights: number;
  total: number;
  checkIn: string;
  checkOut: string;
  extraGuestCharge: number;
};

export function RoomDetail({ room, checkIn, checkOut, onClose, onConfirm }: Props) {
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [extraBeds, setExtraBeds] = useState(0);
  const [meal, setMeal] = useState<MealPlan>("None");

  const nights =
    checkIn && checkOut
      ? Math.max(1, differenceInCalendarDays(checkOut, checkIn))
      : 1;

  const totals = useMemo(() => {
    const roomCost = room.base_price * nights;
    const extraGuestCharge =
      Math.max(0, adults - 2) * (room.extra_guest_price ?? 0) * nights;
    const extraBedCost = extraBeds * (room.extra_guest_price ?? 0) * nights;
    const mealCost = MEAL_PRICES[meal] * (adults + children) * nights;
    const total = roomCost + extraGuestCharge + extraBedCost + mealCost;
    return { roomCost, extraGuestCharge, extraBedCost, mealCost, total };
  }, [room, nights, extraBeds, meal, adults, children]);

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
              {room.room_type} · ₹{room.base_price}/night
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

          <div className="rounded-xl border border-border p-4 space-y-3">
            <h4 className="font-medium text-sm">Guests & meals</h4>
            <Stepper
              value={adults}
              set={setAdults}
              min={1}
              max={room.max_guests}
              label="Adults"
            />
            <Stepper value={children} set={setChildren} max={4} label="Children" />
            <Stepper
              value={extraBeds}
              set={setExtraBeds}
              max={3}
              label={`Extra beds (₹${room.extra_guest_price ?? 0}/night)`}
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm">Meal plan</span>
              <select
                value={meal}
                onChange={(e) => setMeal(e.target.value as MealPlan)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              >
                {(Object.keys(MEAL_PRICES) as MealPlan[]).map((m) => (
                  <option key={m} value={m}>
                    {m} {MEAL_PRICES[m] ? `(+₹${MEAL_PRICES[m]}/pp/day)` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl bg-primary-light/40 border border-border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Room ({nights} night{nights > 1 ? "s" : ""})</span>
              <span>₹{totals.roomCost.toLocaleString("en-IN")}</span>
            </div>
            {totals.extraGuestCharge > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Extra guest charge</span>
                <span>₹{totals.extraGuestCharge.toLocaleString("en-IN")}</span>
              </div>
            )}
            {totals.extraBedCost > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Extra beds</span>
                <span>₹{totals.extraBedCost.toLocaleString("en-IN")}</span>
              </div>
            )}
            {totals.mealCost > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Meals</span>
                <span>₹{totals.mealCost.toLocaleString("en-IN")}</span>
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
                  extraBeds,
                  meal,
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
