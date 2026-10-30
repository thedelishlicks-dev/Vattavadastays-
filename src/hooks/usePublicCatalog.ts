// Guest-side read of the owner's ACTIVE add-ons and packages (information only).
// Allowed for anonymous visitors by migration 20261029000000_public_read_catalog.sql.
// If that migration is not applied yet, or the request fails, the guest page simply shows
// no Packages section: this must never break booking.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { safeVariants } from "@/lib/guestCatalog";
import type { Addon, Package } from "@/lib/quotes";

export function usePublicCatalog(propertyId: string | undefined) {
  return useQuery({
    queryKey: ["public-catalog", propertyId ?? ""],
    enabled: !!propertyId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const [a, p] = await Promise.all([
        supabase.from("addons").select("id, name, category, unit, variants, is_active, sort_order").eq("property_id", propertyId as string).eq("is_active", true).order("sort_order", { ascending: true }),
        supabase.from("packages").select("id, name, description, unit, included, variants, is_active, sort_order").eq("property_id", propertyId as string).eq("is_active", true).order("sort_order", { ascending: true }),
      ]);
      if (a.error) throw a.error;
      if (p.error) throw p.error;
      const addons = (a.data ?? []).map((r) => ({ ...r, variants: safeVariants(r.variants), sort_order: Number(r.sort_order ?? 0) })) as Addon[];
      const packages = (p.data ?? []).map((r) => ({
        ...r,
        variants: safeVariants(r.variants),
        included: Array.isArray(r.included) ? r.included : [],
        sort_order: Number(r.sort_order ?? 0),
      })) as Package[];
      return { addons, packages };
    },
  });
}
