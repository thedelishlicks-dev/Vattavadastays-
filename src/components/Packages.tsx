import { MessageCircle } from "lucide-react";
import type { Property } from "@/hooks/useProperty";
import { usePublicCatalog } from "@/hooks/usePublicCatalog";
import { guestAddonGroups, guestPackages } from "@/lib/guestCatalog";
import { catalogInquiryLink } from "@/lib/whatsapp";

/**
 * Packages and add-ons, for information only. The guest does not pick or pay for them here:
 * "Ask about this" opens WhatsApp and the owner adds them to the stay (as extras on the booking).
 * Hidden when the owner has nothing active, or if the catalogue can't be read.
 */
export function Packages({ property }: { property: Property | undefined }) {
  const { data } = usePublicCatalog(property?.id);
  if (!property || !data) return null;

  const packages = guestPackages(data.packages, data.addons);
  const groups = guestAddonGroups(data.addons);
  if (packages.length === 0 && groups.length === 0) return null;

  const ask = (itemName: string) =>
    property.owner_whatsapp ? catalogInquiryLink({ ownerWhatsapp: property.owner_whatsapp, propertyName: property.name, itemName }) : null;

  return (
    <section id="packages" className="py-20 md:py-28 bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">Make it special</span>
          <h2 className="mt-3 text-3xl md:text-5xl font-semibold">Packages and add-ons</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Prices are a guide and can change with the season. Ask your host and they will add these to your stay.
          </p>
        </div>

        {packages.length > 0 && (
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {packages.map((p) => {
              const link = ask(p.name);
              const shown = p.included.slice(0, 6);
              return (
                <div key={p.id} className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
                  <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                  <div className="mt-1 text-sm font-medium text-primary">{p.price}</div>
                  {p.description && <p className="mt-3 text-sm text-muted-foreground">{p.description}</p>}
                  {shown.length > 0 && (
                    <ul className="mt-4 space-y-1.5 text-sm">
                      {shown.map((n, i) => (
                        <li key={`${n}-${i}`} className="flex gap-2"><span className="text-primary">•</span>{n}</li>
                      ))}
                      {p.included.length > shown.length && <li className="text-xs text-muted-foreground">+ {p.included.length - shown.length} more</li>}
                    </ul>
                  )}
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center justify-center gap-2 self-start rounded-full border border-[#25D366] px-4 py-2 text-xs font-medium text-[#128C7E] hover:bg-[#25D366]/10 transition-colors">
                      <MessageCircle className="h-3.5 w-3.5" /> Ask about this
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {groups.length > 0 && (
          <div className={packages.length > 0 ? "mt-14" : "mt-12"}>
            {packages.length > 0 && <h3 className="text-center font-display text-2xl font-semibold">Add to any stay</h3>}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {groups.map((g) => (
                <div key={g.category} className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{g.label}</div>
                  <ul className="mt-3 divide-y divide-border">
                    {g.items.map((i) => {
                      const link = ask(i.name);
                      return (
                        <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{i.name}</div>
                            <div className="text-xs text-muted-foreground">{i.price}</div>
                          </div>
                          {link && (
                            <a href={link} target="_blank" rel="noreferrer" aria-label={`Ask about ${i.name}`} className="shrink-0 rounded-full border border-[#25D366] p-2 text-[#128C7E] hover:bg-[#25D366]/10 transition-colors">
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
