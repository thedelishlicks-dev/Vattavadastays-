// src/lib/liveInfo.ts
//
// The live date, time and temperature shown on the guest page hero. Pure helpers.
// Time is shown in the property's own time zone (every property is in India), so a guest
// planning from abroad sees the time at the stay, not on their own clock.

export const PROPERTY_TIME_ZONE = "Asia/Kolkata";

export function formatLiveDate(now: Date): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: PROPERTY_TIME_ZONE }).format(now);
}

export function formatLiveTime(now: Date): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: PROPERTY_TIME_ZONE })
    .format(now)
    .replace(/\s?([ap])m$/i, (_, m: string) => ` ${m.toLowerCase()}m`);
}

/** MET Norway symbol codes ("partlycloudy_day", "heavyrain", ...) -> one emoji and a short word. */
export function symbolLabel(symbol: string): { emoji: string; text: string } {
  const night = /_night$/.test(symbol);
  const s = symbol.replace(/_(day|night|polartwilight)$/, "");
  if (!s) return { emoji: "🌡️", text: "" };
  if (s.includes("thunder")) return { emoji: "⛈️", text: "Thunderstorm" };
  if (s.includes("snow") || s.includes("sleet")) return { emoji: "🌨️", text: "Wintry" };
  if (s === "clearsky") return { emoji: night ? "🌙" : "☀️", text: "Clear" };
  if (s === "fair") return { emoji: night ? "🌙" : "🌤️", text: "Mostly clear" };
  if (s === "partlycloudy") return { emoji: "⛅", text: "Partly cloudy" };
  if (s === "cloudy") return { emoji: "☁️", text: "Cloudy" };
  if (s === "fog") return { emoji: "🌫️", text: "Misty" };
  if (s.includes("heavy") && s.includes("rain")) return { emoji: "🌧️", text: "Heavy rain" };
  if (s.includes("showers")) return { emoji: "🌦️", text: "Showers" };
  if (s.includes("light") && s.includes("rain")) return { emoji: "🌦️", text: "Light rain" };
  if (s.includes("rain")) return { emoji: "🌧️", text: "Rain" };
  return { emoji: "🌡️", text: "" };
}

/** The temperature range as the hero shows it: "12–18°C", or "15°C" when low and high match. */
export function formatRange(min: number, max: number): string {
  return min === max ? `${min}°C` : `${min}–${max}°C`;
}

/** Parse the weather proxy's answer; anything unexpected means "show no temperature". */
export function parseWeather(raw: unknown): { min: number; max: number; symbol: string } | null {
  const r = raw as { available?: unknown; min?: unknown; max?: unknown; symbol?: unknown } | null;
  if (!r || r.available !== true) return null;
  const min = Number(r.min);
  const max = Number(r.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max || min < -60 || max > 60) return null;
  return { min, max, symbol: typeof r.symbol === "string" ? r.symbol : "" };
}
