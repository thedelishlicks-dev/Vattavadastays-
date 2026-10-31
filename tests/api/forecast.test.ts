import test from "node:test";
import assert from "node:assert/strict";
import { summarizeForecast } from "../../api/_lib/forecast";

const hour = (iso: string, t: number, sym?: string) => ({ time: iso, data: { instant: { details: { air_temperature: t } }, ...(sym ? { next_1_hours: { summary: { symbol_code: sym } } } : {}) } });
const NOW = new Date("2026-10-30T10:30:00Z");

test("low and high of the next 24 hours, with the symbol for now", () => {
  const ts = [
    hour("2026-10-30T10:00:00Z", 17.4, "partlycloudy_day"),
    hour("2026-10-30T14:00:00Z", 19.2, "rain"),
    hour("2026-10-30T22:00:00Z", 11.6),
    hour("2026-10-31T09:00:00Z", 16.0),
    hour("2026-10-31T12:00:00Z", 25.0), // beyond 24 hours: ignored
  ];
  assert.deepEqual(summarizeForecast(ts, NOW), { min: 12, max: 19, symbol: "partlycloudy_day" });
});

test("hours already past are ignored", () => {
  const ts = [hour("2026-10-30T02:00:00Z", 5, "clearsky_night"), hour("2026-10-30T11:00:00Z", 14), hour("2026-10-30T15:00:00Z", 18), hour("2026-10-30T20:00:00Z", 13)];
  const s = summarizeForecast(ts, NOW);
  assert.equal(s?.min, 13);
  assert.equal(s?.max, 18);
});

test("too little data, or nonsense, gives no summary", () => {
  assert.equal(summarizeForecast([hour("2026-10-30T11:00:00Z", 14)], NOW), null);
  assert.equal(summarizeForecast(null, NOW), null);
  assert.equal(summarizeForecast([{ time: "bad" }, {}, { time: "2026-10-30T11:00:00Z" }], NOW), null);
});
