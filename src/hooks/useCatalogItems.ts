import { useMemo } from "react";
import { useAddons, usePackages, useSeasons } from "./useCatalog";
import { buildCatalog } from "../lib/catalogExtras";

/**
 * The property's add-ons and packages that can be picked as booking extras, plus the seasons
 * needed to price them. Used by the Add Booking modal and the booking's Extras tab, so both
 * offer exactly what the Quote Builder offers. Reads only; owners (signed in) can see the catalog.
 */
export function useCatalogItems(propertyId: string) {
  const addons = useAddons(propertyId);
  const packages = usePackages(propertyId);
  const seasons = useSeasons(propertyId);
  const items = useMemo(
    () => buildCatalog(addons.data ?? [], packages.data ?? []),
    [addons.data, packages.data],
  );
  return {
    items,
    seasons: seasons.data ?? [],
    isLoading: addons.isLoading || packages.isLoading || seasons.isLoading,
    /** False while loading, and when the owner has not set up any priced add-on or package. */
    hasCatalog: items.length > 0,
  };
}
