import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, hint, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-muted/50 px-6 py-10 text-center">
      {Icon && <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-muted-foreground"><Icon className="h-6 w-6" /></span>}
      <p className="text-base font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
