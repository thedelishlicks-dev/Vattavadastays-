import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  title: string;
  /** One quiet line under the title. */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky bottom area: usually <ModalActions>. Error and warning text can go above it. */
  footer?: ReactNode;
  /** Narrow (default) for short forms; wide for calendars and tables. */
  size?: "md" | "lg";
  className?: string;
}

/**
 * The one modal pattern for the whole app: a centred card on desktop, a bottom sheet on phones.
 * Large title + round close button on top, scrolling body, sticky footer. Esc and a tap on the
 * backdrop close it; focus moves into it and returns on close.
 */
export function Modal({ title, subtitle, onClose, children, footer, size = "md", className }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/45 animate-in fade-in duration-200" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative flex w-full max-h-[92dvh] flex-col bg-card text-card-foreground outline-none",
          "rounded-t-[28px] md:rounded-[28px] shadow-[0_12px_40px_rgba(28,25,23,0.22)]",
          "animate-in fade-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-[var(--duration-lazy)] [--tw-ease:var(--ease-lazy)]",
          size === "lg" ? "md:max-w-2xl" : "md:max-w-lg",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 pt-5 pb-2 md:pt-6 md:pb-3">
          <div className="min-w-0">
            <h2 className="text-[26px] leading-tight font-bold tracking-tight font-body">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/80 transition-colors hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 md:px-6 py-2 space-y-4 md:space-y-5 overscroll-contain">{children}</div>
        {footer && <div className="shrink-0 px-5 md:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2 border-t border-border/60">{footer}</div>}
      </div>
    </div>
  );
}

/** Standard footer: one row, plain Cancel on the left, the one primary button filling the rest (keeps phones roomy). */
export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}
