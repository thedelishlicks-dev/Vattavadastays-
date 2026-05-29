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
  { to: "/admin/pricing", label: "Pricing", icon: Tag },
  { to: "/admin/meals", label: "Meals", icon: UtensilsCrossed },
  { to: "/admin/amenities", label: "Amenities", icon: Sparkles },
  { to: "/admin/policies", label: "Policies", icon: ScrollText },
  { to: "/admin/payments", label: "Payments", icon: Wallet },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: property } = useOwnerProperty();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const ownerInitial = user?.email?.[0]?.toUpperCase() ?? "O";
  const ownerEmail = user?.email ?? "";
  const propertyName = property?.name ?? "stayidom.in";

  return (
    <div className="min-h-screen bg-muted/40 flex w-full">
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card">
        <div className="h-14 px-5 flex items-center border-b border-border">
          <span className="font-display text-lg font-semibold text-primary">{propertyName}</span>
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

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card flex flex-col">
            <div className="h-14 px-5 flex items-center border-b border-border justify-between">
              <span className="font-display text-lg font-semibold text-primary">
                {propertyName}
              </span>
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
