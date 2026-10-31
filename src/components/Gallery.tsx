import { useState } from "react";
import { Instagram } from "lucide-react";
import type { Property } from "@/hooks/useProperty";
import { PhotoViewer } from "@/components/PhotoViewer";
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

      {open !== null && <PhotoViewer photos={photos} start={open} onClose={() => setOpen(null)} withThumbs />}
    </section>
  );
}
