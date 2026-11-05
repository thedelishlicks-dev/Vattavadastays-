// The Google Maps link behind the "Directions" short link (api/directions.ts).
// Pure, no I/O. src/lib/location.ts has the same function for the buttons in the browser;
// tests/api/directions.test.ts checks that the two always give the same link.

export interface DirectionsTarget {
  lat?: number | string | null
  lng?: number | string | null
  name?: string | null
  area?: string | null
  /** The owner says the property is listed on Google Maps: find it by name instead of using the pin. */
  byName?: boolean | null
}

function coord(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

export function hasPin(t: DirectionsTarget): boolean {
  const a = coord(t.lat)
  const b = coord(t.lng)
  return a !== null && b !== null && Math.abs(a) <= 90 && Math.abs(b) <= 180
}

/**
 * Google's directions link. No `origin`, so Google starts the route from where the person is standing
 * (it asks for location permission if needed). The destination is the property's pin, or, when the
 * owner has switched it on (or there is no pin), its name and area so Google finds the listing.
 */
export function googleDirectionsUrl(t: DirectionsTarget): string {
  const byName = Boolean(t.byName) || !hasPin(t)
  const destination = byName
    ? [t.name, t.area, 'Kerala'].filter(Boolean).join(', ')
    : `${coord(t.lat)},${coord(t.lng)}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`
}
