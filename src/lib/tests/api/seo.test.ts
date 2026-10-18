import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeo, injectSeo, buildRobots, buildSitemap, DEFAULT_OG_IMAGE } from "../../api/_lib/seo";

const shell = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const prop = { name: 'Misty "Colina" <Villa>', description: "A quiet stay among vegetable farms and cloud-covered hills. ".repeat(6), hero_image: "https://cdn.example/hero.webp", area: "Munnar", owner_phone: "+919999999999", location_lat: 10.1, location_lng: 77.2, shared_amenities: ["wifi", "__meals_config"] };

test("buildSeo: property facts, no hardcoded Vattavada, internal amenities hidden", () => {
  const s = buildSeo(prop, "https://misty.stayidom.in/");
  assert.equal(s.title, 'Misty "Colina" <Villa> | stayidom.in');
  assert.ok(s.description.length <= 160 && s.description.endsWith("…"));
  assert.equal((s.jsonLd.address as { addressLocality: string }).addressLocality, "Munnar");
  assert.deepEqual((s.jsonLd.amenityFeature as { name: string }[]).map((a) => a.name), ["wifi"]);
  const bare = buildSeo({ name: "Hill Nest" }, "https://x.stayidom.in/");
  assert.match(bare.description, /Hill Nest in Kerala/);
  assert.equal(bare.image, DEFAULT_OG_IMAGE);
  assert.ok(!JSON.stringify(bare).includes("Vattavada"));
});

test("injectSeo: replaces the generic tags, keeps one of each, escapes hostile text", () => {
  const html = injectSeo(shell, buildSeo(prop, "https://misty.stayidom.in/"));
  const count = (re: RegExp) => (html.match(re) ?? []).length;
  assert.equal(count(/<title>/g), 1);
  assert.equal(count(/property="og:title"/g), 1);
  assert.equal(count(/property="og:image"/g), 1);
  assert.equal(count(/name="description"/g), 1);
  assert.equal(count(/rel="canonical"/g), 1);
  assert.equal(count(/id="schema-org-ld"/g), 1);
  assert.match(html, /property="og:image" content="https:\/\/cdn\.example\/hero\.webp"/);
  assert.match(html, /<title>Misty "Colina" &lt;Villa&gt; \| stayidom\.in<\/title>/);
  assert.ok(!html.includes("<Villa>"));                         // no raw hostile markup
  assert.ok(!html.includes("stayidom.in — Book Direct"));       // generic copy gone
  assert.match(html, /<div id="root">/);                         // app shell intact
  assert.match(html, /<script type="module" src="\/src\/main\.tsx">/);
  // JSON-LD can't break out of its script tag
  const evil = injectSeo(shell, buildSeo({ name: "</script><script>alert(1)</script>" }, "https://x.stayidom.in/"));
  assert.ok(!/<script>alert\(1\)/.test(evil));
});

test("injectSeo is idempotent and handles meta tags with reversed attribute order", () => {
  const seo = buildSeo(prop, "https://misty.stayidom.in/");
  const once = injectSeo(shell, seo);
  assert.equal(injectSeo(once, seo), once);
  const reversed = shell.replace('<meta property="og:title" content="stayidom.in — Book Direct" />', '<meta content="old" property="og:title">');
  assert.equal((injectSeo(reversed, seo).match(/og:title/g) ?? []).length, 1);
});

test("robots and sitemap use the requesting host", () => {
  const r = buildRobots("https://misty.stayidom.in");
  assert.match(r, /Disallow: \/admin/);
  assert.match(r, /Sitemap: https:\/\/misty\.stayidom\.in\/sitemap\.xml/);
  assert.match(buildSitemap("https://misty.stayidom.in"), /<loc>https:\/\/misty\.stayidom\.in\/<\/loc>/);
});
