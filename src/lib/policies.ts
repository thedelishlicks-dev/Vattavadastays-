// src/lib/policies.ts
//
// Reads the guest-facing policies that owners write in Property → Policies.
// They live in properties.shared_amenities as "__cancel:" / "__rules:"
// sentinels (value = encodeURIComponent(text)). Writes still go through
// propertyConfig.ts — this file is read-only.

export type GuestPolicies = {
  cancellation: string;
  rules: string;
};

function readSentinel(list: string[] | null | undefined, prefix: string): string {
  const entry = (list ?? []).find((a) => a.startsWith(prefix));
  if (!entry) return "";
  const raw = entry.slice(prefix.length);
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    // A malformed %-sequence must never crash the guest page.
    return raw.trim();
  }
}

export function extractPolicies(sharedAmenities: string[] | null | undefined): GuestPolicies {
  return {
    cancellation: readSentinel(sharedAmenities, "__cancel:"),
    rules: readSentinel(sharedAmenities, "__rules:"),
  };
}

export function hasPolicies(p: GuestPolicies): boolean {
  return p.cancellation.length > 0 || p.rules.length > 0;
}
