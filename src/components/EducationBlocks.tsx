import type { ReactNode } from "react";
import type { LessonBlock } from "@/content/educationLessons";

// Renders the few block types Education lessons use. Same **bold** convention as the Help guide
// (src/routes/help.tsx), kept separate so Help stays untouched. Sized for reading on a phone.

/** Turns **bold** markers in a string into <strong>. */
function inline(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function EducationText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className ?? "text-[15px] leading-relaxed text-foreground/85"}>{inline(text)}</p>
  );
}

export function EducationSteps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-foreground/85">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--section-soft)] text-xs font-semibold text-[var(--section-ink)]"
          >
            {i + 1}
          </span>
          <span>{inline(item)}</span>
        </li>
      ))}
    </ol>
  );
}

export function EducationBlock({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case "p":
      return <EducationText text={block.text} />;
    case "steps":
      return <EducationSteps items={block.items} />;
    case "list":
      return (
        <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-foreground/85 marker:text-[var(--section-ink)]/60">
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
      );
    case "note":
      return (
        <div className="rounded-2xl bg-muted/60 p-4">
          <p className="text-sm font-semibold text-foreground">{block.label}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{inline(block.text)}</p>
        </div>
      );
  }
}
