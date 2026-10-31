import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { thumbUrl } from "@/lib/gallery";

/**
 * Full-screen photo viewer: swipe, arrow keys, Esc. Used by the property gallery and the room cards.
 * `withThumbs` is true for gallery photos, which have a small thumbnail beside them (lib/gallery.ts)
 * that shows at once while the big photo loads; room photos have none.
 */
export function PhotoViewer({ photos, start, onClose, withThumbs = false }: { photos: string[]; start: number; onClose: () => void; withThumbs?: boolean }) {
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
        {/* Gallery photos: the small thumbnail is already cached, so it shows at once while the big photo loads. */}
        <img
          key={photos[i]}
          src={photos[i]}
          alt={`Photo ${i + 1} of ${n}`}
          style={withThumbs ? { backgroundImage: `url(${thumbUrl(photos[i])})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
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
