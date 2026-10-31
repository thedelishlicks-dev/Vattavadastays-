-- Behaviour tests for 20261015000000_room_rates, ..._server_side_booking_price
-- and ..._room_ical_feeds. Any failed assertion aborts with a message (psql
-- runs with ON_ERROR_STOP). Keep the pricing cases in step with
-- src/lib/roomRates.test.ts — the two implementations must agree.

\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set B1 '00000000-0000-0000-0000-0000000000b1'
\set B2 '00000000-0000-0000-0000-0000000000b2'
\set C1 '00000000-0000-0000-0000-0000000000c1'
\set C2 '00000000-0000-0000-0000-0000000000c2'
\set D1 '00000000-0000-0000-0000-0000000000d1'

insert into properties values (:'A1', :'B1', 'trial', 24), (:'A2', :'B2', 'trial', 24);
insert into rooms (id, property_id, base_price, extra_guest_price, weekend_multiplier, max_guests) values
  (:'C1', :'A1', 2000, 500, 1.25, 2), (:'C2', :'A1', 3000, 0, 1, 4), (:'D1', :'A2', 1000, 0, 1, 2);
insert into room_rates (property_id, room_id, label, start_date, end_date, kind, value, created_at) values
  (:'A1', :'C1', 'Christmas', '2026-12-24', '2027-01-02', 'fixed',   4000, '2026-10-01'),
  (:'A1', null,  'Winter',    '2026-12-20', '2027-01-05', 'percent',   10, '2026-10-02'),
  (:'A2', :'D1', 'Other',     '2026-12-20', '2027-01-05', 'fixed',   9999, '2026-10-02');

-- 1. SQL price == the JS calculator's answers (src/lib/roomRates.test.ts) ---------
select t_assert((select (room_price, extra_guest_charge, total) = (14000, 3000, 17000) from stay_room_price(:'C1', '2026-12-25', '2026-12-28', 4)), 'peak fixed rate + weekend multiplier + extra guests');
select t_assert((select total = 9900  from stay_room_price(:'C2', '2026-12-25', '2026-12-28', 2)), 'all-rooms +10% applies to the other room');
select t_assert((select total = 15000 from stay_room_price(:'C1', '2026-10-12', '2026-10-19', 2)), 'no rate: base price, Fri/Sat multiplier');
select t_assert((select room_price = 4000*1.25*2 + 2200 from stay_room_price(:'C1', '2027-01-01', '2027-01-04', 2)), 'end_date is the LAST night (inclusive); the all-rooms +10% takes over on 3 Jan');
select t_assert((select count(*) = 0 from stay_room_price(:'C1', '2026-12-28', '2026-12-25', 2)), 'reversed dates price nothing');

-- helper: run a block as a guest/owner and expect a specific error
-- 2. A guest cannot choose their own price or status ------------------------------
do $$ begin
  perform set_config('request.jwt.claim.role', 'anon', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  insert into bookings (property_id, room_id, guest_name, guest_phone, guest_count, check_in, check_out, room_price, extra_guest_charge, total_amount, status, is_paid, advance_amount, discount_amount, commission_amount, source, hold_expires_at)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Mallory', '999', 4, '2026-12-25', '2026-12-28', 1, 0, 1, 'confirmed', true, 99999, 99999, 500, 'agent', now() + interval '999 days');
  reset role;
end $$;
select t_assert((select (total_amount, room_price, extra_guest_charge) = (17000, 14000, 3000) from bookings where guest_name = 'Mallory'), 'guest total re-priced by the database');
select t_assert((select (status, is_paid, advance_amount, discount_amount, source) = ('pending', false, 0, 0, 'direct') and commission_amount is null from bookings where guest_name = 'Mallory'), 'guest cannot self-confirm, pre-pay, discount or add a commission');
select t_assert((select hold_expires_at <= now() + interval '24 hours 1 minute' and hold_expires_at > now() from bookings where guest_name = 'Mallory'), 'hold expiry capped');

-- 3. Invalid guest inserts are rejected --------------------------------------------
do $$ declare r text; begin
  perform set_config('request.jwt.claim.role', 'anon', true); perform set_config('request.jwt.claim.sub', '', true);
  foreach r in array array['0|2026-12-25|2026-12-28|00000000-0000-0000-0000-0000000000c1', '2|2026-12-28|2026-12-25|00000000-0000-0000-0000-0000000000c1', '2|2026-12-25|2026-12-26|00000000-0000-0000-0000-0000000000d1'] loop
    begin
      set local role anon;
      insert into bookings (property_id, room_id, guest_count, check_in, check_out, total_amount)
      values ('00000000-0000-0000-0000-0000000000a1', split_part(r, '|', 4)::uuid, split_part(r, '|', 1)::int, split_part(r, '|', 2)::date, split_part(r, '|', 3)::date, 1);
      reset role;
      raise exception 'TEST_NO_ERROR %', r;
    exception when others then
      reset role;
      if sqlerrm like 'TEST_NO_ERROR%' then raise; end if;
    end;
  end loop;
end $$;

-- 4. The property's owner keeps full control (negotiated price, status, advance) ---
do $$ begin
  perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  set local role authenticated;
  insert into bookings (property_id, room_id, guest_name, guest_count, check_in, check_out, room_price, extra_guest_charge, total_amount, status, advance_amount, discount_amount, source)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Owner deal', 2, '2026-12-25', '2026-12-28', 5000, 0, 5000, 'confirmed', 1000, 200, 'walk_in');
  reset role;
end $$;
select t_assert((select (total_amount, status, advance_amount, discount_amount, source) = (5000, 'confirmed', 1000, 200, 'walk_in') from bookings where guest_name = 'Owner deal'), 'owner insert untouched');

-- 5. Another signed-in user is treated like a guest on a property they don't own ----
do $$ begin
  perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  set local role authenticated;
  insert into bookings (property_id, room_id, guest_name, guest_count, check_in, check_out, total_amount, status, advance_amount)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', 'Other owner', 2, '2026-10-12', '2026-10-13', 1, 'confirmed', 500);
  reset role;
end $$;
select t_assert((select (total_amount, status, advance_amount) = (3000, 'pending', 0) from bookings where guest_name = 'Other owner'), 'non-owner re-priced');

-- 6. SQL editor / service role / cron are untouched -----------------------------------
select set_config('request.jwt.claim.role', '', false), set_config('request.jwt.claim.sub', '', false) \gset
insert into bookings (property_id, room_id, guest_name, guest_count, check_in, check_out, total_amount, status) values (:'A1', :'C2', 'Service', 2, '2026-11-01', '2026-11-02', 123, 'confirmed');
select t_assert((select (total_amount, status) = (123, 'confirmed') from bookings where guest_name = 'Service'), 'service/SQL-editor insert untouched');
select set_config('request.jwt.claim.role', 'service_role', false) \gset
insert into bookings (property_id, room_id, guest_name, guest_count, check_in, check_out, total_amount, status) values (:'A1', :'C2', 'Service2', 2, '2026-11-05', '2026-11-06', 77, 'confirmed');
select t_assert((select total_amount = 77 from bookings where guest_name = 'Service2'), 'service_role insert untouched');
select set_config('request.jwt.claim.role', '', false) \gset

-- 7. Guest group total = sum of the member bookings ------------------------------------
do $$ begin
  perform set_config('request.jwt.claim.role', 'anon', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  insert into booking_groups (id, property_id, group_reference, guest_name, guest_count, check_in, check_out, total_amount, status, is_paid, advance_amount)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'GRP-X', 'Group guest', 4, '2026-12-25', '2026-12-28', 1, 'confirmed', true, 5000);
  insert into bookings (property_id, room_id, group_id, guest_name, guest_count, check_in, check_out, total_amount) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'Group guest', 2, '2026-12-25', '2026-12-28', 1),
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000f1', 'Group guest', 2, '2026-12-25', '2026-12-28', 1);
  reset role;
end $$;
select t_assert((select (total_amount, status, is_paid, advance_amount) = (23900, 'pending', false, 0) from booking_groups where group_reference = 'GRP-X'), 'group total = 14000 + 9900, still pending/unpaid');

-- 8. room_rates: guests read, only the property's owner writes ---------------------------
do $$ declare n int; begin
  perform set_config('request.jwt.claim.role', 'anon', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*) into n from room_rates;
  perform t_assert(n = 3, 'anon can read rates');
  begin
    insert into room_rates (property_id, room_id, start_date, end_date, kind, value) values ('00000000-0000-0000-0000-0000000000a1', null, '2026-11-01', '2026-11-02', 'fixed', 1);
    raise exception 'TEST_NO_ERROR anon rate insert';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  reset role;
end $$;
do $$ declare r text; begin
  perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  foreach r in array array[
    '00000000-0000-0000-0000-0000000000a1|', -- other owner, property a1
    '00000000-0000-0000-0000-0000000000a2|00000000-0000-0000-0000-0000000000c1'  -- own property but someone else's room
  ] loop
    begin
      set local role authenticated;
      insert into room_rates (property_id, room_id, start_date, end_date, kind, value)
      values (split_part(r, '|', 1)::uuid, nullif(split_part(r, '|', 2), '')::uuid, '2026-11-01', '2026-11-02', 'fixed', 1);
      reset role;
      raise exception 'TEST_NO_ERROR %', r;
    exception when others then reset role; if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  end loop;
end $$;
do $$ begin
  perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  set local role authenticated;
  insert into room_rates (property_id, room_id, label, start_date, end_date, kind, value) values ('00000000-0000-0000-0000-0000000000a1', null, 'Owner can', '2026-11-01', '2026-11-02', 'percent', 15);
  begin
    insert into room_rates (property_id, room_id, start_date, end_date, kind, value) values ('00000000-0000-0000-0000-0000000000a1', null, '2026-11-01', '2026-11-02', 'percent', 12.5);
    raise exception 'TEST_NO_ERROR fractional percent';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  reset role;
end $$;

-- 9. room_ical_feeds: owner-only, https only ----------------------------------------------
insert into room_ical_feeds (property_id, room_id, name, url) values (:'A1', :'C1', 'Booking.com', 'https://admin.booking.com/x.ics?s=secret');
do $$ declare n int; begin
  perform set_config('request.jwt.claim.role', 'anon', true); perform set_config('request.jwt.claim.sub', '', true);
  begin set local role anon; select count(*) into n from room_ical_feeds; perform t_assert(false, 'anon must not read feed links');
  exception when insufficient_privilege then reset role; end;
  perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  set local role authenticated; select count(*) into n from room_ical_feeds; reset role;
  perform t_assert(n = 0, 'another owner cannot see feed links');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  set local role authenticated; select count(*) into n from room_ical_feeds; perform t_assert(n = 1, 'owner sees own feed links');
  begin
    insert into room_ical_feeds (property_id, room_id, name, url) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Bad', 'http://insecure.example/x.ics');
    raise exception 'TEST_NO_ERROR http url';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  begin
    insert into room_ical_feeds (property_id, room_id, name, url) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', 'Wrong room', 'https://x.example/a.ics');
    raise exception 'TEST_NO_ERROR room mismatch';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  reset role;
end $$;

-- 10. delete_agent_with_commissions: clears commission records, keeps bookings, deletes the agent --------
insert into agents values ('99999999-9999-4999-8999-999999999991', :'A1', 'Anil'), ('99999999-9999-4999-8999-999999999992', :'A1', 'Other agent');
insert into booking_groups (id, property_id, group_reference, guest_name, check_in, check_out, source, agent_id, commission_amount, commission_paid, status, total_amount)
  values ('88888888-8888-4888-8888-888888888881', :'A1', 'GRP-AG', 'G', '2027-05-01', '2027-05-03', 'agent', '99999999-9999-4999-8999-999999999991', 700, true, 'confirmed', 100);
insert into bookings (id, property_id, room_id, guest_name, guest_phone, guest_count, check_in, check_out, room_price, total_amount, status, source, agent_id, commission_amount, commission_paid) values
  ('77777777-7777-4777-8777-777777777771', :'A1', :'C1', 'A', '9', 2, '2027-06-01', '2027-06-03', 1000, 1000, 'confirmed', 'agent', '99999999-9999-4999-8999-999999999991', 250, false),
  ('77777777-7777-4777-8777-777777777772', :'A1', :'C2', 'B', '9', 2, '2027-07-01', '2027-07-03', 1000, 1000, 'cancelled', 'agent', '99999999-9999-4999-8999-999999999991', 300, true),
  ('77777777-7777-4777-8777-777777777773', :'A1', :'C2', 'Keep', '9', 2, '2027-08-01', '2027-08-03', 1000, 1000, 'confirmed', 'agent', '99999999-9999-4999-8999-999999999992', 100, false);
select t_assert((select (r->>'bookings')::int = 2 and (r->>'groups')::int = 1 from (select delete_agent_with_commissions('99999999-9999-4999-8999-999999999991') as r) x), 'returns how many records it cleared');
select t_assert((select count(*) = 1 from agents), 'only the chosen agent is deleted');
select t_assert((select count(*) = 0 from bookings where id in ('77777777-7777-4777-8777-777777777771','77777777-7777-4777-8777-777777777772') and (agent_id is not null or commission_amount is not null or commission_paid)), 'commission records on the agents bookings are cleared');
select t_assert((select count(*) = 2 from bookings where id in ('77777777-7777-4777-8777-777777777771','77777777-7777-4777-8777-777777777772') and source = 'agent' and total_amount = 1000), 'the bookings themselves, their amounts and source are kept');
select t_assert((select agent_id is null and commission_amount is null and not commission_paid from booking_groups where id = '88888888-8888-4888-8888-888888888881'), 'group commission cleared too');
select t_assert((select agent_id is not null and commission_amount = 100 from bookings where id = '77777777-7777-4777-8777-777777777773'), 'another agents bookings are untouched');
do $$ begin
  begin
    perform delete_agent_with_commissions('99999999-9999-4999-8999-999999999999');
    raise exception 'TEST_NO_ERROR unknown agent';
  exception when others then
    if sqlerrm like 'TEST_NO_ERROR%' then raise; end if;
    perform t_assert(sqlerrm = 'AGENT_NOT_FOUND', 'unknown agent raises AGENT_NOT_FOUND');
  end;
end $$;

-- 9. add-ons / packages: guests read only ACTIVE items of a live property, nobody but the owner writes -----
-- (property a1 is owned by b1, a2 by b2; both are trial/active in the stub. Inserts below run as superuser.)
reset role;
insert into properties (id, owner_id, subscription_status) values ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000b9', 'expired') on conflict do nothing;
insert into addons (property_id, name, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Live active', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Live hidden', false),
  ('00000000-0000-0000-0000-0000000000a9', 'Expired property', true);
insert into packages (property_id, name, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Live package', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Hidden package', false),
  ('00000000-0000-0000-0000-0000000000a9', 'Expired package', true);
do $$ declare n int; begin
  perform set_config('request.jwt.claim.role', 'anon', true); perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*) into n from addons;   perform t_assert(n = 1, 'anon sees only the active add-on of a live property');
  select count(*) into n from packages; perform t_assert(n = 1, 'anon sees only the active package of a live property');
  begin
    insert into addons (property_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'anon write');
    raise exception 'TEST_NO_ERROR anon addon insert';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  begin
    update packages set name = 'hacked';
    get diagnostics n = row_count;
    perform t_assert(n = 0, 'anon cannot update packages');
  end;
  reset role;
end $$;
do $$ declare n int; begin
  perform set_config('request.jwt.claim.role', 'authenticated', true); perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  set local role authenticated;
  select count(*) into n from addons where property_id = '00000000-0000-0000-0000-0000000000a1';
  perform t_assert(n = 2, 'owner still sees their active and hidden add-ons');
  insert into addons (property_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Owner can write');
  begin
    insert into addons (property_id, name) values ('00000000-0000-0000-0000-0000000000a2', 'other owners property');
    raise exception 'TEST_NO_ERROR cross-owner addon insert';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  reset role;
end $$;

-- 10. gallery photos and Instagram handle on properties -------------------------------------
reset role;
select t_assert((select gallery_images = '{}' and instagram_handle is null from properties where id = '00000000-0000-0000-0000-0000000000a1'), 'existing properties start with an empty gallery and no handle');
do $$ begin
  update properties set gallery_images = array['u1','u2'], instagram_handle = 'hill.view_1' where id = '00000000-0000-0000-0000-0000000000a1';
  perform t_assert((select cardinality(gallery_images) = 2 and instagram_handle = 'hill.view_1' from properties where id = '00000000-0000-0000-0000-0000000000a1'), 'photos and a valid handle can be saved');
  begin
    update properties set gallery_images = (select array_agg('u' || g) from generate_series(1, 13) g) where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'TEST_NO_ERROR 13 photos';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  update properties set gallery_images = (select array_agg('u' || g) from generate_series(1, 12) g) where id = '00000000-0000-0000-0000-0000000000a1';
  perform t_assert((select cardinality(gallery_images) = 12 from properties where id = '00000000-0000-0000-0000-0000000000a1'), '12 photos is allowed');
  begin
    update properties set instagram_handle = 'not a handle!' where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'TEST_NO_ERROR bad handle';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  begin
    update properties set instagram_handle = '@hillview' where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'TEST_NO_ERROR handle with @';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  update properties set instagram_handle = null where id = '00000000-0000-0000-0000-0000000000a1';
end $$;

-- 11. room photos: up to 8 stored, more refused ------------------------------------------------
reset role;
do $$ declare rid uuid; begin
  select id into rid from rooms limit 1;
  update rooms set images = array['a','b','c','d','e','f','g','h'] where id = rid;
  perform t_assert((select cardinality(images) = 8 from rooms where id = rid), '8 room photos are allowed');
  begin
    update rooms set images = array['a','b','c','d','e','f','g','h','i'] where id = rid;
    raise exception 'TEST_NO_ERROR 9 room photos';
  exception when others then if sqlerrm like 'TEST_NO_ERROR%' then raise; end if; end;
  update rooms set images = '{}' where id = rid;
  update rooms set images = null where id = rid;
end $$;

\echo 'ALL DATABASE TESTS PASSED'
