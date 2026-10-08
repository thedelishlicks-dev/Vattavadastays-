 // src/lib/errorLogCore.ts
//
// Pure logic for the client error log (no network, no Supabase) so it can be
// unit-tested: scrubbing personal data, ignoring noise, throttling.
// The side-effecting half is src/lib/errorLog.ts.
//
// NOTE: no regex lookbehind anywhere in this file — older iPad/iPhone Safari
// versions throw a SyntaxError at parse time on it, which would take the whole
// app down.

export const MAX_MESSAGE = 500;
export const MAX_STACK = 2000;
export const MAX_CONTEXT = 1200;

/** Removes personal data and secrets from free text before it leaves the browser. */
export function scrubText(input: string): string {
  return input
    // URL query strings can carry tokens / phone numbers
    .replace(/(https?:\/\/[^\s?#"')]+)\?[^\s"')]*/g, "$1?…")
    // email addresses
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    // phone-like numbers: 10+ digits, optionally with spaces/hyphens and a +
    .replace(/\+?(?:\d[\s-]?){9,}\d/g, "[number]")
    // long opaque tokens / JWTs / UUIDs
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]");
}

export function cleanPath(pathname: string): string {
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .slice(0, 200);
}

/** Network failures are expected on weak signal — kept, but tagged so they can be hidden. */
export function classify(message: string): "app" | "network" {
  return /failed to fetch|networkerror|load failed|network request failed|err_internet|err_network|timed? ?out|fetch failed/i.test(
    message,
  )
    ? "network"
    : "app";
}

/** Browser/extension noise that says nothing about the app's health. */
export function shouldIgnore(message: string, stack = ""): boolean {
  if (!message.trim()) return true;
  if (/ResizeObserver loop/i.test(message)) return true;
  if (/^script error\.?$/i.test(message.trim())) return true;
  if (/non-error promise rejection/i.test(message)) return true;
  if (/aborterror|the operation was aborted|signal is aborted/i.test(message)) return true;
  if (/(chrome|moz|safari)-extension:\/\//i.test(stack)) return true;
  return false;
}

export function signatureOf(source: string, message: string): string {
  return `${source}|${message.slice(0, 120)}`;
}

/**
 * Stops one broken page from flooding the log: at most `maxPerSession` reports
 * per page load, and the same error at most once per `dedupeMs`.
 */
export function createThrottle(
  opts: { maxPerSession?: number; dedupeMs?: number; now?: () => number } = {},
) {
  const maxPerSession = opts.maxPerSession ?? 10;
  const dedupeMs = opts.dedupeMs ?? 60_000;
  const now = opts.now ?? (() => Date.now());
  const lastSent = new Map<string, number>();
  let total = 0;

  return {
    allow(signature: string): boolean {
      if (total >= maxPerSession) return false;
      const t = now();
      const prev = lastSent.get(signature);
      if (prev !== undefined && t - prev < dedupeMs) return false;
      lastSent.set(signature, t);
      total += 1;
      return true;
    },
  };
}

/** Turns anything that can be thrown into a message + stack. */
export function describeError(error: unknown, fallbackMessage?: string): { message: string; stack: string } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? "" };
  }
  if (error && typeof error === "object") {
    // Supabase/PostgREST errors are plain objects: { code, message, details, hint }
    const e = error as { code?: unknown; message?: unknown };
    if (typeof e.message === "string") {
      return { message: e.code ? `${String(e.code)}: ${e.message}` : e.message, stack: "" };
    }
    try {
      return { message: JSON.stringify(error), stack: "" };
    } catch {
      /* fall through */
    }
  }
  if (typeof error === "string" && error) return { message: error, stack: "" };
  return { message: fallbackMessage ?? "", stack: "" };
}

export function scrubContext(context: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!context) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k.slice(0, 40)] = typeof v === "string" ? scrubText(v).slice(0, 200) : v;
  }
  const json = JSON.stringify(out);
  return json.length <= MAX_CONTEXT ? out : { truncated: true };
}
