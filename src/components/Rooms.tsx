import { useMemo, useState } from "react";
import { Users, BedDouble, Bath, Filter } from "lucide-react";
import { ROOMS, type Room, type RoomType } from "@/data/rooms";

const ROOM_TYPES: ("All" | RoomType)[] = ["All", "Deluxe", "Standard", "Family", "Dormitory"];
const AMENITY_FILTERS = ["AC", "Attach Bath", "Balcony", "Kitchen"];

type Props = {
  onSelect: (room: Room) => void;
};

export function Rooms({ onSelect }: Props) {
  const [type, setType] = useState<"All" | RoomType>("All");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [sort, setSort] = useState<"low" | "high">("low");

  const toggleAmenity = (a: string) =>
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));

  const filtered = useMemo(() => {
    let list = ROOMS.filter((r) => (type === "All" ? true : r.type === type));
    if (amenities.length) {
      list = list.filter((r) => amenities.every((a) => r.amenities.includes(a)));
    }
    list = [...list].sort((a, b) => (sort === "low" ? a.price - b.price : b.price - a.price));
    return list;
  }, [type, amenities, sort]);

  return (
    <section id="rooms" className="py-16 md:py-24 bg-primary-light/30">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">Step 2</span>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold">Choose your room</h2>
        </div>

        {/* Filter bar */}
        <div className="bg-card border border-border rounded-2xl p-4 md:p-5 shadow-[var(--shadow-soft)] mb-8">
          <div className="flex items-center gap-2 text-sm font-medium mb-4">
            <Filter className="h-4 w-4 text-primary" />
            Filters
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Room type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "All" | RoomType)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
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
                      {a}
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

        {/* Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((room) => (
            <article
              key={room.id}
              className="bg-card rounded-2xl border border-border overflow-hidden shadow-[var(--shadow-soft)] flex flex-col"
            >
              <img
                src={room.image}
                alt={room.name}
                loading="lazy"
                className="h-48 w-full object-cover"
              />
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-xl font-semibold">{room.name}</h3>
                  <span className="text-xs rounded-full bg-primary-light text-primary px-2 py-1">
                    {room.type}
                  </span>
                </div>
                <div className="mt-1 font-display text-2xl font-semibold text-primary">
                  ₹{room.price.toLocaleString("en-IN")}
                  <span className="text-sm text-muted-foreground font-body font-normal"> /night</span>
                </div>

                <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Up to {room.capacity} guests
                  </li>
                  <li className="flex items-center gap-2">
                    <BedDouble className="h-4 w-4 text-primary" /> {room.bedType}
                  </li>
                  <li className="flex items-center gap-2">
                    <Bath className="h-4 w-4 text-primary" /> {room.bathType} bathroom
                  </li>
                </ul>

                {room.amenities.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {room.amenities.map((a) => (
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
                  Extra bed: {room.extraBedPrice ? `₹${room.extraBedPrice}` : "Not available"}
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
      </div>
    </section>
  );
}
