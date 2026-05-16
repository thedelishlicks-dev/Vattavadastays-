import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { isSuperAdminEmail } from '@/lib/subdomain'
import { Shield, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/superadmin')({
  component: SuperAdminLayout,
})

function SuperAdminLayout() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  if (!isSuperAdminEmail(user?.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground text-sm">
            This area is restricted to platform administrators.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">VattavadaStays</div>
            <div className="text-xs text-muted-foreground">Superadmin</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">{user?.email}</span>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              navigate({ to: '/login' })
            }}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 md:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
