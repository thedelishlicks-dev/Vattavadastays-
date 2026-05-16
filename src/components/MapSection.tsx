import { MapPin, Navigation, Apple, Mountain, MessageSquare } from "lucide-react";
import { useProperty } from "@/hooks/useProperty";

interface MapSectionProps {
  subdomain: string;
}

export function MapSection({ subdomain }: MapSectionProps) {
  const { data: property } = useProperty(subdomain);
  const lat = property?.location_lat;
  const lng = property?.location_lng;
  const landmark = property?.landmark_description;
  const staticMapUrl = property?.static_map_image_url;
  const propertyName = property?.name ?? "our property";
  const ownerName = property?.owner_name ?? "the host";
  const ownerPhone = property?.owner_phone ?? "";

  const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : "";
  const appleMapsUrl = lat && lng ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(propertyName)}` : null;

  const smsMessage = [
    `Directions to ${propertyName}:`,
    mapsLink ? `Google Maps: ${mapsLink}` : "",
    landmark ? `Landmark: ${landmark}` : "",
    ownerPhone ? `Call ${ownerName}: +${ownerPhone.replace(/\D/g, "")}` : "",
    "See you soon!",
  ].filter(Boolean).join("\n");

  const smsUrl = `sms:?body=${encodeURIComponent(smsMessage)}`;

  if (!lat && !lng && !staticMapUrl && !landmark) return null;

  return (
    <section id="location" className="py-16 md:py-20 bg-muted/30">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-primary mb-3">
            <MapPin className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wider">Getting Here</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Find Your Way</h2>
          {landmark && <p className="mt-2 text-muted-foreground">{landmark}</p>}
        </div>

        <div className="space-y-4">
          {/* Static Map or Fallback */}
          {staticMapUrl ? (
            <div className="relative rounded-2xl overflow-hidden border border-border">
              <img src={staticMapUrl} alt={`Map showing location of ${propertyName}`} className="w-full h-48 md:h-64 object-cover" />
              {lat && lng && (
                <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur text-stone-900 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm hover:bg-white transition-colors">
                  <Navigation className="h-3.5 w-3.5" /> Open in Maps
                </a>
              )}
            </div>
          ) : lat && lng ? (
            <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-xl border border-border bg-card hover:bg-muted/50 p-4 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Mountain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Coordinates</div>
                <div className="text-xs text-muted-foreground font-mono">{lat.toFixed(4)}°N, {lng.toFixed(4)}°E</div>
              </div>
              <Navigation className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
            </a>
          ) : null}

          {/* Google Maps Link */}
          {mapsLink && (
            <a href={mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-xl border border-border bg-card hover:bg-muted/50 p-4 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-[#4285F4]/10 flex items-center justify-center shrink-0">
                <Navigation className="h-5 w-5 text-[#4285F4]" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Google Maps</div>
                <div className="text-xs text-muted-foreground">Open directions in Google Maps</div>
              </div>
              <Navigation className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
            </a>
          )}

          {/* Apple Maps Link */}
          {appleMapsUrl && (
            <a href={appleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-xl border border-border bg-card hover:bg-muted/50 p-4 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-stone-900/10 flex items-center justify-center shrink-0">
                <Apple className="h-5 w-5 text-stone-900" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">Apple Maps</div>
                <div className="text-xs text-muted-foreground">Open directions in Apple Maps</div>
              </div>
              <Navigation className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
            </a>
          )}

          {/* SMS Directions */}
          <a href={smsUrl} className="flex items-center gap-4 rounded-xl border border-border bg-card hover:bg-muted/50 p-4 transition-colors">
            <div className="h-10 w-10 rounded-lg bg-[#25D366]/10 flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5 text-[#25D366]" />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">SMS Directions</div>
              <div className="text-xs text-muted-foreground">Send directions to your phone</div>
            </div>
            <Navigation className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
          </a>
        </div>
      </div>
    </section>
  );
}
