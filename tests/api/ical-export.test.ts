// api/ical.ts (the public export feed) against a fake Supabase REST API.
import test from "node:test";
import assert from "node:assert/strict";

process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.VITE_SUPABASE_ANON_KEY = "anon-key";

const ROOM = "11111111-1111-4111-8111-111111111111";
const FEED_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FEED_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) =>
  new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const D = (n: number) => addDays(today, n);

const availability = [
  { date: D(5), note: null }, // our booking
  { date: D(6), note: "Maintenance" }, // manual block
  { date: D(7), note: `ical:${FEED_A}:Booking.com` },
  { date: D(8), note: `ical:${FEED_B}:Airbnb` },
];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
  );
  if (url.host !== "sb.test") return realFetch(input);
  if (url.pathname.endsWith("/rooms"))
    return new Response(JSON.stringify([{ name: "Deluxe", is_active: true }]));
  if (url.pathname.endsWith("/availability")) return new Response(JSON.stringify(availability));
  return new Response("[]", { status: 404 });
}) as typeof fetch;

const { default: handler } = await import("../../api/ical");

const get = async (qs: string) => handler(new Request(`https://stayidom.in/api/ical?${qs}`));
const nightsIn = (ics: string) =>
  [...ics.matchAll(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/g)].map(
    (m) => `${m[1]}-${m[2]}-${m[3]}`,
  );

test("default export: only our own nights — never nights imported from other sites", async () => {
  const res = await get(`room=${ROOM}`);
  assert.equal(res.status, 200);
  // D(5) and D(6) are consecutive, so they merge into ONE event starting D(5).
  assert.deepEqual(nightsIn(await res.text()), [D(5)]);
});

test("per-site export (for=feed): own nights + the OTHER site's nights, not that site's own", async () => {
  const a = nightsIn(await (await get(`room=${ROOM}&for=${FEED_A}`)).text());
  assert.deepEqual(a, [D(5), D(8)]); // D(5..6) merged, + Airbnb's D(8); Booking.com's D(7) left out
  const b = nightsIn(await (await get(`room=${ROOM}&for=${FEED_B}`)).text());
  assert.deepEqual(b, [D(5)]); // D(5..7) merged: own + Booking.com's nights; Airbnb's D(8) left out
});

test("bad ids are rejected", async () => {
  assert.equal((await get(`room=nope`)).status, 400);
  assert.equal((await get(`room=${ROOM}&for=nope`)).status, 400);
});
