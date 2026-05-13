import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router'
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

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      navigate({ to: '/login' })
      return
    }

    // Superadmin goes to superadmin dashboard
    if (isSuperAdminEmail(user?.email)) {
      navigate({ to: '/superadmin' })
      return
    }
  }, [isAuthenticated, isLoading, user, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  // Superadmin — don't render admin layout, redirect handled above
  if (isSuperAdminEmail(user?.email)) return null

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  )
}
