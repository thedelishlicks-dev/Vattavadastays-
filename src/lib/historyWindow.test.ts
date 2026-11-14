import test from "node:test";
import assert from "node:assert/strict";
import { windowStart, windowStartForMonth, inWindow, sinceLabel, WINDOW_STEP_MONTHS } from "./historyWindow";

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

test("the by-month view loads back far enough to include stays that began the month before", () => {
  const now = new Date(2026, 10, 14); // 14 Nov 2026
  assert.equal(windowStartForMonth(now, 2026, 10), "2026-05-01"); // this month: the default window
  assert.equal(windowStartForMonth(now, 2026, 5), "2026-05-01"); // June needs May 1st: still the default
  assert.equal(windowStartForMonth(now, 2026, 4), "2025-11-01"); // May needs April: next step back
  assert.equal(windowStartForMonth(now, 2026, 2), "2025-11-01"); // March
  assert.equal(windowStartForMonth(now, 2025, 10), "2025-05-01"); // Nov 2025 needs Oct 2025, 13 months: 18 back
  assert.equal(windowStartForMonth(now, 2027, 3), "2026-05-01"); // future months never go earlier than the default
});

test("every month shown is covered from the 1st of the month before", () => {
  const now = new Date(2026, 10, 14);
  for (let back = 0; back < 40; back++) {
    const d = new Date(2026, 10 - back, 1);
    const from = windowStartForMonth(now, d.getFullYear(), d.getMonth());
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
    assert.ok(from <= prevStr, `${back} months back: ${from} should be <= ${prevStr}`);
  }
});
