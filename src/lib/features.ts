// src/lib/features.ts — switches for features that are built but not offered everywhere.

/**
 * Channel sync (iCal import/export with Booking.com, Airbnb, Agoda …).
 *
 * MASTER switch: `false` hides the feature for EVERY property and stops the app from
 * querying or auto-syncing feeds (nothing is deleted; tables and /api/ical* stay).
 *
 * `true` does NOT show it to anyone by itself: a property gets the "Sync with other
 * sites" button only when the platform admin has switched it on for that property
 * (Superadmin → Manage → "Sync with other sites"; column properties.channel_sync_enabled).
 * The sync endpoint and the database enforce the same switch.
 * Steps for a new property: docs/PARKED_FEATURES.md.
 */
export const CHANNEL_SYNC_ENABLED = true;

/** Show channel sync for this property? Master switch AND the property's own switch. */
export function channelSyncOn(
  property: { channel_sync_enabled?: boolean | null } | null | undefined,
): boolean {
  return CHANNEL_SYNC_ENABLED && property?.channel_sync_enabled === true;
}
