// End-to-end test of api/ical-sync.ts against an in-memory fake of the
// Supabase REST API (PostgREST filters we use) and a fake calendar host.
import test from "node:test";
import assert from "node:assert/strict";

process.env.VITE_SUPABASE_URL = "https://sb.test";
process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.ICAL_CRON_SECRET = "cron-secret-123";

const R1 = "11111111-1111-4111-8111-111111111111", R2 = "22222222-2222-4222-8222-222222222222";
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", F2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", P2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const feedHosts: Record<string, { status?: number; body?: string; headers?: Record<string, string> }> = {};
let ownerPropertyForToken: Record<string, string> = { "owner-jwt": P1 }; // token → property the RLS lets that user touch
const calls: string[] = [];

const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const D = (n: number) => addDays(today, n);

function match(row: Row, key: string, expr: string): boolean {
  const v = row[key] == null ? null : String(row[key]);
  const [op, ...rest] = expr.split(".");
  const arg = rest.join(".");
  switch (op) {
    case "eq": return v === arg;
    case "neq": return v !== arg;
    case "gte": return v !== null && v >= arg;
    case "gt": return v !== null && v > arg;
    case "lte": return v !== null && v <= arg;
    case "like": return v !== null && v.startsWith(decodeURIComponent(arg).replace(/\*$/, ""));
    case "in": return v !== null && arg.replace(/^\(|\)$/g, "").split(",").includes(v);
    default: throw new Error("unsupported op " + op);
  }
}
const RESERVED = new Set(["select", "order", "limit", "on_conflict"]);
function filterRows(table: string, params: URLSearchParams, token: string): Row[] {
  let rows = db[table] ?? [];
  // fake RLS for the owner path: only own-property rows are visible/writable
  const allowed = ownerPropertyForToken[token];
  if (allowed && table === "room_ical_feeds") rows = rows.filter((r) => r.property_id === allowed);
  if (allowed && (table === "availability" || table === "bookings")) rows = rows.filter((r) => (db.rooms ?? []).find((x) => x.id === r.room_id)?.property_id === allowed);
  for (const [k, v] of params) if (!RESERVED.has(k)) rows = rows.filter((r) => match(r, k, v));
  return rows;
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  const method = init?.method ?? "GET";
  const h = (init?.headers ?? {}) as Record<string, string>;
  if (url.host === "sb.test") {
    const table = url.pathname.replace("/rest/v1/", "");
    const token = (h.Authorization ?? "").replace(/^Bearer /i, "");
    calls.push(`${method} ${table}`);
    if (token !== "service-key" && !ownerPropertyForToken[token]) return new Response("{}", { status: 401 });
    const ok = (data: unknown, status = 200) => (status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(data), { status }));
    if (method === "GET") return ok(filterRows(table, url.searchParams, token).map((r) => ({ ...r })));
    if (method === "PATCH") { for (const r of filterRows(table, url.searchParams, token)) Object.assign(r, JSON.parse(String(init!.body))); return ok([], 204); }
    if (method === "DELETE") {
      const doomed = new Set(filterRows(table, url.searchParams, token));
      db[table] = (db[table] ?? []).filter((r) => !doomed.has(r));
      return ok([], 204);
    }
    if (method === "POST") {
      for (const row of JSON.parse(String(init!.body)) as Row[]) {
        const i = (db[table] ?? []).findIndex((r) => r.room_id === row.room_id && r.date === row.date);
        if (i >= 0) db[table][i] = { ...db[table][i], ...row }; else (db[table] ??= []).push(row);
      }
      return ok([], 201);
    }
  }
  const fh = feedHosts[url.host];
  if (fh) return new Response(fh.body ?? "", { status: fh.status ?? 200, headers: fh.headers });
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const { default: handler } = await import("../../api/ical-sync");

const ics = (...events: [string, string][]) =>
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + events.map(([s, e]) => `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${s.replace(/-/g, "")}\r\nDTEND;VALUE=DATE:${e.replace(/-/g, "")}\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\n`).join("") + "END:VCALENDAR\r\n";

function reset() {
  for (const k of Object.keys(db)) delete db[k];
  calls.length = 0;
  db.rooms = [{ id: R1, property_id: P1 }, { id: R2, property_id: P2 }];
  db.room_ical_feeds = [
    { id: F1, property_id: P1, room_id: R1, name: "Booking.com", url: "https://cal.example.com/f1.ics" },
    { id: F2, property_id: P2, room_id: R2, name: "Airbnb", url: "https://cal.example.com/f2.ics" },
  ];
  db.availability = [];
  db.bookings = [];
  for (const k of Object.keys(feedHosts)) delete feedHosts[k];
  feedHosts["cal.example.com"] = { body: ics([D(10), D(13)]) };
}
const post = (body: unknown, token = "owner-jwt") =>
  handler(new Request("https://stayidom.in/api/ical-sync", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const blocked = (room = R1) => (db.availability ?? []).filter((r) => r.room_id === room && r.is_available === false).map((r) => String(r.date)).sort();

test("first sync blocks the channel's nights (check-out day stays free) and records status", async () => {
  reset();
  const res = await post({ room_id: R1 });
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.results[0].ok, true);
  assert.deepEqual(blocked(), [D(10), D(11), D(12)]);
  const feed = db.room_ical_feeds.find((f) => f.id === F1)!;
  assert.equal(feed.last_status, "ok");
  assert.equal(feed.last_nights, 3);
  assert.match(String((db.availability[0] as Row).note), new RegExp(`^ical:${F1}:Booking\\.com$`));
});

test("a cancellation on the channel frees ONLY that feed's nights; bookings and manual blocks survive", async () => {
  reset();
  await post({ room_id: R1 });
  db.availability.push({ room_id: R1, date: D(40), is_available: false, note: "Maintenance" });        // manual block
  db.availability.push({ room_id: R1, date: D(50), is_available: false, note: null });                 // booking mirror
  feedHosts["cal.example.com"] = { body: ics([D(11), D(12)]) };                                          // D(10) cancelled, D(12) shrunk away
  const j = await (await post({ room_id: R1 })).json();
  assert.equal(j.results[0].removed, 2);
  assert.deepEqual(blocked(), [D(11), D(40), D(50)]);
});

test("never overwrites a booking/manual block on the same night, and flags a double-booking", async () => {
  reset();
  db.availability.push({ room_id: R1, date: D(11), is_available: false, note: null });
  db.bookings.push({ room_id: R1, status: "confirmed", check_in: D(11), check_out: D(13) });
  const j = await (await post({ room_id: R1 })).json();
  const r = j.results[0];
  assert.equal(r.conflicts, 2);                       // D(11), D(12) are held by our own booking AND the channel
  assert.match(r.message, /overlap your own bookings/);
  assert.equal(db.availability.find((a) => a.date === D(11))!.note, null);   // our row untouched
});

test("a night the database re-opened (our own booking cancelled) is re-blocked while the channel still holds it", async () => {
  reset();
  await post({ room_id: R1 });
  // free_nights_on_cancel flips is_available to true but leaves our note on the row
  for (const r of db.availability) if (r.date === D(11)) r.is_available = true;
  assert.deepEqual(blocked(), [D(10), D(12)]);
  const j = await (await post({ room_id: R1 })).json();
  assert.equal(j.results[0].added, 1);
  assert.deepEqual(blocked(), [D(10), D(11), D(12)]);
});

test("a broken link, an HTML page or a timeout changes NOTHING and records an error", async () => {
  reset();
  await post({ room_id: R1 });
  const before = blocked();
  for (const bad of [{ status: 500, body: "boom" }, { status: 200, body: "<html>Please log in</html>" }, { status: 404, body: "" }]) {
    feedHosts["cal.example.com"] = bad;
    const j = await (await post({ room_id: R1 })).json();
    assert.equal(j.results[0].ok, false);
    assert.deepEqual(blocked(), before);
  }
  assert.equal(db.room_ical_feeds[0].last_status, "error");
});

test("an empty but valid calendar frees the nights (guest cancelled everything)", async () => {
  reset();
  await post({ room_id: R1 });
  feedHosts["cal.example.com"] = { body: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n" };
  const j = await (await post({ room_id: R1 })).json();
  assert.equal(j.results[0].ok, true);
  assert.deepEqual(blocked(), []);
});

test("redirects are followed but re-checked: a redirect to a private address is refused", async () => {
  reset();
  feedHosts["cal.example.com"] = { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } };
  const j = await (await post({ room_id: R1 })).json();
  assert.equal(j.results[0].ok, false);
  assert.deepEqual(blocked(), []);
  feedHosts["cal.example.com"] = { status: 302, headers: { location: "https://other.example.com/real.ics" } };
  feedHosts["other.example.com"] = { body: ics([D(20), D(21)]) };
  const j2 = await (await post({ room_id: R1 })).json();
  assert.equal(j2.results[0].ok, true);
  assert.deepEqual(blocked(), [D(20)]);
});

test("an owner cannot sync (or see) another property's feeds; bad/absent tokens are refused", async () => {
  reset();
  const j = await (await post({ feed_id: F2 })).json();
  assert.deepEqual(j.results ?? [], []);                          // RLS hides P2's feed from P1's owner (uuid format ok, row not visible)
  assert.equal((await post({ room_id: R1 }, "garbage")).status, 401);
  assert.equal((await handler(new Request("https://stayidom.in/api/ical-sync", { method: "POST", body: "{}" }))).status, 401);
  assert.equal((await post({ all: true })).status, 403);          // owners cannot run "all"
  assert.equal((await handler(new Request("https://stayidom.in/api/ical-sync", { method: "GET" }))).status, 405);
});

test("scheduler (cron secret) syncs every property's feeds", async () => {
  reset();
  feedHosts["cal.example.com"] = { body: ics([D(5), D(7)]) };
  const j = await (await post({ all: true }, "cron-secret-123")).json();
  assert.equal(j.results.length, 2);
  assert.deepEqual(blocked(R1), [D(5), D(6)]);
  assert.deepEqual(blocked(R2), [D(5), D(6)]);
  assert.equal((await post({ all: true }, "wrong-secret")).status, 403);
});

test.after(() => { globalThis.fetch = realFetch; });
