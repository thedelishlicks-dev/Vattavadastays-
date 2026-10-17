/**
 * Vercel Edge Function — serves the app shell (index.html) for a property's
 * home page WITH that property's title, description, share image and
 * structured data already in the HTML.
 *
 * Why: the app is a client-rendered SPA, and WhatsApp / Instagram / Facebook /
 * Telegram link-preview crawlers do not run JavaScript. They used to read the
 * generic platform tags in index.html, so every shared property link looked
 * the same. Google also indexes the server-rendered tags immediately.
 *
 * Wired in vercel.json: "/" on every host is rewritten here (non-property hosts get the plain shell).
 * Fail-safe: if anything goes wrong we 307 to "/?_og=skip", which the rewrite
 * deliberately does not match, so visitors always get the normal app.
 */
import { buildSeo, injectSeo } from './_lib/seo'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!

const NON_PROPERTY_HOSTS = new Set(['stayidom.in', 'www.stayidom.in', 'localhost'])

function subdomainFromHost(host: string | null): string | null {
  if (!host) return null
  const hostname = host.split(':')[0].toLowerCase()
  if (NON_PROPERTY_HOSTS.has(hostname) || hostname.endsWith('.vercel.app')) return null
  if (hostname.endsWith('.stayidom.in')) {
    const sub = hostname.slice(0, -'.stayidom.in'.length)
    return /^[a-z0-9-]+$/.test(sub) ? sub : null
  }
  return null
}

const bail = (): Response => new Response(null, { status: 307, headers: { Location: '/?_og=skip', 'Cache-Control': 'no-store' } })

/**
 * Does the actual work and records what happened in `diag`.
 * Open /?_ogdebug=1 on any host to see `diag` as JSON instead of the page
 * (booleans, statuses and the outcome only — never keys or URLs from env).
 */
async function run(req: Request, diag: Record<string, unknown>): Promise<Response> {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  diag.host = host
  if (!host) { diag.result = 'bail: no host header'; return bail() }
  const origin = `https://${host.split(':')[0]}`

  // The static app shell. The build renames dist/index.html to _shell.html (scripts/post-build.mjs)
  // so that "/" is not answered from a real file before this function can run.
  const shellRes = await fetch(`${origin}/_shell.html`, { headers: { Accept: 'text/html' } })
  diag.shellStatus = shellRes.status
  if (!shellRes.ok) { diag.result = 'bail: could not load _shell.html'; return bail() }
  let html = await shellRes.text()
  diag.shellHasRoot = html.includes('<div id="root">')
  if (!diag.shellHasRoot) { diag.result = 'bail: shell has no root div'; return bail() }

  const sub = subdomainFromHost(host)
  diag.subdomain = sub
  diag.supabaseEnvSet = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
  diag.injected = false
  if (sub) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/properties?subdomain=eq.${encodeURIComponent(sub)}` +
        `&select=name,description,hero_image,logo_url,area,owner_phone,location_lat,location_lng,shared_amenities&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' } },
    )
    diag.propertyStatus = res.status
    if (res.ok) {
      const property = (await res.json())?.[0]
      diag.propertyFound = Boolean(property)
      if (property) {
        html = injectSeo(html, buildSeo(property, `${origin}/`))
        diag.injected = true
        diag.title = String(property.name ?? '')
      }
    }
  }
  diag.result = diag.injected ? 'ok: property tags injected' : 'ok: served plain shell'

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Browsers always revalidate (new deploys must never serve a stale shell);
      // Vercel's CDN keeps it for 5 min and refreshes in the background.
      'Cache-Control': 'public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=3600',
    },
  })
}

export default async function handler(req: Request): Promise<Response> {
  const debug = new URL(req.url).searchParams.get('_ogdebug') === '1'
  const diag: Record<string, unknown> = { fn: 'api/og' }
  const asJson = () => new Response(JSON.stringify(diag, null, 2), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  try {
    const res = await run(req, diag)
    return debug ? asJson() : res
  } catch (e) {
    diag.result = 'error'
    diag.error = e instanceof Error ? e.message : String(e)
    return debug ? asJson() : bail()
  }
}
