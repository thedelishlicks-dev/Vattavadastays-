/**
 * /api/directions : a short, clean link that opens Google Maps with the route to the property,
 * starting from wherever the person is standing.
 *
 * Why a redirect: Google's directions link needs an "&", and some phones' SMS apps end the whole
 * message at the first "&" (the rest of the text, including the link, is lost). The message carries
 * this short link instead, which has no "&", no comma and no spaces, and this route answers with the
 * long Google link. It also means the destination can be corrected later without resending anything.
 *
 * Which property: ?p=<subdomain> when given (previews, localhost, the owner's Test link), otherwise the host
 * (mistvalley.stayidom.in).
 * The destination comes from the property's own saved location and the owner's
 * "listed on Google Maps" setting (properties.directions_by_name).
 */
import { googleDirectionsUrl } from './_lib/directions'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const NON_PROPERTY_HOSTS = new Set(['stayidom.in', 'www.stayidom.in', 'localhost'])

function subdomainFromHost(host: string | null): string | null {
  if (!host) return null
  const hostname = host.split(':')[0].toLowerCase()
  if (NON_PROPERTY_HOSTS.has(hostname) || hostname.endsWith('.vercel.app')) return null
  return hostname.endsWith('.stayidom.in') ? hostname.slice(0, -'.stayidom.in'.length) : null
}

const text = (status: number, body: string): Response =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const sub = (url.searchParams.get('p') ?? subdomainFromHost(host) ?? '').toLowerCase()
  if (!/^[a-z0-9-]{1,63}$/.test(sub)) return text(404, 'Property not found')

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/properties?subdomain=eq.${encodeURIComponent(sub)}&select=*&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
    })
    if (!res.ok) return text(502, 'Could not look up the property')
    const rows = (await res.json()) as Array<{
      name?: string; area?: string | null; location_lat?: number | null; location_lng?: number | null; directions_by_name?: boolean | null
    }>
    const p = rows[0]
    if (!p) return text(404, 'Property not found')

    const location = googleDirectionsUrl({ lat: p.location_lat, lng: p.location_lng, name: p.name, area: p.area, byName: p.directions_by_name })
    return new Response(null, {
      status: 302,
      headers: { Location: location, 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch {
    return text(502, 'Could not look up the property')
  }
}
