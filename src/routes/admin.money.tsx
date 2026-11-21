import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/admin/formKit";
import { LoadFailed } from "@/components/LoadFailed";
import {
  ExpenseBreakdown,
  MoneyFootnote,
  MoneySkeleton,
  MoneyTop,
  OutstandingPayments,
  PeriodPicker,
  RevenueBySource,
} from "@/components/MoneyOverview";
import { useMoneyOverview } from "@/hooks/useMoneyOverview";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { DEFAULT_PERIOD, type PeriodKey } from "@/lib/moneySummary";

export const Route = createFileRoute("/admin/money")({
  component: AdminMoney,
});

// ---------------------------------------------------------------------------
// Money overview: an owner business dashboard (not accounting). The figures and their definitions live in
// lib/moneySummary.ts; the period-specific queries in hooks/useMoneyOverview.ts.
// ---------------------------------------------------------------------------

function AdminMoney() {
  const { data: property, isLoading: propLoading } = useOwnerProperty();
  const [periodKey, setPeriodKey] = useState<PeriodKey>(DEFAULT_PERIOD);
  const { rp, summary, comparisons, isLoading, isSwitching, loadFailed, retry } = useMoneyOverview(
    property?.id ?? "",
    periodKey,
  );

  // Superadmin "manage property" sessions keep ?property= on every link (AGENTS.md).
  const prop = new URLSearchParams(window.location.search).get("property");
  const searchParams: Record<string, string> = prop ? { property: prop } : {};

  if (propLoading) return <div className="h-48 rounded-3xl bg-muted animate-pulse" />;
  if (!property) return <LoadFailed title="Couldn't find your property" />;

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title="Money" subtitle={`How the business is doing · ${rp.label}`} />
      <PeriodPicker value={periodKey} onChange={setPeriodKey} />

      {/* A failed load must not read as ₹0 (HANDOVER rule 36). */}
      {loadFailed ? (
        <LoadFailed title="Couldn't load your figures" onRetry={retry} />
      ) : isLoading || isSwitching || !summary ? (
        <MoneySkeleton />
      ) : (
        <>
          <MoneyTop summary={summary} comparisons={comparisons} periodLabel={rp.label} />
          <RevenueBySource summary={summary} />
          <ExpenseBreakdown summary={summary} searchParams={searchParams} />
          <OutstandingPayments summary={summary} searchParams={searchParams} />
          <MoneyFootnote periodLabel={rp.label} />
        </>
      )}
    </div>
  );
}
