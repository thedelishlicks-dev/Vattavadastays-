# AGENTS.md
# VattavadaStays — Agent Instructions

This file is read by Jules and other AI coding agents before making any changes.
Read it fully before writing a single line of code.

---

## What this project is

VattavadaStays is a SaaS platform that gives Vattavada (Kerala) homestay owners
their own standalone booking website. Think Lodgify, simplified for single-property
family-run operations.

- **Guest side**: Public booking website at `{subdomain}.vattavadastays.com`
- **Owner side**: Protected dashboard at `/dashboard`
- **No platform payments**: owners collect money directly (UPI, cash, bank transfer)

---

## Tech stack — do not deviate from this

| Layer | Tool | Notes |
|---|---|---|
| Framework | TanStack Start (React + TypeScript) | NOT Next.js, NOT Vite-only |
| Styling | Tailwind CSS | No CSS modules, no styled-components |
| Database | Supabase (PostgreSQL) | Schema already exists — do not recreate |
| Auth | Supabase Auth | HTTP-only cookies, NOT localStorage |
| Data fetching | TanStack Query (@tanstack/react-query) | useQuery + useMutation only |
| Server functions | createServerFn() from @tanstack/react-start | NOT API routes, NOT tRPC |
| Hosting | Vercel (frontend) + Supabase (backend) | |
| Images | Supabase Storage or Cloudinary URLs | |

---

## Critical TanStack Start rules

These are the most common mistakes — read carefully.

**Supabase client**
- NEVER export a global Supabase singleton
- ALWAYS export a `createClient()` function — one instance per request
- Use `createBrowserClient` on the client, `createServerClient` on the server
- No `window`, `localStorage`, or `document` access at module level

**Auth**
- Session lives in HTTP-only cookies — never localStorage
- `getSession()` is a server function called in route loaders
- No React Context for auth state
- `useAuth()` hook uses `useQuery` to call `getSession()`

**Data fetching**
- Client components call hooks (`useQuery`, `useMutation`)
- Hooks call server functions (never raw Supabase from the client)
- Route loaders call server functions directly for SSR data
- No `src/services/` folder — server functions replace that pattern

**Routing**
- File-based routing under `src/routes/`
- `beforeLoad` for auth guards (not middleware)
- `redirect()` in loaders/actions (not `navigate()` in useEffect)

---

## Database — already set up in Supabase

**DO NOT recreate the schema. DO NOT run CREATE TABLE statements.**
The following tables exist and have RLS enabled:

### properties
```
id, owner_id, name, name_ml, subdomain, area, location_lat, location_lng,
shared_amenities (text[]), description, description_ml, hero_image,
owner_name, owner_phone, owner_whatsapp, check_in_time, check_out_time,
is_active, created_at
```

### rooms
```
id, property_id, name, name_ml, room_type, max_guests, bed_type,
base_price, extra_guest_price, weekend_multiplier,
room_amenities (text[]), images (text[]), is_active, created_at
```

### availability
```
room_id, date, is_available, price_override, note
PRIMARY KEY (room_id, date)
```

### bookings
```
id, property_id, room_id, guest_name, guest_phone, guest_email,
guest_count, check_in, check_out, nights (generated column),
room_price, extra_guest_charge, total_amount,
status, payment_method, payment_reference, is_paid, created_at
```

Valid booking statuses: `pending`, `confirmed`, `cancelled`, `completed`

### Seed data already present
- Property: **Rose Hill Homestay** (`subdomain: rosehill`, owner: Thomas Kurian)
- 3 rooms: Deluxe Room (₹2500), Family Cottage (₹3500), Standard Room (₹1800)
- 90 days of availability seeded

---

## RLS policies — already set up

- Public can read active properties and their rooms (no auth needed)
- Public can read availability
- Anyone can INSERT a booking (guest checkout flow)
- Owners can manage only their own property, rooms, availability, bookings
- Owner auth is enforced by `owner_id = auth.uid()`

---

## File structure conventions

```
src/
  lib/
    supabase.ts       ← createClient() function (SSR-safe)
    auth.ts           ← signIn, signOut, getSession server functions
  server/
    property.ts       ← public server functions (no auth)
    owner.ts          ← owner server functions (require auth)
  hooks/
    useAuth.ts
    useProperty.ts
    useRoom.ts
    useAvailability.ts
    useBookings.ts
    useCreateBooking.ts
    useOwnerProperty.ts
  types/
    database.ts       ← Property, Room, Availability, Booking interfaces
  utils/
    env.ts            ← validates env vars at runtime
  routes/
    __root.tsx        ← root layout, session loader
    index.tsx         ← marketing/landing
    login.tsx         ← owner login
    dashboard.tsx     ← owner dashboard home
    dashboard.bookings.tsx
    dashboard.calendar.tsx
    dashboard.settings.tsx
    $subdomain.tsx    ← guest property page
    $subdomain.room.$roomId.tsx
    $subdomain.book.tsx
  components/
    AuthGuard.tsx
    ErrorBoundary.tsx
    NotFound.tsx
```

---

## Design system — do not change these values

| Token | Value |
|---|---|
| Primary green | `#166534` |
| Light green | `#dcfce7` |
| Accent amber | `#f59e0b` |
| Background | `#fafaf9` (stone-50) |
| Text primary | `#1c1917` (stone-900) |
| Text secondary | `#78716c` (stone-500) |
| Font | Inter (EN), Noto Sans Malayalam (ML) |
| Border radius | 12px cards, 9999px buttons |

The frontend UI was built on Lovable and pushed to this repo.
**Do not redesign, restyle, or restructure existing components.**
Only replace mock data with real data and add missing logic.

---

## Environment variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Both are required. `src/utils/env.ts` throws a clear error if either is missing.
Never hardcode these values. Never commit `.env` files.

---

## What is already done — do not redo these

- [x] Supabase project created and connected
- [x] Database schema (`properties`, `rooms`, `availability`, `bookings`)
- [x] RLS policies on all tables
- [x] Seed data (Rose Hill Homestay + 3 rooms + 90 days availability)
- [x] Frontend UI built in Lovable (all pages, mobile-responsive)
- [x] GitHub repo connected to Vercel
- [x] Vercel deployment working

---

## What still needs to be built

- [ ] Supabase client setup (src/lib/supabase.ts)
- [ ] Environment validation (src/utils/env.ts)
- [ ] Public server functions (src/server/property.ts)
- [ ] Owner server functions (src/server/owner.ts)
- [ ] Auth flow (src/lib/auth.ts, login route)
- [ ] TanStack Query hooks
- [ ] Route loaders wired to real data
- [ ] Error boundary + not found components
- [ ] Deployment documentation

---

## When in doubt

- Check this file first
- Use exact column names from the database section above
- If a pattern isn't listed here, ask before inventing one
- Never install new dependencies without checking if something in the stack already covers it