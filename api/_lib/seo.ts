// api/_lib/seo.ts
//
// ONE place that decides a property's page title, description, share image
// and structured data. Used by:
//   - api/og.ts       → injects it into the HTML *before* it leaves the server,
//                       so WhatsApp / Instagram / Facebook / Telegram link
//                       previews (crawlers that never run JavaScript) show the
//                       property's own name and photo;
//   - SeoTags.tsx     → keeps the same tags up to date after client navigation.
// Pure functions: no I/O. Covered by tests/api/seo.test.ts.

export const DEFAULT_OG_IMAGE =
  "https://vzzfqgqxnodlrvnaxpbw.supabase.co/storage/v1/object/public/hero-images/og-default.jpeg";

export interface SeoProperty {
  name?: string | null;
  description?: string | null;
  hero_image?: string | null;
  logo_url?: string | null;
  area?: string | null;
  owner_phone?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  shared_amenities?: string[] | null;
}

export interface Seo {
  title: string;
  description: string;
  image: string;
  url: string;
  siteName: string;
  keywords: string;
  jsonLd: Record<string, unknown>;
}

/** Amenity entries starting with "__" are internal config, never shown. */
export function publicAmenities(a: string[] | null | undefined): string[] {
  return (a ?? []).filter((x) => typeof x === "string" && !x.startsWith("__"));
}

function trimDescription(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > 80 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, "") + "…";
}

export function buildSeo(p: SeoProperty, baseUrl: string): Seo {
  const name = (p.name ?? "").trim() || "Homestay";
  const area = (p.area ?? "").trim();
  const place = area || "Kerala";
  const description = p.description?.trim()
    ? trimDescription(p.description)
    : `Book your stay at ${name} in ${place} directly with the owner. No commission, no middlemen.`;
  const image = p.hero_image || DEFAULT_OG_IMAGE;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name,
    description: p.description ?? undefined,
    image: p.hero_image ?? undefined,
    url: baseUrl,
    telephone: p.owner_phone ?? undefined,
    address: {
      "@type": "PostalAddress",
      addressLocality: place,
      addressRegion: "Kerala",
      addressCountry: "IN",
    },
    amenityFeature: publicAmenities(p.shared_amenities).map((n) => ({
      "@type": "LocationFeatureSpecification",
      name: n,
      value: true,
    })),
    ...(p.location_lat && p.location_lng
      ? { geo: { "@type": "GeoCoordinates", latitude: p.location_lat, longitude: p.location_lng } }
      : {}),
  };

  return {
    title: `${name} | stayidom.in`,
    description,
    image,
    url: baseUrl,
    siteName: name,
    keywords: publicAmenities(p.shared_amenities).join(", "),
    jsonLd,
  };
}

// ── HTML injection (server side) ────────────────────────────────────────────

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** JSON inside <script>: "<" must not be able to close the tag. */
const safeJson = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Replace the first <meta> whose name/property equals `key` (any attribute order), else add one before </head>. */
function setMeta(html: string, attr: "name" | "property", key: string, content: string): string {
  const tag = `<meta ${attr}="${key}" content="${escAttr(content)}" />`;
  const keyRe = new RegExp(`\\b(?:name|property)\\s*=\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i");
  let replaced = false;
  const out = html.replace(/<meta\b[^>]*>/gi, (m) => {
    if (!replaced && keyRe.test(m)) { replaced = true; return tag; }
    return m;
  });
  return replaced ? out : out.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

export function injectSeo(html: string, seo: Seo): string {
  let out = html;
  if (/<title>[\s\S]*?<\/title>/i.test(out)) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escText(seo.title)}</title>`);
  else out = out.replace(/<\/head>/i, `    <title>${escText(seo.title)}</title>\n  </head>`);

  out = setMeta(out, "name", "description", seo.description);
  if (seo.keywords) out = setMeta(out, "name", "keywords", seo.keywords);
  out = setMeta(out, "property", "og:type", "website");
  out = setMeta(out, "property", "og:site_name", seo.siteName);
  out = setMeta(out, "property", "og:title", seo.title);
  out = setMeta(out, "property", "og:description", seo.description);
  out = setMeta(out, "property", "og:image", seo.image);
  out = setMeta(out, "property", "og:url", seo.url);
  out = setMeta(out, "name", "twitter:card", "summary_large_image");
  out = setMeta(out, "name", "twitter:title", seo.title);
  out = setMeta(out, "name", "twitter:description", seo.description);
  out = setMeta(out, "name", "twitter:image", seo.image);

  const canonical = `<link rel="canonical" href="${escAttr(seo.url)}" />`;
  out = /<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(out)
    ? out.replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i, canonical)
    : out.replace(/<\/head>/i, `    ${canonical}\n  </head>`);

  // Same id the client (SeoTags) updates, so there is never a second block.
  const ld = `<script id="schema-org-ld" type="application/ld+json">${safeJson(seo.jsonLd)}</script>`;
  out = /<script\b[^>]*id\s*=\s*["']schema-org-ld["'][^>]*>[\s\S]*?<\/script>/i.test(out)
    ? out.replace(/<script\b[^>]*id\s*=\s*["']schema-org-ld["'][^>]*>[\s\S]*?<\/script>/i, ld)
    : out.replace(/<\/head>/i, `    ${ld}\n  </head>`);
  return out;
}

// ── robots.txt / sitemap.xml ────────────────────────────────────────────────

export function buildRobots(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /superadmin",
    "Disallow: /login",
    "Disallow: /setup",
    "Disallow: /reset-password",
    "Disallow: /booking-status",
    "Disallow: /test-booking",
    "Disallow: /api/",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

/** The public site is one page per host (rooms, gallery and booking live on it). */
export function buildSitemap(origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${escText(origin)}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`;
}
