import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isSuperAdminEmail } from '@/lib/subdomain'
import { AdminLayout } from '@/admin/AdminLayout'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'

export const Route = createFileRoute('/admin')({
  component: AdminGuard,
})

function AdminGuard() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const isSuperAdmin = isSuperAdminEmail(user?.email)

  const propertySubdomain = new URLSearchParams(window.location.search).get('property') ?? ''
  const superAdminManaging = isSuperAdmin && !!propertySubdomain

  const { data: property } = useOwnerProperty()

  const manifestSubdomain = isSuperAdmin ? propertySubdomain : (property?.subdomain ?? '')

  useEffect(() => {
    // Wait until we know the subdomain — don't run with empty string
    if (!manifestSubdomain) return

    // ── Dynamic manifest ──────────────────────────────────────────────────
    // Makes Android Chrome install prompt show the correct property name + logo
    const href = `/api/manifest?subdomain=${encodeURIComponent(manifestSubdomain)}`
    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'manifest'
      document.head.appendChild(link)
    }
    link.href = href

    // ── iOS app name ──────────────────────────────────────────────────────
    // iOS Safari reads document.title and apple-mobile-web-app-title at the
    // moment the share sheet opens — not from the manifest.
    // Setting both here means the install prompt shows the property name.
    if (property?.name) {
      document.title = property.name

      let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'apple-mobile-web-app-title'
        document.head.appendChild(meta)
      }
      meta.content = property.name
    }

    // ── iOS app icon ──────────────────────────────────────────────────────
    // apple-touch-icon is read at install time before the manifest is fetched.
    // Always set this — if no logo, reset to the generic stayidom icon so a
    // previous session's logo doesn't bleed into a different property's install.
    let icon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'apple-touch-icon'
      document.head.appendChild(icon)
    }
    icon.href = property?.logo_url ?? '/icons/icon-192.png'

  }, [manifestSubdomain, property?.name, property?.logo_url])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      navigate({ to: '/login' })
      return
    }
    if (isSuperAdmin && !propertySubdomain) {
      navigate({ to: '/superadmin' })
      return
    }
  }, [isAuthenticated, isLoading, isSuperAdmin, propertySubdomain, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return null
  if (isSuperAdmin && !superAdminManaging) return null

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  )
}
