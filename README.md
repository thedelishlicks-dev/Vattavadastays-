# stayidom.in

A white-label, commission-free booking and property management platform for vacation rentals and homestays across Kerala's tourism belt — mountains, backwaters, and beaches — engineered from day one for patchy rural connectivity rather than assuming city-grade signal everywhere.

## Project Overview

stayidom.in gives vacation rental and homestay owners across Kerala their own branded booking websites. It is built as a multi-tenant application where each property gets a unique subdomain (e.g., `bleafmudhouse.stayidom.in`).

We're currently piloting the platform in **Vattavada**, a remote mountain village in Idukki with only weak 2G-grade BSNL/Jio signal — deliberately one of the toughest connectivity environments in the state. The idea: if the guest booking flow and owner dashboard hold up here, they'll hold up just as well in the backwaters (Alleppey, Kumarakom) or on the coast (Varkala, Kovalam) later. Vattavada is the pilot market, not the ceiling.

### Key Features

- **Guest Booking Engine**: Lightweight, mobile-first booking interface optimized for 2G networks.
- **Booking Reference**: Guest receives a short reference ID (`#XXXXXXXX`) on confirmation, included in WhatsApp notification to owner.
- **Multi-Tenant Architecture**: Secure data isolation using Supabase Row Level Security (RLS).
- **Owner Dashboard**: Manage rooms, availability, and bookings from a mobile-responsive interface.
- **Agent Booking Tracking**: Owners can log which bookings came through an agent, track commission (percentage or flat rate, auto-calculated but editable per booking), and see a per-agent commission ledger with mark-as-paid and CSV export. Agent self-service (agents logging in themselves) is not built yet — owner-entered only.
- **Owner-side Availability Calendar**: The owner's Add Booking form shows a visual month calendar of booked/blocked dates for the selected room(s), same interaction as the guest-facing calendar, instead of blind date inputs.
- **Superadmin Panel**: Platform management, property onboarding, and subscription tracking. Superadmin can manage any property dashboard directly.
- **WhatsApp Integration**: Deep links for guest inquiries, booking notifications, and payment screenshot sharing. No heavy API required.
- **UPI Payments**: Direct UPI deep links to owner's UPI ID. Guest pays owner directly — zero commission, instant settlement.
- **Offline-Ready Maps**: Native map deep links instead of heavy JavaScript SDKs.
- **Auto-availability Blocking**: Confirming a booking blocks those dates for future bookings — both guest-created and owner-created bookings sync the availability table immediately at creation (owner-side bookings previously didn't; fixed Round 7, see HANDOVER.md). Cancelling re-opens them.

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

This project follows strict performance and architectural guidelines developed against Vattavada's low-signal pilot environment — the toughest network conditions we design for, and the baseline every feature is held to before it ships anywhere else:

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
- [Handover Notes (latest — v7)](HANDOVER.md)

## License

Private / Proprietary
