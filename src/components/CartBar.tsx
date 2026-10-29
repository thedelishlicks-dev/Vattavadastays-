import { useEffect, useState } from "react";

type Props = {
  rooms: number;
  guestsText: string;
  warning: string | null;
  total: number;
  onContinue: () => void;
};

/** Always-visible summary of the booking so far. Hides itself while the booking form is on screen. */
export function CartBar({ rooms, guestsText, warning, total, onContinue }: Props) {
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById("booking");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (rooms === 0 || formVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 text-sm">
          <div className="font-medium truncate">
            {rooms} room{rooms > 1 ? "s" : ""} · ₹{total.toLocaleString("en-IN")}
          </div>
          <div className={warning ? "text-xs text-amber-700 truncate" : "text-xs text-muted-foreground truncate"}>{warning ?? guestsText}</div>
        </div>
        <button type="button" onClick={onContinue} className="shrink-0 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
          Continue
        </button>
      </div>
    </div>
  );
}
