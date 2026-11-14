// src/lib/historyWindow.ts — how far back the Payments and Agents pages load.
//
// Those pages used to download every booking ever made, which gets slower every month. They now
// load stays from the last N months (by check-in date) and the owner can load more. Dates are plain
// "YYYY-MM-DD" strings built from LOCAL date parts (never toISOString, which is UTC and is a day off
// in India before 5:30 am).

export const WINDOW_STEP_MONTHS = 6;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** First day of the month that is `monthsBack` months before the month of `now`, e.g. 14 Nov 2026 and 6 -> "2026-05-01". */
export function windowStart(now: Date, monthsBack: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

/**
 * Where to start loading so a "by month" view of (year, month0) is complete. A stay can begin the
 * month before, so the start is the 1st of the previous month or earlier, rounded back to a whole
 * number of steps (6 months). Rounding means stepping back month by month re-fetches only every
 * 6th step, not on every tap. Never later than the default window.
 */
export function windowStartForMonth(now: Date, year: number, month0: number, step: number = WINDOW_STEP_MONTHS): string {
  const needed = (now.getFullYear() - year) * 12 + (now.getMonth() - month0) + 1;
  return windowStart(now, Math.max(step, Math.ceil(needed / step) * step));
}

/** Is this check-in inside the window? No window (`from` undefined) means everything is. */
export function inWindow(checkIn: string, from: string | undefined): boolean {
  return !from || checkIn.slice(0, 10) >= from;
}

/** "1 May 2026" for the "showing stays since" line. */
export function sinceLabel(from: string): string {
  const [y, m, d] = from.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
