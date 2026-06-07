/**
 * /api/admin-shell.ts — Vercel Edge Function
 *
 * Fetches the built index.html from the same origin, then patches the
 * meta tags with property-specific name and logo before serving it.
 *
 * This approach is correct because:
 * - The built asset paths (/assets/index-abc123.js etc.) are preserved
 * - iOS Safari reads the patched meta tags from the raw HTML response
 * - The Vite bundle loads and boots React normally
 *
 * Subdomain detection order:
 *  1. Hostname: bleafmudhouse.stayidom.in
 *  2. ?property= param (superadmin Manage button)
 *  3. ?slug= param (Vercel preview testing)
 */

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // ── Detect subdomain ──────────────────────────────────────────────────────
  let subdomain: string | null = null

  const hostname = url.hostname
  if (hostname.endsWith('.stayidom.in')) {
    const parts = hostname.split('.')
    if (parts.length >= 3 && parts[0] !== 'www') {
      subdomain = parts[0]
    }
  }

  if (!subdomain) {
    subdomain =
      url.searchParams.get('property') ||
      url.searchParams.get('slug') ||
      null
  }

  // ── Fetch built index.html from own origin ────────────────────────────────
  // This preserves the correct Vite-generated asset script paths.
  const indexUrl = `${url.origin}/index.html`
  let html: string

  try {
    const indexRes = await fetch(indexUrl)
    if (!indexRes.ok) throw new Error(`index.html fetch failed: ${indexRes.status}`)
    html = await indexRes.text()
  } catch {
    // If we can't fetch index.html, fall through to a plain redirect
    // so the app still loads (without the patched meta tags)
    return Response.redirect(`${url.origin}/index.html`, 302)
  }

  // ── Fetch property branding from Supabase ─────────────────────────────────
  let propertyName: string | null = null
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
          propertyName = rows[0].name ?? null
          logoUrl = rows[0].logo_url ?? null
        }
      }
    } catch {
      // Fall through — unpatched index.html still loads the app correctly
    }
  }

  // ── Patch meta tags in the HTML ───────────────────────────────────────────
  // Only patch what we have — leave the rest of index.html untouched
  if (propertyName) {
    // <title>
    html = html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${escapeHtml(propertyName)}</title>`
    )

    // apple-mobile-web-app-title content=""
    html = html.replace(
      /(<meta\s+name="apple-mobile-web-app-title"\s+content=")[^"]*(")/,
      `$1${escapeHtml(propertyName)}$2`
    )
  }

  if (logoUrl) {
    // apple-touch-icon href
    html = html.replace(
      /(<link\s+rel="apple-touch-icon"\s+href=")[^"]*(")/,
      `$1${escapeHtml(logoUrl)}$2`
    )
  }

  // manifest link — point to dynamic manifest for this subdomain
  if (subdomain) {
    const manifestHref = `/api/manifest?subdomain=${encodeURIComponent(subdomain)}`
    html = html.replace(
      /(<link\s+rel="manifest"\s+href=")[^"]*(")/,
      `$1${escapeHtml(manifestHref)}$2`
    )
  }

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
