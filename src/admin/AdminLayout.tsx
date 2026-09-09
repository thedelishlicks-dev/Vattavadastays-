import { useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
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
  Handshake,
  Receipt,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { supabase } from "@/lib/supabase";
import { DynamicManifest } from "@/components/DynamicManifest";

type NavItemDef = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
};

// Kept as a flat list: the mobile bottom nav still reads NAV.slice(0, 4)
// directly (unchanged, per instruction), and NAV_GROUPS below is derived
// from this same list so path -> label -> icon stays defined in one place.
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
  { to: "/admin/agents", label: "Agents", icon: Handshake },
  { to: "/admin/commissions", label: "Commissions", icon: Receipt },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

function findNav(to: string): NavItemDef {
  const item = NAV.find((n) => n.to === to);
  if (!item) throw new Error(`AdminLayout: no NAV entry for ${to}`);
  return item;
}

// Grouping only — same items, same icons, same hrefs. Order within each
// group follows the plan's grouping, not NAV's declaration order (e.g.
// Calendar is listed before Bookings here even though Rooms sits between
// Dashboard and Calendar in the flat NAV array above).
const NAV_GROUPS: { label: string; items: NavItemDef[] }[] = [
  {
    label: "Operations",
    items: ["/admin/dashboard", "/admin/calendar", "/admin/bookings"].map(findNav),
  },
  {
    label: "Property",
    items: ["/admin/rooms", "/admin/pricing", "/admin/amenities", "/admin/meals", "/admin/policies"].map(
      findNav,
    ),
  },
  {
    label: "Money",
    items: ["/admin/payments", "/admin/agents", "/admin/commissions"].map(findNav),
  },
];
const SETTINGS_NAV = findNav("/admin/settings");

function getPropertyParam(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("property") ?? "";
  if (fromUrl) return fromUrl;
  return sessionStorage.getItem("adminPropertySubdomain") ?? "";
}

// ---------------------------------------------------------------------------
// Property identity block — sits at the top of the sidebar/drawer so the
// admin reads as "this owner's book", not generic software chrome. Falls
// back to an initial-letter circle when there's no logo yet (common during
// the pilot, before onboarding is complete).
// ---------------------------------------------------------------------------

function PropertyIdentity({
  name,
  logoUrl,
  subdomain,
}: {
  name: string;
  logoUrl?: string | null;
  subdomain?: string | null;
}) {
  return (
    <div className="px-4 py-4 flex items-center gap-3 border-b border-border">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-10 w-10 rounded-full object-cover shrink-0 border border-border"
        />
      ) : (
        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
          {name.trim().charAt(0).toUpperCase() || "S"}
        </div>
      )}
      <div className="min-w-0">
        <div className="font-display text-base font-semibold text-foreground truncate">{name}</div>
        {subdomain && (
          <div className="text-[11px] text-muted-foreground truncate">{subdomain}.stayidom.in</div>
        )}
      </div>
    </div>
  );
}

// Section label styling below reuses the same "text-xs uppercase
// tracking-wider text-muted-foreground" treatment already used elsewhere in
// admin (e.g. the Dashboard's "Quick actions" label), so the grouping
// doesn't introduce a new visual language — just structure. The grouped
// list is rendered inline in both the desktop sidebar and the mobile
// drawer below, since each needs `path` from this component's own
// `useRouterState` call to compute `active` per item.

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { data: property } = useOwnerProperty();

  const propertyParam = getPropertyParam();
  const search = propertyParam ? `?property=${encodeURIComponent(propertyParam)}` : "";

  const handleLogout = async () => {
    sessionStorage.removeItem("adminPropertySubdomain");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const ownerInitial = user?.email?.[0]?.toUpperCase() ?? "O";
  const ownerEmail = user?.email ?? "";
  const propertyName = property?.name ?? "stayidom.in";

  return (
    <div className="min-h-screen bg-muted/40 flex w-full">
      <DynamicManifest />
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card">
        <PropertyIdentity name={propertyName} logoUrl={property?.logo_url} subdomain={property?.subdomain} />
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    active={path === item.to}
                    disabled={item.disabled}
                    search={search}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
        {/* Settings pinned above Log out, outside the grouped sections. */}
        <div className="p-3 border-t border-border space-y-0.5">
          <NavItem
            to={SETTINGS_NAV.to}
            label={SETTINGS_NAV.label}
            icon={SETTINGS_NAV.icon}
            active={path === SETTINGS_NAV.to}
            search={search}
          />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-card border-b border-border flex items-center px-3 md:px-6 gap-3 sticky top-0 z-20">
          <button className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted" onClick={() => setMobileOpen(true)} aria-label="Open menu">
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

        {/* Bottom nav: same four items, same order, same hrefs as before
            (Dashboard, Rooms, Calendar, Bookings + More) — only change is
            the pill highlight behind the icon on the active item. */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border grid grid-cols-5">
          {NAV.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = path === item.to;
            return (
              <a
                key={item.to}
                href={`${item.to}${search}`}
                className={[
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                  active ? "text-primary font-medium" : "text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex items-center justify-center h-7 w-10 rounded-full transition-colors",
                    active ? "bg-primary/10" : "",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {item.label}
              </a>
            );
          })}
          <button onClick={() => setMobileOpen(true)} className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground">
            <span className="flex items-center justify-center h-7 w-10 rounded-full">
              <Menu className="h-5 w-5" />
            </span>
            More
          </button>
        </nav>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card flex flex-col">
            <div className="flex items-center justify-between border-b border-border">
              <div className="flex-1 min-w-0">
                <PropertyIdentity name={propertyName} logoUrl={property?.logo_url} subdomain={property?.subdomain} />
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-2 mr-3 rounded-md hover:bg-muted shrink-0" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavItem
                        key={item.to}
                        to={item.to}
                        label={item.label}
                        icon={item.icon}
                        active={path === item.to}
                        disabled={item.disabled}
                        search={search}
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-border space-y-0.5">
              <NavItem
                to={SETTINGS_NAV.to}
                label={SETTINGS_NAV.label}
                icon={SETTINGS_NAV.icon}
                active={path === SETTINGS_NAV.to}
                search={search}
                onClick={() => setMobileOpen(false)}
              />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
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
  search,
  onClick,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  disabled?: boolean;
  search: string;
  onClick?: () => void;
}) {
  if (disabled) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground/60 cursor-not-allowed" title="Coming soon">
        <Icon className="h-4 w-4" />
        <span className="flex-1">{label}</span>
        <span className="text-[10px] uppercase tracking-wider">Soon</span>
      </div>
    );
  }
  return (
    <a href={`${to}${search}`} onClick={onClick} className={["flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors", active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"].join(" ")}>
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}
