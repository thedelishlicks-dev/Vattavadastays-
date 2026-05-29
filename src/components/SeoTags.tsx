import { useEffect } from "react";
import { useProperty } from "@/hooks/useProperty";

interface SeoTagsProps {
  subdomain: string;
}

function getBaseUrl(): string {
  if (typeof window === "undefined") return "https://vattavadastays.vercel.app";
  const hostname = window.location.hostname;
  if (hostname.endsWith(".stayidom.in")) return `https://${hostname}`;
  return "https://vattavadastays.vercel.app";
}

function filterAmenities(amenities: string[] | null | undefined): string[] {
  if (!amenities) return [];
  return amenities.filter((a) => !a.startsWith("__"));
}

export function SeoTags({ subdomain }: SeoTagsProps) {
  const { data: property } = useProperty(subdomain);

  useEffect(() => {
    if (!property) return;

    const baseUrl = getBaseUrl();
    const title = `${property.name ?? "Property"} | stayidom.in`;
    const description = property.description
      ? property.description.slice(0, 160)
      : `Book your stay at ${property.name ?? "this property"} in Vattavada, Kerala. Beautiful homestay experience in the mountains.`;

    // hero_image is the correct column name
    const imageUrl = property.hero_image ? property.hero_image : `${baseUrl}/og-default.jpg`;

    // shared_amenities is the correct column name
    const keywords = filterAmenities(property.shared_amenities).join(", ");

    document.title = title;

    const updateMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const updateOg = (prop: string, content: string) => {
      let el = document.querySelector(`meta[property="og:${prop}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", `og:${prop}`);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const updateTwitter = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="twitter:${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.name = `twitter:${name}`;
        document.head.appendChild(el);
      }
      el.content = content;
    };

    updateMeta("description", description);
    if (keywords) updateMeta("keywords", keywords);
    updateOg("title", title);
    updateOg("description", description);
    updateOg("image", imageUrl);
    updateOg("url", baseUrl);
    updateOg("type", "website");
    updateOg("site_name", "stayidom.in");
    updateTwitter("card", "summary_large_image");
    updateTwitter("title", title);
    updateTwitter("description", description);
    updateTwitter("image", imageUrl);

    // Update favicon if logo exists
    if (property.logo_url) {
      const updateIcon = (rel: string, sizes?: string) => {
        let link = document.querySelector(
          `link[rel="${rel}"]${sizes ? `[sizes="${sizes}"]` : ""}`,
        ) as HTMLLinkElement | null;
        if (!link) {
          link = document.createElement("link");
          link.rel = rel;
          if (sizes) link.sizes = sizes;
          document.head.appendChild(link);
        }
        link.href = property.logo_url!;
      };

      updateIcon("icon");
      updateIcon("apple-touch-icon");
    }

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = baseUrl;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      name: property.name,
      description: property.description ?? undefined,
      image: property.hero_image ?? undefined,
      url: baseUrl,
      telephone: property.owner_phone ?? undefined,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Vattavada",
        addressRegion: "Kerala",
        addressCountry: "IN",
      },
      amenityFeature: filterAmenities(property.shared_amenities).map((name) => ({
        "@type": "LocationFeatureSpecification",
        name,
        value: true,
      })),
      ...(property.location_lat && property.location_lng
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: property.location_lat,
              longitude: property.location_lng,
            },
          }
        : {}),
    };

    let scriptEl = document.querySelector("#schema-org-ld") as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement("script");
      scriptEl.id = "schema-org-ld";
      scriptEl.type = "application/ld+json";
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = JSON.stringify(jsonLd);
  }, [property]);

  return null;
}
