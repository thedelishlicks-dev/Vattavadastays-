import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.VITE_SUPABASE_ANON_KEY = "anon";
const shell = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

let shellStatus = 200, propRows: unknown[] = [{ name: "Misty Colina", description: "Quiet stay", hero_image: "https://cdn.example/h.jpg", area: "Munnar" }], sbStatus = 200;
const seen: string[] = [];
const real = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  seen.push(u.host + u.pathname);
  if (u.host === "sb.test") return new Response(JSON.stringify(propRows), { status: sbStatus });
  if (u.pathname === "/_shell.html") return new Response(shell, { status: shellStatus });
  return new Response("?", { status: 404 });
}) as typeof fetch;
const { default: handler } = await import("../../api/og");
const get = (host: string) => handler(new Request(`https://${host}/`, { headers: { host } }));

test("property subdomain: per-property tags in the first HTML response", async () => {
  const res = await get("misty.stayidom.in");
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  assert.match(html, /<title>Misty Colina \| stayidom\.in<\/title>/);
  assert.match(html, /og:image" content="https:\/\/cdn\.example\/h\.jpg"/);
  assert.match(html, /<div id="root">/);
});

test("platform hosts (www) get the untouched shell; unknown property too", async () => {
  assert.ok((await (await get("www.stayidom.in")).text()).includes("stayidom.in — Book Direct"));
  propRows = [];
  assert.ok((await (await get("nobody.stayidom.in")).text()).includes("stayidom.in — Book Direct"));
});

test("fail-safe: shell fetch fails, or Supabase is down → app still loads", async () => {
  shellStatus = 500;
  const a = await get("misty.stayidom.in");
  assert.equal(a.status, 307); assert.equal(a.headers.get("location"), "/?_og=skip");
  shellStatus = 200; propRows = [{ name: "X" }]; sbStatus = 500;
  const b = await get("misty.stayidom.in");
  assert.equal(b.status, 200);                                   // shell served with generic tags rather than failing
  assert.ok((await b.text()).includes('<div id="root">'));
});

test("a hostile Host header never reaches the database query", async () => {
  seen.length = 0; sbStatus = 200;
  await get("a.b.evil.com");
  await get("x'y.stayidom.in");
  assert.ok(!seen.some((s) => s.startsWith("sb.test")));
});

test("debug mode reports each step as JSON, with no secrets", async () => {
  shellStatus = 200; propRows = [{ name: "Misty Colina" }]; sbStatus = 200;
  const res = await handler(new Request("https://misty.stayidom.in/?_ogdebug=1", { headers: { host: "misty.stayidom.in" } }));
  const d = await res.json();
  assert.equal(d.result, "ok: property tags injected");
  assert.equal(d.subdomain, "misty"); assert.equal(d.shellStatus, 200); assert.equal(d.propertyFound, true); assert.equal(d.supabaseEnvSet, true);
  assert.ok(!JSON.stringify(d).includes("anon"));
  shellStatus = 500;
  const bad = await (await handler(new Request("https://misty.stayidom.in/?_ogdebug=1", { headers: { host: "misty.stayidom.in" } }))).json();
  assert.equal(bad.result, "bail: could not load _shell.html");
  shellStatus = 200;
});

test.after(() => { globalThis.fetch = real; });
