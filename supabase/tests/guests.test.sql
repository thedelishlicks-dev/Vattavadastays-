-- Behaviour tests for 20261121000000_guests (guest identity).
-- Run by supabase/tests/run.sh AFTER the migrations, from the repository root (the \set below reads
-- supabase/tests/phone_parity_cases.json, which src/lib/guestIdentity.test.ts asserts too: SQL and
-- TypeScript must agree on what a phone number is). Any failed assertion aborts with a message.

\set parity `cat supabase/tests/phone_parity_cases.json`
select set_config('t.parity', :'parity', false);

\set GP1 '00000000-0000-0000-0000-0000000000e1'
\set GP2 '00000000-0000-0000-0000-0000000000e2'
\set GO1 '00000000-0000-0000-0000-0000000000f1'
\set GO2 '00000000-0000-0000-0000-0000000000f2'
\set GR1 '00000000-0000-0000-0000-0000000000e3'

insert into properties (id, owner_id) values (:'GP1', :'GO1'), (:'GP2', :'GO2');
insert into rooms (id, property_id, base_price, extra_guest_price, weekend_multiplier, max_guests)
  values (:'GR1', :'GP1', 2000, 0, 1, 4);

-- 1. Parity: every shared phone case ------------------------------------------------------------
do $$
declare c jsonb; n int := 0;
begin
  for c in select * from jsonb_array_elements(current_setting('t.parity')::jsonb) loop
    if normalize_phone_key(c ->> 'raw') is distinct from (c ->> 'key') then
      raise exception 'PARITY FAILED for % : got %, want %', c ->> 'raw', normalize_phone_key(c ->> 'raw'), c ->> 'key';
    end if;
    n := n + 1;
  end loop;
  raise notice 'phone parity: % cases ok', n;
end $$;
select t_assert(normalize_phone_key(null) is null, 'null phone has no key');

-- helper: insert a booking as the property's owner
create or replace function t_owner_booking(p_prop uuid, p_owner uuid, p_name text, p_phone text, p_in date, p_out date, p_email text default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_owner::text, true);
  set local role authenticated;
  insert into bookings (property_id, guest_name, guest_phone, guest_email, guest_count, check_in, check_out, room_price, extra_guest_charge, total_amount, status, source)
  values (p_prop, p_name, p_phone, p_email, 2, p_in, p_out, 1000, 0, 1000, 'confirmed', 'direct')
  returning id into v;
  reset role;
  return v;
end $$;
grant execute on function t_owner_booking(uuid, uuid, text, text, date, date, text) to authenticated;

-- 2. New guest when no match; the same phone written differently reuses it -------------------------
select t_owner_booking(:'GP1', :'GO1', 'Anil Kumar', '+91 98765 43210', '2027-01-01', '2027-01-03', 'anil@example.com');
select t_owner_booking(:'GP1', :'GO1', 'Anil K', '09876543210', '2027-02-01', '2027-02-03');
select t_owner_booking(:'GP1', :'GO1', 'Anil Kumar', '98765-43210', '2027-03-01', '2027-03-03');
select t_assert((select count(*) = 1 from guests where property_id = :'GP1'), 'three bookings, one guest (formatting differences do not duplicate)');
select t_assert((select count(distinct guest_id) = 1 and bool_and(guest_id is not null) from bookings where property_id = :'GP1'), 'all three bookings link to that one guest');
select t_assert((select (name, email) = ('Anil Kumar', 'anil@example.com') from guests where property_id = :'GP1'), 'first booking names the guest; later names do not overwrite');

-- 3. Same phone at another property = a separate guest -------------------------------------------
select t_owner_booking(:'GP2', :'GO2', 'Anil Kumar', '+91 98765 43210', '2027-01-01', '2027-01-03');
select t_assert((select count(*) = 1 from guests where property_id = :'GP2'), 'property B gets its own guest');
select t_assert((select count(distinct id) = 2 from guests where phone_key = '9876543210'), 'two guests overall, one per property');
select t_assert((select g1.id <> g2.id from guests g1, guests g2 where g1.property_id = :'GP1' and g2.property_id = :'GP2'), 'never the same record across properties');

-- 4. No usable phone = no fake identity ---------------------------------------------------------------
select t_owner_booking(:'GP1', :'GO1', 'No Phone', '', '2027-04-01', '2027-04-02');
select t_owner_booking(:'GP1', :'GO1', 'Short Phone', '12345', '2027-04-03', '2027-04-04');
select t_assert((select bool_and(guest_id is null) from bookings where guest_name in ('No Phone', 'Short Phone')), 'unusable phone leaves guest_id empty');
select t_assert((select count(*) = 1 from guests where property_id = :'GP1'), 'and creates no guest');

-- 5. A group of rooms resolves to the same guest -----------------------------------------------
insert into booking_groups (property_id, guest_name, guest_phone, guest_count, check_in, check_out, total_amount, status)
values (:'GP1', 'Anil Kumar', '+919876543210', 4, '2027-05-01', '2027-05-03', 4000, 'confirmed');
select t_assert((select guest_id = (select id from guests where property_id = :'GP1') from booking_groups where property_id = :'GP1' and check_in = '2027-05-01'), 'booking group links to the same guest');

-- 6. A blank email is filled in later, never overwritten ---------------------------------------------
select t_owner_booking(:'GP1', :'GO1', 'Anil Kumar', '9876543210', '2027-06-01', '2027-06-02', 'other@example.com');
select t_assert((select email = 'anil@example.com' from guests where property_id = :'GP1'), 'an email already on record is never overwritten');

-- 7. A public (anon) guest cannot choose a guest record, and cannot reach another property's ------------
do $$
declare foreign_guest uuid; own_guest uuid; got uuid;
begin
  select id into foreign_guest from guests where property_id = '00000000-0000-0000-0000-0000000000e2';
  select id into own_guest from guests where property_id = '00000000-0000-0000-0000-0000000000e1';
  perform set_config('request.jwt.claim.role', 'anon', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  insert into bookings (property_id, room_id, guest_name, guest_phone, guest_count, check_in, check_out, room_price, total_amount, guest_id)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'Mallory', '+91 98765 43210', 2, '2027-07-01', '2027-07-02', 1, 1, foreign_guest)
  returning guest_id into got;
  reset role;
  if got is distinct from own_guest then raise exception 'anon booking linked to %, wanted this property''s own guest %', got, own_guest; end if;
end $$;
select t_assert((select count(*) = 1 from guests where property_id = :'GP1'), 'a guest booking by phone reuses the guest of THIS property');

-- 8. An owner cannot link a booking to another property's guest ---------------------------------------
do $$
declare foreign_guest uuid; blocked boolean := false;
begin
  select id into foreign_guest from guests where property_id = '00000000-0000-0000-0000-0000000000e2';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  begin
    set local role authenticated;
    insert into bookings (property_id, guest_name, guest_phone, guest_count, check_in, check_out, room_price, total_amount, status, guest_id)
    values ('00000000-0000-0000-0000-0000000000e1', 'X', '+91 90000 00001', 2, '2027-08-01', '2027-08-02', 1, 1, 'confirmed', foreign_guest);
    reset role;
  exception when others then
    reset role;
    blocked := true;
  end;
  if not blocked then raise exception 'cross-property guest link was accepted'; end if;
end $$;

-- 9. RLS: owners see and change only their own property's guests; anon sees nothing ---------------------
do $$
declare n int; blocked boolean := false;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  set local role authenticated;
  select count(*) into n from guests;
  if n <> 1 then raise exception 'owner A sees % guests, wanted 1 (its own)', n; end if;
  if exists (select 1 from guests where property_id = '00000000-0000-0000-0000-0000000000e2') then raise exception 'owner A can read property B guests'; end if;
  update guests set name = 'Hacked' where property_id = '00000000-0000-0000-0000-0000000000e2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'owner A changed property B guest'; end if;
  begin
    insert into guests (property_id, name, phone) values ('00000000-0000-0000-0000-0000000000e2', 'Planted', '+91 90000 00002');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'owner A inserted a guest into property B'; end if;
  reset role;

  blocked := false;
  perform set_config('request.jwt.claim.role', 'anon', true); perform set_config('request.jwt.claim.sub', '', true);
  begin
    set local role anon;
    perform 1 from guests limit 1;
  exception when others then blocked := true; end;
  reset role;
  if not blocked then raise exception 'anon can read guests'; end if;
end $$;
select t_assert((select name = 'Anil Kumar' from guests where property_id = :'GP2'), 'property B guest unchanged');

-- 10. Editing money, status or SOURCE never touches guest identity; changing the phone re-links -------
do $$
declare b uuid; before_g uuid; after_g uuid;
begin
  select id, guest_id into b, before_g from bookings where property_id = '00000000-0000-0000-0000-0000000000e1' and check_in = '2027-01-01';
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
  set local role authenticated;
  update bookings set source = 'agent', booking_source_detail = 'whatsapp', advance_amount = 500 where id = b;
  update bookings set booking_source_detail = null where id = b;
  reset role;
  select guest_id into after_g from bookings where id = b;
  if after_g is distinct from before_g then raise exception 'source edit changed the guest'; end if;
  update bookings set guest_phone = '+91 91234 56789' where id = b;
  select guest_id into after_g from bookings where id = b;
  if after_g is not distinct from before_g or after_g is null then raise exception 'a new phone should link to a different guest'; end if;
  update bookings set guest_phone = '+91 98765 43210' where id = b;   -- put it back
end $$;
select t_assert((select count(*) = 2 from guests where property_id = :'GP1'), 'changing a phone creates (or reuses) a guest, never rewrites the old one');
select t_assert((select (source, booking_source_detail, advance_amount, total_amount) is not distinct from ('agent', null, 500, 1000) from bookings where check_in = '2027-01-01' and property_id = :'GP1'), 'source/detail edits stored, money untouched');

-- 11. Backfill is idempotent and only writes guest_id -------------------------------------------------
alter table bookings disable trigger trg_link_booking_guest;
insert into bookings (property_id, guest_name, guest_phone, guest_count, check_in, check_out, room_price, total_amount, status, advance_amount)
values (:'GP2', 'Old One', '098765 99999', 2, '2026-01-01', '2026-01-03', 1500, 1500, 'completed', 700),
       (:'GP2', 'Old One Again', '+91 98765 99999', 2, '2026-02-01', '2026-02-03', 1500, 1500, 'completed', 0),
       (:'GP2', 'Old No Phone', '', 2, '2026-03-01', '2026-03-03', 1500, 1500, 'completed', 0);
alter table bookings enable trigger trg_link_booking_guest;
select t_assert((select count(*) = 3 from bookings where property_id = :'GP2' and guest_id is null and guest_name like 'Old%'), 'legacy rows start unlinked');
\i supabase/migrations/20261121000000_guests.sql
select t_assert((select count(distinct guest_id) = 1 and count(*) = 2 from bookings where guest_name like 'Old One%' and guest_id is not null), 'legacy rows with the same phone share one guest');
select t_assert((select guest_id is null from bookings where guest_name = 'Old No Phone'), 'legacy row without a phone stays unlinked');
select t_assert((select (total_amount, advance_amount, status) = (1500, 700, 'completed') from bookings where guest_name = 'Old One'), 'backfill leaves booking money and status alone');
select count(*) as guests_after_first from guests \gset
\i supabase/migrations/20261121000000_guests.sql
select t_assert((select count(*) = :guests_after_first from guests), 'running the backfill again creates no duplicate guests');

drop function t_owner_booking(uuid, uuid, text, text, date, date, text);
