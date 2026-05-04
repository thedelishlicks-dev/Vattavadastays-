import { Users, BedDouble, Bath } from "lucide-react";
import cottage from "@/assets/cottage.jpg";

const stats = [
  { icon: Users, label: "Guests", value: "6" },
  { icon: BedDouble, label: "Bedrooms", value: "2" },
  { icon: Bath, label: "Bathrooms", value: "2" },
];

export function About() {
  return (
    <section id="about" className="py-20 md:py-28 bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8 grid md:grid-cols-2 gap-12 items-center">
        <div className="relative">
          <img
            src={cottage}
            alt="Bleaf Mud House exterior"
            width={1280}
            height={960}
            loading="lazy"
            className="rounded-2xl shadow-[var(--shadow-elevated)] w-full"
          />
          <div className="absolute -bottom-6 -right-4 md:-right-6 bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-soft)] max-w-[220px]">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display text-lg font-semibold">
                D
              </div>
              <div>
                <div className="font-medium text-sm">Deepak</div>
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
            A quiet retreat among the strawberry farms
          </h2>
          <p className="mt-5 text-muted-foreground leading-relaxed">
            Tucked into the misty hills of Vattavada, Bleaf Mud House is a family-run
            homestead surrounded by strawberry farms and rolling tea plantations. Wake to
            birdsong, walk through the plantations with our host Deepak, and gather around the
            bonfire as the mountains turn gold.
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
