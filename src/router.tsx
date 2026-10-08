import { useEffect } from "react";
import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isStaleBuildError, reloadOnceForNewVersion } from "./lib/staleBuild";
import { logClientError } from "./lib/errorLog";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const stale = isStaleBuildError(error);
  useEffect(() => {
    if (stale) reloadOnceForNewVersion();
    else logClientError({ source: "route", error });
  }, [stale, error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {stale ? "Updating…" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {stale
            ? "A new version is available. Reloading the page."
            : "An unexpected error occurred. Please try again."}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => { if (stale) { window.location.reload(); return; } router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

export const router = createRouter({
  routeTree,
  context: {},
  scrollRestoration: false,
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: DefaultErrorComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export const getRouter = () => {
  return router;
};
