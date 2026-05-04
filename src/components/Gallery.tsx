import { useState } from "react";
import { X } from "lucide-react";
import hero from "@/assets/hero-tea.jpg";
import strawberry from "@/assets/strawberry.jpg";
import bonfire from "@/assets/bonfire.jpg";

const images = [
  { src: hero, alt: "Tea plantation view" },
  { src: strawberry, alt: "Fresh strawberries from the farm" },
  { src: bonfire, alt: "Evening bonfire with mountain views" },
];

export function Gallery() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="gallery" className="py-20 md:py-28 bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">
            Gallery
          </span>
          <h2 className="mt-3 text-3xl md:text-5xl font-semibold">A glimpse of the cottage</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <button
            onClick={() => setActive(0)}
            className="col-span-2 row-span-2 overflow-hidden rounded-2xl group"
          >
            <img
              src={images[0].src}
              alt={images[0].alt}
              loading="lazy"
              className="h-full w-full object-cover aspect-[4/3] md:aspect-auto md:h-[480px] group-hover:scale-105 transition-transform duration-500"
            />
          </button>
          <button
            onClick={() => setActive(1)}
            className="overflow-hidden rounded-2xl group"
          >
            <img
              src={images[1].src}
              alt={images[1].alt}
              loading="lazy"
              className="h-full w-full object-cover aspect-square md:h-[232px] group-hover:scale-105 transition-transform duration-500"
            />
          </button>
          <button
            onClick={() => setActive(2)}
            className="overflow-hidden rounded-2xl group"
          >
            <img
              src={images[2].src}
              alt={images[2].alt}
              loading="lazy"
              className="h-full w-full object-cover aspect-square md:h-[232px] group-hover:scale-105 transition-transform duration-500"
            />
          </button>
        </div>
      </div>

      {active !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setActive(null)}
        >
          <button
            className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            onClick={() => setActive(null)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={images[active].src}
            alt={images[active].alt}
            className="max-h-[90vh] max-w-full object-contain rounded-lg"
          />
        </div>
      )}
    </section>
  );
}
