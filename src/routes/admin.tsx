import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isSuperAdminEmail } from '@/lib/subdomain'
import { AdminLayout } from '@/admin/AdminLayout'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { LoadFailed } from '@/components/LoadFailed'

export const Route = createFileRoute('/admin')({
  component: AdminGuard,
})

function AdminGuard() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const isSuperAdmin = isSuperAdminEmail(user?.email)

  const propertySubdomain = new URLSearchParams(window.location.search).get('property') ?? ''
  const superAdminManaging = isSuperAdmin && !!propertySubdomain

  const propertyQuery = useOwnerProperty()
  const property = propertyQuery.data

  const manifestSubdomain = isSuperAdmin ? propertySubdomain : (property?.subdomain ?? '')

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
      <div className="min-h-dvh flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return null
  if (isSuperAdmin && !superAdminManaging) return null

  // Every admin page needs the property. If it could not be loaded, say so, instead of letting the
  // pages below fall back to "No bookings yet", ₹0 totals or a grey skeleton that never ends.
  if (propertyQuery.isError && !property) {
    const notFound = (propertyQuery.error as { code?: string } | null)?.code === 'PGRST116'
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {notFound ? (
            <LoadFailed
              title={superAdminManaging ? "That property wasn't found" : 'No property is linked to this account'}
              detail={superAdminManaging ? 'Check the property name in the address.' : "Ask Stayidom support to link your property to this login."}
            />
          ) : (
            <LoadFailed title="Couldn't load your property" onRetry={() => void propertyQuery.refetch()} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      key="admin-content"
      className="animate-in fade-in duration-[var(--duration-lazy)] [--tw-ease:var(--ease-lazy)]"
    >
      <AdminLayout />
    </div>
  )
}
