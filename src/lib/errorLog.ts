// src/lib/errorLog.ts
//
// Reports app errors to the `client_errors` table (see
// supabase/migrations/20261009000000_client_error_log.sql) so the superadmin
// can see what is breaking for guests and owners — view them on /superadmin →
// Errors.
//
// Hard rules for this file:
//   * It must NEVER throw or block the app — logging is best-effort.
//   * It must never log personal data (everything is scrubbed first).
//   * If the table doesn't exist yet (migration not run) it fails silently.

import { supabase } from "@/lib/supabase";
import { isStaleBuildError } from "@/lib/staleBuild";
import {
  MAX_MESSAGE,
  MAX_STACK,
  classify,
  cleanPath,
  createThrottle,
  describeError,
  scrubContext,
  scrubText,
  shouldIgnore,
  signatureOf,
} from "@/lib/errorLogCore";

export type ErrorSource = "window" | "promise" | "route" | "booking" | "admin";

const throttle = createThrottle();
let installed = false;

export function logClientError(input: {
  source: ErrorSource;
  error?: unknown;
  message?: string;
  context?: Record<string, unknown>;
}): void {
  try {
    if (typeof window === "undefined") return;
    // Offline: the report couldn't be delivered anyway.
    if (navigator.onLine === false) return;

    const { message: rawMessage, stack: rawStack } = describeError(input.error, input.message);
    if (shouldIgnore(rawMessage, rawStack)) return;
    // Stale-deploy chunk errors self-heal by reloading (lib/staleBuild.ts).
    if (isStaleBuildError(input.error ?? rawMessage)) return;
    // Never report failures of the logger itself (prevents feedback loops).
    if (rawMessage.includes("client_errors")) return;

    const message = scrubText(rawMessage).slice(0, MAX_MESSAGE);
    if (!throttle.allow(signatureOf(input.source, message))) return;

    const record = {
      source: input.source,
      category: classify(rawMessage),
      message,
      stack: rawStack ? scrubText(rawStack).slice(0, MAX_STACK) : null,
      url: cleanPath(window.location.pathname),
      hostname: window.location.hostname.slice(0, 120),
      user_agent: navigator.userAgent.slice(0, 300),
      app_version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null,
      context: scrubContext(input.context),
    };

    // Fire and forget. Supabase resolves (not rejects) with {error} on failure.
    void supabase
      .from("client_errors")
      .insert(record)
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    /* logging must never break the app */
  }
}

/** Catches errors nothing else handled. Call once at startup. */
export function installGlobalErrorLogging(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    let file = "";
    try {
      file = event.filename ? new URL(event.filename).pathname : "";
    } catch {
      /* ignore malformed filename */
    }
    logClientError({
      source: "window",
      error: event.error,
      message: event.message,
      context: { file, line: event.lineno, col: event.colno },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logClientError({ source: "promise", error: event.reason });
  });
}
