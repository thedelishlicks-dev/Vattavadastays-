import { useEffect } from "react";
import { useProperty } from "@/hooks/useProperty";
import { buildSeo } from "../../api/_lib/seo";

interface SeoTagsProps {
  subdomain: string;
}

function getBaseUrl(): string {
  if (typeof window === "undefined") return "https://vattavadastays.vercel.app";
  const hostname = window.location.hostname;
  if (hostname.endsWith(".stayidom.in")) return `https://${hostname}`;
  return "https://vattavadastays.vercel.app";
}

export function SeoTags({ subdomain }: SeoTagsProps) {
  const { data: property } = useProperty(subdomain);

  useEffect(() => {
    if (!property) return;

    const baseUrl = getBaseUrl();
    // Same builder the server uses (api/og.ts), so crawlers and visitors see identical tags.
    const seo = buildSeo(property, baseUrl);
    const { title, description, image: imageUrl, keywords } = seo;

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
    updateOg("site_name", seo.siteName);
    updateTwitter("card", "summary_large_image");
    updateTwitter("title", title);
    updateTwitter("description", description);
    updateTwitter("image", imageUrl);

    // --- Dynamic PWA manifest per subdomain ---
    // Points to the edge function which returns the correct name + logo icon.
    // Only inject on admin pages where the owner installs the PWA.
    if (window.location.pathname.startsWith("/admin")) {
      const manifestHref = `/api/manifest?subdomain=${encodeURIComponent(subdomain)}`;
      let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (!manifestLink) {
        manifestLink = document.createElement("link");
        manifestLink.rel = "manifest";
        document.head.appendChild(manifestLink);
      }
      manifestLink.href = manifestHref;

      // Apple PWA title — shows under the icon on iOS home screen
      updateMeta("apple-mobile-web-app-title", property.name ?? "stayidom");
    }

    // --- Per-property favicon and apple-touch-icon ---
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

    // --- Canonical URL ---
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = baseUrl;

    // --- JSON-LD structured data ---
    const jsonLd = seo.jsonLd;

    let scriptEl = document.querySelector("#schema-org-ld") as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement("script");
      scriptEl.id = "schema-org-ld";
      scriptEl.type = "application/ld+json";
      document.head.appendChild(scriptEl);
    }
    scriptEl.textContent = JSON.stringify(jsonLd);
  }, [property, subdomain]);

  return null;
}
