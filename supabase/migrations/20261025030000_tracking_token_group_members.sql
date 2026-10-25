-- Group members share their group's tracking token.
--
-- The app now sends one token per submission: the group row and every room
-- row in that group carry the same token, so one link opens the whole stay
-- and the owner's per-room WhatsApp buttons can use the room row's token
-- directly. That needs a non-unique index on bookings (several rows can share
-- a token). The unique index from 20261025020000 is replaced here.
--
-- Also aligns existing group members with their group's token.
--
-- Run this BEFORE deploying the code that sends tracking_token on bookings.
-- Safe to run more than once.

drop index if exists public.bookings_tracking_token_key;

create index if not exists bookings_tracking_token_idx
  on public.bookings (tracking_token);

update public.bookings b
   set tracking_token = g.tracking_token
  from public.booking_groups g
 where b.group_id = g.id
   and g.tracking_token is not null
   and b.tracking_token is distinct from g.tracking_token;
