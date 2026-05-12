# VattavadaStays — Product Requirements Document v1.1
**Last updated:** May 2026  
**Author:** VattavadaStays Team  
**Status:** Active — Dev branch in progress

---

## 1. Vision & Goals

**Vision**: A white-label, commission-free booking engine for Vattavada homestays — built for India's rural connectivity reality, not city assumptions.

**What this is**: Each property gets their own branded booking website. No marketplace, no commissions, no OYO dependency.

**What this is not** (V1): Not a listing page. Not a marketplace. Not a booking aggregator.

**Success Metrics (V1)**:
- 5+ properties onboarded within 3 months of launch
- Each property live at `{slug}.vattavadastays.com` within 10 minutes of setup
- Guest booking flow completes on 2G (BSNL/Jio weak signal)
- Zero data leaks between properties (RLS audit passed)
- Owner can manage bookings entirely from mobile on slow connection

---

## 2. User Personas

### Property Owner (Primary)
- Small homestay in Vattavada, 2–10 rooms
- Uses WhatsApp daily, comfortable with basic Android
- Pain: OYO/Booking.com take 15–25% per booking
- Need: Own booking page, shared via Instagram/WhatsApp, managed from phone
- Network: Weak Jio or BSNL at property location

### Guest (End User)
- Domestic traveler from Kerala, Karnataka, Tamil Nadu
- Discovers property via Instagram, WhatsApp forward, or Google search
- Books before leaving home (while on good network)
- Arrives at Vattavada with weak/no signal
- Need: Directions that work offline, booking confirmation on WhatsApp

### Superadmin (Platform Owner — You)
- Onboards properties manually
- Monitors all subscriptions and health
- Single point of support

---

## 3. Network & Performance Constraints

**This is the most important section. Every technical decision must pass this test.**

Vattavada has Jio and BSNL only, with weak signal. Guests travel from cities and arrive with whatever data they had on the road.

### Rules for every feature built:
- **Page load budget**: Full guest booking page must load in under 8 seconds on 2G (simulate with Chrome DevTools → Slow 3G)
- **No heavy dependencies**: No Google Maps JS SDK on guest page (too heavy). Use static map image + Apple/Google Maps deep link instead
- **Images**: All property/room images served via Supabase Storage with auto-compression. Never raw uploads
- **Offline directions**: Guest receives a WhatsApp message with a Google Maps deep link (`maps.google.com/?q=lat,lng`) — this link opens native maps app which works with cached/downloaded maps
- **PWA caching**: Guest booking page is a Progressive Web App — shell, property info, and room list cached after first load via Service Worker
- **Admin on slow network**: Admin dashboard uses optimistic updates (TanStack Query) — actions feel instant even on 2G, sync happens in background
- **No video**: No video embeds anywhere in V1
- **Font loading**: System fonts only on guest page — no Google Fonts import

---

## 4. Functional Requirements

### 4.1 Guest Booking Page (`{slug}.vattavadastays.com`)

**Already built (Dev branch):**
- Property info + rooms loaded from Supabase
- Booking form → inserts into `bookings` table

**To complete:**
- [ ] Booking confirmation screen with summary (no PDF, just clear UI)
- [ ] WhatsApp CTA: "Book via WhatsApp" button → opens `wa.me/{owner_whatsapp}?text=Hi, I want to book {room} from {date} to {date}`
- [ ] Static map image showing property location (Supabase Storage hosted image, not Google Maps JS)
- [ ] "Get Directions" button → deep link to `https://maps.google.com/?q={lat},{lng}` (opens native Maps app, works offline if guest has downloaded that area)
- [ ] SEO: `<title>`, `<meta description>`, Open Graph tags per property (for Google discovery)
- [ ] PWA manifest + Service Worker for shell caching

**WhatsApp booking flow (guest-initiated):**
```
Guest taps "Book via WhatsApp"
→ Pre-filled message opens in WhatsApp:
  "Hi, I'd like to book [Room Name] at [Property Name]
   Check-in: [date]  Check-out: [date]  Guests: [n]
   My name: ___  Phone: ___"
→ Owner receives in WhatsApp, manually confirms
→ Owner logs booking in dashboard
```
This is intentional — no payment gateway in V1. Owner collects UPI/cash directly.

---

### 4.2 Owner Admin Dashboard (`/admin`)

**Already built:**
- Login, auth guard, rooms CRUD, bookings CRUD, calendar, settings

**To complete:**

#### WhatsApp — Owner messages guest from dashboard
Each booking row has a WhatsApp icon. Tapping it opens:
```
wa.me/{guest_phone}?text=Dear {guest_name}, your booking at {property_name} 
is confirmed. Check-in: {check_in}, Check-out: {check_out}. 
Room: {room_name}. Any questions, call us at {owner_phone}.
```
Templates for common messages:
- Booking confirmed
- Booking reminder (day before)
- Payment reminder
- Welcome / directions

#### Dashboard fixes needed now:
- [ ] Room name shown instead of UUID (done in current branch)
- [ ] Upcoming bookings count logic correct (excludes cancelled)
- [ ] Monthly revenue excludes cancelled bookings
- [ ] Settings save correctly invalidates cache (done in current branch)

---

### 4.3 Offline Maps & Directions

**Philosophy**: Do not embed a map. Maps JS SDKs are 500KB+ and fail on 2G. Instead:

**Guest page:**
- Show a static image of the area (pre-uploaded to Supabase Storage by owner during setup)
- "Open in Google Maps" button: `https://maps.google.com/?q={lat},{lng}`
- "Open in Apple Maps" button: `https://maps.apple.com/?ll={lat},{lng}` (shown only on iOS via user-agent)
- Both links open the native maps app — if the guest downloaded Vattavada offline maps before leaving, directions work with no signal

**WhatsApp directions message** (owner sends from dashboard):
```
wa.me/{guest_phone}?text=Here are directions to {property_name}:
Google Maps: https://maps.google.com/?q={lat},{lng}
Landmark: {property.landmark_description}
Call us when you reach Munnar: {owner_phone}
```

**Why this works on weak signal**: Native Maps apps cache route data. The deep link just passes coordinates — no heavy JS loaded on the guest's device.

---

### 4.4 SEO & Discoverability

Goal: Each property page ranks on Google for searches like "homestay vattavada" or "Bleaf Mud House booking".

**Implementation:**
- Server-side meta tags via Vercel Edge Functions (or prerendering at deploy time)
- Each property page has unique: `<title>`, `<meta description>`, `og:image`, `og:title`
- `robots.txt` allows all crawlers
- `sitemap.xml` generated per property
- Structured data: `schema.org/LodgingBusiness` JSON-LD per property page
- No central listing page in V1 — each subdomain is its own SEO entity

**Note on Vite SPA and SEO**: Pure SPAs are not crawlable. Solution is prerendering at build time using `vite-plugin-prerender` — generates static HTML for each property's root page that Google can index.

---

## 5. Multi-Tenant Architecture

### 5.1 Tenant Model

Single Supabase project, multiple properties isolated by `property_id` via RLS.

```
properties table
  id, slug, name, owner_id, branding (JSONB), 
  subscription_status, subscription_end_date,
  location_lat, location_lng, landmark_description,
  owner_whatsapp, static_map_image_url

rooms → property_id FK
bookings → property_id FK  
availability → room_id FK (already isolated via rooms)
```

### 5.2 Subdomain Routing

```typescript
// src/lib/property.ts
export function getSubdomain(): string {
  const host = window.location.hostname
  // bleafmudhouse.vattavadastays.com → 'bleafmudhouse'
  // localhost → fallback to env var for dev
  if (host === 'localhost' || host === '127.0.0.1') {
    return import.meta.env.VITE_PROPERTY_SUBDOMAIN ?? 'bleafmudhouse'
  }
  return host.split('.')[0]
}
```

Vercel: Wildcard domain `*.vattavadastays.com` → same deployment. No code changes per property.

### 5.3 RLS Policies

```sql
-- Owners only see their property
CREATE POLICY "owner_isolation" ON rooms
  FOR ALL USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()
    )
  );

-- Public can read active property rooms (guest page)
CREATE POLICY "public_read_active_rooms" ON rooms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM properties 
      WHERE id = rooms.property_id 
      AND subscription_status IN ('trial', 'active')
    )
  );

-- Anyone can insert a booking (guest booking form)
CREATE POLICY "public_insert_booking" ON bookings
  FOR INSERT WITH CHECK (true);
```

### 5.4 Superadmin

```typescript
// In admin.tsx auth guard
if (user?.email === import.meta.env.VITE_SUPERADMIN_EMAIL) {
  redirect('/superadmin')
}
```

Superadmin dashboard (`/superadmin`):
- List all properties + subscription status
- One-click: create property + send invite
- Revenue overview across all tenants

---

## 6. Subscription & Billing

**Pricing (V1):**
- Trial: 14 days free on onboarding
- Monthly: ₹499/property
- Setup: ₹2,999 one-time (collected manually in V1)

**V1 billing flow (manual):**
- Superadmin collects payment via UPI directly
- Updates `subscription_status` in Supabase manually
- No payment gateway needed in V1

**V2 billing flow (automated):**
- Razorpay subscription API
- Webhook updates `subscription_status`
- Auto-suspend after grace period

---

## 7. WhatsApp Integration Detail

No WhatsApp Business API needed in V1. Use `wa.me` deep links only — free, instant, no approval needed.

### Message Templates (hardcoded, owner taps to send)

| Trigger | Message |
|---|---|
| Booking confirmed | "Dear {name}, your booking at {property} is confirmed. Check-in: {date}. Room: {room}. See you soon!" |
| Directions | "Hi {name}, here's how to reach us: {maps_link}. Call {phone} when you reach Munnar." |
| Payment reminder | "Hi {name}, friendly reminder — payment of ₹{amount} is pending for your stay on {date}. UPI: {upi_id}" |
| Day-before reminder | "Hi {name}, looking forward to your arrival tomorrow at {property}! Check-in from {time}." |

**V2**: WhatsApp Business API (Meta) for actual message sending without guest initiating. Requires Meta Business verification.

---

## 8. Tech Stack (Locked)

| Layer | Tool | Notes |
|---|---|---|
| Framework | Vite + React + TypeScript | SPA — NOT SSR |
| Routing | TanStack Router 1.166.7 | Pinned — do not upgrade |
| Styling | Tailwind CSS v4 | No CSS modules |
| Database | Supabase (PostgreSQL) | RLS enforced |
| Auth | Supabase Auth | Client-side only |
| Data fetching | TanStack Query v5 | useQuery + useMutation |
| Hosting | Vercel | Static SPA + Edge Functions for meta tags |
| Maps | Native deep links only | No Maps JS SDK |
| WhatsApp | wa.me deep links | No API in V1 |
| Images | Supabase Storage | Auto-compressed |
| SEO | vite-plugin-prerender | Static HTML at build time |

**Never install**: `@tanstack/react-start`, `@supabase/ssr`, Google Maps JS SDK, any heavy mapping library

---

## 9. Milestones & Roadmap

### Phase 0 — Complete Dev Branch (Current — Week 1)
- [x] Admin login + auth guard
- [x] Rooms page with real Supabase data
- [x] Bookings page with real data + room names
- [x] Calendar with availability
- [x] Add/edit rooms (drawer)
- [x] Add booking (modal)
- [x] Settings save with correct cache invalidation
- [ ] Guest booking form end-to-end test
- [ ] WhatsApp deep links on booking dashboard
- [ ] Remove TanStack devtools button
- [ ] Merge Dev → Main

### Phase 1 — Multi-Tenant Foundation (Weeks 2–4)
- [ ] Add `property_id` to all tables + RLS migration
- [ ] Dynamic subdomain detection (`getSubdomain()`)
- [ ] Superadmin invite flow
- [ ] Superadmin dashboard (`/superadmin`)
- [ ] Wildcard domain on Vercel (`*.vattavadastays.com`)
- [ ] Test data isolation (pen test with 2 properties)

### Phase 2 — Guest Experience & SEO (Weeks 5–6)
- [ ] Static map image + directions deep links on guest page
- [ ] WhatsApp booking CTA ("Book via WhatsApp" button)
- [ ] SEO meta tags + Open Graph per property
- [ ] `schema.org/LodgingBusiness` structured data
- [ ] PWA manifest + Service Worker (shell caching)
- [ ] Performance audit: guest page on simulated 2G

### Phase 3 — WhatsApp Dashboard Messaging (Week 7)
- [ ] WhatsApp message templates in booking row actions
- [ ] Directions message template (sends lat/lng link)
- [ ] Payment reminder template
- [ ] Day-before reminder template

### Phase 4 — Billing & Onboarding (Week 8)
- [ ] Trial → active subscription flow
- [ ] Manual UPI collection + superadmin status toggle
- [ ] Property onboarding checklist UI
- [ ] Pilot: onboard 2 beta properties (Bleaf + 1 more)

### Phase 5 — Central Listing Page (Future, Post-Pilot)
- [ ] `vattavadastays.com` landing page with "Browse properties"
- [ ] Property cards with availability preview
- [ ] Filter by dates, guests, price
- [ ] Each card links to `{slug}.vattavadastays.com`

---

## 10. Open Questions

| # | Question | Decision Needed By |
|---|---|---|
| 1 | ID proof collection — store in Supabase Storage or email to owner only? | Phase 2 |
| 2 | Cancellation policy — per property or platform standard? | Phase 1 |
| 3 | Language — English only or add Malayalam in V1? | Phase 1 |
| 4 | Superadmin email — hardcoded env var or `is_superadmin` column in DB? | Phase 1 |
| 5 | Static map image — owner uploads, or auto-generate from lat/lng? | Phase 2 |

---

## 11. Constraints & Non-Negotiables

- **No commissions**: Platform earns only via subscription, never per-booking
- **No marketplace in V1**: No central listing, no compare-and-book
- **No heavy JS on guest page**: Maps SDK, analytics SDKs, chat widgets — all banned from guest page
- **RLS is the security model**: No property ever sees another's data. This must be tested before every production deploy
- **WhatsApp is the primary communication channel**: Email is secondary. Every notification has a WhatsApp path
- **Mobile-first**: Every UI designed for 375px width first, desktop second

---

*This document should be updated at the start of each phase. Keep it in the repo root as `PRD.md`.*
