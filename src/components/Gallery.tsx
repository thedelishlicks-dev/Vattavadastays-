import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Instagram, X } from "lucide-react";
import type { Property } from "@/hooks/useProperty";
import { instagramUrl, thumbUrl } from "@/lib/gallery";

// Light on purpose: the grid loads small thumbnails (about 30 KB each) and only when it
// scrolls into view. The bigger photo (about 140 KB) loads only when a guest taps to enlarge.
const GRID_SHOWN = 6;

/** A thumbnail that falls back to the full photo if the thumbnail file is missing. */
function Thumb({ url, className, full }: { url: string; className?: string; full?: boolean }) {
  return (
    <img
      src={full ? url : thumbUrl(url)}
      alt=""
      loading="lazy"
      decoding="async"
      className={className}
      onError={(e) => {
        const img = e.currentTarget;
        if (img.dataset.fallback !== "1") {
          img.dataset.fallback = "1";
          img.src = url;
        }
      }}
    />
  );
}

export function Gallery({ property }: { property: Property | undefined }) {
  const photos = property?.gallery_images ?? [];
  const [open, setOpen] = useState<number | null>(null);
  if (!property || photos.length === 0) return null;

  const ig = instagramUrl(property.instagram_handle);
  const shown = photos.slice(0, GRID_SHOWN);
  const extra = photos.length - shown.length;

  return (
    <section id="gallery" className="py-20 md:py-28 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">Gallery</span>
            <h2 className="mt-3 text-3xl md:text-5xl font-semibold">A closer look</h2>
          </div>
          {ig && (
            <a href={ig} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 self-start rounded-full border border-primary/40 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary-light transition-colors">
              <Instagram className="h-4 w-4" /> Follow @{property.instagram_handle?.replace(/^@/, "")}
            </a>
          )}
        </div>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {shown.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Open photo ${i + 1} of ${photos.length}`}
              className={["relative overflow-hidden rounded-xl bg-muted", i === 0 ? "col-span-2 md:row-span-2 aspect-[16/10] md:aspect-auto" : "aspect-square"].join(" ")}
            >
              <Thumb url={url} full={i === 0} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
              {i === shown.length - 1 && extra > 0 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">+{extra} more</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {open !== null && <Lightbox photos={photos} start={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Lightbox({ photos, start, onClose }: { photos: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const touchX = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = photos.length;

  const go = useCallback((d: number) => setI((cur) => (cur + d + n) % n), [n]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);

  // Start loading the neighbours so swiping feels instant (only after the guest opened the viewer).
  useEffect(() => {
    if (n < 2) return;
    for (const d of [1, -1]) new Image().src = photos[(i + d + n) % n];
  }, [i, n, photos]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}>
        <span className="text-sm">{i + 1} / {n}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-white/10"><X className="h-5 w-5" /></button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={onClose}>
        {/* The small thumbnail is already cached, so it shows at once while the big photo loads. */}
        <img
          key={photos[i]}
          src={photos[i]}
          alt={`Photo ${i + 1} of ${n}`}
          style={{ backgroundImage: `url(${thumbUrl(photos[i])})`, backgroundSize: "cover", backgroundPosition: "center" }}
          className="max-h-[calc(100dvh-7rem)] max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {n > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
      </div>
      <div style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} className="h-4" />
    </div>
  );
}
