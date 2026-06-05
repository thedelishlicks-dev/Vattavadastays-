# stayidom.in

A white-label, commission-free booking engine for Vattavada homestays, designed for rural connectivity.

## Project Overview

stayidom.in provides homestay owners in Vattavada (Kerala) with their own branded booking websites. It is built as a multi-tenant application where each property gets a unique subdomain (e.g., `bleafmudhouse.stayidom.in`).

### Key Features

- **Guest Booking Engine**: Lightweight, mobile-first booking interface optimized for 2G networks.
- **Booking Reference**: Guest receives a short reference ID (`#XXXXXXXX`) on confirmation, included in WhatsApp notification to owner.
- **Multi-Tenant Architecture**: Secure data isolation using Supabase Row Level Security (RLS).
- **Owner Dashboard**: Manage rooms, availability, and bookings from a mobile-responsive interface.
- **Superadmin Panel**: Platform management, property onboarding, and subscription tracking. Superadmin can manage any property dashboard directly.
- **WhatsApp Integration**: Deep links for guest inquiries, booking notifications, and payment screenshot sharing. No heavy API required.
- **UPI Payments**: Direct UPI deep links to owner's UPI ID. Guest pays owner directly — zero commission, instant settlement.
- **Offline-Ready Maps**: Native map deep links instead of heavy JavaScript SDKs.
- **Auto-availability Blocking**: Confirming a booking automatically blocks those dates. Cancelling re-opens them.

## Tech Stack

- **Frontend**: React (Vite), TypeScript, Tailwind CSS v4
- **Routing**: TanStack Router (File-based, pinned at 1.166.7)
- **Data Fetching**: TanStack Query v5
- **Backend**: Supabase (Database, Auth, Storage, Edge Functions)
- **Hosting**: Vercel (Static SPA)

## Getting Started

### Prerequisites

- Node.js (v18+)
- Bun or npm

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/thedelishlicks-dev/Vattavadastays-.git
   cd Vattavadastays-
   ```

2. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```

3. Set up environment variables. Create a `.env` file:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_PROPERTY_SUBDOMAIN=bleafmudhouse
   VITE_SUPERADMIN_EMAIL=admin@stayidom.in
   ```

4. Start the development server:
   ```bash
   bun dev
   # or
   npm run dev
   ```

5. Open [http://localhost:5173](http://localhost:5173) in your browser.

   To test a specific property locally, add `?slug=bleafmudhouse` to the URL.

## Architecture & Constraints

This project follows strict performance and architectural guidelines for Vattavada's low-signal environment:

- **No SSR**: Pure Vite SPA. Never use `@tanstack/react-start` or `@supabase/ssr`.
- **No Heavy SDKs**: Google Maps JS SDK and other heavy libraries are prohibited on the guest page.
- **Sentinel Keys**: Property configurations (meals, policies, UPI etc.) are stored within the `shared_amenities` column using a `__prefix:` pattern to avoid schema bloat.
- **RLS First**: Security is enforced at the database level.
- **TanStack Router pinned**: Never upgrade `@tanstack/react-router` from 1.166.7.
- **window.location.search for ?property= param**: The superadmin Manage flow passes `?property=subdomain` — always read this via `window.location.search`, not TanStack `useSearch`.

## Onboarding a New Property (Superadmin)

1. Go to `/superadmin` → Add property
2. Click **Manage** on the new property row
3. Set up rooms, availability, pricing, UPI ID, and policies
4. Supabase → Authentication → Users → **Invite user** with owner email
5. Owner sets password via Supabase email, logs in at `/login`
6. Click **Activate** in superadmin once setup fee is paid

## Documentation

- [Agent Instructions](AGENTS.md)
- [Handover Notes v5](HANDOVER_v5.md)

## License

Private / Proprietary
