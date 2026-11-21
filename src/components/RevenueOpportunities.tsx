import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, IndianRupee, Megaphone, Receipt, Tag } from "lucide-react";
import { Button } from "@/components/ds";
import {
  DASHBOARD_MAX_OPPORTUNITIES,
  type OpportunityType,
  type RevenueOpportunity,
} from "@/lib/revenueIntelligence";

// Revenue Intelligence on Home. Every card is one rule from lib/revenueIntelligence.ts: a short title, one or two
// plain sentences, an amount only when the rule can calculate one, and one button. Shows three at first; the
// rest are one tap away. Renders nothing when there is nothing to say.

const ICONS: Record<OpportunityType, React.ComponentType<{ className?: string }>> = {
  outstanding_payment: IndianRupee,
  pricing_gap: Tag,
  empty_dates: CalendarDays,
  missing_expenses: Receipt,
  missing_booking_source: Megaphone,
};

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function RevenueOpportunities({
  opportunities,
  max = DASHBOARD_MAX_OPPORTUNITIES,
}: {
  /** All of them, in display order (from useRevenueIntelligence). */
  opportunities: RevenueOpportunity[];
  max?: number;
}) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  if (opportunities.length === 0) return null;

  // Keep a superadmin's ?property= on the destination, like the other Home sections do.
  const prop = new URLSearchParams(window.location.search).get("property");
  const search = (prop ? { property: prop } : {}) as never;

  const visible = showAll ? opportunities : opportunities.slice(0, max);
  const hidden = opportunities.length - visible.length;

  return (
    <section aria-label="Opportunities" className="space-y-2">
      <h2 className="text-base font-semibold">Opportunities</h2>
      <ul className="space-y-3">
        {visible.map((o) => {
          const Icon = ICONS[o.type];
          // Show the amount as its own figure only when the title does not already say it.
          const showAmount =
            o.estimatedValue !== undefined && !o.title.includes(rupees(o.estimatedValue));
          return (
            <li key={o.id} className="rounded-3xl border border-border/60 bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{o.title}</h3>
                    {showAmount && (
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {rupees(o.estimatedValue as number)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {o.description}
                  </p>
                </div>
              </div>
              {o.href && o.actionLabel && (
                <Button
                  size="sm"
                  variant="soft"
                  className="mt-3"
                  onClick={() => navigate({ to: o.href as never, search })}
                >
                  {o.actionLabel}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Show {hidden} more
        </button>
      )}
      {showAll && opportunities.length > max && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-xs font-medium text-primary hover:underline"
        >
          Show fewer
        </button>
      )}
    </section>
  );
}
