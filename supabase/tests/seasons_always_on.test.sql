-- 20261110000000_seasons_always_on: run AFTER migrations.test.sql and seasons.test.sql
-- (the flip changes the default the older tests rely on).
\set A '00000000-0000-0000-0000-0000000000b1'
\set B '00000000-0000-0000-0000-0000000000b2'
\set RM '00000000-0000-0000-0000-0000000000b3'
-- a property still on the old model WITH an uncopied old rate: the migration must refuse it
insert into properties (id, owner_id, subscription_status, season_pricing_v2) values (:'A', null, 'trial', false);
insert into rooms (id, property_id, base_price, max_guests) values (:'RM', :'A', 2000, 2);
insert into room_rates (property_id, room_id, label, start_date, end_date, kind, value) values (:'A', null, 'Late', '2027-05-01', '2027-05-05', 'percent', 10);
-- (the guard's error below is expected)
\set ON_ERROR_STOP off
\i supabase/migrations/20261110000000_seasons_always_on.sql
\set ON_ERROR_STOP on
select t_assert((select not season_pricing_v2 from properties where id = :'A'), 'guard: a property with uncopied rates is NOT switched');
-- copy it (re-apply the copy migration), then the flip succeeds
\i supabase/migrations/20261109000000_unified_seasons.sql
\i supabase/migrations/20261110000000_seasons_always_on.sql
select t_assert((select season_pricing_v2 from properties where id = :'A'), 'after the copy, the property is switched');
select t_assert((select bool_and(season_pricing_v2) from properties), 'every property is switched');
insert into properties (id, owner_id, subscription_status) values (:'B', null, 'trial');
select t_assert((select season_pricing_v2 from properties where id = :'B'), 'a NEW property starts on seasons');
select t_assert((select room_price = 2200 from stay_room_price(:'RM', '2027-05-02', '2027-05-03', 2)), 'the late rate is priced through its season');
\echo 'ALWAYS-ON TESTS PASSED'
