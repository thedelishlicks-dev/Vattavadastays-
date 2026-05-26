# VattavadaStays

A white-label, commission-free booking engine for Vattavada homestays, designed for rural connectivity.

## Project Overview

VattavadaStays provides homestay owners in Vattavada (Kerala) with their own branded booking websites. It is built as a multi-tenant application where each property gets a unique subdomain (e.g., `bleafmudhouse.stayidom.in`).

### Key Features

- **Guest Booking Engine**: Lightweight, mobile-first booking interface optimized for 2G networks.
- **Multi-Tenant Architecture**: Secure data isolation using Supabase Row Level Security (RLS).
- **Owner Dashboard**: Manage rooms, availability, and bookings from a mobile-responsive interface.
- **Superadmin Panel**: Platform management, property onboarding, and subscription tracking.
- **WhatsApp Integration**: Deep links for guest inquiries and owner notifications, no heavy API required.
- **Offline-Ready Maps**: Native map deep links instead of heavy JavaScript SDKs.

## Tech Stack

- **Frontend**: React (Vite), TypeScript, Tailwind CSS v4
- **Routing**: TanStack Router (File-based)
- **Data Fetching**: TanStack Query (React Query)
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

3. Set up environment variables:
   Create a `.env` file in the root directory and add the following:
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

## Architecture & Constraints

This project follows strict performance and architectural guidelines to ensure usability in Vattavada's low-signal environment:

- **No SSR**: This is a pure Vite SPA. Do not use `@tanstack/react-start` or `@supabase/ssr`.
- **No Heavy SDKs**: Google Maps JS SDK and other heavy libraries are prohibited on the guest page.
- **Sentinel Keys**: Property configurations (like meals, policies, etc.) are stored within the `shared_amenities` column in the `properties` table using a `__prefix:` pattern to avoid schema bloat.
- **RLS First**: Security is enforced at the database level. Every query must respect Row Level Security.

## Documentation

- [Product Requirements Document (PRD)](PRD.md)
- [Agent Instructions](AGENTS.md)
- [Handover Notes](HANDOVER_v4.md)

## License

Private / Proprietary
