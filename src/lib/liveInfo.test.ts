import test from "node:test";
import assert from "node:assert/strict";
import { formatLiveDate, formatLiveTime, formatRange, parseWeather, symbolLabel } from "./liveInfo";

test("date and time are shown in India time whatever the viewer's clock", () => {
  const t = new Date("2026-10-30T10:42:00Z"); // 4:12 pm in India
  assert.equal(formatLiveTime(t), "4:12 pm");
  assert.match(formatLiveDate(t), /Fri/);
  assert.match(formatLiveDate(t), /30/);
  assert.equal(formatLiveTime(new Date("2026-10-30T18:45:00Z")), "12:15 am"); // crosses midnight in India
});

test("weather symbols", () => {
  assert.equal(symbolLabel("clearsky_day").emoji, "☀️");
  assert.equal(symbolLabel("clearsky_night").emoji, "🌙");
  assert.equal(symbolLabel("partlycloudy_day").text, "Partly cloudy");
  assert.equal(symbolLabel("lightrain").text, "Light rain");
  assert.equal(symbolLabel("heavyrain").text, "Heavy rain");
  assert.equal(symbolLabel("rainshowersandthunder_day").text, "Thunderstorm");
  assert.equal(symbolLabel("lightrainshowers_night").text, "Showers");
  assert.equal(symbolLabel("").text, "");
  assert.equal(symbolLabel("somethingnew").text, "");
});

test("range text", () => {
  assert.equal(formatRange(12, 18), "12–18°C");
  assert.equal(formatRange(15, 15), "15°C");
});

test("only a complete, sane answer shows a temperature", () => {
  assert.deepEqual(parseWeather({ available: true, min: 12, max: 18, symbol: "cloudy" }), { min: 12, max: 18, symbol: "cloudy" });
  assert.equal(parseWeather({ available: false }), null);
  assert.equal(parseWeather(null), null);
  assert.equal(parseWeather({ available: true, min: "abc", max: 18 }), null);
  assert.equal(parseWeather({ available: true, min: 20, max: 10 }), null);
  assert.equal(parseWeather({ available: true, min: 5, max: 200 }), null);
});
