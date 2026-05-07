import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { PageHeader, Section, inputCls, SaveBar } from "@/admin/formKit";

export const Route = createFileRoute("/admin/amenities")({ component: AmenitiesPage });

function AmenitiesPage() {
  const [shared, setShared] = useState<Record<string, boolean>>({
    WiFi: true,
    Parking: true,
    Bonfire: true,
    Kitchen: true,
    Garden: true,
    Games: true,
    Badminton: true,
    Library: true,
    "Hot water": true,
    "Power backup": false,
    "First aid": true,
  });
  const [roomPool, setRoomPool] = useState<string[]>([
    "AC",
    "TV",
    "Balcony",
    "Hot Water",
    "Heater",
    "Wardrobe",
    "Mini fridge",
    "Tea/Coffee maker",
    "Work desk",
    "Valley view",
  ]);
  const [newShared, setNewShared] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [dirty, setDirty] = useState(false);
  const mark = () => setDirty(true);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Amenities" subtitle="What you offer property-wide and per room." />

      <Section
        title="Property-level shared amenities"
        description="Visible to all guests on the public site."
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(shared).map(([k, v]) => (
            <label
              key={k}
              className="flex items-center gap-2 text-sm border border-border rounded-md px-3 py-2 cursor-pointer hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={v}
                onChange={(e) => {
                  setShared({ ...shared, [k]: e.target.checked });
                  mark();
                }}
                className="h-4 w-4 accent-primary"
              />
              {k}
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <input
            value={newShared}
            onChange={(e) => setNewShared(e.target.value)}
            placeholder="Add new shared amenity"
            className={inputCls}
          />
          <button
            onClick={() => {
              if (!newShared.trim()) return;
              setShared({ ...shared, [newShared.trim()]: true });
              setNewShared("");
              mark();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </Section>

      <Section
        title="Room-level amenities pool"
        description="Pickable per room when editing rooms."
      >
        <div className="flex flex-wrap gap-2">
          {roomPool.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 text-xs rounded-full bg-secondary text-secondary-foreground pl-3 pr-1.5 py-1"
            >
              {a}
              <button
                onClick={() => {
                  setRoomPool((p) => p.filter((x) => x !== a));
                  mark();
                }}
                className="h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-background/60"
                aria-label={`Remove ${a}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <input
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            placeholder="Add new room amenity"
            className={inputCls}
          />
          <button
            onClick={() => {
              const v = newRoom.trim();
              if (!v || roomPool.includes(v)) return;
              setRoomPool([...roomPool, v]);
              setNewRoom("");
              mark();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </Section>

      <SaveBar dirty={dirty} onSave={() => setDirty(false)} />
    </div>
  );
}
