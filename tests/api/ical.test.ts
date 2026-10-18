import test from "node:test";
import assert from "node:assert/strict";
import { parseIcsNights, buildIcs, nightsToRanges, normalizeFeedUrl, looksLikeIcs, unfold } from "../../api/_lib/ical";

const FROM = "2026-10-01", TO = "2028-10-01";
const wrap = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}END:VCALENDAR\r\n`;

test("all-day event: check-in inclusive, check-out exclusive (Airbnb / Booking.com style)", () => {
  const r = parseIcsNights(wrap("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261227\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\n"), FROM, TO);
  assert.deepEqual(r.nights, ["2026-12-24", "2026-12-25", "2026-12-26"]);
  assert.equal(r.events, 1);
});

test("date-time events use the calendar date as written; missing/short end = one night", () => {
  const r = parseIcsNights(wrap(
    "BEGIN:VEVENT\r\nDTSTART:20261110T140000Z\r\nDTEND:20261112T100000Z\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261120\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261122\r\nDTEND;VALUE=DATE:20261122\r\nEND:VEVENT\r\n"), FROM, TO);
  assert.deepEqual(r.nights, ["2026-11-10", "2026-11-11", "2026-11-20", "2026-11-22"]);
});

test("cancelled, transparent and recurring events are ignored (recurring is counted)", () => {
  const r = parseIcsNights(wrap(
    "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261203\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261206\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261207\r\nDTEND;VALUE=DATE:20261208\r\nRRULE:FREQ=WEEKLY\r\nEND:VEVENT\r\n"), FROM, TO);
  assert.deepEqual(r.nights, []);
  assert.equal(r.recurringIgnored, 1);
});

test("past nights and nights beyond the window are dropped", () => {
  const r = parseIcsNights(wrap("BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260928\r\nDTEND;VALUE=DATE:20261003\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20301201\r\nDTEND;VALUE=DATE:20301203\r\nEND:VEVENT\r\n"), FROM, TO);
  assert.deepEqual(r.nights, ["2026-10-01", "2026-10-02"]);
});

test("folded lines, LF-only endings and overlapping events", () => {
  assert.deepEqual(unfold("A:1\n B\nC:2"), ["A:1B", "C:2"]);
  const r = parseIcsNights("BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;VALUE=D\n ATE:20261201\nDTEND;VALUE=DATE:20261203\nEND:VEVENT\nBEGIN:VEVENT\nDTSTART;VALUE=DATE:20261202\nDTEND;VALUE=DATE:20261204\nEND:VEVENT\nEND:VCALENDAR", FROM, TO);
  assert.deepEqual(r.nights, ["2026-12-01", "2026-12-02", "2026-12-03"]);
});

test("looksLikeIcs rejects an HTML page", () => {
  assert.equal(looksLikeIcs("<html><body>Please log in</body></html>"), false);
  assert.equal(looksLikeIcs("BEGIN:VCALENDAR\r\nEND:VCALENDAR"), true);
});

test("nightsToRanges merges consecutive nights across month and year ends", () => {
  assert.deepEqual(nightsToRanges(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-05"]), [
    { start: "2026-12-30", end: "2027-01-02" },
    { start: "2027-01-05", end: "2027-01-06" },
  ]);
});

test("export → import round trip gives the same nights; feed carries no guest data", () => {
  const nights = ["2026-12-24", "2026-12-25", "2026-12-26", "2027-01-10"];
  const ics = buildIcs({ roomId: "room-1", calName: "Deluxe, Valley; View", blockedNights: nights, stampIso: "2026-10-14T10:00:00.000Z" });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTAMP:20261014T100000Z/);
  assert.match(ics, /X-WR-CALNAME:Deluxe\\, Valley\\; View/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.ok(!/ATTENDEE|DESCRIPTION|guest/i.test(ics));
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
  assert.deepEqual(parseIcsNights(ics, FROM, TO).nights, nights);
});

test("empty availability still yields a valid empty calendar", () => {
  const ics = buildIcs({ roomId: "r", calName: "R", blockedNights: [] });
  assert.ok(looksLikeIcs(ics));
  assert.deepEqual(parseIcsNights(ics, FROM, TO).nights, []);
});

test("normalizeFeedUrl: https/webcal only, no private or odd targets", () => {
  assert.deepEqual(normalizeFeedUrl("webcal://www.airbnb.co.in/calendar/ical/123.ics?s=abc"), { ok: true, url: "https://www.airbnb.co.in/calendar/ical/123.ics?s=abc" });
  for (const bad of ["http://example.com/a.ics", "https://localhost/a.ics", "https://127.0.0.1/a.ics", "https://10.0.0.5/a", "https://[::1]/a", "https://intranet/a.ics", "https://user:pw@example.com/a.ics", "https://example.com:8443/a.ics", "https://foo.internal/a", "not a url", ""]) {
    assert.equal(normalizeFeedUrl(bad).ok, false, bad);
  }
});
