import { createFileRoute } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ChevronDown, Info, X } from "lucide-react";
import {
  GLOSSARY,
  GUIDE_GROUPS,
  SUPPORT_CONTACT,
  type GuideBlock,
  type GuideSection,
} from "@/content/ownerGuide";

// Public owner Help page. No login needed, so the link can be sent to a new
// owner on WhatsApp before they have signed in. Content lives in
// src/content/ownerGuide.ts. Deep links such as /help#seasonal-rates open and
// scroll to the matching section.

export const Route = createFileRoute("/help")({
  component: HelpPage,
});

/** Turns **bold** markers in a string into <strong>. */
function renderInline(text: string): ReactNode[] {
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

function Block({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case "p":
      return <p className="text-sm leading-relaxed text-muted-foreground">{renderInline(block.text)}</p>;
    case "steps":
      return (
        <ol className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-primary/60">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "note":
      return (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">{block.label}: </span>
            {renderInline(block.text)}
          </p>
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {block.head.map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map((row, i) => (
                <tr key={i} className="align-top">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-muted-foreground">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Section({ section }: { section: GuideSection }) {
  return (
    <details
      id={section.id}
      className="group scroll-mt-20 rounded-xl border border-border bg-card open:shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold leading-snug text-foreground">{section.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{section.summary}</p>
        </div>
        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        {section.blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>
    </details>
  );
}

function HelpPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Owner Help · stayidom.in";
    // Owner help is not meant to be found through search engines.
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);

    // Open and scroll to a section named in the URL, e.g. /help#seasonal-rates.
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (id) {
      const el = document.getElementById(id);
      if (el) {
        if (el instanceof HTMLDetailsElement) el.open = true;
        requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
      }
    }
    return () => {
      document.title = prevTitle;
      meta.remove();
    };
  }, []);

  // Opened from the dashboard in a new tab or sheet, so "Close" should close it.
  // If the browser refuses (a tab the owner opened by hand), go back or fall
  // back to the dashboard.
  const closeHelp = () => {
    window.close();
    window.setTimeout(() => {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "/admin/dashboard";
    }, 150);
  };

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card px-3">
        <button
          onClick={closeHelp}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" /> Close
        </button>
        <div className="ml-1 font-display text-base font-semibold text-foreground">Owner Help</div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-6 pb-16">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">How to run your property</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Short answers, step by step. Tap a question to open it. Example prices use a room called Mud House; yours
            will differ.
          </p>
        </div>

        <nav className="rounded-xl border border-border bg-card p-4" aria-label="Contents">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Jump to</div>
          <ul className="space-y-1.5 text-sm">
            {GUIDE_GROUPS.map((g) => (
              <li key={g.key}>
                <a href={`#group-${g.key}`} className="font-medium text-primary hover:underline">
                  {g.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#group-glossary" className="font-medium text-primary hover:underline">
                Words explained
              </a>
            </li>
          </ul>
        </nav>

        {GUIDE_GROUPS.map((g) => (
          <section key={g.key} id={`group-${g.key}`} className="scroll-mt-20 space-y-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-foreground">{g.title}</h2>
              <p className="text-sm text-muted-foreground">{g.intro}</p>
            </div>
            {g.sections.map((s) => (
              <Section key={s.id} section={s} />
            ))}
          </section>
        ))}

        <section id="group-glossary" className="scroll-mt-20 space-y-3">
          <h2 className="font-display text-xl font-semibold text-foreground">Words explained</h2>
          <dl className="divide-y divide-border rounded-xl border border-border bg-card">
            {GLOSSARY.map((g) => (
              <div key={g.term} className="grid grid-cols-3 gap-3 p-3 text-sm">
                <dt className="font-semibold text-foreground">{g.term}</dt>
                <dd className="col-span-2 text-muted-foreground">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>

        {SUPPORT_CONTACT && (
          <section className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <div className="font-display text-base font-semibold text-foreground">Still stuck?</div>
            <p className="mt-1">Contact support: {SUPPORT_CONTACT}</p>
            <p className="mt-1">
              Please tell us the property name, the guest's name or phone number, the dates, and what happened. A
              screenshot helps.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
