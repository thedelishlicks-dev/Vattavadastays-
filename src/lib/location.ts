// src/lib/location.ts
//
// A property's map location is TWO numbers, latitude and longitude. One without the other is useless,
// so everything that builds a map link goes through here: coordinates count only when both are real
// numbers, and the Settings screen refuses to save one without the other.

export type Coord = number | string | null | undefined;

const num = (v: Coord): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

/** True only when both latitude and longitude are real numbers in range (0 is a valid value). */
export function hasCoordinates(lat: Coord, lng: Coord): boolean {
  const a = num(lat);
  const b = num(lng);
  return a !== null && b !== null && Math.abs(a) <= 90 && Math.abs(b) <= 180;
}

export type DirectionsTarget = { lat: Coord; lng: Coord; name?: string | null; area?: string | null; byName?: boolean | null };

/**
 * Google's directions link, used by the buttons. No `origin`, so Google starts the route from where the
 * person is standing. The destination is the property's pin, or, when the owner has switched it on
 * (properties.directions_by_name) or there is no pin, its name and area so Google finds the listing.
 * The server route api/directions.ts builds the same link (api/_lib/directions.ts).
 */
export function directionsUrl(p: DirectionsTarget): string {
  const byName = Boolean(p.byName) || !hasCoordinates(p.lat, p.lng);
  const destination = byName ? [p.name, p.area, "Kerala"].filter(Boolean).join(", ") : `${num(p.lat)},${num(p.lng)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

/**
 * The link that goes INTO message text (SMS, WhatsApp): short, and with no "&", no comma and no
 * space, because some SMS apps end the whole message at the first "&" and others end a link at a comma.
 * It redirects to directionsUrl() on the server (api/directions.ts).
 * On the live site the property's own address is enough; previews and localhost need ?p=<subdomain>.
 */
export function directionsShortLink(subdomain: string, here?: { hostname: string; origin: string }): string {
  if (!here || here.hostname.endsWith(".stayidom.in")) return `https://${subdomain}.stayidom.in/api/directions`;
  return `${here.origin}/api/directions?p=${encodeURIComponent(subdomain)}`;
}

/** Apple Maps link, or null without both coordinates (a name search there is too unreliable). */
export function appleMapsUrl(p: { lat: Coord; lng: Coord; name: string }): string | null {
  return hasCoordinates(p.lat, p.lng) ? `https://maps.apple.com/?ll=${num(p.lat)},${num(p.lng)}&q=${encodeURIComponent(p.name)}` : null;
}

/**
 * Google Maps shows a spot as "10.0889, 77.0595". Pasted into the Latitude box that used to keep only the
 * first number. Returns both numbers when the text is such a pair, otherwise null.
 */
export function splitCoordinatePair(text: string): { lat: string; lng: string } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  return m ? { lat: m[1], lng: m[2] } : null;
}

export type CoordinateCheck = { ok: true; lat: number | null; lng: number | null } | { ok: false; error: string };

/** Settings form: both empty is fine (no location), both filled must be valid numbers, one alone is refused. */
export function validateCoordinates(latText: string, lngText: string): CoordinateCheck {
  const a = latText.trim();
  const b = lngText.trim();
  if (a === "" && b === "") return { ok: true, lat: null, lng: null };
  if (a === "" || b === "") return { ok: false, error: "Enter both latitude and longitude, or leave both empty. One alone can't give directions." };
  const lat = num(a);
  const lng = num(b);
  if (lat === null || lng === null) return { ok: false, error: "Latitude and longitude must be numbers, like 10.0889 and 77.0595." };
  if (Math.abs(lat) > 90) return { ok: false, error: "Latitude must be between -90 and 90." };
  if (Math.abs(lng) > 180) return { ok: false, error: "Longitude must be between -180 and 180." };
  return { ok: true, lat, lng };
}
