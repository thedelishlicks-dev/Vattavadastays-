import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Clock } from "lucide-react";
import { PageHeader } from "@/admin/formKit";
import { EDUCATION_CATEGORIES } from "@/content/educationLessons";
import { educationPropertyParam, useEducationProgress } from "@/hooks/useEducationProgress";
import {
  continueLesson,
  lessonsForCategory,
  progressFor,
  publishedLessons,
  type CategoryFilter,
} from "@/lib/education";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/education/")({
  component: AdminEducation,
});

// ---------------------------------------------------------------------------
// Education: learn, do, measure. A short list of practical lessons, each ending in one thing to do on
// a real Stayidom screen. Help answers "how do I use Stayidom?"; this answers "how do I improve my
// property business?". Content: src/content/educationLessons.ts. Rules and progress:
// src/lib/education.ts.
// ---------------------------------------------------------------------------

const cardCls = "rounded-3xl border border-border/60 bg-card";

function AdminEducation() {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const { completed, ready } = useEducationProgress();
  const property = educationPropertyParam();
  const search = (property ? { property } : {}) as never;

  const overall = progressFor(completed);
  const next = useMemo(() => continueLesson(completed), [completed]);
  const categories = EDUCATION_CATEGORIES.filter((c) => filter === "all" || c.id === filter);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Education" subtitle="Learn it, do it in Stayidom, then see the result." />

      <section className={cn(cardCls, "space-y-3 p-5")}>
        <p className="text-[15px] leading-relaxed text-foreground/85">
          Short lessons to help you improve the property you run here. Each one ends with a single
          thing to do on a real Stayidom screen, and tells you where to see whether it helped.
        </p>
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>Looking for how to use a screen or button?</span>
          {/* prettier-ignore */}
          <a href="/help" target="_blank" rel="noopener" className="inline-flex min-h-10 items-center font-medium text-[var(--section-ink)] hover:underline">Open Help</a>
        </div>
      </section>

      {ready && overall.total > 0 && (
        <section className={cn(cardCls, "space-y-3 p-5")} aria-label="Your progress">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-base font-semibold">
              {overall.done} of {overall.total} lessons done
            </p>
            <p className="text-sm text-muted-foreground">{overall.percent}%</p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overall.percent}
            aria-label="Lessons completed"
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-[var(--section)]"
              style={{ width: `${overall.percent}%` }}
            />
          </div>
          {next && (
            <Link
              to="/admin/education/$slug"
              params={{ slug: next.slug }}
              search={search}
              className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--section-soft)] px-4 py-3 text-[var(--section-ink)]"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium">
                  {overall.done === 0 ? "Start here" : "Continue learning"}
                </span>
                <span className="block text-sm font-semibold leading-snug">{next.title}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
            </Link>
          )}
          {!next && (
            <p className="text-sm text-muted-foreground">
              You have finished every lesson. Check your Monthly report to see what changed.
            </p>
          )}
        </section>
      )}

      <nav
        aria-label="Lesson categories"
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max gap-2 md:w-auto md:flex-wrap">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterChip>
          {EDUCATION_CATEGORIES.map((c) => (
            <FilterChip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.title}
            </FilterChip>
          ))}
        </div>
      </nav>

      {categories.map((c) => {
        const lessons = lessonsForCategory(c.id);
        if (lessons.length === 0) return null;
        const p = progressFor(completed, c.id);
        return (
          <section key={c.id} aria-labelledby={`cat-${c.id}`} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <div className="min-w-0">
                <h2 id={`cat-${c.id}`} className="text-lg font-semibold tracking-tight">
                  {c.title}
                </h2>
                <p className="text-sm text-muted-foreground">{c.blurb}</p>
              </div>
              {ready && (
                <p className="shrink-0 text-xs text-muted-foreground">
                  {p.done} of {p.total}
                </p>
              )}
            </div>
            <ul className="space-y-3">
              {lessons.map((l) => {
                const done = completed.has(l.id);
                return (
                  <li key={l.id}>
                    <Link
                      to="/admin/education/$slug"
                      params={{ slug: l.slug }}
                      search={search}
                      className={cn(
                        cardCls,
                        "block p-4 transition-colors hover:bg-muted/40 active:bg-muted/60",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                            done
                              ? "bg-[var(--section)] text-[var(--section-on)]"
                              : "border border-border bg-card",
                          )}
                        >
                          {done && <Check className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold leading-snug">
                            {l.title}
                          </span>
                          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                            {l.description}
                          </span>
                          <span className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              {l.minutes} min
                            </span>
                            {done && (
                              <span className="font-medium text-[var(--section-ink)]">
                                Completed
                              </span>
                            )}
                          </span>
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {publishedLessons().length === 0 && (
        <p className="text-sm text-muted-foreground">No lessons yet.</p>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
        active
          ? "bg-[var(--section)] text-[var(--section-on)]"
          : "bg-muted text-foreground hover:bg-muted/70",
      )}
    >
      {children}
    </button>
  );
}
