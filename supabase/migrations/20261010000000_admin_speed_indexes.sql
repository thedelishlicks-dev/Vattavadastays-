-- ============================================================================
-- Indexes for the admin screens (HANDOVER: admin speed).
--
-- Trimmed after checking the live index list (docs/DB_CHECKS.sql query 6): only
-- indexes that DO NOT already exist are added. Already present, so skipped:
--   bookings(property_id)            -> idx_bookings_property
--   bookings(check_in)               -> idx_bookings_check_in
--   booking_charges(booking_id)      -> idx_booking_charges_booking_id
--   rooms(property_id)               -> idx_rooms_property
--
-- Missing, added here (Supabase nested selects join on these columns, and the
-- admin Payments/Bookings pages list booking_groups by property):
--   * booking_groups had NO index on property_id
--   * bookings had NO index on group_id
--   * booking_charges had NO index on group_id
--
-- SAFE: "if not exists", no data changes, re-runnable. At today's size (tens of
-- rows) this changes nothing you can feel; it keeps admin pages quick as years
-- of bookings accumulate.
-- ============================================================================

create index if not exists booking_groups_property_checkin_idx
  on public.booking_groups (property_id, check_in desc);

create index if not exists bookings_group_id_idx
  on public.bookings (group_id) where group_id is not null;

create index if not exists booking_charges_group_id_idx
  on public.booking_charges (group_id) where group_id is not null;
