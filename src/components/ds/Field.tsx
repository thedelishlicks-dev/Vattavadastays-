import { useId, type InputHTMLAttributes, type ReactElement, type ReactNode, cloneElement } from "react";
import { cn } from "@/lib/utils";

/** Soft filled control: no border, grey fill, rounded. Use on <input>, <select>, <textarea>. */
export const fieldCls =
  "w-full rounded-xl border-0 bg-muted px-3.5 py-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">{label}</label>
      {cloneElement(children, { id })}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldCls, className)} {...rest} />;
}

const TONES = {
  green: "bg-[#dcfce7] text-[#166534]",
  blue: "bg-[#dbeafe] text-[#1e3a8a]",
  amber: "bg-[#fef3c7] text-[#92400e]",
  rose: "bg-[#ffe4e6] text-[#9f1239]",
  grey: "bg-muted text-foreground/80",
} as const;
export type Tone = keyof typeof TONES;

/** A group of fields with a round coloured icon on the left: the colour tells groups apart at a glance. */
export function FieldGroup({ icon: Icon, tone = "green", label, children }: { icon: React.ComponentType<{ className?: string }>; tone?: Tone; label?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <span aria-hidden="true" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONES[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
        {children}
      </div>
    </div>
  );
}
