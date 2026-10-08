 // Run: npx tsx scripts/adminWindow.check.ts
//
// Proves that downloading only a window of bookings (Calendar: the viewed month;
// Dashboard: from last month onward) shows EXACTLY what downloading the whole
// history would — using random bookings — and that pagination returns every row.

import { buildCalendarIndex, stateOf, summarizeDate, nightsOf } from "../src/lib/calendarState";
import { fetchAllRows, type Page } from "../src/lib/paginate";

let failed = 0, passed = 0;
function ok(name: string, cond: boolean, detail = "") {
  cond ? passed++ : failed++;
  if (!cond || process.env.VERBOSE) console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + detail}`);
}

// ── deterministic random ────────────────────────────────────────────────────
let seed = 20261008;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

const ROOMS = ["A", "B", "C"].map((id) => ({ id, name: "Room " + id }));
const STATUS = ["pending", "confirmed", "confirmed", "confirmed", "completed", "cancelled"];

type B = { id: string; room_id: string; check_in: string; check_out: string; status: string; guest_name: string; group_id?: string; total_amount: number };
const bookings: B[] = [];
for (let i = 0; i < 600; i++) {
  const ci = addDays("2025-10-01", Math.floor(rnd() * 500)); // Oct 2025 … Feb 2027
  bookings.push({ id: "b" + i, room_id: pick(ROOMS).id, check_in: ci, check_out: addDays(ci, 1 + Math.floor(rnd() * 12)), status: pick(STATUS), guest_name: "Guest " + i, total_amount: 1000 + Math.floor(rnd() * 9000) });
}
// availability: nights of non-cancelled bookings + a few manual blocks
const availSet = new Set<string>();
for (const b of bookings) if (b.status !== "cancelled") for (const n of nightsOf(b.check_in, b.check_out)) availSet.add(`${b.room_id}|${n}`);
for (let i = 0; i < 40; i++) availSet.add(`${pick(ROOMS).id}|${addDays("2025-10-01", Math.floor(rnd() * 500))}`);
const availAll = [...availSet].map((k) => { const [room_id, date] = k.split("|"); return { room_id, date }; });

// ── 1. Calendar: window == full history, for every room/day of every month ──
let cells = 0;
for (let y = 2025; y <= 2027; y++) for (let m = 1; m <= 12; m++) {
  const start = `${y}-${pad(m)}-01`;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${pad(m)}-${pad(days)}`;
  const windowed = bookings.filter((b) => b.check_in <= end && b.check_out >= start); // the hook's filter
  const availMonth = availAll.filter((a) => a.date >= start && a.date <= end);        // the page's own query
  const full = buildCalendarIndex(bookings, availMonth);
  const win = buildCalendarIndex(windowed, availMonth);
  let same = true, detail = "";
  for (let d = 1; d <= days && same; d++) {
    const date = `${y}-${pad(m)}-${pad(d)}`;
    for (const r of ROOMS) {
      cells++;
      const a = JSON.stringify(stateOf(full, r.id, date)), b = JSON.stringify(stateOf(win, r.id, date));
      if (a !== b) { same = false; detail = `${date} ${r.id}: full=${a} window=${b}`; break; }
    }
    if (same && JSON.stringify(summarizeDate(full, ROOMS, date)) !== JSON.stringify(summarizeDate(win, ROOMS, date))) { same = false; detail = `${date}: summary differs`; }
  }
  ok(`calendar ${y}-${pad(m)}: windowed == full history`, same, detail);
}
console.log(`  (compared ${cells} room-days; ${bookings.length} bookings; window sizes ~${Math.round(bookings.length / 20)} vs ${bookings.length})`);

// Boundary cases written out explicitly
const edge = (name: string, ci: string, co: string, month: string, want: boolean) => {
  const start = month + "-01", end = month + "-" + pad(new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate());
  ok(`edge: ${name}`, (ci <= end && co >= start) === want);
};
edge("stay straddling month start is included", "2026-10-29", "2026-11-03", "2026-11", true);
edge("guest checking out on the 1st is included (shows check-out)", "2026-10-30", "2026-11-01", "2026-11", true);
edge("stay ending Oct 31 (checks out the 31st) is NOT in November", "2026-10-28", "2026-10-31", "2026-11", false);
edge("stay starting on the last day is included", "2026-11-30", "2026-12-02", "2026-11", true);
edge("stay starting on the 1st of next month is NOT included", "2026-12-01", "2026-12-03", "2026-11", false);

// ── 2. Dashboard: window from last month onward gives identical figures ─────
function dashboard(bks: B[], groups: { id: string; check_in: string; status: string; total_amount: number }[], today: string) {
  const thisMonth = today.slice(0, 7);
  const groupIds = new Set<string>(); // ids of rooms belonging to groups
  const standalone = bks.filter((b) => !groupIds.has(b.id) && !b.group_id);
  const rev = (x: { check_in: string; status: string; total_amount: number }) => x.check_in.slice(0, 7) === thisMonth && (x.status === "confirmed" || x.status === "completed") ? x.total_amount : 0;
  return {
    upcoming: standalone.filter((b) => b.check_in >= today && b.status !== "cancelled").length + groups.filter((g) => g.check_in >= today && g.status !== "cancelled").length,
    revenue: standalone.reduce((s, b) => s + rev(b), 0) + groups.reduce((s, g) => s + rev(g), 0),
    pendingRows: [...standalone.filter((b) => b.status === "pending" && b.check_in >= today).map((b) => b.id), ...groups.filter((g) => g.status === "pending" && g.check_in >= today).map((g) => g.id)].sort(),
    checkinsToday: [...standalone.filter((b) => b.status === "confirmed" && b.check_in === today).map((b) => b.id), ...groups.filter((g) => g.status === "confirmed" && g.check_in === today).map((g) => g.id)].sort(),
  };
}
const groups = Array.from({ length: 80 }, (_, i) => { const ci = addDays("2025-10-01", Math.floor(rnd() * 500)); return { id: "g" + i, check_in: ci, status: pick(STATUS), total_amount: 5000 + Math.floor(rnd() * 20000) }; });
// some bookings are the rooms of groups (carry group_id)
bookings.filter((_, i) => i % 9 === 0).forEach((b, i) => { b.group_id = "g" + (i % 80); });

for (const today of ["2026-01-15", "2026-02-01", "2026-03-31", "2026-06-30", "2026-10-08", "2026-12-31", "2027-01-01"]) {
  const d = new Date(today + "T00:00:00Z");
  const from = ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))); // first of previous month
  const full = dashboard(bookings, groups, today);
  const win = dashboard(bookings.filter((b) => b.check_in >= from), groups.filter((g) => g.check_in >= from), today);
  ok(`dashboard on ${today}: windowed figures == full history`, JSON.stringify(full) === JSON.stringify(win), `${JSON.stringify(full)} vs ${JSON.stringify(win)}`);
}

// ── 3. Pagination ───────────────────────────────────────────────────────────
function fakeServer(total: number, serverCap: number) {
  const data = Array.from({ length: total }, (_, i) => i);
  let calls = 0;
  const fetchPage = async (from: number, to: number): Promise<Page<number>> => {
    calls++;
    const want = data.slice(from, to + 1);
    return { data: want.slice(0, serverCap), error: null, count: total }; // server truncates to its own cap
  };
  return { fetchPage, calls: () => calls, data };
}
for (const [total, cap, size, label] of [[0, 1000, 1000, "empty"], [37, 1000, 1000, "small"], [1000, 1000, 1000, "exactly one page"], [1001, 1000, 1000, "one over"], [2500, 1000, 1000, "2.5 pages"], [1200, 500, 1000, "server cap lower than page size"]] as const) {
  const s = fakeServer(total, cap);
  const got = await fetchAllRows(s.fetchPage, size);
  ok(`pagination: ${label} (${total} rows) returns all rows, in order, no duplicates`, got.length === total && got.every((v, i) => v === i), `got ${got.length}`);
  if (total <= 1000 && cap >= total) ok(`pagination: ${label} takes exactly ONE request`, s.calls() === 1 || total === 0, `calls=${s.calls()}`);
}
let threw = false;
try { await fetchAllRows(async () => ({ data: null, error: new Error("boom"), count: null })); } catch { threw = true; }
ok("pagination: errors are thrown, not swallowed", threw);
// no count available → falls back to short-page detection and still terminates
const noCount = Array.from({ length: 2500 }, (_, i) => i);
const got2 = await fetchAllRows<number>(async (f, t) => ({ data: noCount.slice(f, t + 1), error: null, count: null }), 1000);
ok("pagination: works without a count", got2.length === 2500);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
