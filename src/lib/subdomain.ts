/**
 * Detects the current property subdomain from the URL.
 * bleafmudhouse.vattavadastays.com → 'bleafmudhouse'
 * localhost → falls back to VITE_PROPERTY_SUBDOMAIN env var
 */
export function getSubdomain(): string {
  const hostname = window.location.hostname

  // Production: {subdomain}.vattavadastays.com
  if (hostname.endsWith('.vattavadastays.com')) {
    return hostname.split('.')[0]
  }

  // Vercel preview: use ?slug= query param if present
  const params = new URLSearchParams(window.location.search)
  const slug = params.get('slug')
  if (slug) return slug

  // Final fallback to env var
  return import.meta.env.VITE_PROPERTY_SUBDOMAIN ?? 'bleafmudhouse'
}

/**
 * Returns true if the current user is the superadmin.
 * Called after auth is confirmed.
 */
export function isSuperAdminEmail(email: string | undefined): boolean {
  if (!email) return false
  return email === import.meta.env.VITE_SUPERADMIN_EMAIL
}
