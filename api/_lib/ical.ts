// api/_lib/ical.ts
//
// iCalendar (RFC 5545) parsing + building for channel sync — pure functions,
// no I/O, no framework. Used by the Edge functions api/ical.ts (export) and
// api/ical-sync.ts (import) and covered by tests/api/ical.test.ts.
//
// Only what availability sync needs: all-day or date-time events become a set
// of occupied NIGHTS (check-in day inclusive … check-out day exclusive).
//
// Folder starts with "_" so Vercel does not expose it as a route.

const DAY = 86400000;

export function ymd(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
export function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}
export function addDays(date: string, n: number): string {
  return ymd(toMs(date) + n * DAY);
}

/** RFC 5545 §3.1: a line break followed by a space/tab continues the previous line. */
export function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

/** "DTSTART;VALUE=DATE:20261224" → { name, params, value } */
function splitLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 1) return null;
  const head = line.slice(0, colon);
  const semi = head.indexOf(";");
  return {
    name: (semi === -1 ? head : head.slice(0, semi)).toUpperCase(),
    params: semi === -1 ? "" : head.slice(semi + 1).toUpperCase(),
    value: line.slice(colon + 1).trim(),
  };
}

/** "20261224" or "20261224T140000Z" → "2026-12-24" (the calendar date as written). */
export function icsDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = `${y}-${mo}-${d}`;
  return Number.isNaN(toMs(date)) ? null : date;
}

export interface ParsedFeed {
  /** Every occupied night (yyyy-MM-dd) inside the window, de-duplicated, sorted. */
  nights: string[];
  /** VEVENTs that contributed at least one night. */
  events: number;
  /** True when the night cap was hit (feed is unusually large). */
  truncated: boolean;
  /** Recurring events can't be expanded here; they are ignored and counted. */
  recurringIgnored: number;
}

export const MAX_NIGHTS = 3000;

/**
 * Parse an .ics feed into occupied nights within [fromDate, toDate].
 * Skips CANCELLED and TRANSPARENT (free) events. An event with no end, or an
 * end on/before its start, counts as one night.
 */
export function parseIcsNights(text: string, fromDate: string, toDate: string): ParsedFeed {
  const lines = unfold(text);
  const nights = new Set<string>();
  let events = 0;
  let recurringIgnored = 0;
  let truncated = false;

  let inEvent = false;
  let start: string | null = null;
  let end: string | null = null;
  let cancelled = false;
  let transparent = false;
  let recurring = false;

  for (const line of lines) {
    const up = line.trim().toUpperCase();
    if (up === "BEGIN:VEVENT") {
      inEvent = true; start = null; end = null; cancelled = false; transparent = false; recurring = false;
      continue;
    }
    if (up === "END:VEVENT") {
      inEvent = false;
      if (recurring) { recurringIgnored += 1; continue; }
      if (cancelled || transparent || !start) continue;
      const last = end && end > start ? end : addDays(start, 1); // exclusive end
      let added = false;
      for (let d = start; d < last; d = addDays(d, 1)) {
        if (d < fromDate) continue;
        if (d > toDate) break;
        if (nights.size >= MAX_NIGHTS) { truncated = true; break; }
        nights.add(d);
        added = true;
      }
      if (added) events += 1;
      continue;
    }
    if (!inEvent) continue;
    const f = splitLine(line);
    if (!f) continue;
    if (f.name === "DTSTART") start = icsDate(f.value);
    else if (f.name === "DTEND") end = icsDate(f.value);
    else if (f.name === "STATUS" && f.value.toUpperCase() === "CANCELLED") cancelled = true;
    else if (f.name === "TRANSP" && f.value.toUpperCase() === "TRANSPARENT") transparent = true;
    else if (f.name === "RRULE") recurring = true;
  }
  return { nights: [...nights].sort(), events, truncated, recurringIgnored };
}

/** Does this text look like an iCalendar feed at all (vs an HTML login page)? */
export function looksLikeIcs(text: string): boolean {
  return /^\s*BEGIN:VCALENDAR/im.test(text.slice(0, 2000));
}

/** Group sorted nights into [start, endExclusive) ranges of consecutive nights. */
export function nightsToRanges(sortedNights: string[]): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  for (const n of sortedNights) {
    const last = out[out.length - 1];
    if (last && last.end === n) last.end = addDays(n, 1);
    else out.push({ start: n, end: addDays(n, 1) });
  }
  return out;
}

/** RFC 5545 §3.1: fold at 75 octets. Our lines are ASCII except the calendar name. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74)); rest = rest.slice(74);
  while (rest.length > 0) { parts.push(" " + rest.slice(0, 73)); rest = rest.slice(73); }
  return parts.join("\r\n");
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/**
 * Build the feed other sites import. Deliberately carries NO guest data:
 * every event is just "Reserved". `stampIso` is injectable for tests.
 */
export function buildIcs(opts: { roomId: string; calName: string; blockedNights: string[]; stampIso?: string }): string {
  const stamp = (opts.stampIso ?? new Date().toISOString()).replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//stayidom.in//Availability//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(opts.calName)}`),
  ];
  for (const r of nightsToRanges([...new Set(opts.blockedNights)].sort())) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${opts.roomId}-${r.start}@stayidom.in`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${r.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${r.end.replace(/-/g, "")}`,
      "SUMMARY:Reserved",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ── Safe-URL check for the import side (SSRF guard) ─────────────────────────

/**
 * Only public https feeds. `webcal://` (what sites hand out) is https underneath.
 * Rejects IP literals, localhost-style names, non-standard ports and credentials.
 */
export function normalizeFeedUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  let raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Paste the calendar link first." };
  if (/^webcal:\/\//i.test(raw)) raw = "https://" + raw.slice("webcal://".length);
  if (raw.length > 2000) return { ok: false, error: "That link is too long." };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, error: "That doesn't look like a link." }; }
  if (u.protocol !== "https:") return { ok: false, error: "The link must start with https:// (or webcal://)." };
  if (u.username || u.password) return { ok: false, error: "Links with a username/password aren't supported." };
  if (u.port && u.port !== "443") return { ok: false, error: "Only standard https links are supported." };
  const host = u.hostname.toLowerCase();
  const blockedName = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || !host.includes(".");
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const ipv6 = host.startsWith("[") || host.includes(":");
  if (blockedName || ipv4 || ipv6) return { ok: false, error: "That address can't be used." };
  return { ok: true, url: u.toString() };
}
