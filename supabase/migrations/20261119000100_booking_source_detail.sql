-- "How did this guest find you?" — a finer-grained companion to bookings.source / booking_groups.source.
-- `source` (direct | agent | walk_in) is NOT touched: it still drives agents and commissions, and its
-- CHECK constraint stays as is. `booking_source_detail` is free-ish text, nullable, with suggested values
-- (whatsapp, instagram, google, website, phone, walk_in, repeat_guest, airbnb, booking_com, makemytrip,
-- agoda, other). Existing rows stay NULL ("not recorded"). Guest bookings never set it.
-- No policy change: existing booking / group policies already cover every column.
--
-- Safe to run more than once.

alter table public.bookings        add column if not exists booking_source_detail text;
alter table public.booking_groups  add column if not exists booking_source_detail text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_source_detail_len') then
    alter table public.bookings add constraint bookings_source_detail_len check (booking_source_detail is null or char_length(booking_source_detail) <= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'booking_groups_source_detail_len') then
    alter table public.booking_groups add constraint booking_groups_source_detail_len check (booking_source_detail is null or char_length(booking_source_detail) <= 40);
  end if;
end $$;
