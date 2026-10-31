// Turn MET Norway's hourly forecast (locationforecast/2.0/compact) into the one thing the guest
// page hero shows: the low and high for the next 24 hours, and a weather symbol for now.

export type ForecastSummary = { min: number; max: number; symbol: string }

type Entry = {
  time?: string
  data?: {
    instant?: { details?: { air_temperature?: number } }
    next_1_hours?: { summary?: { symbol_code?: string } }
    next_6_hours?: { summary?: { symbol_code?: string } }
  }
}

export function summarizeForecast(timeseries: unknown, now: Date): ForecastSummary | null {
  if (!Array.isArray(timeseries)) return null
  const from = now.getTime() - 60 * 60_000 // the current hour started up to an hour ago
  const to = now.getTime() + 24 * 60 * 60_000

  const temps: number[] = []
  let symbol = ''
  for (const e of timeseries as Entry[]) {
    const t = e?.time ? Date.parse(e.time) : NaN
    if (!Number.isFinite(t) || t < from || t > to) continue
    const temp = e.data?.instant?.details?.air_temperature
    if (typeof temp !== 'number' || !Number.isFinite(temp)) continue
    temps.push(temp)
    if (!symbol) symbol = e.data?.next_1_hours?.summary?.symbol_code ?? e.data?.next_6_hours?.summary?.symbol_code ?? ''
  }
  if (temps.length < 3) return null
  return { min: Math.round(Math.min(...temps)), max: Math.round(Math.max(...temps)), symbol }
}
