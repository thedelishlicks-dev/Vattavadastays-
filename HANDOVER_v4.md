# stayidom.in — Session Handover v4

**Date:** May 2026
**Handover from:** Claude Sonnet (Anthropic)
**Handover to:** Minimax Agent
**Branch:** main (active, deployed to Vercel)

---

## Project Summary

stayidom.in is a white-label, commission-free booking SaaS for Vattavada (Kerala) homestays.

- Guest side: `{subdomain}.stayidom.in` — public booking page
- Owner side: `/admin` — protected dashboard
- Superadmin side: `/superadmin` — platform management
- Stack: Vite + React + TypeScript + TanStack Router 1.166.7 + Supabase + Tailwind CSS v4
- Hosting: Vercel (static SPA) — production URL: `stayidom.vercel.app`
- Repo: `github.com/thedelishlicks-dev/Vattavadastays-`
- Domain: NOT purchased yet — all links use `stayidom.vercel.app`

---

## Environment Variables (Vercel)

| Key                       | Value                                          |
| ------------------------- | ---------------------------------------------- |
| `VITE_SUPABASE_URL`       | `https://vzzfqgqxnodlrvnaxpbw.supabase.co`     |
| `VITE_SUPABASE_ANON_KEY`  | Legacy anon key from Supabase → Settings → API |
| `VITE_PROPERTY_SUBDOMAIN` | `bleafmudhouse` (dev fallback)                 |
| `VITE_SUPERADMIN_EMAIL`   | Superadmin email address                       |

---

## CRITICAL Architecture Rules — Do NOT Violate

- **NEVER** use `createServerFn()`, `@tanstack/react-start`, or `@supabase/ssr`
- **NEVER** add `shellComponent`, `HeadContent`, or `Scripts` to `__root.tsx`
- **NEVER** install `@tanstack/router-devtools`
- **NEVER** upgrade `@tanstack/react-router` — pinned at 1.166.7
- **NEVER** use Google Maps JS SDK — use `maps.google.com/?q=lat,lng` deep links only
- **NEVER** use video embeds — too heavy for Vattavada's 2G network
- **NEVER** use `localStorage` or `sessionStorage` in artifacts
- Auth is client-side only via `supabase.auth` and `onAuthStateChange`
- Login is at `/login` (standalone, outside admin tree)
- `src/routes/__root.tsx` renders NO html/body tags — QueryClientProvider + Outlet + CSS import only
- All `<a>` tags in JSX must be on a single line — GitHub web editor corrupts multi-line JSX attributes
- Always commit to `main` branch — Vercel deploys from main

---

## Current Properties in Production

| Property        | Subdomain     | Owner Email               | Status |
| --------------- | ------------- | ------------------------- | ------ |
| Bleaf Mud House | bleafmudhouse | (superadmin knows)        | active |
| Green Valley    | greenvalley   | vitalminded2025@gmail.com | trial  |

---

## Key Files

| File                                | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `src/routes/__root.tsx`             | Root — QueryClientProvider + Outlet only                         |
| `src/routes/index.tsx`              | Guest booking page                                               |
| `src/routes/login.tsx`              | Standalone login at `/login`                                     |
| `src/routes/setup.tsx`              | Owner onboarding via invite token                                |
| `src/routes/admin.tsx`              | Auth guard — redirects to `/login` or `/superadmin`              |
| `src/routes/superadmin.tsx`         | Superadmin layout + auth guard                                   |
| `src/routes/superadmin.index.tsx`   | Superadmin dashboard — all properties                            |
| `src/admin/AdminLayout.tsx`         | Admin shell with sidebar                                         |
| `src/lib/supabase.ts`               | Single Supabase client instance                                  |
| `src/lib/subdomain.ts`              | `getSubdomain()` + `isSuperAdminEmail()`                         |
| `src/lib/whatsapp.ts`               | WhatsApp deep link helpers (wa.me only)                          |
| `src/hooks/useAuth.ts`              | `onAuthStateChange` pattern                                      |
| `src/hooks/useProperty.ts`          | Guest property + rooms query                                     |
| `src/hooks/useOwnerProperty.ts`     | Owner property query — queryKey: `['ownerProperty', user?.id]`   |
| `src/hooks/useBookings.ts`          | Bookings query                                                   |
| `src/hooks/useCreateBooking.ts`     | Guest booking mutation                                           |
| `src/hooks/useSuperAdmin.ts`        | `useAllProperties`, `useCreateProperty`, `useUpdateSubscription` |
| `src/hooks/useAvailabilityRange.ts` | Calendar availability query                                      |
| `src/components/BookingForm.tsx`    | Guest booking form + WhatsApp CTA                                |
| `src/components/Footer.tsx`         | Real property data — phone, WhatsApp, maps                       |
| `src/routes/admin.rooms.tsx`        | Add/edit rooms (drawer)                                          |
| `src/routes/admin.bookings.tsx`     | Bookings table + add booking modal + WhatsApp templates          |
| `src/routes/admin.dashboard.tsx`    | Dashboard with real stats + room names                           |
| `src/routes/admin.settings.tsx`     | Property settings — invalidates `['ownerProperty']`              |
| `src/routes/admin.calendar.tsx`     | Availability calendar per room                                   |
| `src/routes/admin.pricing.tsx`      | Per-room pricing editor (drawer)                                 |
| `src/routes/admin.meals.tsx`        | Meal packages + breakfast config                                 |
| `src/routes/admin.amenities.tsx`    | Property + room amenities editor                                 |
| `src/routes/admin.policies.tsx`     | Check-in/out times, cancellation, house rules                    |
| `src/routes/admin.payments.tsx`     | UPI config, outstanding payments, mark paid                      |

---

## Database Schema

### properties

```
id, owner_id, name, name_ml, subdomain, area, location_lat, location_lng,
shared_amenities (text[]), description, description_ml, hero_image,
owner_name, owner_phone, owner_whatsapp, check_in_time, check_out_time,
is_active, subscription_status ('trial'|'active'|'suspended'),
subscription_end_date, landmark_description, static_map_image_url, created_at
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
room_price, extra_guest_charge, total_amount,
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

## CRITICAL: Sentinel Key Pattern in shared_amenities

`properties.shared_amenities` is a `text[]` column used for TWO purposes:

1. Real amenity tags like `"parking"`, `"wifi"`, `"bonfire"` — shown to guests
2. Sentinel keys prefixed with `__` — used to store config without new DB columns

**Sentinel keys currently in use:**

| Prefix        | Stores                        | Used by            |
| ------------- | ----------------------------- | ------------------ |
| `__meals:`    | JSON-encoded MealsConfig      | admin.meals.tsx    |
| `__cancel:`   | Cancellation policy text      | admin.policies.tsx |
| `__rules:`    | House rules text              | admin.policies.tsx |
| `__upi:`      | UPI ID string                 | admin.payments.tsx |
| `__pmethods:` | JSON array of payment methods | admin.payments.tsx |

**CRITICAL rules for sentinel keys:**

- Always filter sentinels out before displaying amenities to guests: `.filter(a => !a.startsWith('__'))`
- Always preserve sentinels when saving amenities: keep `__` prefixed items, replace the rest
- Values are `encodeURIComponent(JSON.stringify(value))` encoded
- See `admin.amenities.tsx` for the exact preserve pattern

---

## Supabase Functions (RPC)

### `create_property_with_invite(p_name, p_subdomain, p_owner_email, p_area, p_owner_name, p_owner_phone)`

- Creates property with `subscription_status = 'trial'`
- Generates invite token
- Returns: `{ property_id, subdomain, invite_token, invite_link, expires_at }`
- invite_link points to `stayidom.vercel.app/setup?token=xxx`
- **When domain is purchased:** update this function's invite_link to use the real domain

### `get_invite_by_token(p_token TEXT)`

- Returns: `{ email, property_name, property_id, used_at, expires_at }`
- Callable by `anon` role (unauthenticated)
- Returns a TABLE — comes back as array in JS, always use `data[0]`

### `get_invite_by_token` JS usage pattern:

```typescript
const { data } = await supabase.rpc("get_invite_by_token", { p_token: token });
const row = Array.isArray(data) ? data[0] : data; // ALWAYS do this
```

### `consume_invite_token(p_token TEXT)` — marks token used_at

### `create_owner_auth_user(p_email, p_password, p_property_id, p_token)` — SQL only, has issues (see below)

---

## Edge Function

### `create-owner`

- URL: `https://vzzfqgqxnodlrvnaxpbw.supabase.co/functions/v1/create-owner`
- JWT verification: **OFF** (unauthenticated callers need access)
- Uses service role to call `supabase.auth.admin.createUser()`
- Creates auth user + marks token used + links property owner_id
- Called from `setup.tsx` handleSetPassword

---

## /setup Route — Current Status & Known Issue

**What works:**

- Token validation via `get_invite_by_token` RPC ✅
- Displays owner email and property name correctly ✅
- Edge Function creates the auth user correctly ✅
- Property gets linked to owner_id correctly ✅
- Token gets marked as used ✅

**What is broken:**

- `supabase.auth.signInWithPassword()` returns "Invalid login credentials" immediately after `create-owner` Edge Function creates the user
- Root cause: Unknown — user exists, identity exists, email confirmed, but sign-in fails
- Suspected cause: Supabase free tier may have a propagation delay between admin user creation and sign-in availability

**Current workaround for onboarding new owners:**

1. Superadmin creates property via superadmin dashboard
2. Superadmin goes to Supabase → Authentication → Users → Add user → Create new user (with Auto Confirm checked)
3. Run SQL to link property: `UPDATE properties SET owner_id = (SELECT id FROM auth.users WHERE email = 'owner@email.com') WHERE subdomain = 'propertysubdomain';`
4. Share login URL and credentials with owner via WhatsApp: `stayidom.vercel.app/login`

**Fix needed:**

- Option A: Add a retry loop in `setup.tsx` — wait 2 seconds then retry `signInWithPassword`
- Option B: After Edge Function call, redirect to `/login` with email pre-filled instead of auto-signing in
- Option B is cleaner — just show a success screen and tell owner to log in with their new password

---

## RLS Policies (8 active)

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

## Completed Phases

### Phase 0 ✅

- Guest booking form end-to-end
- WhatsApp CTA on booking confirmation
- "Book via WhatsApp" button on guest page
- WhatsApp message templates in admin booking row (confirm, directions, payment reminder, day-before)
- Footer with real property data (phone, WhatsApp, Google Maps deep link)
- Add/edit rooms (drawer)
- Add booking from admin (modal with live price calc)
- Confirm/cancel booking status buttons
- Room name shown on dashboard
- Settings cache key fix

### Phase 1 ✅

- SQL migrations (property_id on all tables, RLS policies)
- `subscription_status` field on properties
- `invite_tokens` table
- `create_property_with_invite` DB function
- Dynamic subdomain detection (`src/lib/subdomain.ts`)
- Superadmin dashboard (all properties, stats, add property, invite link)
- Admin redirect for superadmin users
- Pricing page — per-room editor with live preview
- Meals page — breakfast toggle + meal packages
- Amenities page — property-wide toggle grid + room summary
- Policies page — check-in/out times, cancellation presets, house rules
- Payments page — UPI config, outstanding payments, mark paid
- `/setup` route — owner onboarding (partial — sign-in step broken, workaround in place)
- `create-owner` Edge Function deployed

---

## What Needs Doing Next

### Fix /setup sign-in (Priority 1 — small fix)

- Change `setup.tsx` to redirect to `/login` after Edge Function succeeds instead of auto sign-in
- Show success message: "Account created! Please log in with your new password."
- Pre-fill email on the login page via URL param: `/login?email=xxx`

### Phase 2 — Guest Experience & SEO

- [ ] Static map image + directions deep links on guest page (no Google Maps JS SDK)
- [ ] SEO meta tags + Open Graph per property (`<title>`, `<meta description>`, `og:image`)
- [ ] `schema.org/LodgingBusiness` structured data JSON-LD per property
- [ ] PWA manifest + Service Worker (shell caching for 2G users)
- [ ] Performance audit: guest page on simulated 2G
- [ ] Superadmin "Resend invite" button for existing properties

### Phase 3 — WhatsApp Business (Future)

- [ ] Meta Business verification
- [ ] WhatsApp Business API for server-initiated messages
- [ ] Automated booking confirmations

### Phase 4 — Billing

- [ ] Trial → active flow UI
- [ ] Razorpay subscription API (V2)

### Phase 5 — Central Listing Page

- [ ] `stayidom.in` landing with property cards
- [ ] Filter by dates, guests, price

### Domain (When purchased)

- Buy `stayidom.in` (or `.in`)
- Add to Vercel → Domains → add `stayidom.in` + `*.stayidom.in`
- Update `src/lib/subdomain.ts` — already handles `.stayidom.in` subdomains
- Update `create_property_with_invite` SQL function — change invite_link domain
- Add production URL to Supabase Auth → URL Configuration → allowed redirect URLs

---

## Known Issues / Watch Points

- `useOwnerProperty` queryKey is `['ownerProperty', user?.id]` — any invalidation must use this exact key
- GitHub web editor corrupts multi-line JSX `<a>` tag attributes — always single line
- `@tanstack/react-router` must stay at 1.166.7
- No Google Maps JS SDK — use deep links only
- No video embeds
- Superadmin user must be a separate Supabase auth user with no property linked
- `shared_amenities` array contains sentinel keys — NEVER overwrite the whole array without preserving `__` prefixed items
- `get_invite_by_token` returns an array — always use `data[0]`
- `create_owner_auth_user` SQL function exists but has sign-in issues — use Edge Function instead
- Green Valley property owner was manually created — setup flow auto-sign-in is not working yet

---

## Network Reality (Critical for all feature decisions)

Vattavada has weak Jio and BSNL only. Every feature must pass:

- Guest page must load under 8 seconds on 2G
- No heavy JS SDKs on guest page
- Images via Supabase Storage with compression
- Native maps deep links only
- PWA shell caching after first load
- Admin uses optimistic updates

---

## Guidance for Minimax Agent

### How to work on this project

1. Always read the file before editing — don't guess at existing code
2. Check `HANDOVER_v4.md` before starting any task
3. Run the dev server and check for TypeScript errors after changes
4. Test on mobile viewport — most owners use phones
5. Commit to `main` branch — Vercel auto-deploys

### Suggested first task

Fix `/setup` sign-in — change `setup.tsx` so that after the Edge Function succeeds, instead of calling `signInWithPassword`, it shows a success screen and redirects to `/login?email=xxx`. Update `login.tsx` to pre-fill email from URL params.

### File editing pattern (from admin.rooms.tsx — use as reference)

- Drawer pattern for edit forms (right-side slide-in panel)
- `inputCls` and `labelCls` constants for consistent form styling
- Direct `supabase` calls (no server functions)
- `queryClient.invalidateQueries({ queryKey: ['ownerProperty', user?.id] })` after property updates
- `queryClient.invalidateQueries({ queryKey: ['bookings', property?.id] })` after booking updates

### Supabase client usage

```typescript
import { supabase } from "@/lib/supabase";
// Direct table operations
const { data, error } = await supabase.from("rooms").select("*").eq("property_id", id);
// RPC
const { data } = await supabase.rpc("function_name", { param: value });
// Remember: RPC returning TABLE comes back as array — use data[0]
```

### Adding a new admin route

1. Create `src/routes/admin.{name}.tsx`
2. Export `Route = createFileRoute('/admin/{name}')({ component: YourComponent })`
3. Add to `NAV` array in `src/admin/AdminLayout.tsx`
4. TanStack Router auto-discovers routes — no manual registration needed

---

## Supabase Project Details

- Project URL: `https://vzzfqgqxnodlrvnaxpbw.supabase.co`
- Edge Function base URL: `https://vzzfqgqxnodlrvnaxpbw.supabase.co/functions/v1/`
- Deployed Edge Functions: `create-owner`
- pgcrypto extension: enabled (needed for password hashing in SQL functions)
