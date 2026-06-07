/**
 * /api/manifest.ts — Vercel Edge Function
 *
 * Returns a dynamic PWA manifest scoped to a specific property.
 * Called by SeoTags.tsx as:  /api/manifest?subdomain=bleafmudhouse
 *
 * Works on Vercel free tier — Edge Functions are included.
 *
 * Deploy note: this file must live at api/manifest.ts in the repo root
 * (not inside src/). Vercel auto-detects it.
 */

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const subdomain = searchParams.get('subdomain')?.trim().toLowerCase()

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
