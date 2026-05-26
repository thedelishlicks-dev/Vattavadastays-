
# AGENTS.md
# VattavadaStays — Agent Instructions

Read this file fully before writing a single line of code.

---

## What this project is

VattavadaStays is a SaaS platform giving Vattavada (Kerala) homestay owners
their own standalone booking website.

- Guest side: Public booking website at {subdomain}.stayidom.in
- Owner side: Protected dashboard at /admin
- No platform payments: owners collect money directly (UPI, cash, bank transfer)

---

## Tech stack — do not deviate from this

| Layer | Tool | Notes |
|---|---|---|
| Framework | Vite + React + TypeScript | SPA — NOT SSR, NOT TanStack Start |
| Routing | TanStack Router 1.166.7 | File-based routing under src/routes/ |
| Styling | Tailwind CSS v4 | No CSS modules, no styled-components |
| Database | Supabase (PostgreSQL) | Schema already exists |
| Auth | Supabase Auth | Client-side, localStorage managed by Supabase SDK |
| Data fetching | TanStack Query v5 | useQuery + useMutation only |
| Hosting | Vercel (static SPA) | |

---

## CRITICAL — This is a Vite SPA, not TanStack Start SSR

These mistakes will break the build immediately:

- NEVER use createServerFn() — it does not exist in this project
- NEVER import from @tanstack/react-start — not installed
- NEVER import from @supabase/ssr — not installed  
- NEVER use createServerClient or createBrowserClient from @supabase/ssr
- NEVER write server-side loaders or beforeLoad auth guards
- NEVER use HTTP-only cookies for session management

The Supabase client is a standard browser singleton in src/lib/supabase.ts.
Auth state is managed client-side via onAuthStateChange.
All data fetching is done directly from the browser using the Supabase client.

---

## Supabase client pattern — always use this

```typescript
// src/lib/supabase.ts — single exported instance
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

Import `supabase` directly in server functions and hooks.
Never instantiate a new client anywhere else.

---

## Auth pattern — always use this

```typescript
// Client-side only, no cookies, no SSR
supabase.auth.signInWithPassword({ email, password })
supabase.auth.signOut()
supabase.auth.getSession()
supabase.auth.onAuthStateChange((event, session) => { ... })
```

useAuth() hook lives in src/hooks/useAuth.ts and uses
useState + useEffect with onAuthStateChange.

---

## Data fetching pattern — always use this

Direct Supabase queries wrapped in TanStack Query hooks:

```typescript
// In a hook — call supabase directly, no server functions
export function useProperty(subdomain: string) {
  return useQuery({
    queryKey: ['property', subdomain],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*, rooms(*)')
        .eq('subdomain', subdomain)
        .eq('is_active', true)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!subdomain,
  })
}
```

RLS policies enforce all security — owners only see their own data
because auth.uid() is checked automatically by Supabase.

---

## File structure

```
src/
  lib/
    supabase.ts     ← single supabase client instance
    auth.ts         ← signIn, signOut, getSession functions
    utils.ts        ← shadcn utility (do not modify)
  hooks/
    useAuth.ts      ← useState + onAuthStateChange
    useProperty.ts
    useRoom.ts
    useAvailability.ts
    useBookings.ts
    useCreateBooking.ts
    useOwnerProperty.ts
    use-mobile.tsx  ← original Lovable hook (do not modify)
  types/
    database.ts     ← Property, Room, Availability, Booking interfaces
  utils/
    env.ts          ← env var access
  routes/           ← TanStack Router file-based routes
  components/       ← UI components from Lovable (do not modify structure)
  data/             ← mock data (being replaced with real Supabase calls)
  assets/
```

---

## Database — already set up in Supabase

DO NOT recreate the schema. DO NOT run CREATE TABLE statements.

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
guest_count, check_in, check_out, nights (generated),
room_price, extra_guest_charge, total_amount,
status, payment_method, payment_reference, is_paid, created_at
```

Valid booking statuses: pending, confirmed, cancelled, completed

---

## RLS policies — already set up

- Public can read active properties and rooms (no auth needed)
- Public can read availability
- Anyone can INSERT a booking
- Owners can manage only their own data (owner_id = auth.uid())

---

## Package versions — do not change these

- @tanstack/react-router: 1.166.7 (pinned — do not upgrade)
- @tanstack/router-plugin: 1.166.7 (pinned — do not upgrade)
- @tanstack/react-query: ^5.83.0
- @supabase/supabase-js: ^2.105.3

Never install @tanstack/react-start or @supabase/ssr.
Never upgrade @tanstack packages without explicit instruction.

---

## Design system — do not change these values

| Token | Value |
|---|---|
| Primary green | #166534 |
| Light green | #dcfce7 |
| Accent amber | #f59e0b |
| Background | #fafaf9 (stone-50) |
| Text primary | #1c1917 (stone-900) |
| Text secondary | #78716c (stone-500) |

The frontend UI was built on Lovable.
Do not redesign, restyle, or restructure existing components.
Only replace mock data with real Supabase data and add missing logic.

---

## Environment variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Both must be set in Vercel project settings.
Never hardcode. Never commit .env files.

---

## CRITICAL: Sentinel Key Pattern in shared_amenities

`properties.shared_amenities` is a `text[]` column used for TWO purposes:
1. Real amenity tags like `"parking"`, `"wifi"`, `"bonfire"` — shown to guests
2. Sentinel keys prefixed with `__` — used to store config without new DB columns

**Sentinel keys currently in use:**

| Prefix | Stores | Used by |
|---|---|---|
| `__meals:` | JSON-encoded MealsConfig | admin.meals.tsx |
| `__cancel:` | Cancellation policy text | admin.policies.tsx |
| `__rules:` | House rules text | admin.policies.tsx |
| `__upi:` | UPI ID string | admin.payments.tsx |
| `__pmethods:` | JSON array of payment methods | admin.payments.tsx |

**CRITICAL rules for sentinel keys:**
- Always filter sentinels out before displaying amenities to guests: `.filter(a => !a.startsWith('__'))`
- Always preserve sentinels when saving amenities: keep `__` prefixed items, replace the rest
- Values are `encodeURIComponent(JSON.stringify(value))` encoded
- See `admin.amenities.tsx` for the exact preserve pattern

---

## /setup Route — Current Status & Workaround

**What works:**
- Token validation via `get_invite_by_token` RPC ✅
- Edge Function `create-owner` correctly creates user and links property ✅

**Known issue:**
- Auto-sign-in after account creation in `setup.tsx` fails with "Invalid credentials".

**Current workaround:**
- Redirect the owner to `/login` with their email pre-filled.
- Use `/login?email=xxx` to help the owner.

---

## Payment & Recording Logic

- **Part Payments**: The `advance_amount` in the `bookings` table stores the *cumulative* total paid so far.
- **Recording Payment**: When the owner records a new payment (instalment) in the admin dashboard, the frontend adds this new amount to the existing `advance_amount` and saves the result.
- **Payment Methods**: Supported methods are "UPI", "Bank Transfer", and "Cash on Arrival".
- **Notifications**: Guests are encouraged to notify the owner via a WhatsApp deep link after submitting a booking request. The owner can send payment reminders (asking for 25% advance if nothing paid, or the balance if part-paid) via WhatsApp deep links from the booking details.

---

## What is already done

- [x] Supabase project with schema, RLS, seed data
- [x] Vercel deployment working (Vite SPA)
- [x] Frontend UI (all pages, mobile-responsive)
- [x] src/lib/supabase.ts (browser client)
- [x] src/lib/auth.ts (client-side auth functions)
- [x] src/hooks/useAuth.ts (onAuthStateChange pattern)
- [x] TanStack Query hooks updated to query Supabase directly
- [x] All routes wired to real Supabase data
- [x] Admin dashboard protected with auth check
- [x] Booking form wired to createBooking mutation
- [x] Multi-tenant architecture with subdomain routing
- [x] Superadmin dashboard for property management
- [x] Cumulative part-payment recording logic
- [x] WhatsApp notification flow for guests and owners
- [x] vercel.json configured correctly
