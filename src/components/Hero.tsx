import { useProperty } from "@/hooks/useProperty";
import { getSubdomain } from "@/lib/subdomain";

function getTodayLabel(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function Hero() {
  const subdomain = getSubdomain();
  const { data: property } = useProperty(subdomain);

  const heroImage = property?.hero_image ?? null;
  const today = getTodayLabel();

  const propertyName = property?.name ?? "Loading...";
  const propertyNameMl = property?.name_ml ?? null;
  const area = property?.area ?? "Vattavada";
  const roomCount = property?.rooms?.length ?? 0;

  const tagline = property?.hero_tagline
    ? property.hero_tagline
    : `${roomCount}-room stay in ${area}`;

  return (
    <section id="top" className="relative h-[88vh] min-h-[560px] w-full overflow-hidden">
      {heroImage ? (
        <img
          src={heroImage}
          alt={propertyName}
          width={1920}
          height={1080}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-green-900 via-green-800 to-stone-900" />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70" />

      <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col items-center justify-center px-6 text-center text-white">
        <div className="mb-5 flex items-center gap-3 flex-wrap justify-center">
          <span className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs uppercase tracking-[0.2em] backdrop-blur-sm">
            {area} · Kerala
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs backdrop-blur-sm">
            <span>{today}</span>
            <span className="opacity-60">·</span>
            <span>🌡 12–18°C</span>
          </span>
        </div>

        <h1 className="font-display text-4xl sm:text-5xl md:text-7xl font-semibold leading-[1.05] max-w-3xl">
          {propertyName}
        </h1>
        {propertyNameMl && (
          <div className="font-malayalam mt-3 text-xl md:text-2xl text-white/90">
            {propertyNameMl}
          </div>
        )}
        <p className="mt-6 max-w-xl text-base md:text-lg text-white/85">
          {tagline}
        </p>
        <a
          href="#availability"
          className="mt-9 inline-flex items-center justify-center rounded-full bg-primary px-8 py-4 text-sm md:text-base font-medium text-primary-foreground shadow-[var(--shadow-elevated)] hover:scale-[1.03] transition-transform"
        >
          Check Availability
        </a>
      </div>
    </section>
  );
}
