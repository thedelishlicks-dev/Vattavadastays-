// Runs after `vite build` (see package.json "build").
//
// Renames dist/index.html -> dist/_shell.html.
//
// Why: Vercel serves a real file BEFORE it looks at rewrites. While dist/index.html
// existed, a visit to "/" was answered straight from that file and the rewrite to
// api/og (which injects each property's own title / photo for WhatsApp, Instagram
// and Google) never ran. With no index.html, "/" has no file, so the rewrite in
// vercel.json handles it; every other path falls back to /_shell.html (the SPA).
//
// Fails the build (so nothing broken is deployed) if the file isn't there.
import { existsSync, renameSync } from "node:fs";

const from = "dist/index.html";
const to = "dist/_shell.html";
if (!existsSync(from)) {
  console.error(`post-build: ${from} not found — build output changed?`);
  process.exit(1);
}
renameSync(from, to);
console.log(`post-build: ${from} -> ${to}`);
