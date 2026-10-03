// src/admin/navConfig.ts
//
// The admin area is organised into 6 sections. Each section owns one or
// more existing pages ("tabs"). NO routes are added, removed or renamed —
// every page keeps its original URL, so old bookmarks, WhatsApp links and
// dashboard-checklist links keep working. Sections are purely a navigation
// layer on top of the existing routes.
//
//   Daily   → Home · Calendar · Bookings(+Quotes) · Money(Payments + Agents & Commissions)
//   Setup   → Rooms & Pricing · Property(Settings/Amenities/Meals/Add-ons/Policies)
//
// Retired URLs that now redirect: /admin/pricing → /admin/rooms,
// /admin/commissions → /admin/agents.

import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Wallet,
  BedDouble,
  Building2,
} from "lucide-react";

export type NavTab = { to: string; label: string };

export type NavSection = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** "daily" = used every day; "setup" = configured once, tweaked occasionally. */
  group: "daily" | "setup";
  /** First tab is the section's landing page. A single tab = no tab bar. */
  tabs: NavTab[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "home",
    label: "Home",
    icon: LayoutDashboard,
    group: "daily",
    tabs: [{ to: "/admin/dashboard", label: "Home" }],
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    group: "daily",
    tabs: [{ to: "/admin/calendar", label: "Calendar" }],
  },
  {
    key: "bookings",
    label: "Bookings",
    icon: ClipboardList,
    group: "daily",
    tabs: [
      { to: "/admin/bookings", label: "Bookings" },
      { to: "/admin/quotes", label: "Quotes" },
    ],
  },
  {
    key: "money",
    label: "Money",
    icon: Wallet,
    group: "daily",
    tabs: [
      { to: "/admin/payments", label: "Payments" },
      { to: "/admin/agents", label: "Agents & Commissions" },
    ],
  },
  {
    key: "rooms",
    label: "Rooms & Pricing",
    icon: BedDouble,
    group: "setup",
    // Prices are edited inside the room editor, so this section is a single page.
    tabs: [{ to: "/admin/rooms", label: "Rooms & Pricing" }],
  },
  {
    key: "property",
    label: "Property",
    icon: Building2,
    group: "setup",
    tabs: [
      { to: "/admin/settings", label: "Settings" },
      { to: "/admin/amenities", label: "Amenities" },
      { to: "/admin/meals", label: "Meals" },
      { to: "/admin/addons", label: "Add-ons" },
      { to: "/admin/policies", label: "Policies" },
    ],
  },
];

export const SECTION_HOME = (s: NavSection) => s.tabs[0].to;

export function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** The section that owns this URL path, or undefined (e.g. login). */
export function sectionForPath(path: string): NavSection | undefined {
  const p = normalizePath(path);
  return NAV_SECTIONS.find((s) => s.tabs.some((t) => p === t.to || p.startsWith(`${t.to}/`)));
}

export function sectionByKey(key: string): NavSection {
  const s = NAV_SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`navConfig: unknown section ${key}`);
  return s;
}
