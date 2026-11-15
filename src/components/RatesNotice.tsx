import { Loader2, TriangleAlert } from "lucide-react";

/**
 * Status of the seasonal-price lookup, for screens that calculate a stay's price on the owner's side
 * (Add booking, Quote builder, Edit stay). Until the lookup succeeds, those totals would silently use
 * each room's base price, so a peak-season stay could be quoted or saved too cheap. Shows nothing
 * once the prices are loaded.
 */
export function RatesNotice({ query }: { query: { isSuccess: boolean; isError: boolean; refetch: () => unknown } }) {
  if (query.isSuccess) return null;
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 min-w-[10rem]">Couldn't load seasonal prices, so the total can't be trusted yet.</span>
        <button type="button" onClick={() => void query.refetch()} className="rounded-full border border-destructive/30 bg-card px-3 py-1 font-medium hover:bg-destructive/5">
          Try again
        </button>
      </div>
    );
  }
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking seasonal prices…
    </p>
  );
}
