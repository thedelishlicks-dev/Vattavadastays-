import { Link } from "@tanstack/react-router";
import type { BusinessSnapshotData, Comparison } from "@/lib/dashboardMetrics";

// Four compact cards in a 2×2 grid: readable on a 360px phone without scrolling sideways, and they simply
// get wider on a desktop. Figures come from lib/businessMetrics.ts; this file only displays them.

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function Trend({ comparison }: { comparison: Comparison | null }) {
  // No comparison (not enough history) renders nothing at all: an empty line, never a guess.
  if (!comparison) return null;
  const tone =
    comparison.direction === "up"
      ? "text-green-600"
      : comparison.direction === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  return <p className={`mt-1 text-xs font-medium ${tone}`}>{comparison.text}</p>;
}

function MetricCard({
  label,
  value,
  hint,
  comparison,
  muted,
}: {
  label: string;
  /** null renders an em dash */
  value: string | null;
  hint?: React.ReactNode;
  comparison: Comparison | null;
  muted?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-4 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1.5 text-xl font-bold tabular-nums truncate ${muted ? "text-muted-foreground" : ""}`}
      >
        {value ?? "—"}
      </p>
      <Trend comparison={comparison} />
      {hint && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function BusinessSnapshot({
  data,
  monthLabel,
  expensesStatus = "ready",
}: {
  data: BusinessSnapshotData;
  monthLabel: string;
  /** Profit needs expenses: say so while they load or if they failed, instead of implying there are none. */
  expensesStatus?: "ready" | "loading" | "error";
}) {
  const { revenue, occupancy, adr, profit } = data;
  return (
    <section aria-label={`Business snapshot for ${monthLabel}`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Business snapshot</h2>
        <span className="text-xs text-muted-foreground">{monthLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Revenue this month"
          value={revenue.value === null ? null : rupees(revenue.value)}
          comparison={revenue.comparison}
          hint="Confirmed & completed stays"
        />
        <MetricCard
          label="Occupancy this month"
          value={occupancy.value === null ? null : `${Math.round(occupancy.value)}%`}
          comparison={occupancy.comparison}
          hint={
            occupancy.availableNights > 0
              ? `${occupancy.occupiedNights} of ${occupancy.availableNights} room-nights`
              : "No active rooms"
          }
        />
        <MetricCard
          label="Avg nightly rate (ADR)"
          value={adr.value === null ? null : rupees(adr.value)}
          comparison={adr.comparison}
          hint="Room revenue per night sold"
        />
        <MetricCard
          label="Est. operating profit"
          value={profit.value === null ? null : rupees(profit.value)}
          comparison={profit.comparison}
          muted={profit.value !== null && profit.value < 0}
          hint={
            expensesStatus === "loading" ? (
              "Loading expenses…"
            ) : expensesStatus === "error" ? (
              "Couldn’t load expenses"
            ) : profit.expensesRecorded ? (
              "Revenue − recorded expenses"
            ) : (
              <Link to="/admin/expenses" className="text-primary hover:underline">
                Add expenses to estimate
              </Link>
            )
          }
        />
      </div>
    </section>
  );
}
