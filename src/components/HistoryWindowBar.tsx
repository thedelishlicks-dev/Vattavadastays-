import { Loader2 } from "lucide-react";
import { sinceLabel } from "@/lib/historyWindow";

/**
 * "Showing stays since 1 May 2026 · Load 6 more months · Load all history".
 * Renders nothing once everything is already loaded.
 */
export function HistoryWindowBar({
  from,
  hasMore,
  loading,
  onMore,
  onAll,
  note,
}: {
  from: string | undefined;
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
  onAll: () => void;
  /** What older things stay in view regardless, e.g. "older stays that are still unpaid". */
  note: string;
}) {
  if (!from || !hasMore) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground"
    >
      <span className="flex-1 min-w-[12rem]">
        Showing stays from {sinceLabel(from)} onward, plus {note}.
      </span>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" />}
      <button
        type="button"
        onClick={onMore}
        disabled={loading}
        className="rounded-full border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        Load 6 more months
      </button>
      <button
        type="button"
        onClick={onAll}
        disabled={loading}
        className="rounded-full border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        Load all history
      </button>
    </div>
  );
}
