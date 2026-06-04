import { createFileRoute, Outlet, redirect, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isSuperAdminEmail } from '@/lib/subdomain'
import { AdminLayout } from '@/admin/AdminLayout'

export const Route = createFileRoute('/admin')({
  component: AdminGuard,
  validateSearch: (search: Record<string, unknown>) => ({
    // Superadmin passes ?property=subdomain to manage a specific property
    property: (search.property as string) ?? '',
  }),
})

function AdminGuard() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const { property: propertySubdomain } = useSearch({ from: '/admin' })

  const isSuperAdmin = isSuperAdminEmail(user?.email)
  // Superadmin is allowed into admin layout only when ?property=subdomain is set
  const superAdminManaging = isSuperAdmin && !!propertySubdomain

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      navigate({ to: '/login' })
      return
    }
    // Superadmin without a ?property= param → go to superadmin dashboard
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

  // Superadmin without property param — redirect handled above
  if (isSuperAdmin && !superAdminManaging) return null

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  )
}
