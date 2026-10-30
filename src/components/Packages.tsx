import { useState } from "react";
import { Check, MessageCircle, Plus } from "lucide-react";
import type { Property } from "@/hooks/useProperty";
import { usePublicCatalog } from "@/hooks/usePublicCatalog";
import { guestAddonGroups, guestPackages } from "@/lib/guestCatalog";
import { catalogEnquiryLink, type CatalogEnquiryInput } from "@/lib/whatsapp";

/**
 * Packages and add-ons, for information only. The guest ticks what they like and sends ONE
 * WhatsApp enquiry (with their dates and rooms if already chosen); the owner then adds the
 * extras to the stay. Nothing is booked or charged here.
 * Hidden when the owner has nothing active, or if the catalogue can't be read.
 */
export function Packages({ property, stay, liftForCartBar }: {
  property: Property | undefined;
  /** Dates, guests and rooms already chosen on the page, added to the message. */
  stay?: CatalogEnquiryInput["stay"];
  /** True while the fixed rooms bar is on screen, so the send button sits above it. */
  liftForCartBar?: boolean;
}) {
  const { data } = usePublicCatalog(property?.id);
  const [picked, setPicked] = useState<Record<string, string>>({}); // key -> line for the message
  if (!property || !data) return null;

  const packages = guestPackages(data.packages, data.addons);
  const groups = guestAddonGroups(data.addons);
  if (packages.length === 0 && groups.length === 0) return null;

  const canEnquire = !!property.owner_whatsapp;
  const toggle = (key: string, line: string) =>
    setPicked((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = line;
      return next;
    });
  const items = Object.values(picked);
  const sendLink = canEnquire && items.length > 0 ? catalogEnquiryLink(property.owner_whatsapp as string, { propertyName: property.name, items, stay }) : null;

  return (
    <section id="packages" className="py-20 md:py-28 bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">Make it special</span>
          <h2 className="mt-3 text-3xl md:text-5xl font-semibold">Packages and add-ons</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {canEnquire ? "Tick what you like and send one message to your host. " : ""}Prices are a guide and can change with the season.
          </p>
        </div>

        {packages.length > 0 && (
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {packages.map((p) => {
              const key = `p:${p.id}`;
              const on = !!picked[key];
              const shown = p.included.slice(0, 6);
              return (
                <div key={p.id} className={["flex flex-col rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]", on ? "border-primary ring-2 ring-primary/20" : "border-border"].join(" ")}>
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
                  {canEnquire && (
                    <button type="button" aria-pressed={on} onClick={() => toggle(key, `${p.name} (${p.price})`)} className={["mt-5 inline-flex items-center justify-center gap-2 self-start rounded-full px-4 py-2 text-xs font-medium transition-colors", on ? "bg-primary text-primary-foreground" : "border border-primary/40 text-primary hover:bg-primary-light"].join(" ")}>
                      {on ? <><Check className="h-3.5 w-3.5" /> Added</> : <><Plus className="h-3.5 w-3.5" /> Add to enquiry</>}
                    </button>
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
                      const key = `a:${i.id}`;
                      const on = !!picked[key];
                      return (
                        <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{i.name}</div>
                            <div className="text-xs text-muted-foreground">{i.price}</div>
                          </div>
                          {canEnquire && (
                            <button type="button" aria-pressed={on} aria-label={on ? `Remove ${i.name} from enquiry` : `Add ${i.name} to enquiry`} onClick={() => toggle(key, `${i.name} (${i.price})`)} className={["shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors", on ? "bg-primary text-primary-foreground" : "border border-primary/40 text-primary hover:bg-primary-light"].join(" ")}>
                              {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                            </button>
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

        {sendLink && (
          <div className={["sticky z-30 mt-10 flex justify-center", liftForCartBar ? "bottom-20" : "bottom-4"].join(" ")} style={{ paddingBottom: liftForCartBar ? undefined : "env(safe-area-inset-bottom, 0px)" }}>
            <div className="flex items-center gap-3 rounded-full border border-border bg-background/95 py-2 pl-5 pr-2 shadow-lg backdrop-blur-md">
              <span className="text-sm font-medium">{items.length} selected</span>
              <button type="button" onClick={() => setPicked({})} className="text-xs text-muted-foreground underline underline-offset-2">Clear</button>
              <a href={sendLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
                <MessageCircle className="h-4 w-4" /> Send enquiry
              </a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
