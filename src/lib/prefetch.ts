// src/lib/prefetch.ts
//
// Starts the guest page's property request the instant the main script runs,
// instead of waiting for the "/" route chunk (+ ~25 small files) to download and
// render first. The two now happen in parallel, which removes one full network
// round-trip from the guest's first load — noticeable on weak hill-area signal.
//
// The decision below mirrors routes/index.tsx (Index): keep them in sync.

import { queryClient } from "@/lib/queryClient";
import { propertyQueryOptions } from "@/hooks/useProperty";
import { getSubdomain } from "@/lib/subdomain";

export function guestSlugForThisPage(): string | null {
  if (window.location.pathname !== "/") return null;

  const slugParam = new URLSearchParams(window.location.search).get("slug");
  if (slugParam) return slugParam;

  const h = window.location.hostname;
  const isRootDomain =
    h === "stayidom.in" ||
    h === "www.stayidom.in" ||
    h.endsWith(".vercel.app") ||
    h === "localhost" ||
    h === "127.0.0.1";
  if (isRootDomain) return null; // marketing landing page — no property to load

  return getSubdomain() || null;
}

export function prefetchGuestProperty(): void {
  try {
    const slug = guestSlugForThisPage();
    // prefetchQuery never throws; on failure the page's own useProperty() retries.
    if (slug) void queryClient.prefetchQuery(propertyQueryOptions(slug));
  } catch {
    /* an optimisation only — never block startup */
  }
}
