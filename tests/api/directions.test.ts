import test from "node:test";
import assert from "node:assert/strict";

process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.VITE_SUPABASE_ANON_KEY = "anon";

import { googleDirectionsUrl } from "../../api/_lib/directions";
import { directionsUrl } from "../../src/lib/location";

type Row = { name: string; area?: string | null; location_lat?: number | null; location_lng?: number | null; directions_by_name?: boolean | null };
let rows: Record<string, Row> = {};
let lastUrl = "";
let status = 200;

globalThis.fetch = (async (input: RequestInfo | URL) => {
  lastUrl = String(input);
  const sub = new URL(lastUrl).searchParams.get("subdomain")?.replace("eq.", "") ?? "";
  if (status !== 200) return new Response("boom", { status });
  return new Response(JSON.stringify(rows[sub] ? [rows[sub]] : []), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

const { default: handler } = await import("../../api/directions");
const call = (u: string, host = "x.test") => handler(new Request(u, { headers: { host } }));

test("the server link and the browser link are always the same", () => {
  for (const t of [
    { lat: 10.2167, lng: 77.2, name: "Mist Valley Homestay", area: "Vattavada" },
    { lat: "10.2167", lng: "77.2", name: "Mist Valley Homestay", area: "Vattavada", byName: true },
    { lat: null, lng: null, name: "Mist Valley Homestay", area: null },
    { lat: 10.2167, lng: null, name: "Mist Valley Homestay", area: "Vattavada" },
  ]) {
    assert.equal(googleDirectionsUrl(t), directionsUrl(t));
  }
});

test("redirects to the route to the pin, from wherever the guest is standing", async () => {
  rows = { mistvalley: { name: "Mist Valley Homestay", area: "Vattavada", location_lat: 10.2167, location_lng: 77.2, directions_by_name: false } };
  const res = await call("https://mistvalley.stayidom.in/api/directions", "mistvalley.stayidom.in");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://www.google.com/maps/dir/?api=1&destination=10.2167%2C77.2&travelmode=driving");
  assert.ok(!res.headers.get("location")!.includes("origin="));
  assert.match(res.headers.get("cache-control") ?? "", /s-maxage=300/);
});

test("when the owner says it is listed on Google Maps, the route goes to the listing by name and area", async () => {
  rows = { mistvalley: { name: "Mist Valley Homestay", area: "Vattavada", location_lat: 10.2167, location_lng: 77.2, directions_by_name: true } };
  const res = await call("https://x.test/api/directions?p=mistvalley");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://www.google.com/maps/dir/?api=1&destination=Mist%20Valley%20Homestay%2C%20Vattavada%2C%20Kerala&travelmode=driving");
});

test("a property with only one coordinate still gets a working link (by name)", async () => {
  rows = { mistvalley: { name: "Mist Valley Homestay", area: "Vattavada", location_lat: 10.2167, location_lng: null } };
  const res = await call("https://x.test/api/directions?p=mistvalley");
  assert.equal(res.status, 302);
  assert.ok(res.headers.get("location")!.includes("Mist%20Valley%20Homestay"));
});

test("the subdomain comes from ?p= first, then the host; junk and unknown properties are 404", async () => {
  rows = { mistvalley: { name: "Mist Valley Homestay", location_lat: 1, location_lng: 2 } };
  await call("https://other.stayidom.in/api/directions?p=mistvalley", "other.stayidom.in");
  assert.match(lastUrl, /subdomain=eq\.mistvalley/);
  await call("https://mistvalley.stayidom.in/api/directions", "mistvalley.stayidom.in");
  assert.match(lastUrl, /subdomain=eq\.mistvalley/);
  assert.equal((await call("https://x.test/api/directions?p=nope")).status, 404);
  assert.equal((await call("https://x.test/api/directions?p=" + encodeURIComponent("a&b=c"))).status, 404);
  assert.equal((await call("https://stayidom.in/api/directions", "stayidom.in")).status, 404);
});

test("a database error is a clear 502, never a redirect to somewhere wrong", async () => {
  status = 500;
  const res = await call("https://x.test/api/directions?p=mistvalley");
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("location"), null);
  status = 200;
});
