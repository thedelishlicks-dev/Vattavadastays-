import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil, Users, BedDouble, Bath } from "lucide-react";
import { ROOMS, type Room } from "@/data/rooms";

export const Route = createFileRoute("/admin/rooms")({
  component: RoomsAdmin,
});

function RoomsAdmin() {
  const [rooms, setRooms] = useState(ROOMS.map((r) => ({ ...r, active: true })));

  const toggle = (id: string) =>
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, active: !r.active } : r)));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Rooms</h1>
          <p className="text-sm text-muted-foreground">
            Manage room types, pricing, and availability.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Add room
        </button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rooms.map((r) => (
          <RoomAdminCard key={r.id} room={r} onToggle={() => toggle(r.id)} />
        ))}
      </div>
    </div>
  );
}

function RoomAdminCard({
  room,
  onToggle,
}: {
  room: Room & { active: boolean };
  onToggle: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="relative">
        <img src={room.image} alt={room.name} className="h-40 w-full object-cover" />
        <span
          className={`absolute top-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded-full ${room.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          {room.active ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium">{room.name}</h3>
            <span className="text-xs text-muted-foreground">{room.type}</span>
          </div>
          <div className="font-display text-lg font-semibold text-primary">
            ₹{room.price.toLocaleString("en-IN")}
            <span className="text-xs text-muted-foreground font-normal">/night</span>
          </div>
        </div>

        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> {room.capacity} guests
          </li>
          <li className="flex items-center gap-1.5">
            <BedDouble className="h-3.5 w-3.5" /> {room.bedType}
          </li>
          <li className="flex items-center gap-1.5">
            <Bath className="h-3.5 w-3.5" /> {room.bathType}
          </li>
        </ul>

        {room.amenities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {room.amenities.map((a) => (
              <span
                key={a}
                className="text-[10px] rounded-full bg-secondary text-secondary-foreground px-2 py-0.5"
              >
                {a}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={room.active}
              onChange={onToggle}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-muted-foreground">Bookable</span>
          </label>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}
