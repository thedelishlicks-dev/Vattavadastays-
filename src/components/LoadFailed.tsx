import { TriangleAlert } from "lucide-react";

/**
 * Shown when a page's data could not be loaded. Without it the page fell back to its empty state
 * ("No agents yet", ₹0 totals, "not available for booking") — which reads as the truth, not as a
 * failed request. A failed load changes nothing, so it is safe to say nothing was lost.
 */
export function LoadFailed({
  title,
  detail = "This is a connection problem, not missing data. Nothing has been changed or lost.",
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
      <TriangleAlert className="h-7 w-7 mx-auto text-destructive" />
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  );
}
