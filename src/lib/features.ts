// src/lib/features.ts — switches for features that are built but not offered yet.

/**
 * Channel sync (iCal import/export with Booking.com, Airbnb, Agoda …).
 *
 * PARKED: today's owners take bookings from Instagram and phone calls, so the
 * "Sync with other sites" button would only add noise. Switch to `true` when
 * extending to areas where owners also sell on those sites (Munnar, Alleppey,
 * Varkala). Then follow docs/PARKED_FEATURES.md (background sync + checks).
 *
 * `false` hides the Calendar button and pop-up AND stops the app from
 * querying or auto-syncing feeds. Nothing is deleted: the tables, the
 * /api/ical endpoints and all code stay in place.
 */
export const CHANNEL_SYNC_ENABLED = false;
