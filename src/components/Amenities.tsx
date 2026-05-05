import { Wifi, Flame, Car, UtensilsCrossed, Trees, Gamepad2, BookOpen, Trophy } from "lucide-react";

const items = [
  { icon: Wifi, label: "WiFi" },
  { icon: Car, label: "Parking" },
  { icon: Flame, label: "Bonfire" },
  { icon: UtensilsCrossed, label: "Kitchen" },
  { icon: Trees, label: "Garden" },
  { icon: Gamepad2, label: "Indoor Games" },
  { icon: Trophy, label: "Badminton" },
  { icon: BookOpen, label: "Library" },
];

export function Amenities() {
  return (
    <section id="amenities" className="py-20 md:py-28 bg-primary-light/40">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            Shared amenities
          </span>
          <h2 className="mt-3 text-3xl md:text-5xl font-semibold">For every guest</h2>
        </div>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {items.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="group flex flex-col items-center gap-3 rounded-2xl bg-card border border-border p-6 hover:shadow-[var(--shadow-soft)] hover:-translate-y-1 transition-all"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Icon className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium text-foreground text-center">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
