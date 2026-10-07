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

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});
