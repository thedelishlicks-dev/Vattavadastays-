import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { MoneyChange, MoneyComparisons, MoneySummary, PeriodKey } from "@/lib/moneySummary";
import { PERIOD_OPTIONS, profitNote } from "@/lib/moneySummary";
import { expenseCategoryLabel } from "@/lib/expenses";

// Presentation only. Every figure comes from lib/moneySummary.ts (which reuses balance.ts and
// businessMetrics.ts); nothing here does money maths. Mobile-first: two columns of cards on a phone.

export const rupees = (n: number) =>
  `${n < 0 ? "−" : ""}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;

const cardCls = "rounded-3xl border border-border/60 bg-card p-4 min-w-0";

export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (key: PeriodKey) => void;
}) {
  return (
    <div role="tablist" aria-label="Reporting period" className="flex gap-2">
      {PERIOD_OPTIONS.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground/80 hover:bg-muted/70"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Trend({
  change,
  goodWhen,
}: {
  change: MoneyChange | null | undefined;
  goodWhen: "up" | "down";
}) {
  // No trustworthy comparison renders nothing: never a guess, never "↑ ∞%".
  if (!change) return null;
  const tone =
    change.direction === "flat"
      ? "text-muted-foreground"
      : change.direction === goodWhen
        ? "text-green-600"
        : "text-destructive";
  return <p className={`mt-1 text-xs font-medium ${tone}`}>{change.text}</p>;
}

function MetricCard({
  label,
  value,
  hint,
  change,
  goodWhen = "up",
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  change?: MoneyChange | null;
  goodWhen?: "up" | "down";
  className?: string;
}) {
  return (
    <div className={`${cardCls} ${className}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums truncate">{value}</p>
      <Trend change={change} goodWhen={goodWhen} />
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MoneySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your figures">
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-3xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-40 rounded-3xl bg-muted animate-pulse" />
      <div className="h-40 rounded-3xl bg-muted animate-pulse" />
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function MoneyTop({
  summary,
  comparisons,
  periodLabel,
}: {
  summary: MoneySummary;
  comparisons: MoneyComparisons | null;
  periodLabel: string;
}) {
  const note = profitNote(summary.expenseCount);
  const o = summary.outstanding;
  return (
    <section aria-label={`Money summary for ${periodLabel}`} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Revenue"
          value={rupees(summary.revenue)}
          change={comparisons?.revenue}
          hint="Confirmed & completed stays"
        />
        <MetricCard
          label="Collected"
          value={rupees(summary.collected)}
          change={comparisons?.collected}
          hint="Recorded on this period's stays"
        />
        <MetricCard
          label="Outstanding"
          value={rupees(o.total)}
          hint={
            o.count > 0 ? `${plural(o.count, "booking", "bookings")} with money due` : "Nothing due"
          }
        />
        <MetricCard
          label="Expenses"
          value={rupees(summary.expenses)}
          change={comparisons?.expenses}
          goodWhen="down"
          hint={
            summary.expenseCount > 0
              ? `${plural(summary.expenseCount, "expense", "expenses")} recorded`
              : "None recorded"
          }
        />
      </div>

      <div className={cardCls}>
        <p className="text-xs text-muted-foreground">Estimated operating profit</p>
        <p
          className={`mt-1.5 text-3xl font-bold tabular-nums ${summary.profit < 0 ? "text-destructive" : ""}`}
        >
          {rupees(summary.profit)}
        </p>
        <Trend change={comparisons?.profit} goodWhen="up" />
        <dl className="mt-3 space-y-1 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Revenue</dt>
            <dd className="tabular-nums">{rupees(summary.revenue)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">− Expenses</dt>
            <dd className="tabular-nums">{rupees(summary.expenses)}</dd>
          </div>
          <div className="flex justify-between border-t border-border/60 pt-1 font-semibold">
            <dt>= Estimated operating profit</dt>
            <dd className="tabular-nums">{rupees(summary.profit)}</dd>
          </div>
        </dl>
        <p className={`mt-2 text-xs ${note.complete ? "text-muted-foreground" : "text-amber-700"}`}>
          {note.text}
        </p>
      </div>
    </section>
  );
}

export function RevenueBySource({ summary }: { summary: MoneySummary }) {
  const rows = summary.bySource;
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <section className={`${cardCls} space-y-3`} aria-label="Revenue by source">
      <div>
        <h2 className="text-base font-semibold">Revenue by source</h2>
        <p className="text-xs text-muted-foreground">
          As recorded on each booking. Bookings with no source recorded are shown as Unknown.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No confirmed or completed stays in this period.
        </p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.group}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                    <span className="font-semibold">{rupees(r.revenue)}</span>
                    <span className="w-14 text-right text-xs text-muted-foreground">
                      {plural(r.bookings, "booking", "bookings")}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-1.5 rounded-full bg-primary/70"
                    style={{ width: `${Math.max(2, (r.revenue / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {rupees(summary.revenue)} · {plural(summary.stayCount, "booking", "bookings")}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

export function ExpenseBreakdown({
  summary,
  searchParams,
}: {
  summary: MoneySummary;
  searchParams: Record<string, string>;
}) {
  const rows = summary.byCategory;
  return (
    <section className={`${cardCls} space-y-3`} aria-label="Expenses by category">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">Expenses</h2>
        <Link
          to="/admin/expenses"
          search={searchParams as never}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/70"
        >
          {rows.length > 0 ? "Manage expenses" : "Add expenses"} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses recorded for this period.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {rows.map((c) => (
              <li
                key={c.category}
                className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-2.5 text-sm"
              >
                <span>{expenseCategoryLabel(c.category)}</span>
                <span className="font-semibold tabular-nums">{rupees(c.total)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{rupees(summary.expenses)}</span>
          </div>
        </>
      )}
    </section>
  );
}

export function OutstandingPayments({
  summary,
  searchParams,
}: {
  summary: MoneySummary;
  searchParams: Record<string, string>;
}) {
  const o = summary.outstanding;
  return (
    <section className={`${cardCls} space-y-3`} aria-label="Outstanding payments">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Outstanding payments</h2>
          <p className="text-xs text-muted-foreground">
            Unpaid balance on this period's confirmed &amp; completed stays.
          </p>
        </div>
        {o.count > 0 && (
          <Link
            to="/admin/payments"
            search={searchParams as never}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs font-medium hover:bg-muted/70"
          >
            Review payments <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {o.count === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is due on this period's stays.</p>
      ) : (
        <>
          <div>
            <p className="text-2xl font-bold tabular-nums">{rupees(o.total)}</p>
            <p className="text-xs text-muted-foreground">
              {plural(o.count, "booking", "bookings")} with money due
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-muted/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Upcoming</p>
              <p className="font-semibold tabular-nums">{rupees(o.upcoming)}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Started stays</p>
              <p className="font-semibold tabular-nums">{rupees(o.started)}</p>
            </div>
          </div>
        </>
      )}
      {summary.refundDue > 0 && (
        <p className="rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {rupees(summary.refundDue)} was paid above the bill on these stays (refund due). It is not
          taken off Outstanding.
        </p>
      )}
    </section>
  );
}

export function MoneyFootnote({ periodLabel }: { periodLabel: string }) {
  return (
    <details className="rounded-3xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground/80">
        How these numbers work
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li>
          Revenue, Collected and Outstanding cover stays with nights in {periodLabel}. A stay that
          crosses into another period is split by nights.
        </li>
        <li>Pending and cancelled bookings are never counted. A multi-room booking counts once.</li>
        <li>
          Collected is the money recorded on those stays. The app does not keep payment dates, so it
          is not "cash received during the period".
        </li>
        <li>
          Estimated operating profit is revenue minus the expenses you recorded. It is not
          accounting profit.
        </li>
      </ul>
    </details>
  );
}
