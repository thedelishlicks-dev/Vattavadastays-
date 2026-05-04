import { Wifi, Flame, Mountain, Car, UtensilsCrossed, Droplets } from "lucide-react";

const items = [
  { icon: Wifi, label: "WiFi" },
  { icon: Droplets, label: "Hot Water" },
  { icon: Flame, label: "Bonfire" },
  { icon: Mountain, label: "Plantation View" },
  { icon: Car, label: "Free Parking" },
  { icon: UtensilsCrossed, label: "Kitchen" },
];

export function Amenities() {
  return (
    <section id="amenities" className="py-20 md:py-28 bg-primary-light/40">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            What's included
          </span>
          <h2 className="mt-3 text-3xl md:text-5xl font-semibold">Everything you need</h2>
        </div>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-4">
          {items.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="group flex flex-col items-center gap-3 rounded-2xl bg-card border border-border p-6 md:p-8 hover:shadow-[var(--shadow-soft)] hover:-translate-y-1 transition-all"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Icon className="h-6 w-6" />
              </div>
              <span className="text-sm md:text-base font-medium text-foreground text-center">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
