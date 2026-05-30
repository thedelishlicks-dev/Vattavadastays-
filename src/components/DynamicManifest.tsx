import { useEffect } from "react";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";

/**
 * Injects a property-aware PWA manifest at runtime.
 * This gives each owner's home screen icon their property name and logo.
 * Mounted once inside AdminLayout.
 */
export function DynamicManifest() {
  const { data: property } = useOwnerProperty();

  useEffect(() => {
    if (!property) return;

    const manifest = {
      name: property.name,
      short_name: property.name.length > 12
        ? property.name.slice(0, 12)
        : property.name,
      description: `Manage bookings for ${property.name}`,
      start_url: "/admin/dashboard",
      scope: "/admin",
      display: "standalone",
      orientation: "portrait",
      background_color: "#fafaf9",
      theme_color: "#166534",
      icons: property.logo_url
        ? [
            {
              src: property.logo_url,
              sizes: "any",
              type: "image/webp",
              purpose: "any maskable",
            },
          ]
        : [
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any maskable",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
    };

    // Inject as a blob URL so Safari picks it up dynamically
    const blob = new Blob([JSON.stringify(manifest)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [property]);

  return null;
}
