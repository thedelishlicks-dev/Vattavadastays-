import {
  Wifi,
  Flame,
  Car,
  UtensilsCrossed,
  Trees,
  Waves,
  Sparkles,
  ShowerHead,
  Zap,
  Sun,
  Dog,
  Accessibility,
  Truck,
  Tent,
  Bike,
  FlameKindling,
  WashingMachine,
} from "lucide-react";
import type { Property } from "@/hooks/useProperty";

// ---------------------------------------------------------------------------
// Icon + label map — keys must match PROPERTY_AMENITY_OPTIONS in
// src/routes/admin.amenities.tsx exactly.
// ---------------------------------------------------------------------------
const AMENITY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  parking:        { label: "Parking",              icon: Car },
  wifi:           { label: "WiFi",                 icon: Wifi },
  swimming_pool:  { label: "Swimming Pool",        icon: Waves },
  bonfire:        { label: "Bonfire",              icon: Flame },
  garden:         { label: "Garden",               icon: Trees },
  bbq:            { label: "BBQ / Grill",          icon: FlameKindling },
  trekking:       { label: "Trekking Access",      icon: Bike },
  campfire_area:  { label: "Campfire Area",        icon: Tent },
  common_kitchen: { label: "Common Kitchen",       icon: UtensilsCrossed },
  laundry:        { label: "Laundry",              icon: WashingMachine },
  pet_friendly:   { label: "Pet Friendly",         icon: Dog },
  wheelchair:     { label: "Wheelchair Accessible",icon: Accessibility },
  generator:      { label: "Generator Backup",     icon: Zap },
  solar:          { label: "Solar Power",          icon: Sun },
  ev_charging:    { label: "EV Charging",          icon: ShowerHead },
  pickup:         { label: "Pickup / Drop",        icon: Truck },
};

// Fallback for custom amenities the owner typed in free-text.
function FallbackIcon({ className }: { className?: string }) {
  return <Sparkles className={className} />;
}

interface Props {
  property: Property | undefined;
}

export function Amenities({ property }: Props) {
  // Strip internal sentinel keys (e.g. __meals:...) — same filter as admin page.
  const keys = (property?.shared_amenities ?? []).filter((a) => !a.startsWith("__"));

  // Loading skeleton — same grid shape as the real content.
  if (!property) {
    return (
      <section id="amenities" className="py-20 md:py-28 bg-primary-light/40">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <div className="h-3 w-24 bg-muted rounded-full mx-auto animate-pulse" />
            <div className="h-8 w-48 bg-muted rounded-xl mx-auto animate-pulse" />
          </div>
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-card border border-border p-6 animate-pulse h-28" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Owner hasn't set any amenities yet — don't render the section at all.
  if (keys.length === 0) return null;

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
          {keys.map((key) => {
            const meta = AMENITY_META[key];
            const Icon = meta?.icon ?? FallbackIcon;
            // Custom amenity keys are stored as raw text (e.g. "rooftop terrace")
            const label = meta?.label ?? key.replace(/_/g, " ");

            return (
              <div
                key={key}
                className="group flex flex-col items-center gap-3 rounded-2xl bg-card border border-border p-6 hover:shadow-[var(--shadow-soft)] hover:-translate-y-1 transition-all"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-sm font-medium text-foreground text-center capitalize">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
