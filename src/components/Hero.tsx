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
  const logoUrl = property?.logo_url ?? null;

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
        <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-stone-900 via-stone-800 to-stone-950" />
      )}

      {/* Dark vignette overlay */}
      <div className="absolute inset-0 bg-radial-[at_50%_50%] from-transparent via-black/20 to-black/60" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />

      <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col items-center justify-center px-6 text-center text-white">
        <div className="mb-8 flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          {logoUrl ? (
            <div className="relative">
              <div className="absolute inset-0 blur-2xl bg-white/20 rounded-full" />
              <img
                src={logoUrl}
                alt={`${propertyName} logo`}
                className="relative h-24 w-24 md:h-32 md:w-32 object-cover rounded-full border-2 border-white/50 shadow-2xl"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <span className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs uppercase tracking-[0.2em] backdrop-blur-sm">
                {area} · Kerala
              </span>
            </div>
          )}

          <div className="space-y-4">
            <h1 className="font-display text-4xl sm:text-5xl md:text-7xl font-bold leading-[1.1] max-w-3xl drop-shadow-lg">
              {propertyName}
            </h1>
            {propertyNameMl && (
              <div className="font-malayalam text-xl md:text-2xl text-white/90 drop-shadow-md">
                {propertyNameMl}
              </div>
            )}
            <p className="mx-auto max-w-xl text-base md:text-lg text-white/90 font-medium tracking-wide drop-shadow-md">
              {tagline}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 mt-4">
          <a
            href="#availability"
            className="inline-flex items-center justify-center rounded-full bg-primary px-10 py-4 text-sm md:text-base font-semibold text-primary-foreground shadow-2xl hover:scale-[1.05] active:scale-95 transition-all duration-300"
          >
            Check Availability
          </a>

          <div className="flex flex-col items-center gap-3 animate-in fade-in duration-1000 delay-500">
            <div className="text-[10px] uppercase tracking-[0.3em] font-medium text-white/70">
              {area} · Kerala
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-4 py-1.5 text-xs backdrop-blur-md">
              <span>{today}</span>
              <span className="opacity-40">|</span>
              <span>🌡 12–18°C</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
