# stayidom.in

A commission-free booking and property-management platform for vacation rentals and homestays across Kerala's tourism belt — mountains, backwaters and beaches. Each property gets its own branded booking website at its own subdomain (e.g. `bleafmudhouse.stayidom.in`).

Built for patchy rural connectivity. The pilot is in **Vattavada**, a mountain village in Idukki with weak 2G-grade Jio/BSNL signal. If the guest booking flow and owner dashboard work there, they'll work in the backwaters or on the coast.

## Key features

- **Guest booking site.** Mobile-first, lightweight. Seasonal and weekend pricing, server-checked price, booking reference (`#XXXXXXXX`) shown on confirmation and sent to the owner on WhatsApp.
- **Owner dashboard (`/admin`).** Rooms and seasonal rates, bookings, owner calendar (all-rooms and per-room), block dates, quotes, payments (part-payments, refund due), agents and commissions, settings, payment setup (UPI), policies, meals, add-ons.
- **Superadmin (`/superadmin`).** Add properties, invite owners by email, setup checklist, renewal and billing notes, client error log, leads.
- **WhatsApp, no API needed.** Deep links for booking notices, payment and directions reminders, and payment screenshots.
- **UPI payments.** Direct `upi://` links to the owner's UPI ID. Money goes straight to the owner.
- **Link previews, SEO.** Per-property title, photo and JSON-LD for WhatsApp, Instagram and Google; per-host `robots.txt` and `sitemap.xml`.
- **Channel sync (iCal)** — export works; import is built but switched off (`src/lib/features.ts`).

## Tech stack

- **Frontend:** React 19, Vite 7, TypeScript, Tailwind CSS 4
- **Routing:** TanStack Router (file-based, pinned at 1.166.7)
- **Data:** TanStack Query 5, Supabase JS 2
- **Backend:** Supabase (Postgres, Auth, Storage, one Deno Edge Function)
- **Hosting:** Vercel (static SPA + Edge Functions in `api/`)

## Getting started

### Prerequisites

- Node.js 22 (CI uses 22)
- npm (the repo uses `package-lock.json`)

### Local development

```bash
git clone https://github.com/thedelishlicks-dev/Vattavadastays-.git
cd Vattavadastays-
npm ci
cp .env.example .env     # then fill in the values below
npm run dev
```

`.env`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_PROPERTY_SUBDOMAIN=bleafmudhouse
VITE_SUPERADMIN_EMAIL=your_superadmin_email
```

Open `http://localhost:5173`. To test a property locally, add `?slug=bleafmudhouse`.

### Checks

```bash
npm run build       # must pass; regenerates src/routeTree.gen.ts
npm run typecheck   # run after build; expects 0 errors
npm test            # unit tests (src/lib) and API tests (tests/api)
npm run check       # behaviour checks (scripts/*.check.ts)
```

CI (`.github/workflows/ci.yml`) runs all of the above plus migration tests against a throw-away Postgres.

## Project layout

```
api/              Vercel Edge Functions (og, seo, manifest, ical, ical-sync)
src/
  routes/         TanStack Router file routes
  components/     UI
  hooks/          TanStack Query hooks
  lib/            Business logic (balance, pricing, calendar state, onboarding …) — pure and tested
  admin/          Admin shell and navigation (navConfig.ts)
  supabase/functions/   Supabase Edge Function (invite-owner)
supabase/
  baseline/       Live database snapshot (16 Oct 2026)
  migrations/     Changes since the baseline
  tests/          Migration and RLS tests
scripts/          Behaviour checks, typecheck and build helpers
docs/             Parked features, polish notes, diagnostics
```

## Architecture and constraints

- **No SSR.** Pure Vite SPA. No `@tanstack/react-start`, no `@supabase/ssr`.
- **No heavy SDKs on the guest page.** No Google Maps JS SDK, no analytics or chat widgets. Maps are deep links.
- **Config in `shared_amenities`.** Meals, policies, UPI, payment methods and theme are stored with a `__prefix:` sentinel to avoid schema churn. Writes go through `src/lib/propertyConfig.ts`.
- **Security in the database.** Row-level security on every table; triggers prevent guest-side price tampering and double bookings; billing columns are owner-protected.
- **Money in one place.** All balance, refund and advance maths lives in `src/lib/balance.ts`.
- **Pinned router.** Don't upgrade `@tanstack/react-router` from 1.166.7.
- **`?property=` is read from `window.location.search`**, not TanStack `useSearch`.

## Onboarding a new property (superadmin)

1. In `/superadmin`, press **Add property** and fill in name, subdomain, owner email and details.
2. Press **Invite owner now**. The owner gets a set-password email.
3. Press **Manage** on the row and set up rooms, prices, UPI ID, policies and a hero photo. The row's checklist shows what's left.
4. Owner sets a password from the email and signs in at `stayidom.in/login`.
5. Press **Activate** once the setup fee is paid.

Supabase Auth needs Site URL `https://stayidom.in`, redirect URLs `https://stayidom.in/reset-password` and `https://*.stayidom.in/**`, and a customised "Invite user" email. Details in `HANDOVER.md` §9.

## Documentation

- [AGENTS.md](AGENTS.md) — rules for anyone (or any AI assistant) changing the code
- [HANDOVER.md](HANDOVER.md) — current state, rules, known issues and what's left
- [PRD.md](PRD.md) — product requirements and status
- [docs/PARKED_FEATURES.md](docs/PARKED_FEATURES.md) — channel sync and how to turn it on
- [supabase/baseline/README.md](supabase/baseline/README.md) — how to rebuild the database

## License

Private / Proprietary
