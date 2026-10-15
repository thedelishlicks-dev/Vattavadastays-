/**
 * /robots.txt and /sitemap.xml (rewritten here by vercel.json), per host so
 * each property's sitemap and Sitemap: line point at its own domain.
 */
import { buildRobots, buildSitemap } from './_lib/seo'

export const config = { runtime: 'edge' }

export default function handler(req: Request): Response {
  const url = new URL(req.url)
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host).split(':')[0]
  const origin = `https://${host}`
  const kind = url.searchParams.get('kind')

  if (kind === 'sitemap') {
    return new Response(buildSitemap(origin), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    })
  }
  return new Response(buildRobots(origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  })
}
