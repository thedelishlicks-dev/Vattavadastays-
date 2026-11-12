import { useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { HelpCircle, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { supabase } from "@/lib/supabase";
import { DynamicManifest } from "@/components/DynamicManifest";
import {
  NAV_SECTIONS,
  SECTION_HOME,
  sectionByKey,
  sectionForPath,
  type NavSection,
} from "@/admin/navConfig";
import { SectionTabs } from "@/admin/SectionTabs";
import { SectionContext } from "@/admin/sectionContext";

// Navigation is defined in src/admin/navConfig.ts (6 sections; each owns one
// or more existing pages, shown as tabs). Daily-use sections are listed first,
// set-once configuration after.
const NAV_GROUP_DEFS: { label: string; group: NavSection["group"] }[] = [
  { label: "Daily", group: "daily" },
  { label: "Setup", group: "setup" },
];

// The mobile bottom bar shows the four daily sections + More. Rooms & Pricing
// and Property (set-once configuration) live under More.
const BOTTOM_NAV: NavSection[] = ["home", "calendar", "bookings", "money"].map(sectionByKey);

function getPropertyParam(): string {
  const fromUrl = new URLSearchParams(window.location.search).get("property") ?? "";
  if (fromUrl) return fromUrl;
  return sessionStorage.getItem("adminPropertySubdomain") ?? "";
}

// ---------------------------------------------------------------------------
// Property identity block — desktop sidebar only. The persistent rail has
// no other header nearby showing which property this is, so it earns the
// space here; the mobile drawer skips it since the top app bar it opens
// from already shows the property name (see the drawer header below).
// Falls back to an initial-letter circle when there's no logo yet (common
// during the pilot, before onboarding is complete).
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
    <div className="px-4 py-4 flex items-center gap-3">
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

  const activeSection = sectionForPath(path);
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
    <SectionContext.Provider value={activeSection}>
    <div data-section={activeSection?.key} className="owner-ui min-h-screen bg-muted/40 flex w-full">
      <DynamicManifest />
      <aside className="hidden md:flex w-60 flex-col border-r border-border/60 bg-card">
        <PropertyIdentity name={propertyName} logoUrl={property?.logo_url} subdomain={property?.subdomain} />
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {NAV_GROUP_DEFS.map((g) => (
            <div key={g.label}>
              <div className="px-3 pb-1.5 text-xs text-muted-foreground font-semibold">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {NAV_SECTIONS.filter((sec) => sec.group === g.group).map((sec) => (
                  <NavItem
                    key={sec.key}
                    to={SECTION_HOME(sec)}
                    label={sec.label}
                    icon={sec.icon}
                    sectionKey={sec.key}
                    active={activeSection?.key === sec.key}
                    search={search}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-border/60 space-y-0.5">
          <a
            href="/help"
            target="_blank"
            rel="noopener"
            className="w-full flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" /> Help
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-card/95 backdrop-blur border-b border-border/60 flex items-center px-3 md:px-6 gap-3 sticky top-0 z-20">
          <button className="md:hidden flex h-10 w-10 -ml-2 items-center justify-center rounded-full hover:bg-muted" onClick={() => setMobileOpen(true)} aria-label="Open menu">
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

        {activeSection && (
          <SectionTabs section={activeSection} path={path} propertyParam={propertyParam} />
        )}

        <main data-bold={activeSection?.bold ? "" : undefined} className={["flex-1 p-4 md:p-6 pb-20 md:pb-6", activeSection?.bold ? "bg-[var(--section-wash)]" : ""].join(" ")}>
          <Outlet />
        </main>

        {/* Bottom nav: the four daily sections + More (which opens the full
            menu, including Rooms & Pricing and Property). */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border/60 grid grid-cols-5">
          {BOTTOM_NAV.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection?.key === sec.key;
            return (
              <a
                key={sec.key}
                href={`${SECTION_HOME(sec)}${search}`}
                data-section={sec.key}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                  active ? "text-[var(--section-ink)] font-medium" : "text-muted-foreground",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex items-center justify-center h-7 w-10 rounded-full transition-colors",
                    active ? "bg-[var(--section-soft)]" : "",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {sec.label}
              </a>
            );
          })}
          <button onClick={() => setMobileOpen(true)} data-section={activeSection?.group === "setup" ? activeSection.key : undefined} className={[
              "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
              activeSection?.group === "setup" ? "text-[var(--section-ink)] font-medium" : "text-muted-foreground",
            ].join(" ")}
          >
            <span
              className={[
                "flex items-center justify-center h-7 w-10 rounded-full",
                activeSection?.group === "setup" ? "bg-[var(--section-soft)]" : "",
              ].join(" ")}
            >
              <Menu className="h-5 w-5" />
            </span>
            More
          </button>
        </nav>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card flex flex-col rounded-r-3xl">
            {/* No PropertyIdentity here: the top app bar (visible on the
                screen this drawer opens from) already shows the property
                name, so repeating name/logo/subdomain here would just cost
                vertical space without telling the owner anything new. */}
            <div className="h-14 px-5 flex items-center justify-between">
              <span className="font-display text-lg font-semibold text-primary">{propertyName}</span>
              <button onClick={() => setMobileOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-muted hover:bg-muted/70" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
              {NAV_GROUP_DEFS.map((g) => (
                <div key={g.label}>
                  <div className="px-3 pb-1.5 text-xs text-muted-foreground font-semibold">
                    {g.label}
                  </div>
                  <div className="space-y-0.5">
                    {NAV_SECTIONS.filter((sec) => sec.group === g.group).map((sec) => (
                      <NavItem
                        key={sec.key}
                        to={SECTION_HOME(sec)}
                        label={sec.label}
                        icon={sec.icon}
                        sectionKey={sec.key}
                        active={activeSection?.key === sec.key}
                        search={search}
                        onClick={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
            <div className="p-3 border-t border-border/60 space-y-0.5">
              <a
                href="/help"
            target="_blank"
            rel="noopener"
                className="w-full flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <HelpCircle className="h-4 w-4" /> Help
              </a>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" /> Log out
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
    </SectionContext.Provider>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  sectionKey,
  active,
  disabled,
  search,
  onClick,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Carries this section's colours, so each item shows its own accent even when not active. */
  sectionKey?: string;
  active: boolean;
  disabled?: boolean;
  search: string;
  onClick?: () => void;
}) {
  if (disabled) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-full text-sm text-muted-foreground/60 cursor-not-allowed" title="Coming soon">
        <Icon className="h-4 w-4" />
        <span className="flex-1">{label}</span>
        <span className="text-[10px] font-medium">Soon</span>
      </div>
    );
  }
  return (
    <a
      href={`${to}${search}`}
      onClick={onClick}
      data-section={sectionKey}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center gap-3 px-4 py-2.5 rounded-full text-sm transition-colors",
        active
          ? "bg-[var(--section-soft)] text-[var(--section-ink)] font-semibold"
          : "text-foreground hover:bg-muted",
      ].join(" ")}
    >
      <Icon className={["h-4 w-4", active ? "" : "text-[var(--section-ink)] opacity-80"].join(" ")} />
      {label}
    </a>
  );
}
