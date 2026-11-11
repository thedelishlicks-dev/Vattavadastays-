import { cn } from "@/lib/utils";
import type { Tone } from "./Field";

const TEXT: Record<Tone, string> = { green: "text-[#166534]", blue: "text-[#1e3a8a]", amber: "text-[#92400e]", rose: "text-[#9f1239]", grey: "text-muted-foreground" };

/** Status as quiet coloured text with a dot: never a loud pill. */
export function StatusChip({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TEXT[tone], className)}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
