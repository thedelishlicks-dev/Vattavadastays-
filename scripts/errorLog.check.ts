// Run: npx tsx scripts/errorLog.check.ts
// Verifies the client error log never leaks personal data and can't flood.

import { readFileSync } from "node:fs";
import {
  classify, cleanPath, createThrottle, describeError, scrubContext, scrubText, shouldIgnore, signatureOf,
} from "../src/lib/errorLogCore";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      got  = ${JSON.stringify(got)}\n      want = ${JSON.stringify(want)}`}`);
}
function no(name: string, text: string, secret: string) {
  const ok = !text.includes(secret);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  LEAKED "${secret}" in: ${text}`}`);
}

// ── Privacy ────────────────────────────────────────────────────────────────
no("email removed", scrubText("Failed for guest rahul.k+test@gmail.com today"), "rahul");
no("10-digit phone removed", scrubText("lookup phone 9876543210 failed"), "9876543210");
no("+91 spaced phone removed", scrubText("call +91 98765 43210 now"), "98765");
no("hyphenated phone removed", scrubText("phone 98765-43210"), "43210");
no("JWT removed", scrubText("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnopqrstuvwxyz1234"), "eyJhbGci");
no("uuid removed", scrubText("booking 3f2b1c9e-7a44-4d0e-9b1a-0c5e2f8a1b77 missing"), "3f2b1c9e");
const u = scrubText("GET https://x.supabase.co/rest/v1/bookings?guest_phone=eq.9876543210&select=* 400");
no("URL query string removed", u, "guest_phone");
no("URL query string removed (phone)", u, "9876543210");
eq("URL host/path kept", u.startsWith("GET https://x.supabase.co/rest/v1/bookings?…"), true);

// ── Useful info must survive scrubbing ─────────────────────────────────────
eq("ISO dates untouched", scrubText("range 2026-10-08 to 2026-10-12"), "range 2026-10-08 to 2026-10-12");
eq("stack file:line:col untouched", scrubText("at f (https://demo.stayidom.in/assets/index-BbLhu-ze.js:1:23456)"), "at f (https://demo.stayidom.in/assets/index-BbLhu-ze.js:1:23456)");
eq("error code kept", scrubText("23505: duplicate key value"), "23505: duplicate key value");
eq("short numbers kept", scrubText("room 4 of 12, 3 guests, ₹4500"), "room 4 of 12, 3 guests, ₹4500");

eq("uuid in path → :id", cleanPath("/booking/3f2b1c9e-7a44-4d0e-9b1a-0c5e2f8a1b77/view"), "/booking/:id/view");

// ── Noise & classification ─────────────────────────────────────────────────
eq("ResizeObserver ignored", shouldIgnore("ResizeObserver loop completed with undelivered notifications."), true);
eq("cross-origin 'Script error.' ignored", shouldIgnore("Script error."), true);
eq("AbortError ignored", shouldIgnore("AbortError: The operation was aborted"), true);
eq("extension stack ignored", shouldIgnore("TypeError: x", "at chrome-extension://abc/inject.js:1:1"), true);
eq("empty ignored", shouldIgnore("   "), true);
eq("real error kept", shouldIgnore("TypeError: Cannot read properties of undefined (reading 'rooms')"), false);
eq("Failed to fetch → network", classify("TypeError: Failed to fetch"), "network");
eq("Safari 'Load failed' → network", classify("TypeError: Load failed"), "network");
eq("real bug → app", classify("TypeError: Cannot read properties of undefined"), "app");

// ── Throttle ───────────────────────────────────────────────────────────────
let t = 0;
const th = createThrottle({ maxPerSession: 3, dedupeMs: 60_000, now: () => t });
eq("first report allowed", th.allow("a"), true);
eq("same error within 60 s blocked", th.allow("a"), false);
t = 61_000;
eq("same error after 60 s allowed", th.allow("a"), true);
eq("different error allowed", th.allow("b"), true);
eq("session cap (3) then blocks everything", th.allow("c"), false);
eq("signature stable", signatureOf("window", "x".repeat(300)).length, "window|".length + 120);

// ── describeError ──────────────────────────────────────────────────────────
eq("Error → name: message", describeError(new TypeError("boom")).message, "TypeError: boom");
eq("Supabase error object → code: message", describeError({ code: "42501", message: "permission denied" }).message, "42501: permission denied");
eq("string", describeError("plain").message, "plain");
eq("unknown → fallback", describeError(undefined, "fb").message, "fb");
eq("circular object doesn't throw", (() => { const o: any = {}; o.self = o; return typeof describeError(o).message; })(), "string");

// ── Context ────────────────────────────────────────────────────────────────
no("context strings scrubbed", JSON.stringify(scrubContext({ where: "call 9876543210" })), "9876543210");
eq("oversized context dropped", scrubContext(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`key${i}`, "some ordinary words here ".repeat(7)]))), { truncated: true });
eq("normal context kept", scrubContext({ step: "create-booking", rooms: 2 }), { step: "create-booking", rooms: 2 });

// ── Safari safety: no regex lookbehind in the shipped logger ───────────────
for (const f of ["src/lib/errorLogCore.ts", "src/lib/errorLog.ts"]) {
  const src = readFileSync(f, "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  eq(`${f}: no regex lookbehind`, /\(\?<[=!]/.test(src), false);
}

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll error-log checks passed");
