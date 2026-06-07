/**
 * /api/admin-shell.ts — Vercel Edge Function
 *
 * Serves a modified index.html for admin routes with the property name
 * and logo already baked into the HTML meta tags. This is the only way
 * to make iOS Safari read the correct PWA name at install time — iOS
 * reads apple-mobile-web-app-title once from the raw HTML response and
 * ignores any JavaScript changes made after page load.
 *
 * Subdomain detection order:
 *  1. Hostname: bleafmudhouse.stayidom.in  → subdomain = "bleafmudhouse"
 *  2. ?property= param (superadmin Manage button)
 *  3. ?slug= param (Vercel preview testing)
 *
 * Deploy: place at api/admin-shell.ts in repo root (alongside manifest.ts)
 */

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // 1. Try hostname first (production subdomains)
  let subdomain: string | null = null
  const hostname = url.hostname
  if (hostname.endsWith('.stayidom.in')) {
    const parts = hostname.split('.')
    // parts = ['bleafmudhouse', 'stayidom', 'in'] → length >= 3
    if (parts.length >= 3 && parts[0] !== 'www') {
      subdomain = parts[0]
    }
  }

  // 2. Fall back to ?property= (superadmin managing via Manage button)
  //    or ?slug= (Vercel preview testing)
  if (!subdomain) {
    subdomain =
      url.searchParams.get('property') ||
      url.searchParams.get('slug') ||
      null
  }

  // Defaults used when no subdomain or Supabase fetch fails
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
      // Fall through to defaults — page still loads, React sets title later
    }
  }

  const iconHref = logoUrl ?? '/icons/icon-192.png'

  // Manifest link: include ?property= if that's how we detected the subdomain
  // so the manifest edge function also gets the right subdomain
  const manifestSubdomain = subdomain ?? ''
  const manifestHref = manifestSubdomain
    ? `/api/manifest?subdomain=${encodeURIComponent(manifestSubdomain)}`
    : '/manifest.json'

  // Forward all original query params in the page's start URL so TanStack
  // Router and admin.tsx still see ?property=bleafmudhouse after the shell loads
  const forwardedSearch = url.search // e.g. "?property=bleafmudhouse"

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(propertyName)}</title>
    <link rel="manifest" href="${escapeHtml(manifestHref)}" />
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
