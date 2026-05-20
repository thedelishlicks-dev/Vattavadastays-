import { Users, BedDouble, Bath } from "lucide-react";
import type { Property } from "@/hooks/useProperty";

interface AboutProps {
  property?: Property | null;
}

export function About({ property }: AboutProps) {
  if (!property) return null;

  const roomCount = property.rooms?.length ?? 0;
  const hasMeals = property.shared_amenities?.some(
    (a) => !a.startsWith("__") && (a.toLowerCase().includes("meal") || a.toLowerCase().includes("breakfast"))
  );

  const stats = [
    { icon: BedDouble, label: "Rooms", value: roomCount > 0 ? String(roomCount) : "—" },
    { icon: Users, label: "Host", value: property.owner_name ?? "Your host" },
    { icon: Bath, label: "Meals", value: hasMeals ? "Included" : "Available" },
  ];

  const aboutImage = property.hero_image ?? "/assets/cottage.jpg";
  const ownerInitial = property.owner_name?.charAt(0).toUpperCase() ?? "H";

  return (
    <section id="about" className="py-20 md:py-28 bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8 grid md:grid-cols-2 gap-12 items-center">
        <div className="relative">
          <img
            src={aboutImage}
            alt={`${property.name} exterior`}
            width={1280}
            height={960}
            loading="lazy"
            className="rounded-2xl shadow-[var(--shadow-elevated)] w-full"
          />
          <div className="absolute -bottom-6 -right-4 md:-right-6 bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-soft)] max-w-[220px]">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display text-lg font-semibold">
                {ownerInitial}
              </div>
              <div>
                <div className="font-medium text-sm">{property.owner_name ?? "Host"}</div>
                <div className="text-xs text-muted-foreground">Your host</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            About the stay
          </span>
          <h2 className="mt-3 text-3xl md:text-5xl font-semibold text-foreground">
            {property.name}
          </h2>
          {property.name_ml && (
            <div className="font-malayalam mt-2 text-xl text-muted-foreground">
              {property.name_ml}
            </div>
          )}
          <p className="mt-5 text-muted-foreground leading-relaxed">
            {property.description ?? `Welcome to ${property.name}, a beautiful stay in ${property.area ?? "Vattavada"}.`}
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {stats.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl bg-primary-light/60 border border-border p-4 text-center"
              >
                <Icon className="mx-auto h-5 w-5 text-primary" />
                <div className="mt-2 font-display text-2xl font-semibold text-foreground">
                  {value}
                </div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
