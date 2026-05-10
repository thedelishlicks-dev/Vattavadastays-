import { useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BedDouble,
  CalendarDays,
  ClipboardList,
  Tag,
  UtensilsCrossed,
  Sparkles,
  ScrollText,
  Wallet,
  Settings,
  LogOut,
  Menu,
  X,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { supabase } from "@/lib/supabase";

type NavItemDef = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

const NAV: NavItemDef[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/rooms", label: "Rooms", icon: BedDouble },
  { to: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/admin/bookings", label: "Bookings", icon: ClipboardList },
  { to: "/admin/pricing", label: "Pricing", icon: Tag, disabled: true },
  { to: "/admin/meals", label: "Meals", icon: UtensilsCrossed, disabled: true },
  { to: "/admin/amenities", label: "Amenities", icon: Sparkles, disabled: true },
  { to: "/admin/policies", label: "Policies", icon: ScrollText, disabled: true },
  { to: "/admin/payments", label: "Payments", icon: Wallet, disabled: true },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, isLoading, isAuthenticated } = useAuth();
  const { data: property } = useOwnerProperty();

  // While auth state is resolving, show nothing (avoids flash)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in — show login form inline (no redirect loop)
  if (!isAuthenticated) {
    return <LoginForm />;
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  };

  const ownerInitial = user?.email?.[0]?.toUpperCase() ?? "O";
  const ownerEmail = user?.email ?? "";
  const propertyName = property?.name ?? "Bleaf Mud House";

  return (
    <div className="min-h-screen bg-muted/40 flex w-full">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card">
        <div className="h-14 px-5 flex items-center border-b border-border">
          <span className="font-display text-lg font-semibold text-primary">Bleaf Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <NavItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={path === item.to}
              disabled={item.disabled}
            />
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="m-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-card border-b border-border flex items-center px-3 md:px-6 gap-3 sticky top-0 z-20">
          <button
            className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="font-medium text-sm md:text-base truncate">{propertyName}</div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-medium">{ownerEmail}</span>
              <span className="text-[11px] text-muted-foreground">Owner</span>
            </div>
            <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
              {ownerInitial}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>

        {/* Bottom nav (mobile) */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border grid grid-cols-5">
          {NAV.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = path === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={[
                  "flex flex-col items-center justify-center py-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                ].join(" ")}
              >
                <Icon className="h-5 w-5 mb-0.5" />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center py-2 text-[10px] text-muted-foreground"
          >
            <Menu className="h-5 w-5 mb-0.5" />
            More
          </button>
        </nav>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card flex flex-col">
            <div className="h-14 px-5 flex items-center border-b border-border justify-between">
              <span className="font-display text-lg font-semibold text-primary">Bleaf Admin</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 -mr-2 rounded-md hover:bg-muted"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {NAV.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  active={path === item.to}
                  disabled={item.disabled}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
            <button
              onClick={handleLogout}
              className="m-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

// Inline login form — rendered by AdminLayout when not authenticated
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) setError(signInError.message);
      // on success useAuth will update → AdminLayout re-renders with the dashboard
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 md:p-8 shadow-[var(--shadow-soft)]">
        <h1 className="font-display text-2xl font-semibold text-primary">Bleaf Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Owner login</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-primary py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (disabled) {
    return (
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground/60 cursor-not-allowed"
        title="Coming soon"
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">{label}</span>
        <span className="text-[10px] uppercase tracking-wider">Soon</span>
      </div>
    );
  }
  return (
    <Link
      to={to}
      onClick={onClick}
      className={[
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
