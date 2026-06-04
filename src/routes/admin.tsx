import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isSuperAdminEmail } from '@/lib/subdomain'
import { AdminLayout } from '@/admin/AdminLayout'

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
