import heroImg from "@/assets/hero-tea.jpg";

export function Hero() {
  return (
    <section id="top" className="relative h-[88vh] min-h-[560px] w-full overflow-hidden">
      <img
        src={heroImg}
        alt="Tea plantation in the Western Ghats"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70" />

      <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col items-center justify-center px-6 text-center text-white">
        <span className="mb-5 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs uppercase tracking-[0.2em] backdrop-blur-sm">
          Vattavada · Kerala
        </span>
        <h1 className="font-display text-4xl sm:text-5xl md:text-7xl font-semibold leading-[1.05] max-w-3xl">
          Bleaf Mud House
        </h1>
        <div className="font-malayalam mt-3 text-xl md:text-2xl text-white/90">
          ബ്ലീഫ് മഡ് ഹൗസ്
        </div>
        <p className="mt-6 max-w-xl text-base md:text-lg text-white/85">
          Organic farm stay in the Western Ghats
        </p>
        <a
          href="#booking"
          className="mt-9 inline-flex items-center justify-center rounded-full bg-primary px-8 py-4 text-sm md:text-base font-medium text-primary-foreground shadow-[var(--shadow-elevated)] hover:scale-[1.03] transition-transform"
        >
          Check Availability
        </a>
      </div>
    </section>
  );
}
