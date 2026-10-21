import test from "node:test";
import assert from "node:assert/strict";
import { fetchAllPages } from "./pagination";
import { roomsFreeForStay } from "./stayAvailability";

// ── paging ──────────────────────────────────────────────────────────────────
const source = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));
const pager = (rows: { i: number }[], failAt?: number) => {
  const calls: [number, number][] = [];
  return {
    calls,
    fetchPage: async (from: number, to: number) => {
      calls.push([from, to]);
      if (failAt !== undefined && calls.length === failAt) return { data: null, error: new Error("boom") };
      return { data: rows.slice(from, to + 1), error: null };
    },
  };
};

test("paging: a list longer than one page is returned in full, in order (the 1,000-row cut-off)", async () => {
  const p = pager(source(2500));
  const rows = await fetchAllPages(p.fetchPage, 1000);
  assert.equal(rows.length, 2500);
  assert.equal(rows[0].i, 0); assert.equal(rows[2499].i, 2499);
  assert.deepEqual(p.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("paging: exactly one full page needs one extra (empty) request; short lists need one", async () => {
  const exact = pager(source(1000));
  assert.equal((await fetchAllPages(exact.fetchPage, 1000)).length, 1000);
  assert.equal(exact.calls.length, 2);
  const short = pager(source(3));
  assert.equal((await fetchAllPages(short.fetchPage, 1000)).length, 3);
  assert.equal(short.calls.length, 1);
  assert.deepEqual(await fetchAllPages(pager([]).fetchPage), []);
});

test("paging: an error on any page throws (no silently partial list); runaway loops stop", async () => {
  await assert.rejects(() => fetchAllPages(pager(source(2500), 2).fetchPage, 1000), /boom/);
  const endless = async (from: number) => ({ data: source(10).map((_, i) => ({ i: from + i })), error: null });
  const rows = await fetchAllPages(endless, 10, 5);
  assert.equal(rows.length, 50);
});

// ── rooms free for the whole stay ───────────────────────────────────────────
const blocked = (m: Record<string, string[]>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, new Set(v)]));

test("a stay can pass the per-night check yet have NO single room free all the way through", () => {
  // Room A is taken the first night, room B the second: every night has a free room, but no room has both.
  const b = blocked({ A: ["2027-03-01"], B: ["2027-03-02"] });
  assert.deepEqual(roomsFreeForStay(["A", "B"], b, { checkIn: "2027-03-01", checkOut: "2027-03-03" }, true), []);
  assert.deepEqual(roomsFreeForStay(["A", "B"], b, { checkIn: "2027-03-01", checkOut: "2027-03-02" }, true), ["B"]);
  assert.deepEqual(roomsFreeForStay(["A", "B"], b, { checkIn: "2027-03-02", checkOut: "2027-03-03" }, true), ["A"]);
});

test("a room with nothing blocked (or no entry at all) is free; checkout day is not a night when turnover is safe", () => {
  const b = blocked({ A: ["2027-03-03"] });
  assert.deepEqual(roomsFreeForStay(["A", "C"], b, { checkIn: "2027-03-01", checkOut: "2027-03-03" }, true), ["A", "C"]);
});

test("without a cleaning gap, the check-out day counts as occupied too", () => {
  const b = blocked({ A: ["2027-03-03"] });
  assert.deepEqual(roomsFreeForStay(["A"], b, { checkIn: "2027-03-01", checkOut: "2027-03-03" }, false), []);
});
