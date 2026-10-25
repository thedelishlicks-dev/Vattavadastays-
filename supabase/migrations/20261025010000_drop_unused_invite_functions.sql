-- Drops three invite functions superseded by the invite-owner Edge Function.
-- Checked 25 Oct 2026: nothing in the app or in other database functions calls
-- them. The invite_tokens table is kept (create_property_with_invite uses it).
-- Safe to run more than once.

drop function if exists public.consume_invite_token(text);
drop function if exists public.create_owner_auth_user(text, text, uuid, text);
drop function if exists public.get_invite_by_token(text);
