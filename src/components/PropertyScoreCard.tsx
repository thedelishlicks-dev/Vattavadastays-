import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { categoryProgress, type PropertyScoreResult } from "@/lib/propertyScore";

// Property Score: one number, one sentence, three things to do. The score and the actions come from
// lib/propertyScore.ts; this file only shows them. Always shows something useful, even at 0.

export function PropertyScoreCard({
  result,
  isLoading = false,
  loadFailed = false,
  title = "Property Score",
}: {
  result: PropertyScoreResult | null;
  isLoading?: boolean;
  loadFailed?: boolean;
  /** The Monthly report says "Current Property Score". */
  title?: string;
}) {
  if (isLoading || !result) {
    return (
      <div
        className="h-40 rounded-3xl bg-muted animate-pulse"
        aria-label="Loading property score"
      />
    );
  }

  // Keep a superadmin's ?property= on the links, like the other Home sections do.
  const prop = new URLSearchParams(window.location.search).get("property");
  const search = (prop ? { property: prop } : {}) as never;

  const { score, message, topActions, categories, unavailable } = result;
  const notes: string[] = [];
  if (loadFailed) notes.push("Some data couldn’t load, so this score may change.");
  else if (unavailable.length > 0)
    notes.push(
      `${unavailable.length} ${unavailable.length === 1 ? "check isn’t" : "checks aren’t"} counted yet: they start once there’s a booking or pricing to judge.`,
    );

  return (
    <section
      aria-label="Property score"
      className="bg-card border border-border/60 rounded-3xl overflow-hidden"
    >
      <div className="p-4 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xs text-muted-foreground">{title}</h2>
            <p className="mt-1 text-3xl font-bold tabular-nums leading-none">
              {score}
              <span className="text-base font-medium text-muted-foreground"> / 100</span>
            </p>
          </div>
          <p className="text-sm text-right text-muted-foreground max-w-[55%]">{message}</p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          aria-label="Property score"
          className="h-1.5 rounded-full bg-muted overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      <div className="border-t border-border">
        <p className="px-4 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">Top actions</p>
        {topActions.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-muted-foreground">
            Nothing to improve right now. Nice work.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {topActions.map((a, i) => (
              <li key={a.id}>
                <Link
                  to={(a.href ?? "/admin/dashboard") as never}
                  search={search}
                  className="flex items-center gap-3 px-4 py-3 transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] hover:bg-muted/40"
                >
                  <span className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-medium">{a.action}</span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                    +{a.improvement}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <details className="border-t border-border group">
        <summary className="cursor-pointer list-none px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>See breakdown</span>
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
        </summary>
        <ul className="px-4 pb-3 space-y-2">
          {categories.map((c) => {
            const p = categoryProgress(c);
            return (
              <li key={c.category}>
                <div className="flex items-baseline justify-between text-xs">
                  <span>{c.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {p.counted ? `${p.earned} / ${p.measurable}` : "Not counted yet"}
                  </span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${p.share * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </details>

      {notes.length > 0 && (
        <p className="px-4 py-2.5 text-[11px] leading-snug text-muted-foreground bg-primary-light/20 border-t border-border">
          {notes.join(" ")}
        </p>
      )}
    </section>
  );
}
