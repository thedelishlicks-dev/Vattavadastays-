// Run: VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite-node scripts/prefetch.check.ts
// Verifies the pre-render property prefetch only fires on guest pages.

let failed = 0;
function setLocation(hostname: string, pathname: string, search = "") {
  (globalThis as any).window = { location: { hostname, pathname, search } };
}
const { guestSlugForThisPage } = await import("../src/lib/prefetch");
const { propertyQueryOptions } = await import("../src/hooks/useProperty");

function expect(name: string, host: string, path: string, search: string, want: string | null) {
  setLocation(host, path, search);
  const got = guestSlugForThisPage();
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  got=${got} want=${want}`}`);
}

expect("property subdomain home → prefetch", "demo.stayidom.in", "/", "", "demo");
expect("property subdomain /login → no prefetch", "demo.stayidom.in", "/login", "", null);
expect("property subdomain /admin/dashboard → no prefetch", "demo.stayidom.in", "/admin/dashboard", "", null);
expect("property subdomain /booking-status → no prefetch", "demo.stayidom.in", "/booking-status", "?property=abc", null);
expect("root domain → landing, no prefetch", "stayidom.in", "/", "", null);
expect("www → landing, no prefetch", "www.stayidom.in", "/", "", null);
expect("vercel preview root → landing, no prefetch", "x.vercel.app", "/", "", null);
expect("vercel preview ?slug= → prefetch", "x.vercel.app", "/", "?slug=bleafmudhouse", "bleafmudhouse");
expect("localhost → no prefetch", "localhost", "/", "", null);

// Same cache key the page's useProperty() reads → the prefetch is actually reused.
const k = JSON.stringify(propertyQueryOptions("demo").queryKey);
const ok = k === JSON.stringify(["property", "demo"]);
if (!ok) failed++;
console.log(`${ok ? "PASS" : "FAIL"}  prefetch cache key matches useProperty key`);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nAll prefetch checks passed");
