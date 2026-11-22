import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/admin/formKit";
import { LoadFailed } from "@/components/LoadFailed";
import {
  MonthPicker,
  ReportExpenses,
  ReportFootnote,
  ReportGuests,
  ReportNotices,
  ReportPerformance,
  ReportSkeleton,
  ReportSources,
  ReportSummary,
  ReportTakeaway,
} from "@/components/MonthlyReport";
import { PropertyScoreCard } from "@/components/PropertyScoreCard";
import { RevenueOpportunities } from "@/components/RevenueOpportunities";
import { useMonthlyReport } from "@/hooks/useMonthlyReport";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { usePropertyScore } from "@/hooks/usePropertyScore";
import { useRevenueIntelligence } from "@/hooks/useRevenueIntelligence";
import {
  OPPORTUNITIES_HEADING,
  buildTakeaway,
  lastCompletedMonth,
  opportunitiesNote,
  reportOpportunities,
  reportWindow,
  scoreSection,
  type ReportMonth,
} from "@/lib/monthlyReport";

export const Route = createFileRoute("/admin/report")({
  component: AdminReport,
});

// ---------------------------------------------------------------------------
// Monthly business report: "How did my property perform, and what should I do next?" A composition over Money
// Intelligence, the business metrics, guest identity, the Property Score and Revenue Intelligence. The figures
// and wording live in lib/monthlyReport.ts; the month-specific queries in hooks/useMonthlyReport.ts.
// ---------------------------------------------------------------------------

function AdminReport() {
  const { data: property, isLoading: propLoading } = useOwnerProperty();
  const now = useMemo(() => new Date(), []);
  // The default is the last COMPLETED month, never the current unfinished one.
  const [month, setMonth] = useState<ReportMonth>(() => lastCompletedMonth(new Date()));

  const r = useMonthlyReport(property, month);
  // Current-state engines (they read today's calendar, prices and bookings): shown as such, never as the month's.
  const score = usePropertyScore(property);
  const intel = useRevenueIntelligence(property);

  // Superadmin "manage property" sessions keep ?property= on every link (AGENTS.md).
  const prop = new URLSearchParams(window.location.search).get("property");
  const searchParams: Record<string, string> = prop ? { property: prop } : {};

  const opportunities = useMemo(
    () => reportOpportunities(intel.opportunities),
    [intel.opportunities],
  );
  const opportunitiesLoaded = !intel.isLoading && !intel.loadFailed;
  const takeaway = useMemo(
    () => (r.report ? buildTakeaway(r.report, opportunitiesLoaded ? opportunities : null) : null),
    [r.report, opportunities, opportunitiesLoaded],
  );
  const section = scoreSection(score.result);

  if (propLoading) return <div className="h-48 rounded-3xl bg-muted animate-pulse" />;
  if (!property) return <LoadFailed title="Couldn't find your property" />;

  const win = reportWindow(month);
  const subtitle = property.name
    ? `${property.name}${property.area ? ` · ${property.area}` : ""}`
    : "How your property performed";

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title={`${win.label} Business Report`} subtitle={subtitle} />
      <MonthPicker
        month={month}
        now={now}
        previousLabel={win.comparisonLabel}
        onChange={setMonth}
      />

      {/* A failed load must not read as ₹0 (HANDOVER rule 36). */}
      {r.loadFailed ? (
        <LoadFailed title="Couldn't load your report" onRetry={r.retry} />
      ) : r.isLoading || r.isSwitching || !r.report ? (
        <ReportSkeleton />
      ) : (
        <>
          <ReportNotices report={r.report} comparisonFailed={r.comparisonFailed} />
          <ReportSummary report={r.report} />
          <ReportPerformance report={r.report} />
          <ReportSources report={r.report} />
          <ReportExpenses report={r.report} searchParams={searchParams} />
          <ReportGuests report={r.report} status={r.guestsStatus} />

          <section aria-label="Current Property Score" className="space-y-2">
            <PropertyScoreCard
              result={score.result}
              isLoading={score.isLoading}
              loadFailed={score.loadFailed}
              title="Current Property Score"
            />
            {section && <p className="px-1 text-xs text-muted-foreground">{section.note}</p>}
          </section>

          <RevenueOpportunities
            opportunities={opportunities}
            heading={OPPORTUNITIES_HEADING}
            note={opportunitiesNote(r.report)}
          />

          {takeaway && <ReportTakeaway takeaway={takeaway} />}
          <ReportFootnote report={r.report} />
        </>
      )}
    </div>
  );
}
