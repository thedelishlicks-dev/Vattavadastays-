import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { rupees, MoneyFootnote } from "@/components/MoneyOverview";
import { expenseCategoryLabel } from "@/lib/expenses";
import {
  compareMonths,
  earliestReportMonth,
  guestSectionState,
  lastCompletedMonth,
  shiftMonth,
  type MonthlyReport,
  type OwnerTakeaway,
  type ReportChange,
  type ReportMonth,
} from "@/lib/monthlyReport";
import { monthLabelOf } from "@/lib/moneySummary";

// Presentation only. Every figure and sentence comes from lib/monthlyReport.ts (which reuses Money
// Intelligence, businessMetrics, guest identity, the Property Score and Revenue Intelligence). Nothing here does
// money maths. Mobile-first: two columns of cards on a phone, one scroll, numbers before words.

const cardCls = "rounded-3xl border border-border/60 bg-card p-4 min-w-0";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * When the previous month gives no baseline AT ALL (revenue has nothing to compare with), saying so under every
 * card is a wall of text; it is said once, in a notice. A neutral line under a single card still shows when the
 * rest of the report IS compared (e.g. expenses recorded for the first time).
 */
const isNeutral = (c: ReportChange | null | undefined) =>
  c?.kind === "no_baseline" || c?.kind === "none";
const noBaselineAtAll = (report: MonthlyReport) =>
  report.comparison?.revenue.kind === "no_baseline";
const pick = (report: MonthlyReport, change: ReportChange | null | undefined) =>
  noBaselineAtAll(report) && isNeutral(change) ? null : change;

// ── Month picker ────────────────────────────────────────────────────────────

export function MonthPicker({
  month,
  now,
  previousLabel,
  onChange,
}: {
  month: ReportMonth;
  now: Date;
  /** "September 2026": what this month is compared with. */
  previousLabel: string;
  onChange: (m: ReportMonth) => void;
}) {
  const canNewer = compareMonths(month, lastCompletedMonth(now)) < 0;
  const canOlder = compareMonths(month, earliestReportMonth(now)) > 0;
  const btn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70 disabled:opacity-40 disabled:hover:bg-muted";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className={btn}
          disabled={!canOlder}
          onClick={() => onChange(shiftMonth(month, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-lg font-semibold text-center" aria-live="polite">
          {monthLabelOf(month.year, month.month0)}
        </p>
        <button
          type="button"
          className={btn}
          disabled={!canNewer}
          onClick={() => onChange(shiftMonth(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Compared with {previousLabel}</p>
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your report">
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

// ── Small pieces ────────────────────────────────────────────────────────────

/**
 * One comparison line. The direction is in the WORDS and the arrow ("↑ Up 18% vs September 2026"), so colour is
 * only a hint. Neutral states ("No previous-month baseline") are quiet text, never a number.
 */
function ChangeLine({
  change,
  goodWhen = "up",
}: {
  change: ReportChange | null | undefined;
  goodWhen?: "up" | "down";
}) {
  if (!change) return null;
  const tone =
    change.direction === null || change.direction === "flat"
      ? "text-muted-foreground"
      : change.direction === goodWhen
        ? "text-green-700"
        : "text-destructive";
  return <p className={`mt-1 text-xs font-medium ${tone}`}>{change.text}</p>;
}

function Stat({
  label,
  value,
  hint,
  change,
  goodWhen,
  quiet = false,
}: {
  label: string;
  value: string;
  hint?: string;
  change?: ReportChange | null;
  goodWhen?: "up" | "down";
  quiet?: boolean;
}) {
  return (
    <div className={quiet ? "min-w-0 rounded-3xl bg-muted/60 p-4" : cardCls}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-xl font-bold tabular-nums">{value}</p>
      <ChangeLine change={change} goodWhen={goodWhen} />
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <p
      className={`rounded-2xl px-4 py-3 text-sm ${
        tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-muted/60 text-muted-foreground"
      }`}
    >
      {children}
    </p>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

export function ReportNotices({
  report,
  comparisonFailed,
}: {
  report: MonthlyReport;
  comparisonFailed: boolean;
}) {
  return (
    <>
      {!report.hasStays && (
        <Notice>
          Not enough booking data for this month. There are no confirmed or completed stays in{" "}
          {report.monthName}, so some figures below are empty.
        </Notice>
      )}
      {report.setupNote && <Notice>{report.setupNote}</Notice>}
      {noBaselineAtAll(report) && !report.setupNote && (
        <Notice>
          No previous-month baseline: {report.previousLabel} has no booking revenue to compare with,
          so changes aren&rsquo;t shown.
        </Notice>
      )}
      {comparisonFailed && (
        <Notice tone="warn">
          Couldn&rsquo;t load {report.previousLabel} for the comparison. The figures below are for{" "}
          {report.monthName} only.
        </Notice>
      )}
    </>
  );
}

export function ReportSummary({ report }: { report: MonthlyReport }) {
  const { money: m, comparison: c, profitNote: note } = report;
  const o = m.outstanding;
  return (
    <section aria-label={`Summary for ${report.label}`} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Revenue"
          value={rupees(m.revenue)}
          change={pick(report, c?.revenue)}
          hint="Confirmed & completed stays"
        />
        <Stat
          label="Collected"
          value={rupees(m.collected)}
          hint={`Recorded on ${report.monthName}'s stays. Not cash received in ${report.monthName}.`}
        />
        <Stat
          label="Outstanding"
          value={rupees(o.total)}
          hint={
            o.count > 0
              ? `${plural(o.count, "booking")} with money due · ${rupees(o.upcoming)} upcoming · ${rupees(o.started)} on started stays`
              : "Nothing due"
          }
        />
        <Stat
          label="Expenses"
          value={rupees(m.expenses)}
          change={pick(report, c?.expenses)}
          goodWhen="down"
          hint={
            m.expenseCount > 0 ? `${plural(m.expenseCount, "expense")} recorded` : "None recorded"
          }
        />
      </div>

      <div className={cardCls}>
        <p className="text-xs text-muted-foreground">Estimated operating profit</p>
        <p
          className={`mt-1.5 text-3xl font-bold tabular-nums ${m.profit < 0 ? "text-destructive" : ""}`}
        >
          {rupees(m.profit)}
        </p>
        <ChangeLine change={pick(report, c?.profit)} />
        <dl className="mt-3 space-y-1 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Revenue</dt>
            <dd className="tabular-nums">{rupees(m.revenue)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">− Recorded expenses</dt>
            <dd className="tabular-nums">{rupees(m.expenses)}</dd>
          </div>
          <div className="flex justify-between border-t border-border/60 pt-1 font-semibold">
            <dt>= Estimated operating profit</dt>
            <dd className="tabular-nums">{rupees(m.profit)}</dd>
          </div>
        </dl>
        <p className={`mt-2 text-xs ${note.complete ? "text-muted-foreground" : "text-amber-700"}`}>
          {note.text}
        </p>
      </div>

      {m.refundDue > 0 && (
        <Notice tone="warn">
          {rupees(m.refundDue)} was paid above the bill on these stays (refund due). It is not taken
          off Outstanding.
        </Notice>
      )}
    </section>
  );
}

export function ReportPerformance({ report }: { report: MonthlyReport }) {
  const { metrics: x, money: m, comparison: c } = report;
  const noRooms = x.availableRoomNights === 0;
  return (
    <section aria-label="Performance" className="space-y-3">
      <h2 className="text-base font-semibold">How the rooms performed</h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Occupancy"
          value={noRooms ? "—" : `${Math.round(x.occupancyPercent)}%`}
          change={pick(report, c?.occupancy)}
          hint={
            noRooms
              ? "No active rooms"
              : `${x.occupiedRoomNights} of ${x.availableRoomNights} room nights`
          }
        />
        <Stat
          label="Average daily rate (ADR)"
          value={x.occupiedRoomNights > 0 ? rupees(x.adr) : "—"}
          change={pick(report, c?.adr)}
          hint="Room revenue per night sold"
        />
        <Stat
          label="RevPAR"
          value={noRooms ? "—" : rupees(x.revPar)}
          change={pick(report, c?.revPar)}
          hint="Room revenue per available night"
        />
        <Stat
          label="Bookings"
          value={String(m.stayCount)}
          change={pick(report, c?.stays)}
          hint="A multi-room booking counts once"
        />
        <Stat
          quiet
          label="Room nights occupied"
          value={String(x.occupiedRoomNights)}
          hint="Every room, every night"
        />
        <Stat
          quiet
          label="Room nights available"
          value={String(x.availableRoomNights)}
          hint={
            noRooms ? undefined : `${plural(report.roomCount, "active room")} × ${report.days} days`
          }
        />
      </div>
    </section>
  );
}

export function ReportSources({ report }: { report: MonthlyReport }) {
  const rows = report.bySource;
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <section className={`${cardCls} space-y-3`} aria-label="Revenue by source">
      <div>
        <h2 className="text-base font-semibold">Revenue by source</h2>
        <p className="text-xs text-muted-foreground">
          As recorded on each booking, including any source you corrected. Unknown means no source
          was recorded.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No confirmed or completed stays this month.</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.group}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                    <span className="font-semibold">{rupees(r.revenue)}</span>
                    <span className="w-10 text-right text-xs text-muted-foreground">
                      {r.percent === null ? "—" : `${r.percent}%`}
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
            <span>Total revenue</span>
            <span className="tabular-nums">
              {rupees(report.money.revenue)}
              {report.money.revenue > 0 ? " · 100%" : ""}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

export function ReportExpenses({
  report,
  searchParams,
}: {
  report: MonthlyReport;
  searchParams: Record<string, string>;
}) {
  const rows = report.money.byCategory;
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
        <div className="space-y-1">
          <p className="text-sm font-medium">No expenses recorded for this month.</p>
          <p className="text-xs text-muted-foreground">
            That doesn&rsquo;t mean the property had no costs, only that none were entered. Add them
            to get a fuller picture.
          </p>
        </div>
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
            <span>Total expenses</span>
            <span className="tabular-nums">{rupees(report.money.expenses)}</span>
          </div>
        </>
      )}
    </section>
  );
}

export function ReportGuests({
  report,
  status,
}: {
  report: MonthlyReport | null;
  status: "loading" | "error" | "ready";
}) {
  const g = report?.guests ?? null;
  return (
    <section className={`${cardCls} space-y-3`} aria-label="Guests">
      <div>
        <h2 className="text-base font-semibold">Guests</h2>
        <p className="text-xs text-muted-foreground">
          Guests are recognised by phone number, never by name.
        </p>
      </div>
      {status === "error" ? (
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load guest details. The rest of the report is not affected.
        </p>
      ) : !g ? (
        <div className="h-16 rounded-2xl bg-muted animate-pulse" aria-label="Loading guests" />
      ) : guestSectionState(g) === "no_stays" ? (
        <p className="text-sm text-muted-foreground">No stays this month.</p>
      ) : guestSectionState(g) === "none_identified" ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">No identified guest records yet.</p>
          <p className="text-xs text-muted-foreground">
            A guest record is made when a booking has a phone number. Add phone numbers to your
            bookings to see repeat guests.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat quiet label="Identified guests" value={String(g.uniqueGuests)} />
            <Stat quiet label="Repeat guests" value={String(g.repeatGuests)} />
            <Stat quiet label="Repeat guest stays" value={String(g.repeatGuestStays)} />
          </div>
          <p className="text-xs text-muted-foreground">
            A repeat guest has stayed more than once at this property, counted up to the end of{" "}
            {report?.monthName}.
            {g.unidentifiedStays > 0 &&
              ` ${plural(g.unidentifiedStays, "stay")} had no usable phone number, so ${g.unidentifiedStays === 1 ? "it isn't" : "they aren't"} matched to a guest.`}
          </p>
        </>
      )}
    </section>
  );
}

export function ReportTakeaway({ takeaway }: { takeaway: OwnerTakeaway }) {
  return (
    <section className={`${cardCls} space-y-4`} aria-label="Summary in words">
      <div className="space-y-2">
        <h2 className="text-base font-semibold">What changed</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {takeaway.whatChanged.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
      {takeaway.whatToDoNext.length > 0 && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          <h2 className="text-base font-semibold">What to do next</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {takeaway.whatToDoNext.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ReportFootnote({ report }: { report: MonthlyReport }) {
  return (
    <div className="space-y-3">
      <MoneyFootnote periodLabel={report.label} />
      <details className="rounded-3xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground/80">
          About occupancy, guests and the sections marked &ldquo;current&rdquo;
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            Occupancy, ADR and RevPAR use the rooms that are active today. The app does not keep a
            history of rooms added or removed.
          </li>
          <li>
            Repeat guests are counted up to the end of {report.monthName}. A stay booked later does
            not change this report.
          </li>
          <li>
            The Property Score and the opportunities describe your property today. They are not
            saved month by month, so they are not {report.monthName}&rsquo;s own figures.
          </li>
        </ul>
      </details>
    </div>
  );
}
