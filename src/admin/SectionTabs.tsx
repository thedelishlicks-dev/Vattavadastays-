// src/admin/SectionTabs.tsx
//
// Sub-navigation shown just under the top bar for sections that own more
// than one page (Bookings, Money, Rooms & Pricing, Property). Each tab is a
// real link to the page's existing URL. Clicking switches pages without a
// full reload; the ?property= param is carried along so superadmin
// "manage property" sessions stay on the right property (AdminGuard reads
// it straight from the URL).

import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { normalizePath, type NavSection } from "@/admin/navConfig";

export function SectionTabs({
  section,
  path,
  propertyParam,
}: {
  section: NavSection;
  path: string;
  propertyParam: string;
}) {
  const navigate = useNavigate();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const current = normalizePath(path);
  const search = propertyParam ? `?property=${encodeURIComponent(propertyParam)}` : "";

  // With 5 tabs (Property) the bar scrolls on a phone — keep the active one in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [current]);

  if (section.tabs.length < 2) return null;

  return (
    <div className="sticky top-14 z-10 bg-card border-b border-border">
      <nav
        aria-label={`${section.label} pages`}
        className="flex gap-1 overflow-x-auto px-3 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {section.tabs.map((tab) => {
          const active = current === tab.to || current.startsWith(`${tab.to}/`);
          return (
            <a
              key={tab.to}
              ref={active ? activeRef : undefined}
              href={`${tab.to}${search}`}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                // Let the browser handle new-tab / modified clicks normally.
                if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                if (active) return;
                navigate({
                  to: tab.to,
                  search: propertyParam ? { property: propertyParam } : {},
                } as never);
              }}
              className={[
                "shrink-0 whitespace-nowrap px-3 py-3 text-sm border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
