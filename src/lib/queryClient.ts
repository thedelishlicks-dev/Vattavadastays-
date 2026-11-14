// src/lib/queryClient.ts
//
// One shared QueryClient (previously created inside routes/__root.tsx) so it can
// also be used before React renders — see lib/prefetch.ts.
//
// staleTime: TanStack Query's default is 0, i.e. data is "stale" the instant it
// arrives, so every component mount and every iPad/phone app-switch refetched
// the property and room list. With ten components calling useProperty(), simply
// opening the booking dialog re-downloaded everything. 30 s removes that
// redundant traffic while staying fresh enough for the owner Calendar
// (mutations still invalidate their queries immediately).

import { QueryCache, QueryClient } from "@tanstack/react-query";
import { logClientError } from "@/lib/errorLog";

export const queryClient = new QueryClient({
  // A query that still fails after its retries is recorded (superadmin > Errors), so a screen that
  // quietly could not load shows up there. The log scrubs and throttles repeats itself.
  queryCache: new QueryCache({
    onError: (error, query) => logClientError({ source: "query", error, context: { query: String(query.queryKey[0] ?? "") } }),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});
