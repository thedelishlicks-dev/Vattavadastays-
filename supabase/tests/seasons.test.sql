-- Behaviour tests for 20261109000000_unified_seasons.
-- Run by supabase/tests/run.sh AFTER migrations.test.sql, from the repository root
-- (the \set below reads supabase/tests/season_parity_cases.json, which
-- src/lib/roomRates.test.ts asserts too: SQL and TypeScript must agree).

\set parity `cat supabase/tests/season_parity_cases.json`
select set_config('t.parity', :'parity', false);

-- 1. Parity: every case in the shared fixture, priced by room_night_base_seasons() ------------
do $$
declare
  fx jsonb := current_setting('t.parity')::jsonb;
  c jsonb; s jsonb; r jsonb; k jsonb; got numeric; n int := 0;
  prop uuid := '00000000-0000-0000-0000-0000000000f1';
begin
  for c in select * from jsonb_array_elements(fx -> 'cases') loop
    delete from season_room_rules where property_id = prop;
    delete from price_seasons where property_id = prop;
    delete from rooms where property_id = prop;
    delete from properties where id = prop;
    insert into properties (id, owner_id, subscription_status, season_pricing_v2) values (prop, null, 'trial', true);
    for r in select * from jsonb_array_elements(fx -> 'rooms') loop
      insert into rooms (id, property_id, base_price, max_guests) values ((r ->> 'id')::uuid, prop, (r ->> 'base_price')::numeric, 2);
    end loop;
    for s in select * from jsonb_array_elements(c -> 'seasons') loop
      insert into price_seasons (id, property_id, name, start_date, end_date, recurs_yearly, priority)
      values ((s ->> 'id')::uuid, prop, s ->> 'name', (s ->> 'start')::date, (s ->> 'end')::date, (s ->> 'yearly')::boolean, (s ->> 'priority')::int);
    end loop;
    for r in select * from jsonb_array_elements(c -> 'rules') loop
      insert into season_room_rules (property_id, season_id, room_id, kind, value)
      values (prop, (r ->> 'season')::uuid, nullif(r ->> 'room', '')::uuid, r ->> 'kind', (r ->> 'value')::numeric);
    end loop;
    for k in select * from jsonb_array_elements(c -> 'checks') loop
      got := room_night_base_seasons((k ->> 'room')::uuid, (k ->> 'date')::date);
      if got is distinct from (k ->> 'expect')::numeric then
        raise exception 'PARITY FAILED in "%": room % on % expected % got %', c ->> 'name', k ->> 'room', k ->> 'date', k ->> 'expect', got;
      end if;
      n := n + 1;
    end loop;
  end loop;
  raise notice 'parity: % checks ok', n;
  delete from season_room_rules where property_id = prop;
  delete from price_seasons where property_id = prop;
  delete from rooms where property_id = prop;
  delete from properties where id = prop;
end $$;

-- 2. Switch off = exactly the old behaviour; switch on = the new rules -----------------------------
\set P '00000000-0000-0000-0000-0000000000f2'
\set RM '00000000-0000-0000-0000-0000000000f3'
insert into properties (id, owner_id, subscription_status) values (:'P', '00000000-0000-0000-0000-0000000000f9', 'trial');
insert into rooms (id, property_id, base_price, extra_guest_price, weekend_multiplier, max_guests) values (:'RM', :'P', 2000, 500, 1.25, 2);
insert into room_rates (property_id, room_id, label, start_date, end_date, kind, value, created_at) values
  (:'P', :'RM', 'Christmas', '2026-12-24', '2027-01-02', 'fixed', 4000, '2026-10-01'),
  (:'P', null,  'Christmas', '2026-12-24', '2027-01-02', 'percent', 10, '2026-10-02'),
  (:'P', null,  '',          '2027-03-01', '2027-03-05', 'percent', -20, '2026-10-03');
select t_assert((select total = 4000*1.25*2 + 4000 + 2*500*3 from stay_room_price(:'RM', '2026-12-25', '2026-12-28', 4)), 'switch OFF: legacy room_rates price the stay as before');

-- 3. The one-time copy (re-run the copy block by re-applying the migration: it must not duplicate)
\i supabase/migrations/20261109000000_unified_seasons.sql
select t_assert((select count(*) = 3 from season_room_rules where property_id = :'P'), 'every room_rates row became exactly one rule');
select t_assert((select count(*) = 2 from price_seasons where property_id = :'P'), 'identical name + dates share ONE season; the unnamed one is its own');
select t_assert((select bool_and(for_addons = false) from price_seasons where property_id = :'P'), 'copied seasons do not touch add-on prices');
select t_assert((select name like 'Rates 1 Mar 2027%' from price_seasons where property_id = :'P' and name <> 'Christmas'), 'an unnamed rate is named from its dates');
select t_assert((select total = 4000*1.25*2 + 4000 + 2*500*3 from stay_room_price(:'RM', '2026-12-25', '2026-12-28', 4)), 'still switch OFF after the copy: price unchanged');

-- 4. Old vs new on the copied data: identical for every night of two years (the price check) ----------
select t_assert(
  (select count(*) = 0 from generate_series(date '2026-11-01', date '2028-11-01', interval '1 day') g
    where room_night_base_legacy(:'RM', g::date) is distinct from room_night_base_seasons(:'RM', g::date)),
  'copied rules price every night exactly like room_rates');

update properties set season_pricing_v2 = true where id = :'P';
select t_assert((select total = 4000*1.25*2 + 4000 + 2*500*3 from stay_room_price(:'RM', '2026-12-25', '2026-12-28', 4)), 'switch ON gives the same price for migrated data');
-- an edit through the new rules now matters, legacy edits no longer do
update season_room_rules set value = 5000 where property_id = :'P' and room_id = :'RM';
select t_assert((select room_price = 5000*1.25*2 + 5000 from stay_room_price(:'RM', '2026-12-25', '2026-12-28', 2)), 'switch ON: new rules are used');
update properties set season_pricing_v2 = false where id = :'P';
select t_assert((select room_price = 4000*1.25*2 + 4000 from stay_room_price(:'RM', '2026-12-25', '2026-12-28', 2)), 'switch back OFF = rollback: legacy price again');

-- 5. Guards ------------------------------------------------------------------------------
do $$
begin
  begin
    insert into season_room_rules (property_id, season_id, room_id, kind, value)
    values ('00000000-0000-0000-0000-0000000000a1', (select id from price_seasons where property_id = '00000000-0000-0000-0000-0000000000f2' limit 1), null, 'percent', 5);
    raise exception 'a rule pointing at another property''s season was accepted';
  exception when check_violation then null; end;
  begin
    insert into season_room_rules (property_id, season_id, room_id, kind, value)
    select '00000000-0000-0000-0000-0000000000f2', id, null, 'percent', 600 from price_seasons where property_id = '00000000-0000-0000-0000-0000000000f2' limit 1;
    raise exception 'percent 600 was accepted';
  exception when check_violation then null; end;
end $$;

-- 6. Who can do what (RLS + switch) -------------------------------------------------------
do $$
declare n int;
begin
  -- guests (anon) read seasons and rules of a live property, never write
  set local role anon;
  select count(*) into n from price_seasons where property_id = '00000000-0000-0000-0000-0000000000f2';
  if n = 0 then raise exception 'guests cannot read seasons'; end if;
  select count(*) into n from season_room_rules where property_id = '00000000-0000-0000-0000-0000000000f2';
  if n = 0 then raise exception 'guests cannot read season rules'; end if;
  begin
    insert into season_room_rules (property_id, season_id, kind, value)
    select property_id, id, 'percent', 5 from price_seasons where property_id = '00000000-0000-0000-0000-0000000000f2' limit 1;
    raise exception 'a guest could write a season rule';
  exception when insufficient_privilege then null; end;
  reset role;

  -- the owner can edit rules but cannot flip the rollout switch
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f9', true);
  set local role authenticated;
  update season_room_rules set value = 6 where property_id = '00000000-0000-0000-0000-0000000000f2' and room_id is null and kind = 'percent' and value = 10;
  begin
    update properties set season_pricing_v2 = true where id = '00000000-0000-0000-0000-0000000000f2';
    raise exception 'an owner flipped season_pricing_v2';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

\echo 'SEASON TESTS PASSED'
