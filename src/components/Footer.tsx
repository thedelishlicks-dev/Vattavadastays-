import { Phone, MapPin, MessageCircle, Leaf, ClipboardList } from "lucide-react";
import { useProperty } from "@/hooks/useProperty";
import { telLink } from "@/lib/whatsapp";

export function Footer({ subdomain }: { subdomain: string }) {
  const { data: property } = useProperty(subdomain);

  const phone = property?.owner_phone ?? "";
  const whatsapp = property?.owner_whatsapp ?? phone;
  const lat = property?.location_lat;
  const lng = property?.location_lng;
  const propertyName = property?.name ?? "stayidom.in";
  const ownerName = property?.owner_name ?? "the host";

  const mapsUrl =
    lat && lng
      ? `https://maps.google.com/?q=${lat},${lng}`
      : "https://maps.google.com/?q=Upper+Vattavada+Munnar";

  function cleanDigits(p: string): string {
    const d = p.replace(/\D/g, "");
    if (d.startsWith("91") && d.length === 12) return d;
    if (d.length === 10) return `91${d}`;
    return d;
  }

  const waLink = whatsapp ? `https://wa.me/${cleanDigits(whatsapp)}` : null;

  return (
    <footer id="contact" className="bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-16 md:py-20">
        <div className="grid md:grid-cols-3 gap-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Leaf className="h-5 w-5" />
              </span>
              <div>
                <div className="font-display text-lg font-semibold">{propertyName}</div>
                {property?.name_ml && (
                  <div className="font-malayalam text-sm opacity-70">{property.name_ml}</div>
                )}
              </div>
            </div>
            {property?.hero_tagline && (
              <p className="mt-5 text-sm opacity-70 leading-relaxed max-w-xs">
                {property.hero_tagline}
              </p>
            )}
          </div>

          {/* Location */}
          <div>
            <h3 className="font-display text-lg font-semibold mb-4">Visit us</h3>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 text-sm opacity-80 hover:opacity-100"
            >
              <MapPin className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <span>
                {property?.area ?? "Upper Vattavada"}
                <br />
                Munnar Road, Kerala
              </span>
            </a>
            {lat && lng && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-xs opacity-60 hover:opacity-100"
              >
                Open in Google Maps
              </a>
            )}
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-display text-lg font-semibold mb-4">Get in touch</h3>
            <div className="space-y-3">
              {phone && (
                <a
                  href={telLink(phone)}
                  className="flex items-center gap-3 rounded-full bg-background/10 hover:bg-background/15 px-5 py-3 text-sm font-medium transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  Call {ownerName}
                </a>
              )}
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-full bg-[#25D366] text-white hover:opacity-90 px-5 py-3 text-sm font-medium transition-opacity"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}

              {/* Track booking — always visible */}
              <a
                href="/booking-status"
                className="flex items-center gap-3 rounded-full bg-background/10 hover:bg-background/15 px-5 py-3 text-sm font-medium transition-colors"
              >
                <ClipboardList className="h-4 w-4" />
                Track your booking
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-background/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs opacity-60">
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6">
            <span>
              © {new Date().getFullYear()} {propertyName}. All rights reserved.
            </span>
            {ownerName && <span>Hosted by {ownerName}</span>}
          </div>
          <span className="font-medium text-primary">Powered by stayidom.in</span>
        </div>
      </div>
    </footer>
  );
}
