/**
 * Tests for guestHistory.ts: the query shape behind the Monthly report's repeat-guest numbers.
 *
 *   npx tsx --test src/lib/guestHistory.test.ts
 *
 * A recording fake stands in for Supabase, so these tests prove HOW the data is requested (one batched query per
 * table, never one per booking; scoped; bounded to the end of the month) without a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUEST_ID_CHUNK,
  HISTORY_COLUMNS,
  HISTORY_GROUP_COLUMNS,
  chunk,
  fetchGuestHistoryRows,
  type GuestHistoryRow,
  type HistoryClient,
  type HistoryQuery,
} from "./guestHistory";

interface Call {
  table: string;
  columns?: string;
  eq: [string, string][];
  in: [string, readonly string[]][];
  lt: [string, string][];
  range?: [number, number];
}

function fakeClient(rowsFor: (call: Call) => GuestHistoryRow[]) {
  const calls: Call[] = [];
  const client: HistoryClient = {
    from(table) {
      const call: Call = { table, eq: [], in: [], lt: [] };
      const q: HistoryQuery = {
        select(columns) {
          call.columns = columns;
          return q;
        },
        eq(c, v) {
          call.eq.push([c, v]);
          return q;
        },
        in(c, v) {
          call.in.push([c, v]);
          return q;
        },
        lt(c, v) {
          call.lt.push([c, v]);
          return q;
        },
        order() {
          return q;
        },
        range(from, to) {
          call.range = [from, to];
          calls.push(call);
          const data = rowsFor(call);
          return Promise.resolve({ data, error: null, count: data.length });
        },
      };
      return q;
    },
  };
  return { client, calls };
}

const row = (id: string, guest: string): GuestHistoryRow => ({
  id,
  property_id: "P1",
  guest_id: guest,
  status: "confirmed",
  check_in: "2026-09-05",
  check_out: "2026-09-07",
  total_amount: 1000,
});

test("no guests, no request: a month with nobody identified makes no network call at all", async () => {
  const { client, calls } = fakeClient(() => []);
  assert.deepEqual(await fetchGuestHistoryRows(client, "bookings", "P1", [], "2026-11-01"), []);
  assert.equal(calls.length, 0);
});

test("all of a month's guests are asked for in ONE query per table (not one per guest or booking)", async () => {
  const ids = Array.from({ length: 30 }, (_, i) => `g${i}`);
  const { client, calls } = fakeClient(() => [row("b1", "g1")]);
  const out = await fetchGuestHistoryRows(client, "bookings", "P1", ids, "2026-11-01");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].in, [["guest_id", ids]]);
  assert.equal(out.length, 1);
});

test("the query is scoped to the property, bounded to the END of the month, and selects only needed columns", async () => {
  const { client, calls } = fakeClient(() => []);
  await fetchGuestHistoryRows(client, "bookings", "P1", ["g1"], "2026-11-01");
  await fetchGuestHistoryRows(client, "booking_groups", "P1", ["g1"], "2026-11-01");
  for (const c of calls) {
    assert.deepEqual(c.eq, [["property_id", "P1"]]);
    assert.deepEqual(c.lt, [["check_in", "2026-11-01"]]); // a later stay can never change a past month
  }
  assert.equal(calls[0].table, "bookings");
  assert.equal(calls[0].columns, HISTORY_COLUMNS);
  assert.equal(calls[1].table, "booking_groups");
  assert.equal(calls[1].columns, HISTORY_GROUP_COLUMNS);
  assert.doesNotMatch(HISTORY_COLUMNS, /\*|guest_name|guest_phone|email/); // no personal data downloaded
});

test("a long guest list is split into chunks (short URLs), still one request per chunk and no duplicates", async () => {
  const ids = Array.from({ length: GUEST_ID_CHUNK * 2 + 1 }, (_, i) => `g${i}`);
  const { client, calls } = fakeClient((c) => c.in[0][1].map((g) => row(`b-${g}`, g)));
  const out = await fetchGuestHistoryRows(client, "bookings", "P1", ids, "2026-11-01");
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c.in[0][1].length),
    [GUEST_ID_CHUNK, GUEST_ID_CHUNK, 1],
  );
  assert.equal(out.length, ids.length);
  assert.equal(new Set(out.map((r) => r.id)).size, ids.length);
});

test("chunk: sizes and edge cases", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
});

test("no property id, no request (never an unscoped query)", async () => {
  const { client, calls } = fakeClient(() => []);
  assert.deepEqual(await fetchGuestHistoryRows(client, "bookings", "", ["g1"], "2026-11-01"), []);
  assert.equal(calls.length, 0);
});
