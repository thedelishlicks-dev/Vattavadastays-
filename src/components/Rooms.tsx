import { useMemo, useState } from "react";
import { Users, BedDouble, Bath, Filter } from "lucide-react";
import { useProperty } from "@/hooks/useProperty";
import type { Room } from "@/types/database";

const AMENITY_FILTERS = ["ac", "balcony", "kitchen", "attach_bath"];
const AMENITY_LABELS: Record<string, string> = {
  ac: "AC",
  balcony: "Balcony",
  kitchen: "Kitchen",
  attach_bath: "Attach Bath",
};

type Props = {
  onSelect: (room: Room) => void;
};

export function Rooms({ onSelect }: Props) {
  const [amenities, setAmenities] = useState<string[]>([]);
  const [sort, setSort] = useState<"low" | "high">("low");

  const { data: property, isLoading, error } = useProperty("bleafmudhouse");
  const rooms: Room[] = property?.rooms ?? [];

  const toggleAmenity = (a: string) =>
    setAmenities((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );

  const filtered = useMemo(() => {
    let list = rooms.filter((r) => r.is_active);
    if (amenities.length) {
      list = list.filter((r) =>
        amenities.every((a) => r.room_amenities?.includes(a))
      );
    }
    list = [...list].sort((a, b) =>
      sort === "low"
        ? a.base_price - b.base_price
        : b.base_price - a.base_price
    );
    return list;
  }, [rooms, amenities, sort]);

  return (
    <section id="rooms" className="py-16 md:py-24 bg-primary-light/30">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            Step 2
          </span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold">
            Choose your room
          </h2>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shadow-[var(--shadow-soft)] mb-8">
          <div className="flex items-center gap-2 text-sm font-medium mb-4">
            <Filter className="h-4 w-4 text-primary" />
            Filters
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Amenities
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {AMENITY_FILTERS.map((a) => {
                  const active = amenities.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => toggleAmenity(a)}
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-accent",
                      ].join(" ")}
                    >
                      {AMENITY_LABELS[a]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Sort by price
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "low" | "high")}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="low">Low to high</option>
                <option value="high">High to low</option>
              </select>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-80 rounded-2xl bg-muted animate-pulse"
              />
            ))}
          </div>
        )}

        {error && (
          <p className="text-center text-muted-foreground py-10">
            Unable to load rooms. Please try again.
          </p>
        )}

        {!isLoading && !error && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((room) => (
              <article
                key={room.id}
                className="bg-card rounded-2xl border border-border overflow-hidden shadow-[var(--shadow-soft)] flex flex-col"
              >
                <img
                  src={room.images?.[0] ?? "/placeholder.jpg"}
                  alt={room.name}
                  loading="lazy"
                  className="h-48 w-full object-cover"
                />
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-semibold">
                      {room.name}
                    </h3>
                    <span className="text-xs rounded-full bg-primary-light text-primary px-2 py-1">
                      {room.room_type}
                    </span>
                  </div>
                  <div className="mt-1 font-display text-2xl font-semibold text-primary">
                    ₹{room.base_price.toLocaleString("en-IN")}
                    <span className="text-sm text-muted-foreground font-normal">
                      {" "}
                      /night
                    </span>
                  </div>
                  <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> Up to{" "}
                      {room.max_guests} guests
                    </li>
                    <li className="flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-primary" />{" "}
                      {room.bed_type}
                    </li>
                    <li className="flex items-center gap-2">
                      <Bath className="h-4 w-4 text-primary" /> Attached
                      bathroom
                    </li>
                  </ul>
                  {room.room_amenities?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {room.room_amenities.map((a) => (
                        <span
                          key={a}
                          className="text-[11px] rounded-full bg-secondary text-secondary-foreground px-2 py-0.5"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 text-xs text-muted-foreground">
                    Extra guest:{" "}
                    {room.extra_guest_price
                      ? `₹${room.extra_guest_price}/night`
                      : "Not available"}
                  </div>
                  <button
                    onClick={() => onSelect(room)}
                    className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Select Room
                  </button>
                </div>
              </article>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-10">
                No rooms match these filters.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
