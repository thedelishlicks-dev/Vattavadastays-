  -- ============================================================================
-- Indexes for the admin screens (HANDOVER: admin speed).
--
-- The admin pages filter bookings / groups by property and order by date, and
-- Supabase's nested selects ("*, booking_charges(*)", "*, bookings(*)") join on
-- foreign-key columns. Without indexes on those columns Postgres scans the whole
-- table for every request. Harmless while tables are small; these keep admin
-- pages fast as years of bookings pile up.
--
-- SAFE: every statement is "if not exists", changes no data, and can be re-run.
-- Plain CREATE INDEX briefly locks the table for writes — instant at this size.
--
-- BEFORE RUNNING: run docs/DB_CHECKS.sql query 6. If an equivalent index already
-- exists under another name (e.g. one Supabase/you created earlier) you can skip
-- that line — duplicates only waste a little disk, they don't break anything.
-- ============================================================================

-- Admin lists/windows: "bookings of this property, newest check-in first"
create index if not exists bookings_property_checkin_idx
  on public.bookings (property_id, check_in desc);

-- Rooms of a group booking (nested select + group updates)
create index if not exists bookings_group_id_idx
  on public.bookings (group_id) where group_id is not null;

create index if not exists booking_groups_property_checkin_idx
  on public.booking_groups (property_id, check_in desc);

-- Extra charges are fetched nested under every booking and every group
create index if not exists booking_charges_booking_id_idx
  on public.booking_charges (booking_id) where booking_id is not null;

create index if not exists booking_charges_group_id_idx
  on public.booking_charges (group_id) where group_id is not null;

-- "*, rooms(*)" on the property fetch
create index if not exists rooms_property_id_idx
  on public.rooms (property_id);

-- Note: no index is added for availability(room_id, date) — the app upserts with
-- onConflict "room_id,date", which already requires a unique index on those columns.
-- No index for bookings overlap checks — the double-booking constraint's own GiST
-- index (bookings_no_overlap) covers (room_id, date range).
