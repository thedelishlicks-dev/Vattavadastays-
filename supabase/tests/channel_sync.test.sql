-- Tests for 20261122000000_channel_sync_per_property: the per-property switch and the
-- database-level safeguards on room_ical_feeds. Runs right after migrations.test.sql
-- (reuses its properties A1/A2, rooms C1/C2/D1 and owners B1/B2).

\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set C1 '00000000-0000-0000-0000-0000000000c1'
\set C2 '00000000-0000-0000-0000-0000000000c2'
\set D1 '00000000-0000-0000-0000-0000000000d1'

-- 1. Off by default; on only where migrations.test.sql switched it on
select t_assert((select channel_sync_enabled = false from properties where id = :'A2'), 'a property starts with channel sync OFF');
select t_assert((select channel_sync_enabled = true from properties where id = :'A1'), 'the platform admin / SQL can switch it ON');

-- 2. An owner cannot switch it on for themselves
do $$ begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  set local role authenticated;
  begin
    update properties set channel_sync_enabled = true where id = '00000000-0000-0000-0000-0000000000a2';
    raise exception 'an owner flipped channel_sync_enabled';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;
select t_assert((select channel_sync_enabled = false from properties where id = :'A2'), 'owner could not switch channel sync on');

-- 3. A switched-off property cannot save import links (even as its own owner)
do $$ declare msg text; begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);
  set local role authenticated;
  begin
    insert into room_ical_feeds (property_id, room_id, name, url)
    values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1', 'Booking.com', 'https://admin.booking.com/y.ics');
    raise exception 'TEST_NO_ERROR switched-off property saved a feed';
  exception when others then
    if sqlerrm like 'TEST_NO_ERROR%' then raise; end if;
    msg := sqlerrm;
  end;
  reset role;
  perform t_assert(msg like '%not switched on%', 'switched-off property: ' || coalesce(msg, 'no message'));
end $$;

-- 4. A room cannot import its OWN export link; another room's link and ordinary links are fine
do $$
declare
  own text[] := array[
    'https://stayidom.in/api/ical?room=00000000-0000-0000-0000-0000000000c1',
    'https://bleaf.stayidom.in/api/ical?room=00000000-0000-0000-0000-0000000000C1',
    'webcal://example.vercel.app/api/ical?room=00000000-0000-0000-0000-0000000000c1.ics',
    'https://stayidom.in/api/ical.ics?room=00000000-0000-0000-0000-0000000000c1&x=1'
  ];
  u text;
begin
  foreach u in array own loop
    begin
      insert into room_ical_feeds (property_id, room_id, name, url)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'SelfTest', u);
      raise exception 'TEST_NO_ERROR own link accepted: %', u;
    exception when check_violation then null;
    end;
  end loop;

  insert into room_ical_feeds (property_id, room_id, name, url) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'OtherRoomTest', 'https://stayidom.in/api/ical?room=00000000-0000-0000-0000-0000000000c2'),
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'PlainTest', 'https://x.example/other?room=00000000-0000-0000-0000-0000000000c1');

  begin
    update room_ical_feeds set url = 'https://stayidom.in/api/ical?room=00000000-0000-0000-0000-0000000000c1' where name = 'PlainTest';
    raise exception 'TEST_NO_ERROR update to own link accepted';
  exception when check_violation then null;
  end;

  begin
    update room_ical_feeds set room_id = '00000000-0000-0000-0000-0000000000c2' where name = 'OtherRoomTest';
    raise exception 'TEST_NO_ERROR moving a feed under the room it points at accepted';
  exception when check_violation then null;
  end;
end $$;
select t_assert((select count(*) = 2 from room_ical_feeds where name in ('OtherRoomTest', 'PlainTest')), 'other-room and ordinary links were saved');
delete from room_ical_feeds where name in ('OtherRoomTest', 'PlainTest');

\echo 'CHANNEL SYNC TESTS PASSED'
