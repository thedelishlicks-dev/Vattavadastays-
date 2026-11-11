import { useSection } from "@/admin/sectionContext";
import { Save } from "lucide-react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  // Inside the admin layout the header carries the section's icon tile and a short accent bar
  // (colours come from data-section, see styles.css). Elsewhere it renders as plain text.
  const section = useSection();
  const Icon = section?.icon;
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--section-soft)] text-[var(--section-ink)]"
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
    return (
    <div className="bg-card border border-border/60 rounded-3xl p-5 md:p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full h-11 rounded-xl border-0 bg-muted px-3.5 text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

export function SaveBar({ onSave, dirty }: { onSave: () => void; dirty?: boolean }) {
  return (
    <div className="sticky bottom-0 md:bottom-[unset] md:static -mx-4 md:mx-0 px-4 py-3 md:p-0 bg-background/80 md:bg-transparent backdrop-blur md:backdrop-blur-0 border-t border-border md:border-0 flex items-center justify-end gap-2">
      {dirty && <span className="text-xs text-muted-foreground mr-auto">Unsaved changes</span>}
      <button
        onClick={onSave}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <Save className="h-4 w-4" /> Save changes
      </button>
    </div>
  );
}
