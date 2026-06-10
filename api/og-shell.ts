/**
 * /api/og-shell.ts — Vercel Edge Function
 *
 * Serves the guest booking page with Open Graph meta tags baked into
 * the raw HTML response. WhatsApp, iMessage, Twitter and other crawlers
 * don't run JavaScript, so OG tags set by React (SeoTags.tsx) are
 * invisible to them. This function patches index.html server-side
 * before sending it so crawlers see the correct tags.
 *
 * Subdomain detection:
 *  1. bleafmudhouse.stayidom.in → subdomain = "bleafmudhouse"
 *  2. ?slug= param (Vercel preview testing)
 *
 * Deploy: place at api/og-shell.ts in repo root
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

  // Fallback for Vercel preview testing (?slug=bleafmudhouse)
  if (!subdomain) {
    subdomain = url.searchParams.get('slug') || null
  }

  // No subdomain — serve plain index.html (root domain, admin, etc.)
  if (!subdomain) {
    return fetchIndex(url.origin)
  }

  // ── Fetch built index.html ────────────────────────────────────────────────
  let html: string
  try {
    const res = await fetch(`${url.origin}/index.html`)
    if (!res.ok) throw new Error('index.html fetch failed')
    html = await res.text()
  } catch {
    return Response.redirect(`${url.origin}/index.html`, 302)
  }

  // ── Fetch property data from Supabase ─────────────────────────────────────
  let name = 'stayidom.in'
  let description = 'Book your stay in Vattavada, Kerala.'
  let image: string | null = null
  let area = 'Vattavada'

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?subdomain=eq.${encodeURIComponent(subdomain)}&select=name,description,hero_image,area,owner_name&limit=1`,
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
      const p = rows?.[0]
      if (p) {
        name = p.name ?? name
        area = p.area ?? area
        description = p.description
          ? p.description.slice(0, 160)
          : `Book your stay at ${name} in ${area}, Kerala. Direct booking — no commission.`
        image = p.hero_image ?? null
      }
    }
  } catch {
    // Fall through with defaults
  }

  const pageUrl = `https://${subdomain}.stayidom.in`
  const imageUrl = image ?? `${url.origin}/og-default.jpg`

  // ── Patch OG tags into index.html ─────────────────────────────────────────
  // Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(name)} | stayidom.in</title>`
  )

  // Insert OG + Twitter meta tags just before </head>
  const ogTags = `
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(name)} | stayidom.in" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="stayidom.in" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(name)} | stayidom.in" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  `

  html = html.replace('</head>', `${ogTags}</head>`)

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cache for 1 hour — property details change rarely
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}

async function fetchIndex(origin: string): Promise<Response> {
  try {
    const res = await fetch(`${origin}/index.html`)
    const html = await res.text()
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch {
    return Response.redirect(`${origin}/index.html`, 302)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
