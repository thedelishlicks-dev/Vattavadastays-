# Guest page — how it works (3 Nov 2026)

The page guests see at `{subdomain}.stayidom.in` (`GuestPage` in `src/routes/index.tsx`). This is the one place that describes it end to end; `HANDOVER.md` §3 has the rules, §9 the change log.

## 1. Page order

Hero → About → Amenities → Gallery → **Dates and guests** → **Rooms** → **Your details** (booking form) → Packages → Map → Footer.

Details and pictures first, then the three booking steps. The hero's "Check Availability" button jumps straight to the dates. The header menu follows the same order; "Gallery" appears only when the owner has uploaded photos. Sections with nothing to show (no gallery photos, no active packages, no location) are hidden, never shown empty.

## 2. The booking flow

| Step | Component | What the guest does |
|---|---|---|
| 1. Dates and guests | `Availability.tsx` | Picks check-in and check-out, sets adults and children (default 2 adults), taps **See available rooms** |
| 2. Rooms | `Rooms.tsx`, `CartBar.tsx` | Sees only rooms free for those dates, taps **Add** on each. Details sit behind "Room details". A bottom bar shows rooms, guests placed and the total |
| 3. Your details | `BookingForm.tsx` | Sees a short summary with Change links, enters name and phone, sends the request |

State lives in `GuestPage`: `checkIn`, `checkOut`, `party` (adults, children), `selectedIds` (room ids) and `pinned` (rooms whose guests the guest set by hand). The booking lines are **derived** from those (`allocateGuests` then `buildBookingDetails`), never stored separately.

- **Changing dates** keeps the chosen rooms and re-prices them. Rooms that are no longer free are removed once the new availability has arrived, with a message.
- **Changing the guest count** clears hand-set room splits.
- **Free rooms** come from `useUnavailableRoomIds` (via `getBlockedDatesForRooms`, so guests never read `bookings`).
- The booking can't be sent while some guests have no room, or a room has no adult (`problem` in `GuestPage`).

## 3. Sharing guests over rooms (`src/lib/partyAllocation.ts`, pure and tested)

- `allocateGuests(rooms, party, pinned)`: one adult in each room first, then the remaining adults, then children. Each guest goes where most **included** places are left; once every room is full to its included number, to the room with the cheapest extra-guest price. Nobody goes over a room's limit.
- `suggestOptions(rooms, party, priceOf)`: prices every set of rooms that can hold the group (a room needs an adult) using the real stay total, and returns **Best value** (cheapest) and **More space** (cheapest with fewer extra guests, if one exists). The options box shows only when no single room covers the group inside its included guests.
- `priceOf` is `buildBookingDetails(...).total`, so weekend and seasonal rates are included. Do not price options from `base_price`.

## 4. Guest limit per room

`rooms.max_guests` is the number of guests **included** in the nightly price. `rooms.max_occupancy` is the most the room can hold with extra beds; empty means `max_guests + 4`.

`maxGuestsFor(included, maxOccupancy)` in `src/lib/guestCount.ts` is the single definition. It is used by the steppers, the allocation, `useCreateBooking` and the database trigger `enforce_guest_booking_terms` (migration `20261101000000`), which refuses a guest booking above the limit. Owner-created bookings are not limited. The owner sets it in Rooms & Pricing → room editor → "Most guests allowed" (1 to 30, not below the included guests).

## 5. Photos

| What | Limit | Sizes | Where the owner sets it |
|---|---|---|---|
| Property gallery | 12 (`MAX_GALLERY_PHOTOS`) | ≤ 140 KB photo + ≤ 30 KB thumbnail (`…-t.webp` beside it, see `thumbUrl`) | Settings → Photos → Gallery (`GalleryManager`) |
| Room photos | 6 per room (`MAX_ROOM_PHOTOS`; database allows 8) | 800 px preset, no thumbnail | Rooms & Pricing → room editor (`RoomPhotosManager`) |
| Instagram | one handle | link only | Settings → Photos → Instagram (`InstagramField`) |

- The gallery grid loads thumbnails lazily (the large first tile uses its full photo); the other full photos load only when a guest opens the viewer.
- A room card shows the first photo. Rooms with several get arrows, dots, a "1 / N" pill and swipe; tapping opens the full-screen viewer at the current photo. The next photo is fetched only once the guest starts browsing.
- One shared viewer: `PhotoViewer.tsx` (swipe, arrow keys, Esc).
- Gallery changes save immediately (they do not wait for the Save button).
- **No reels or other embeds.** They add third-party scripts, cookies and layout shifts on weak connections (HANDOVER §3). The Instagram button is a link-out.

## 6. Hero: live date, time and temperature

- Date and time are shown in **India time** (`liveInfo.ts`), refreshed every 30 s (`useNow`).
- Temperature is the next-24-hour low–high from `/api/weather` (`api/weather.ts`, `api/_lib/forecast.ts`), which calls **MET Norway** Locationforecast. Free, CC BY 4.0, commercial use allowed **with credit**; the footer shows "Weather data from MET Norway" whenever a temperature is shown.
- The server route sets an identifying User-Agent (`WEATHER_USER_AGENT`, optional), rounds coordinates to 2 decimals and caches for an hour at the edge. The browser never calls MET Norway.
- It is a forecast for a point about 1 km wide, not a measurement. Without a location pair, or if the call fails, only the date and time show; a number is never invented.
- The free Open-Meteo tier was rejected: it is for non-commercial use only.

## 7. Directions and location

A map location is a **pair**: latitude and longitude. `src/lib/location.ts` is the only place that builds maps links.

- Both numbers set: links go to the exact spot.
- One or none: the "Open in Maps" cards are hidden, and the SMS Directions message carries a Google Maps **search** for the property's name and area, so it always has a working link.
- Settings refuses to save one coordinate without the other, checks the numbers and range, and fills both boxes when "10.0889, 77.0595" is pasted into Latitude.

## 8. Packages and add-ons (information only)

Active add-ons and packages are readable by guests (policies `addons_public_read` and `packages_public_read`, migration `20261029000000`; the property must be in trial or active). The section lists packages with what they include and a "from" price, then add-ons by category. The guest ticks items and sends **one** WhatsApp enquiry (`catalogEnquiryLink`) that also carries dates, guests and rooms if already chosen. Nothing is booked or charged online; the owner adds extras to the booking afterwards (`CatalogExtrasPicker`). The section is hidden if nothing is active or the catalogue can't be read.

## 9. Migrations (run by hand, in this order)

| File | What it does |
|---|---|
| `20261029000000_public_read_catalog.sql` | Guests can read active add-ons and packages |
| `20261030000000_property_gallery_instagram.sql` | `properties.gallery_images` (max 12), `properties.instagram_handle` |
| `20261031000000_room_photos_limit.sql` | `rooms.images` at most 8 |
| `20261101000000_room_max_occupancy.sql` | `rooms.max_occupancy` and the guest-limit check in `enforce_guest_booking_terms` |

All are safe to run twice. The repo cannot tell which have been applied to the live database; check with:

```sql
-- gallery + Instagram (expect 2 rows)
select column_name from information_schema.columns
where table_name = 'properties' and column_name in ('gallery_images', 'instagram_handle');

-- room limit column (expect 1 row) and the trigger check (expect true)
select column_name from information_schema.columns where table_name = 'rooms' and column_name = 'max_occupancy';
select pg_get_functiondef('public.enforce_guest_booking_terms'::regproc) like '%max_occupancy%' as limit_check_installed;

-- guest read of add-ons and packages (expect 2 rows)
select tablename, policyname from pg_policies where policyname in ('addons_public_read', 'packages_public_read');

-- properties saved with only one coordinate (should be empty; fix in Settings → Location)
select subdomain, name, location_lat, location_lng from properties where (location_lat is null) <> (location_lng is null);
```

Code is safe to deploy before the migrations: the gallery, Instagram button, packages and room limit simply stay off, and bookings and room saves keep working.

## 10. How to test it by hand

1. **Phone, throttled to slow 3G:** the page loads, the gallery shows thumbnails only until a photo is opened, and the viewer swipes.
2. **Group of 6** with a 4-guest and a 2-guest room: the options box shows real totals; each "Use this" fills the bar; the booking can be sent.
3. **Limit:** set "Most guests allowed" to 5 on a room; the guest steppers stop at 5 and a hand-made insert above it is refused.
4. **Weather:** open `/api/weather?lat=<lat>&lng=<lng>` on the preview. Expect `"available":true` with `min` and `max`; the hero shows the range and the footer shows the credit.
5. **Directions:** with both coordinates the SMS has the exact link; clear one in Settings (it refuses to save), and on an old row the SMS carries the search link.
6. **Packages:** tick two items, tap **Send enquiry**: one WhatsApp message lists both and the dates.
7. Test as a guest in a private tab (a signed-in owner can read rows a guest can't).
