import test from "node:test";
import assert from "node:assert/strict";
import { windowStart, inWindow, sinceLabel, WINDOW_STEP_MONTHS } from "./historyWindow";

test("the window starts on the 1st of the month N months back", () => {
  assert.equal(windowStart(new Date(2026, 10, 14), 6), "2026-05-01");
  assert.equal(windowStart(new Date(2026, 10, 14), 12), "2025-11-01");
  assert.equal(windowStart(new Date(2026, 10, 14), 6 + WINDOW_STEP_MONTHS), "2025-11-01");
});

test("it crosses year ends and starts on the 1st even when today is the 31st", () => {
  assert.equal(windowStart(new Date(2026, 1, 3), 6), "2025-08-01");
  assert.equal(windowStart(new Date(2026, 0, 31), 1), "2025-12-01");
  assert.equal(windowStart(new Date(2026, 2, 31), 1), "2026-02-01"); // no overflow into March
});

test("a stay is in the window from the first day onward; no window means everything", () => {
  assert.equal(inWindow("2026-05-01", "2026-05-01"), true);
  assert.equal(inWindow("2026-04-30", "2026-05-01"), false);
  assert.equal(inWindow("2026-12-25", "2026-05-01"), true);
  assert.equal(inWindow("2019-01-01", undefined), true);
  assert.equal(inWindow("2026-05-01T00:00:00+00:00", "2026-05-01"), true);
});

test("the since label is a readable date", () => {
  assert.match(sinceLabel("2026-05-01"), /1 May 2026/);
});
