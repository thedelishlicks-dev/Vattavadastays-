// Recovery from "stale build" errors.
//
// The app is a static SPA with content-hashed JS chunks. After a deploy the old
// chunk files disappear; a browser still holding the old index.html (common on
// iPad/iPhone Safari and Home Screen apps) then fails to load a route and the
// user sees an error screen until they clear website data.

const KEY = "stayidom:stale-reload-at";
const COOLDOWN_MS = 30_000;

export function isStaleBuildError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /dynamically imported module|importing a module script failed|failed to fetch dynamically|ChunkLoadError|error loading dynamically imported/i.test(
    msg,
  );
}

/** Reloads the page, but never more than once per 30 s (prevents reload loops). */
export function reloadOnceForNewVersion(): void {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < COOLDOWN_MS) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // sessionStorage can throw in private mode; fall through and reload once.
  }
  window.location.reload();
}
