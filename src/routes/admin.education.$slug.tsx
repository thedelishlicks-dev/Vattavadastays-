import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock, ExternalLink } from "lucide-react";
import { PageHeader } from "@/admin/formKit";
import { EducationBlock, EducationSteps, EducationText } from "@/components/EducationBlocks";
import { Button, EmptyState } from "@/components/ds";
import { educationPropertyParam, useEducationProgress } from "@/hooks/useEducationProgress";
import {
  categoryTitle,
  continueLesson,
  findLesson,
  helpHref,
  nextLesson,
  prerequisiteHint,
  resolveAction,
} from "@/lib/education";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/education/$slug")({
  component: AdminLesson,
});

// ---------------------------------------------------------------------------
// One lesson. It answers five questions in order: what to understand, why it matters to the property,
// what to do now, where in Stayidom to do it (the action button, only when a real screen fits) and how
// to tell it helped. Content: src/content/educationLessons.ts. Links: src/lib/education.ts.
// ---------------------------------------------------------------------------

const cardCls = "rounded-3xl border border-border/60 bg-card";

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-tight">{children}</h2>;
}

/** The one external link. Kept on one line: AGENTS.md wants every <a> opening tag on a single line. */
function HelpLink({ href }: { href: string }) {
  // prettier-ignore
  return <a href={href} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[var(--section-ink)] hover:underline">Need the button-by-button steps? Open them in Help<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>;
}

function AdminLesson() {
  const { slug } = Route.useParams();
  const lesson = findLesson(slug);
  const { completed, ready, setDone } = useEducationProgress();
  const property = educationPropertyParam();
  const search = (property ? { property } : {}) as never;

  // A new lesson opens at the top, not part-way down the last one.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!lesson) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader title="Education" />
        <EmptyState
          icon={BookOpen}
          title="That lesson is not available"
          hint="It may have been moved or taken down. Your other lessons are still here."
          action={
            <Link
              to="/admin/education"
              search={search}
              className="inline-flex h-11 items-center rounded-full bg-muted px-5 text-sm font-semibold hover:bg-muted/70"
            >
              See all lessons
            </Link>
          }
        />
      </div>
    );
  }

  const done = completed.has(lesson.id);
  const action = resolveAction(lesson, property);
  const help = helpHref(lesson);
  const before = prerequisiteHint(lesson, completed);
  const next = nextLesson(lesson.id);
  // After finishing, point at what is still unfinished if the next lesson is already done.
  const upNext = next && !completed.has(next.id) ? next : continueLesson(completed, lesson.id);

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/admin/education"
        search={search}
        className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-[var(--section-ink)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Education
      </Link>

      <header className="space-y-3">
        <PageHeader title={lesson.title} />
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{categoryTitle(lesson.category)}</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {lesson.minutes} min
          </span>
          {done && <span className="font-medium text-[var(--section-ink)]">Completed</span>}
        </p>
        <EducationText
          text={lesson.description}
          className="text-base leading-relaxed text-foreground"
        />
      </header>

      {before && (
        <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          This works best after{" "}
          <Link
            to="/admin/education/$slug"
            params={{ slug: before.slug }}
            search={search}
            className="font-medium text-[var(--section-ink)] hover:underline"
          >
            {before.title}
          </Link>
          .
        </p>
      )}

      <section className={cn(cardCls, "space-y-2 p-5")} aria-label="What you will learn">
        <p className="text-sm font-semibold">After this lesson you can</p>
        <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-foreground/85 marker:text-[var(--section-ink)]/60">
          {lesson.objectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <Heading>What to understand</Heading>
        {lesson.body.map((b, i) => (
          <EducationBlock key={i} block={b} />
        ))}
      </section>

      <section className="space-y-2">
        <Heading>Why it matters to your property</Heading>
        <EducationText text={lesson.whyItMatters} />
      </section>

      <section className={cn(cardCls, "space-y-4 p-5")} aria-label="What to do now">
        <Heading>What to do now</Heading>
        <EducationSteps items={lesson.actionSteps} />
        {action && (
          <div className="space-y-2 pt-1">
            <Link
              to={action.to}
              search={action.search as never}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90 sm:w-auto"
            >
              {action.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <p className="text-xs text-muted-foreground">Opens {action.screen}.</p>
          </div>
        )}
        {help && <HelpLink href={help} />}
      </section>

      <section className="space-y-2">
        <Heading>How you will know it helped</Heading>
        <EducationText text={lesson.measure} />
      </section>

      <section className={cn(cardCls, "space-y-3 p-5")} aria-label="Finish this lesson">
        <Button
          variant={done ? "soft" : "primary"}
          size="lg"
          block
          aria-pressed={done}
          disabled={!ready}
          onClick={() => setDone(lesson.id, !done)}
        >
          {done ? (
            <>
              <Check className="h-5 w-5" aria-hidden="true" />
              Done. Tap to undo
            </>
          ) : (
            "Mark lesson as done"
          )}
        </Button>
        {!ready && (
          <p className="text-center text-xs text-muted-foreground">
            Your progress can be saved once your property has loaded.
          </p>
        )}
      </section>

      {upNext ? (
        <Link
          to="/admin/education/$slug"
          params={{ slug: upNext.slug }}
          search={search}
          className="flex items-center justify-between gap-3 rounded-3xl bg-[var(--section-soft)] p-5 text-[var(--section-ink)]"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium">
              {upNext === next ? "Next lesson" : "Continue learning"}
            </span>
            <span className="block text-base font-semibold leading-snug">{upNext.title}</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </Link>
      ) : (
        <p className="rounded-3xl bg-muted/60 p-5 text-sm text-muted-foreground">
          That is every lesson. Open your Monthly report next month to see what changed.
        </p>
      )}
    </article>
  );
}
