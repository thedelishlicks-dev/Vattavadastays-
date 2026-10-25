import test from "node:test";
import assert from "node:assert/strict";
import { datesBetween, blockRows, chunk, findBlockConflicts, partialSaveMessage, MAX_RANGE_DAYS } from "./blockDates";

test("a range includes both ends and works whichever end was tapped first", () => {
  assert.deepEqual(datesBetween("2026-12-30", "2027-01-02"), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.deepEqual(datesBetween("2027-01-02", "2026-12-30"), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.deepEqual(datesBetween("2026-12-25", "2026-12-25"), ["2026-12-25"]);
});

test("a range crosses month and year ends, and leap days, correctly", () => {
  assert.equal(datesBetween("2028-02-27", "2028-03-01").join(), "2028-02-27,2028-02-28,2028-02-29,2028-03-01");
  assert.equal(datesBetween("2026-01-01", "2026-12-31").length, 365);
});

test("a runaway range is capped at a year", () => {
  assert.equal(datesBetween("2026-01-01", "2035-01-01").length, MAX_RANGE_DAYS);
});

test("rows are every room x every date, closed, with the trimmed note (or null)", () => {
  const rows = blockRows(["A", "B"], ["2027-01-01", "2027-01-02"], "  Festival ");
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], { room_id: "A", date: "2027-01-01", is_available: false, note: "Festival" });
  assert.deepEqual(rows.map((r) => `${r.room_id}:${r.date}`), ["A:2027-01-01", "A:2027-01-02", "B:2027-01-01", "B:2027-01-02"]);
  assert.equal(blockRows(["A"], ["2027-01-01"], "   ")[0].note, null);
  assert.deepEqual(blockRows([], ["2027-01-01"], ""), []);
});

test("a whole-property festival: 8 rooms x 10 days = 80 rows, saved in chunks", () => {
  const rows = blockRows(["1", "2", "3", "4", "5", "6", "7", "8"], datesBetween("2026-12-24", "2027-01-02"), "Closed");
  assert.equal(rows.length, 80);
  assert.deepEqual(chunk(Array.from({ length: 1200 }, (_, i) => i), 500).map((c) => c.length), [500, 500, 200]);
  assert.deepEqual(chunk([], 500), []);
});

test("conflicts are reported per room, only for rooms and dates that really have a booking", () => {
  const found = findBlockConflicts(
    ["2027-01-01", "2027-01-02", "2027-01-03"],
    ["A", "B", "C"],
    { A: ["2027-01-02", "2027-02-01"], B: [], C: ["2027-01-03", "2027-01-01"] },
  );
  assert.deepEqual(found, [{ roomId: "A", dates: ["2027-01-02"] }, { roomId: "C", dates: ["2027-01-01", "2027-01-03"] }]);
  assert.deepEqual(findBlockConflicts(["2027-01-01"], ["A"], {}), []);
});

test("partial-save message says how far it got and that retrying is safe", () => {
  const m = partialSaveMessage(500, 1200, "Couldn't reach the server.");
  assert.match(m, /Blocked 500 of 1,200/);
  assert.match(m, /stay blocked/);
});
