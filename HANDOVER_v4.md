# stayidom.in — Session Handover v5

**Date:** June 2026
**Handover from:** Claude Sonnet (Anthropic)
**Branch:** main (active, deployed to Vercel)

---

## Project Summary

stayidom.in is a white-label, commission-free booking SaaS for Vattavada (Kerala) homestays.

- Guest side: `{subdomain}.stayidom.in` — public booking page
- Owner side: `/admin` — protected dashboard
- Superadmin side: `/superadmin` — platform management
- Stack: Vite + React + TypeScript + TanStack Router 1.166.7 + Supabase + Tailwind CSS v4
- Hosting: Vercel (static SPA)
- Repo: `github.com/thedelishlicks-dev/Vattavadastays-`

---

## Environment Variables (Vercel)

| Key                       | Value                                           |
| ------------------------- | ----------------------------------------------- |
| `VITE_SUPABASE_URL`       | `https://vzzfqgqxnodlrvnaxpbw.supabase.co`      |
| `VITE_SUPABASE_ANON_KEY`  | See Supabase → Settings → API Keys              |
| `VITE_PROPERTY_SUBDOMAIN` | `bleafmudhouse` (dev fallback)                  |
| `VITE_SUPERADMIN_EMAIL`   | Superadmin email address                        |

---

## Round 5 Changes — June 2026

### Fixed
- **Double-booking race condition** — availability trigger (`trg_booking_status_change`) auto-blocks dates when booking is confirmed and re-opens on cancel
- **Booking reference on success screen** — guest sees `#XXXXXXXX` ref after submitting, with copy button. Same ref in WhatsApp message to owner
- **Superadmin property management** — Manage button on each property row navigates to `/admin/dashboard?property={subdomain}`. Superadmin can set up rooms, availability, pricing for any property
- **Simplified onboarding** — removed /setup invite token flow. Now uses Supabase Auth invite email. Superadmin sets up property via Manage, then invites owner via Supabase dashboard
- **Demo property** — availability seeded for 1 year so demo.stayidom.in works for guests

### Attempted but reverted
- `create_booking_atomic` Postgres RPC — built, tested in SQL Editor, but Supabase Free tier PostgREST schema cache returns 404 on RPC calls. Reverted to direct insert in `useCreateBooking.ts`. Re-enable on Pro upgrade.

### Known issues carried forward
- `/setup` route still exists but is no longer used — safe to delete
- Supabase Free tier pauses after inactivity — first request after pause may be slow
- `create_booking_atomic` function exists in DB but is not called by the app

---

## Current Properties in Production

| Property          | Subdomain     | Status        |
| ----------------- | ------------- | ------------- |
| Bleaf Mud House   | bleafmudhouse | active        |
| Mist Valley       | demo          | trial (demo)  |
| MistyMountain     | mistymountain | pending       |
| Greenforest       | greenforest   | pending       |
| Green Valley      | greenvalley   | pending       |

---

## CRITICAL Architecture Rules — Do NOT Violate

- **NEVER** use `createServerFn()`, `@tanstack/react-start`, or `@supabase/ssr`
- **NEVER** add `shellComponent`, `HeadContent`, or `Scripts` to `__root.tsx`
- **NEVER** install `@tanstack/router-devtools`
- **NEVER** upgrade `@tanstack/react-router` — pinned at 1.166.7
- **NEVER** use Google Maps JS SDK — use `maps.google.com/?q=lat,lng` deep links only
- **NEVER** use video embeds — too heavy for Vattavada's 2G network
- Auth is client-side only via `supabase.auth` and `onAuthStateChange`
- Login is at `/login` (standalone, outside admin tree)
- All `<a>` tags in JSX must be on a single line — GitHub web editor corrupts multi-line JSX attributes
- For `?property=` param in admin routes: ALWAYS use `window.location.search` directly, NOT TanStack `useSearch` — it does not propagate to child routes

---

## Key Files

| File                                | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `src/routes/__root.tsx`             | Root — QueryClientProvider + Outlet only                         |
| `src/routes/index.tsx`              | Guest booking page                                               |
| `src/routes/login.tsx`              | Standalone login at `/login`                                     |
| `src/routes/setup.tsx`              | DEPRECATED — no longer used. Safe to delete.                     |
| `src/routes/admin.tsx`              | Auth guard — reads ?property= from window.location.search        |
| `src/routes/superadmin.tsx`         | Superadmin layout + auth guard                                   |
| `src/routes/superadmin.index.tsx`   | Superadmin dashboard — all properties + Manage button            |
| `src/admin/AdminLayout.tsx`         | Admin shell with sidebar                                         |
| `src/lib/supabase.ts`               | Single Supabase client instance                                  |
| `src/lib/subdomain.ts`              | `getSubdomain()` + `isSuperAdminEmail()`                         |
| `src/lib/whatsapp.ts`               | WhatsApp deep link helpers (wa.me only)                          |
| `src/hooks/useAuth.ts`              | `onAuthStateChange` pattern                                      |
| `src/hooks/useProperty.ts`          | Guest property + rooms query                                     |
| `src/hooks/useOwnerProperty.ts`     | Owner property query — fetches by subdomain when superadmin      |
| `src/hooks/useBookings.ts`          | Bookings query                                                   |
| `src/hooks/useCreateBooking.ts`     | Guest booking mutation — direct insert (no RPC)                  |
| `src/hooks/useSuperAdmin.ts`        | `useAllProperties`, `useCreateProperty`, `useUpdateSubscription` |
| `src/components/BookingForm.tsx`    | Guest booking form + booking reference + WhatsApp CTA            |
| `src/components/UPIPaymentSection.tsx` | UPI deep link + WhatsApp screenshot prompt                    |

---

## Database Schema

### properties

```
id, owner_id, name, name_ml, subdomain, area, location_lat, location_lng,
shared_amenities (text[]), description, description_ml, hero_image,
owner_name, owner_phone, owner_whatsapp, check_in_time, check_out_time,
is_active, subscription_status ('trial'|'active'|'suspended'),
subscription_end_date, created_at
```

### rooms

```
id, property_id, name, name_ml, room_type, max_guests, bed_type,
base_price, extra_guest_price, weekend_multiplier,
room_amenities (text[]), images (text[]), is_active, created_at
```

### bookings

```
id, property_id, room_id, guest_name, guest_phone, guest_email,
guest_count, check_in, check_out, nights (generated),
room_price, extra_guest_charge, total_amount, advance_amount,
status ('pending'|'confirmed'|'cancelled'|'completed'),
payment_method, payment_reference, is_paid, created_at
```

### availability

```
room_id, date, is_available, price_override, note
PRIMARY KEY (room_id, date)
```

### invite_tokens

```
id, token, email, property_id, used_at, expires_at, created_at
```

---

## Database Triggers

### trg_booking_status_change

Fires AFTER UPDATE of status on bookings table.

- Booking confirmed → upserts availability rows to is_available = false for all dates in range
- Booking cancelled/pending (from confirmed) → sets is_available = true for dates not covered by another confirmed booking

This is the primary double-booking protection. Do not remove.

---

## CRITICAL: Sentinel Key Pattern in shared_amenities

`properties.shared_amenities` is a `text[]` column used for TWO purposes:

1. Real amenity tags like `"parking"`, `"wifi"`, `"bonfire"` — shown to guests
2. Sentinel keys prefixed with `__` — used to store config without new DB columns

| Prefix        | Stores                        | Used by            |
| ------------- | ----------------------------- | ------------------ |
| `__meals:`    | JSON-encoded MealsConfig      | admin.meals.tsx    |
| `__cancel:`   | Cancellation policy text      | admin.policies.tsx |
| `__rules:`    | House rules text              | admin.policies.tsx |
| `__upi:`      | UPI ID string                 | admin.payments.tsx |
| `__pmethods:` | JSON array of payment methods | admin.payments.tsx |

**Rules:**
- Filter sentinels before showing to guests: `.filter(a => !a.startsWith('__'))`
- Preserve sentinels when saving amenities — never overwrite the whole array
- Values encoded: `encodeURIComponent(JSON.stringify(value))`

---

## Superadmin Flow

### Adding a new property

1. /superadmin → Add property (fills name, subdomain, owner details)
2. Click **Manage** on the new row → navigates to `/admin/dashboard?property={subdomain}`
3. Set up rooms, availability, pricing, UPI ID, policies
4. Supabase → Authentication → Users → **Invite user** → enter owner email
5. Owner receives email, sets password, logs in at stayidom.in/login
6. Back in /superadmin → click **Activate** once setup fee paid

### Manage button

- Navigates via `window.location.href = /admin/dashboard?property={subdomain}`
- `admin.tsx` reads property param from `window.location.search`
- `useOwnerProperty` detects superadmin mode and fetches by subdomain

---

## Supabase Functions (RPC)

### `create_property_with_invite` — still used by superadmin dashboard to create properties

### `create_booking_atomic` — EXISTS in DB but NOT CALLED by app

Was built to prevent double-booking race conditions atomically.
Removed from app due to Supabase Free tier PostgREST schema cache 404 issue.
The function is still in the DB. To re-enable:
1. Upgrade to Supabase Pro (prevents schema cache issues)
2. Update `useCreateBooking.ts` to call `supabase.rpc('create_booking_atomic', {...})`
3. Remove the direct insert + availability update code

### `get_invite_by_token` — still used by /setup (deprecated but functional)

---

## RLS Policies

| Table        | Policy                        | Rule                                                              |
| ------------ | ----------------------------- | ----------------------------------------------------------------- |
| properties   | public_read_active_properties | `is_active = true AND subscription_status IN ('trial', 'active')` |
| properties   | owners_manage_property        | `owner_id = auth.uid()`                                           |
| rooms        | public_read_active_rooms      | property must be active                                           |
| rooms        | owners_manage_rooms           | via property `owner_id = auth.uid()`                              |
| bookings     | public_insert_booking         | `WITH CHECK (true)`                                               |
| bookings     | owners_manage_bookings        | via property `owner_id = auth.uid()`                              |
| availability | public_read_availability      | `true`                                                            |
| availability | owners_manage_availability    | via rooms → property `owner_id = auth.uid()`                      |

---

## What Needs Doing Next

### High priority
- [ ] Payment guard — prevent owner recording more than total_amount
- [ ] First-time owner onboarding checklist (empty dashboard state)
- [ ] Confirm status change dialog on mobile (prevent accidental taps)

### Phase 2 — Guest Experience & SEO
- [ ] Static map image + directions deep links on guest page
- [ ] SEO meta tags + Open Graph per property
- [ ] `schema.org/LodgingBusiness` structured data JSON-LD
- [ ] PWA manifest + Service Worker (shell caching for 2G)
- [ ] Performance audit: guest page on simulated 2G

### Phase 3 — WhatsApp Business (Future)
- [ ] Meta Business verification
- [ ] WhatsApp Business API for server-initiated messages

### Phase 4 — Billing
- [ ] Trial → active flow UI
- [ ] Razorpay subscription API

### Phase 5 — Central Listing
- [ ] stayidom.in landing with property cards
- [ ] Filter by dates, guests, price

### Cleanup
- [ ] Delete /setup route (deprecated)
- [ ] Upgrade Supabase to Pro → re-enable create_booking_atomic RPC

---

## Known Issues / Watch Points

- `useOwnerProperty` queryKey is `['ownerProperty', user?.id, propertySubdomain]` — invalidation must use exact key
- GitHub web editor corrupts multi-line JSX `<a>` tag attributes — always single line
- `@tanstack/react-router` must stay at 1.166.7
- Supabase Free tier pauses after inactivity — cold start may cause first request to fail
- `shared_amenities` array contains sentinel keys — NEVER overwrite the whole array without preserving `__` prefixed items
- Superadmin `?property=` param must be read via `window.location.search`, NOT TanStack `useSearch`

---

## Network Reality

Vattavada has weak Jio and BSNL only. Every feature must pass:

- Guest page must load under 8 seconds on 2G
- No heavy JS SDKs on guest page
- Images via Supabase Storage with compression
- Native maps deep links only
- PWA shell caching after first load
- Admin uses optimistic updates

---

## Supabase Project Details

- Project URL: `https://vzzfqgqxnodlrvnaxpbw.supabase.co`
- Edge Function base URL: `https://vzzfqgqxnodlrvnaxpbw.supabase.co/functions/v1/`
- Deployed Edge Functions: `create-owner` (used by deprecated /setup only)
- pgcrypto extension: enabled
