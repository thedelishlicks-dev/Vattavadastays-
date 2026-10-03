// src/lib/propertyConfig.ts
//
// Single save path for everything stored in properties.shared_amenities
// (the real amenity tags AND the "__prefix:" sentinel config entries —
// see "Sentinel Key Pattern" in HANDOVER.md).
//
// Why this exists: Meals, Policies, Amenities, Payment setup and the theme
// picker each used to build the new array from the *cached* property
// (React Query) and then overwrite the whole column. If an owner saved on
// one page and then another page was still holding an older copy, the
// second save could silently drop the first page's sentinels (e.g. the UPI
// ID). Re-reading the latest column value right before writing shrinks
// that window to a single round trip. It does not make the write atomic —
// two devices saving in the same second can still race — but it removes
// the realistic "stale cache" case.

import { supabase } from "@/lib/supabase";

/** Latest shared_amenities straight from the database (never the cache). */
export async function fetchSharedAmenities(propertyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("shared_amenities")
    .eq("id", propertyId)
    .single();
  if (error) throw error;
  return ((data as { shared_amenities: string[] | null } | null)?.shared_amenities ?? []) as string[];
}

/**
 * Replace (or remove, when value is null) one sentinel entry.
 * `prefix` includes the colon, e.g. "__upi:". Value must already be
 * URI-encoded by the caller, same as every other sentinel.
 */
export function withSentinel(current: string[], prefix: string, value: string | null): string[] {
  const kept = current.filter((a) => !a.startsWith(prefix));
  return value === null ? kept : [...kept, `${prefix}${value}`];
}

/**
 * Read-modify-write on shared_amenities using the latest stored value.
 * `extraColumns` lets a caller update other columns in the same request
 * (e.g. Policies also saves check_in_time / check_out_time).
 */
export async function updateSharedAmenities(
  propertyId: string,
  transform: (latest: string[]) => string[],
  extraColumns: Record<string, unknown> = {},
): Promise<string[]> {
  const latest = await fetchSharedAmenities(propertyId);
  const next = transform(latest);
  const { error } = await supabase
    .from("properties")
    .update({ ...extraColumns, shared_amenities: next })
    .eq("id", propertyId);
  if (error) throw error;
  return next;
}
