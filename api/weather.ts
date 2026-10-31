/**
 * /api/weather?lat=..&lng=.. : today's temperature range for the guest page hero.
 *
 * Source: MET Norway Locationforecast (api.met.no). Free, no key, and its data (CC BY 4.0 /
 * NLOD) may be used commercially with credit; the guest page footer shows "Data from MET Norway".
 * Their terms ask for: an identifying User-Agent, a backend proxy rather than browsers calling
 * them directly, cached answers, and no repeat requests before the answer expires. This route
 * does all of that: coordinates are rounded to 2 decimals (about 1 km), and one answer is cached
 * for an hour at the edge, so many guests of one property cost one call.
 *
 * It is a forecast for a point, not a measurement: good for "about 12 to 18 degrees", not exact.
 * A failure never breaks the page: the answer is just {available:false}.
 *
 * Optional env: WEATHER_USER_AGENT (default names stayidom.in with its URL as the contact).
 */
import { summarizeForecast } from './_lib/forecast'

export const config = { runtime: 'edge' }

const json = (body: unknown, sMaxAge: number): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=600, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}`,
    },
  })

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const lat = Number(url.searchParams.get('lat'))
  const lng = Number(url.searchParams.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ available: false }, 3600)
  }

  const userAgent = process.env.WEATHER_USER_AGENT || 'stayidom.in/1.0 (+https://stayidom.in)'
  const api = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}`

  try {
    const res = await fetch(api, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(4000) })
    if (!res.ok) return json({ available: false }, 300) // includes 429: back off for a while
    const data = (await res.json()) as { properties?: { timeseries?: unknown } }
    const summary = summarizeForecast(data.properties?.timeseries, new Date())
    if (!summary) return json({ available: false }, 300)
    return json({ available: true, ...summary }, 3600)
  } catch {
    return json({ available: false }, 300)
  }
}
