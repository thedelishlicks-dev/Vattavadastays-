// Lightweight grouped bar chart (no chart library).
// Replaces recharts on the Payments page, which alone cost ~110 KB gzip —
// the heaviest admin page for owners on weak Jio/BSNL signal.

import { useState } from "react";

export type MiniBarRow = { month: string; Collected: number; Outstanding: number };

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const axis = (n: number) => (n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`);

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function MiniBarChart({ data }: { data: MiniBarRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => Math.max(d.Collected, d.Outstanding))));
  const ticks = [max, max / 2, 0];
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const shown = active !== null ? data[active] : null;

  return (
    <div>
      <div className="h-36 flex gap-2">
        <div className="flex flex-col justify-between text-[11px] text-muted-foreground w-11 shrink-0 text-right pb-5">
          {ticks.map((t) => (
            <span key={t}>{axis(t)}</span>
          ))}
        </div>
        <div className="relative flex-1 pb-5">
          <div className="absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between pointer-events-none">
            {ticks.map((t) => (
              <div key={t} className="border-t border-dashed border-border" />
            ))}
          </div>
          <div className="relative h-full flex items-end justify-around gap-1">
            {data.map((d, i) => (
              <button
                key={d.month}
                type="button"
                onClick={() => setActive(active === i ? null : i)}
                aria-label={`${d.month}: collected ${inr(d.Collected)}, outstanding ${inr(d.Outstanding)}`}
                className={`relative h-full flex-1 flex items-end justify-center gap-0.5 rounded-sm ${active === i ? "bg-muted" : ""}`}
              >
                <span
                  className="w-2.5 max-w-[40%] rounded-t-[3px] bg-primary"
                  style={{ height: pct(d.Collected) }}
                />
                <span
                  className="w-2.5 max-w-[40%] rounded-t-[3px] bg-destructive/70"
                  style={{ height: pct(d.Outstanding) }}
                />
                <span className="absolute -bottom-5 text-[11px] text-muted-foreground whitespace-nowrap">
                  {d.month}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1 h-4 text-xs text-muted-foreground text-center" aria-live="polite">
        {shown
          ? `${shown.month} · Collected ${inr(shown.Collected)} · Outstanding ${inr(shown.Outstanding)}`
          : "Tap a month to see amounts"}
      </div>
    </div>
  );
}
