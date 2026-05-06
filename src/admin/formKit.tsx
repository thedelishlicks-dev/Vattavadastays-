import { Save } from "lucide-react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl font-semibold">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
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
    <div className="bg-card border border-border rounded-xl p-4 md:p-5 space-y-4">
      <div>
        <h2 className="font-medium">{title}</h2>
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
  "w-full h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary";

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
