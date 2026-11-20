import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, IndianRupee, Receipt } from "lucide-react";
import type { Opportunity } from "@/lib/dashboardMetrics";

// Data-backed prompts only: every row states something the owner's own bookings, calendar or expenses
// show. Nothing here claims demand or market knowledge. Renders nothing when there is nothing to say.

const ICONS: Record<Opportunity["id"], React.ComponentType<{ className?: string }>> = {
  outstanding: IndianRupee,
  "open-dates": CalendarDays,
  "missing-expenses": Receipt,
};

export function RevenueOpportunities({ opportunities }: { opportunities: Opportunity[] }) {
  if (opportunities.length === 0) return null;
  // Keep a superadmin's ?property= on the link, like the attention rows do.
  const prop = new URLSearchParams(window.location.search).get("property");

  return (
    <section
      aria-label="Revenue opportunities"
      className="border border-border/60 rounded-3xl overflow-hidden"
    >
      <div className="px-4 py-2.5 text-xs text-muted-foreground bg-primary-light/20">
        Revenue opportunities
      </div>
      <div className="divide-y divide-border">
        {opportunities.map((o) => {
          const Icon = ICONS[o.id];
          return (
            <Link
              key={o.id}
              to={o.to}
              search={(prop ? { property: prop } : {}) as never}
              aria-label={`${o.title}. ${o.actionLabel}`}
              className="flex items-start gap-3 px-4 py-3 transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] hover:bg-muted/40"
            >
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-medium">{o.title}</div>
                  {o.amount !== undefined && (
                    <div className="shrink-0 text-sm font-semibold tabular-nums">
                      ₹{Math.round(o.amount).toLocaleString("en-IN")}
                    </div>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{o.detail}</div>
                <div className="mt-1 text-xs font-medium text-primary">{o.actionLabel} →</div>
              </div>
              <ChevronRight className="mt-1.5 h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
