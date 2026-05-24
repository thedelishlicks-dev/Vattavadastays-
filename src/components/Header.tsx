import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useProperty } from "@/hooks/useProperty";
import { getSubdomain } from "@/lib/subdomain";

const links = [
  { href: "#availability", label: "Dates" },
  { href: "#rooms", label: "Rooms" },
  { href: "#booking", label: "Book" },
  { href: "#about", label: "About" },
  { href: "#amenities", label: "Amenities" },
  { href: "#contact", label: "Contact" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const subdomain = getSubdomain();
  const { data: property } = useProperty(subdomain);

  const logoUrl = property?.logo_url ?? null;
  const propertyName = property?.name ?? "Loading...";
  const propertyNameMl = property?.name_ml ?? null;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-background/85 border-b border-border">
      <div className="mx-auto max-w-6xl px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={propertyName}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <span className="font-display text-lg font-semibold">
                {propertyName.charAt(0).toUpperCase()}
              </span>
            </span>
          )}
          <div className="leading-tight">
            <div className="font-display text-base md:text-lg font-semibold text-foreground">
              {propertyName}
            </div>
            {propertyNameMl && (
              <div className="font-malayalam text-xs md:text-sm text-muted-foreground">
                {propertyNameMl}
              </div>
            )}
          </div>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-foreground/80 hover:text-primary transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="flex flex-col px-4 py-3">
            {links.map((l) => (
              
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-3 text-base font-medium text-foreground/90 hover:text-primary"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
