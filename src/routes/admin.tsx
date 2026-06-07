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

  // Read ?property= from the actual current URL — works regardless of which
  // child route (/admin/dashboard, /admin/bookings etc.) we land on
  const propertySubdomain = new URLSearchParams(window.location.search).get('property') ?? ''
  const superAdminManaging = isSuperAdmin && !!propertySubdomain

  // Fetch the property so we have the subdomain for regular owners
  // (superadmin already has propertySubdomain from the URL param)
  const { data: property } = useOwnerProperty()

  // The subdomain to use for the manifest:
  // - superadmin managing a property → from ?property= param
  // - regular owner → from their own property record
  const manifestSubdomain = isSuperAdmin ? propertySubdomain : (property?.subdomain ?? '')

  // Inject dynamic manifest link as soon as we know the subdomain.
  // This is what makes the PWA install show the correct property name + logo.
  useEffect(() => {
    if (!manifestSubdomain) return

    const href = `/api/manifest?subdomain=${encodeURIComponent(manifestSubdomain)}`

    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.rel = 'manifest'
      document.head.appendChild(link)
    }
    link.href = href

    // Apple home screen title — shows under the icon on iOS
    if (property?.name) {
      let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'apple-mobile-web-app-title'
        document.head.appendChild(meta)
      }
      meta.content = property.name
    }

    // Apple touch icon — used immediately on install without waiting for manifest
    if (property?.logo_url) {
      let icon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
      if (!icon) {
        icon = document.createElement('link')
        icon.rel = 'apple-touch-icon'
        document.head.appendChild(icon)
      }
      icon.href = property.logo_url
    }
  }, [manifestSubdomain, property?.name, property?.logo_url])

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      navigate({ to: '/login' })
      return
    }
    // Superadmin without ?property= → go to superadmin dashboard
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
