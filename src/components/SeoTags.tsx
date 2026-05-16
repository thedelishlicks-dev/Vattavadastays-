import { useEffect } from "react";
import { useProperty } from "@/hooks/useProperty";

interface SeoTagsProps {
  subdomain: string;
}

function getBaseUrl(): string {
  if (typeof window === "undefined") return "https://vattavadastays.vercel.app";
  const hostname = window.location.hostname;
  if (hostname.endsWith(".vattavadastays.com")) {
    return `https://${hostname}`;
  }
  return "https://vattavadastays.vercel.app";
}

export function SeoTags({ subdomain }: SeoTagsProps) {
  const { data: property } = useProperty(subdomain);

  useEffect(() => {
    if (!property) return;

    const baseUrl = getBaseUrl();
    const pageUrl = `${baseUrl}`;
    const propertyName = property.name ?? "Our Property";
    const description =
      property.description?.slice(0, 160) ??
      `Stay at ${propertyName} — a beautiful homestay in Vattavada, Kerala. Book your mountain retreat surrounded by strawberry farms and tea plantations.`;
    const heroImage = property.hero_image ?? "";

    // Title
    document.title = `${propertyName} | VattavadaStays`;

    // Meta description
    updateMetaTag("description", description);

    // Open Graph
    updateMetaTag("og:title", `${propertyName} | Book Your Stay in Vattavada`);
    updateMetaTag("og:description", description);
    updateMetaTag("og:type", "website");
    updateMetaTag("og:url", pageUrl);
    if (heroImage) updateMetaTag("og:image", heroImage);
    updateMetaTag("og:site_name", "VattavadaStays");

    // Twitter Card
    updateMetaTag("twitter:card", "summary_large_image");
    updateMetaTag("twitter:title", `${propertyName} | VattavadaStays`);
    updateMetaTag("twitter:description", description);
    if (heroImage) updateMetaTag("twitter:image", heroImage);

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", pageUrl);

    // Schema.org JSON-LD (LodgingBusiness)
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      name: propertyName,
      description: property.description ?? description,
      url: pageUrl,
      image: heroImage || undefined,
      address: {
        "@type": "PostalAddress",
        addressLocality: property.area ?? "Vattavada",
        addressRegion: "Kerala",
        addressCountry: "IN",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: property.location_lat ?? undefined,
        longitude: property.location_lng ?? undefined,
      },
      telephone: property.owner_phone ?? undefined,
      amenityFeature: getAmenityFeatures(property.shared_amenities ?? []),
      priceRange: "₹₹",
    };

    const cleanJsonLd = JSON.parse(JSON.stringify(jsonLd));

    let script = document.querySelector(
      'script[type="application/ld+json"]'
    ) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.setAttribute("type", "application/ld+json");
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(cleanJsonLd);
  }, [property]);

  return null;
}

function updateMetaTag(name: string, content: string) {
  const attr = name.startsWith("og:") || name.startsWith("twitter:")
    ? "property"
    : "name";

  let meta = document.querySelector(
    `meta[${attr}="${name}"]`
  ) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attr, name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function getAmenityFeatures(amenities: string[]): object[] {
  const sentinelFree = amenities.filter((a) => !a.startsWith("__"));
  return sentinelFree.map((amenity) => ({
    "@type": "LocationFeatureSpecification",
    name: amenity.charAt(0).toUpperCase() + amenity.slice(1).replace(/-/g, " "),
    value: true,
  }));
}
