import { MapPin, Navigation, Apple, Mountain } from "lucide-react";
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
  const propertyName = property?.name ?? "the property";

  const mapsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null;
  const appleMapsUrl =
    lat && lng
      ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(propertyName)}`
      : null;

  // Don't render if no location data
  if (!lat && !lng && !staticMapUrl && !landmark) return null;

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <section id="location" className="py-16 md:py-20 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="mb-8">
          <span className="text-xs uppercase tracking-[0.2em] text-primary font-medium">
            Getting here
          </span>
          <h2 className="mt-2 text-2xl md:text-3xl font-semibold text-foreground">
            Find your way to us
          </h2>
          {landmark && (
            <p className="mt-2 text-sm text-muted-foreground">{landmark}</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          {/* Static map */}
          <div>
            {staticMapUrl ? (
              <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
                <img
                  src={staticMapUrl}
                  alt={`Map showing location of ${propertyName}`}
                  className="w-full h-56 md:h-72 object-cover"
                  loading="lazy"
                />
                {lat && lng && (
                  <a href={mapsUrl ?? "#"} target="_blank" rel="noreferrer" className="absolute inset-0" aria-label="View on Google Maps" />
                )}
              </div>
            ) : lat && lng ? (
              <div className="rounded-2xl border border-border bg-gradient-to-br from-primary-light/40 to-primary-light/20 p-8 text-center">
                <Mountain className="mx-auto h-10 w-10 text-primary mb-3" />
                <p className="text-sm text-muted-foreground mb-1">Coordinates saved for this property</p>
                <p className="font-mono text-xs text-muted-foreground">{lat.toFixed(4)}, {lng.toFixed(4)}</p>
                <p className="mt-2 text-xs text-muted-foreground">Add a static map image in admin settings to show a map here.</p>
              </div>
            ) : null}
          </div>

          {/* Directions */}
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tap below to open directions in your preferred maps app. Works offline if you have downloaded the area.
            </p>

            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-xl border border-border bg-card hover:bg-muted/50 p-4 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-white border shadow-sm flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">Open in Google Maps</div>
                  <div className="text-xs text-muted-foreground">Navigation + offline maps support</div>
                </div>
                <Navigation className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
              </a>
            )}

            {appleMapsUrl && (
              <a href={appleMapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-xl border border-border bg-card hover:bg-muted/50 p-4 transition-colors">
                <div className="h-10 w-10 rounded-lg bg-black flex items-center justify-center shrink-0">
                  <Apple className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{isIOS ? "Open in Apple Maps" : "Apple Maps (iOS)"}</div>
                  <div className="text-xs text-muted-foreground">Works great on iPhone</div>
                </div>
                <Navigation className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
              </a>
            )}

            {!mapsUrl && (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">No location set yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Add latitude, longitude in admin settings to enable directions.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
