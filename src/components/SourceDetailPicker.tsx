import { BOOKING_SOURCE_DETAIL_OPTIONS } from "@/lib/bookingSourceDetail";
import { cn } from "@/lib/utils";
import type { BookingSourceDetail } from "@/types/database";

interface SourceDetailPickerProps {
  /** "" = not recorded */
  value: BookingSourceDetail;
  onChange: (value: BookingSourceDetail) => void;
}

/** "How did this guest find you?" — optional, tap a chip; tap it again to clear. */
export function SourceDetailPicker({ value, onChange }: SourceDetailPickerProps) {
  return (
    <div className="space-y-1.5">
      <p id="source-detail-label" className="text-xs font-medium text-muted-foreground">
        How did this guest find you? <span className="font-normal">(optional)</span>
      </p>
      <div role="radiogroup" aria-labelledby="source-detail-label" className="flex flex-wrap gap-2">
        {BOOKING_SOURCE_DETAIL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(value === opt.value ? "" : opt.value)}
            className={cn(
              "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              value === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground/80 hover:bg-muted/70",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
