 /**
 * /api/manifest.ts — Vercel Edge Function
 *
 * Returns a dynamic PWA manifest scoped to a specific property.
 *
 * Primary lookup: derives the subdomain from the request's Host header
 * (e.g. originsoil.stayidom.in -> "originsoil"). This means index.html
 * can point a static <link rel="manifest" href="/api/manifest"> tag at
 * this endpoint on the VERY FIRST page load, with no JS-driven swap
 * needed after mount — avoiding the installability race condition where
 * Chrome/Safari evaluate the PWA manifest before SeoTags.tsx has had a
 * chance to fetch the property and patch the <link> tag's href.
 *
 * Fallback lookup: still accepts ?subdomain=originsoil for backward
 * compatibility with SeoTags.tsx's existing runtime swap, and for local
 * dev / preview URLs where the Host header isn't a real property subdomain.
 *
 * Works on Vercel free tier — Edge Functions are included.
 *
 * Deploy note: this file must live at api/manifest.ts in the repo root
 * (not inside src/). Vercel auto-detects it.
 */
export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

// Hostnames that are never a property subdomain — root domain, previews, localhost.
const NON_PROPERTY_HOSTS = new Set(['stayidom.in', 'www.stayidom.in', 'localhost'])

function deriveSubdomainFromHost(host: string | null): string | null {
  if (!host) return null
  // Strip port if present (e.g. localhost:5173)
  const hostname = host.split(':')[0].toLowerCase()

  if (NON_PROPERTY_HOSTS.has(hostname)) return null
  if (hostname.endsWith('.vercel.app')) return null // preview deployments

  if (hostname.endsWith('.stayidom.in')) {
    const sub = hostname.slice(0, -'.stayidom.in'.length)
    return sub || null
  }

  return null
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const queryParamSubdomain = searchParams.get('subdomain')?.trim().toLowerCase()
  const hostSubdomain = deriveSubdomainFromHost(req.headers.get('host'))

  // Host header takes priority — it's available on the very first request,
  // before any client-side JS has run. Query param is a fallback only.
  const subdomain = hostSubdomain || queryParamSubdomain || null

  // --- fallback manifest used when no subdomain or property not found ---
  const fallback = {
    name: 'stayidom.in',
    short_name: 'stayidom',
    description: 'Manage your property bookings',
    start_url: '/admin/dashboard',
    scope: '/admin',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fafaf9',
    theme_color: '#166534',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }

  if (!subdomain) {
    return jsonResponse(fallback)
  }

  try {
    // Query Supabase REST API directly — no SDK needed in edge runtime
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?subdomain=eq.${encodeURIComponent(subdomain)}&select=name,logo_url&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
        },
      }
    )

    if (!res.ok) return jsonResponse(fallback)

    const rows = await res.json()
    const property = rows?.[0]
    if (!property) return jsonResponse(fallback)

    const shortName = property.name
      .split(' ')
      .slice(0, 2)
      .join(' ')

    // Build icons — use property logo if available, else generic icons
    const icons = property.logo_url
      ? [
          // The logo itself at both sizes — browser will scale it
          {
            src: property.logo_url,
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'any',
          },
          {
            src: property.logo_url,
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any',
          },
          // Keep the maskable generic icon so Android adaptive icons work
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        ]
      : fallback.icons

    const manifest = {
      name: property.name,
      short_name: shortName,
      description: `Manage bookings for ${property.name}`,
      start_url: '/admin/dashboard',
      scope: '/admin',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#fafaf9',
      theme_color: '#166534',
      icons,
    }

    return jsonResponse(manifest)
  } catch {
    return jsonResponse(fallback)
  }
}

function jsonResponse(data: object): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Cache for 1 hour — logo changes are rare, fast enough to propagate
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
