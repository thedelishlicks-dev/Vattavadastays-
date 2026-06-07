/**
 * /api/admin-shell.ts — Vercel Edge Function
 *
 * Serves a modified index.html for admin routes with the property name
 * and logo already baked into the HTML meta tags. This is the only way
 * to make iOS Safari read the correct PWA name at install time — iOS
 * reads apple-mobile-web-app-title once from the raw HTML response and
 * ignores any JavaScript changes made after page load.
 *
 * Usage: admin routes are rewritten to this function via vercel.json
 * Deploy: place at api/admin-shell.ts in repo root
 */

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // Get subdomain from hostname (bleafmudhouse.stayidom.in)
  // or from ?property= param (superadmin managing via preview URL)
  let subdomain: string | null = null

  const hostname = url.hostname
  if (hostname.endsWith('.stayidom.in')) {
    const parts = hostname.split('.')
    if (parts.length >= 3) subdomain = parts[0]
  }

  if (!subdomain) {
    subdomain = url.searchParams.get('property') || url.searchParams.get('slug')
  }

  // Defaults — used when no subdomain or fetch fails
  let propertyName = 'stayidom.in'
  let logoUrl: string | null = null

  if (subdomain) {
    try {
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
      if (res.ok) {
        const rows = await res.json()
        if (rows?.[0]) {
          propertyName = rows[0].name ?? propertyName
          logoUrl = rows[0].logo_url ?? null
        }
      }
    } catch {
      // Fall through to defaults
    }
  }

  const iconHref = logoUrl ?? '/icons/icon-192.png'
  const manifestHref = subdomain
    ? `/api/manifest?subdomain=${encodeURIComponent(subdomain)}`
    : '/manifest.json'

  // Serve a minimal HTML shell — same as index.html but with
  // property name and logo baked in before any JS runs.
  // The Vite bundle (src/main.tsx) loads normally from /assets/.
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(propertyName)}</title>
    <link rel="manifest" href="${manifestHref}" />
    <meta name="theme-color" content="#166534" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="${escapeHtml(propertyName)}" />
    <link rel="apple-touch-icon" href="${escapeHtml(iconHref)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=Noto+Sans+Malayalam:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Don't cache — each owner needs their own fresh shell
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
