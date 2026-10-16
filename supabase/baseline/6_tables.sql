create  table public.addons (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  name text not null,
  category text not null default 'other'::text,
  unit text not null default 'per_person_day'::text,
  variants jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.agents (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  name text not null,
  phone text,
  default_commission_type text not null default 'percentage'::text,
  default_commission_value numeric not null default 0,
  notes text,
  created_at timestamp with time zone default now()
);

create table public.availability (
  room_id uuid not null,
  date date not null,
  is_available boolean default true,
  price_override numeric(10,2),
  note text
);

create table public.booking_charges (
  id uuid not null default gen_random_uuid(),
  booking_id uuid,
  description text not null,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  created_at timestamp with time zone default now(),
  group_id uuid
);

create table public.booking_groups (
  id uuid not null default gen_random_uuid(),
  property_id uuid,
  group_reference text not null,
  guest_name text not null,
  guest_phone text,
  guest_email text,
  check_in date not null,
  check_out date not null,
  guest_count integer not null default 1,
  total_amount numeric(10,2) not null default 0,
  advance_amount numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  discount_reason text,
  status text not null default 'pending'::text,
  payment_method text,
  payment_reference text,
  is_paid boolean default false,
  created_at timestamp with time zone default now(),
  source text not null default 'direct'::text,
  agent_id uuid,
  commission_amount numeric,
  commission_paid boolean not null default false,
  commission_paid_date timestamp with time zone,
  hold_expires_at timestamp with time zone
);

create table public.bookings (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  room_id uuid,
  guest_name text not null,
  guest_phone text not null,
  guest_email text,
  guest_count integer not null,
  check_in date not null,
  check_out date not null,
  nights integer generated always as ((check_out - check_in)) stored,
  room_price numeric(10,2) not null,
  extra_guest_charge numeric(10,2) default 0,
  total_amount numeric(10,2) not null,
  status text default 'pending'::text,
  payment_method text,
  payment_reference text,
  is_paid boolean default false,
  created_at timestamp with time zone default now(),
  advance_amount numeric default 0,
  checked_in_at timestamp with time zone,
  checked_out_at timestamp with time zone,
  invoice_notes text,
  discount_amount numeric(10,2) not null default 0,
  discount_reason text,
  group_id uuid,
  source text not null default 'direct'::text,
  agent_id uuid,
  commission_amount numeric,
  commission_paid boolean not null default false,
  commission_paid_date timestamp with time zone,
  hold_expires_at timestamp with time zone
);

create table public.client_errors (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  source text not null,
  category text not null default 'app'::text,
  message text not null,
  stack text,
  url text,
  hostname text,
  user_agent text,
  app_version text,
  context jsonb
);

create table public.invite_tokens (
  id uuid not null default gen_random_uuid(),
  token text not null default encode(gen_random_bytes(32), 'hex'::text),
  email text not null,
  property_id uuid,
  used_at timestamp with time zone,
  expires_at timestamp with time zone not null default (now() + '7 days'::interval),
  created_at timestamp with time zone default now()
);

create table public.leads (
  id uuid not null default gen_random_uuid(),
  name text not null,
  phone text not null,
  property_name text,
  tier text,
  created_at timestamp with time zone default now()
);

create table public.packages (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  name text not null,
  description text,
  unit text not null default 'per_person'::text,
  included jsonb not null default '[]'::jsonb,
  variants jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.price_seasons (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  recurs_yearly boolean not null default false,
  priority integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table public.properties (
  id uuid not null default gen_random_uuid(),
  owner_id uuid,
  name text not null,
  name_ml text,
  subdomain text,
  area text,
  location_lat numeric,
  location_lng numeric,
  shared_amenities text[] default '{}'::text[],
  description text,
  description_ml text,
  hero_image text,
  owner_name text,
  owner_phone text,
  owner_whatsapp text,
  check_in_time text default '12:00 PM'::text,
  check_out_time text default '11:00 AM'::text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  subscription_status text not null default 'trial'::text,
  subscription_end_date timestamp with time zone,
  landmark_description text,
  static_map_image_url text,
  about_image text,
  hero_tagline text,
  logo_url text,
  theme text default 'forest'::text,
  heading_font text default 'Fraunces'::text,
  subscription_tier text default 'small'::text,
  monthly_fee integer default 1000,
  setup_fee_paid boolean default false,
  setup_fee_amount integer default 5000,
  billing_notes text,
  pending_hold_hours integer not null default 24
);

create table public.quotes (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  guest_name text not null default 'Guest'::text,
  guest_phone text not null,
  check_in date not null,
  check_out date not null,
  guest_count integer not null default 1,
  inputs jsonb not null default '{}'::jsonb,
  rooms jsonb not null default '[]'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  rooms_total numeric(12,2) not null default 0,
  addons_total numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  status text not null default 'draft'::text,
  valid_until date,
  notes text,
  sent_at timestamp with time zone,
  converted_booking_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.room_ical_feeds (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  room_id uuid not null,
  name text not null,
  url text not null,
  created_at timestamp with time zone not null default now(),
  last_synced_at timestamp with time zone,
  last_status text,
  last_message text,
  last_nights integer,
  last_conflicts integer
);

create table public.room_rates (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  room_id uuid,
  label text not null default ''::text,
  start_date date not null,
  end_date date not null,
  kind text not null default 'fixed'::text,
  value numeric not null,
  created_at timestamp with time zone not null default now()
);

create table public.rooms (
  id uuid not null default gen_random_uuid(),
  property_id uuid not null,
  name text not null,
  name_ml text,
  room_type text,
  max_guests integer not null,
  bed_type text,
  base_price numeric(10,2) not null,
  extra_guest_price numeric(10,2) default 0,
  weekend_multiplier numeric(3,2) default 1.0,
  room_amenities text[] default '{}'::text[],
  images text[] default '{}'::text[],
  is_active boolean default true,
  created_at timestamp with time zone default now()
);
