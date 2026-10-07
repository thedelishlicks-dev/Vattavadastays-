-- ============================================================================
-- Security hardening pass — see chat history for the full audit this comes
-- from. Every change below closes a gap where the ACTUAL enforcement point
-- (an RLS policy, or a SECURITY DEFINER function's grants/internal checks)
-- was looser than what the app's own UI assumed. None of this changes the
-- app's UI or normal owner/guest behavior — every policy here was checked
-- against exactly what useCreateBooking.ts, AddBookingModal.tsx, and
-- booking-status.tsx actually send, so legitimate flows keep working
-- unchanged. Apply this in a staging project first if you have one; if not,
-- at minimum apply SECTION 1 immediately (it's the one being actively
-- exploitable), then the rest.
-- ============================================================================


-- ============================================================================
-- SECTION 1 — CRITICAL: create_property_with_invite() and
-- link_property_owner() are SECURITY DEFINER functions with NO internal
-- caller check, and their EXECUTE grant currently includes `anon` — meaning
-- anyone on the internet, with no account at all, can call them right now
-- via the public anon key:
--   - link_property_owner(property_id, email) reassigns ANY property's
--     owner_id to whatever user matches that email — a full takeover of
--     any property on the platform by anyone who already has an account.
--   - create_property_with_invite(...) creates new properties and mints
--     valid 7-day invite tokens for anyone, with no auth at all.
-- Both are only ever called from the /superadmin route in the app, so they
-- should only ever succeed for the superadmin. Fixed two ways (belt and
-- suspenders): the grant is narrowed, AND the function itself now checks
-- the caller's email, matching the same hardcoded-superadmin-email pattern
-- already used by every other superadmin_* RLS policy in this project.
-- ============================================================================

revoke execute on function public.create_property_with_invite(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.link_property_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.create_property_with_invite(text, text, text, text, text, text) to authenticated;
grant execute on function public.link_property_owner(uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.create_property_with_invite(p_name text, p_subdomain text, p_owner_email text, p_area text, p_owner_name text, p_owner_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_property_id UUID;
  v_token TEXT;
  v_result JSONB;
BEGIN
  IF (auth.jwt() ->> 'email') IS DISTINCT FROM 'thedelishlicks@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF EXISTS (SELECT 1 FROM properties WHERE subdomain = p_subdomain) THEN
    RAISE EXCEPTION 'Subdomain % is already taken', p_subdomain;
  END IF;

  INSERT INTO properties (
    name, subdomain, area, owner_name,
    owner_phone, owner_whatsapp, is_active, subscription_status
  ) VALUES (
    p_name, p_subdomain, p_area, p_owner_name,
    p_owner_phone, p_owner_phone, true, 'trial'
  )
  RETURNING id INTO v_property_id;

  v_token := replace(gen_random_uuid()::TEXT, '-', '') ||
             replace(gen_random_uuid()::TEXT, '-', '');

  INSERT INTO invite_tokens (token, email, property_id)
  VALUES (v_token, p_owner_email, v_property_id);

  v_result := jsonb_build_object(
    'property_id', v_property_id,
    'subdomain', p_subdomain,
    'invite_token', v_token,
    'invite_link', 'https://vattavadastays.vercel.app/setup?token=' || v_token,
    'expires_at', (NOW() + INTERVAL '7 days')::TEXT
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_property_owner(p_property_id uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  if (auth.jwt() ->> 'email') is distinct from 'thedelishlicks@gmail.com' then
    raise exception 'Not authorized';
  end if;

  select id into v_user_id from auth.users where email = p_email limit 1;
  if v_user_id is null then
    raise exception 'No user found with email %', p_email;
  end if;
  update properties set owner_id = v_user_id where id = p_property_id;
end;
$function$;


-- ============================================================================
-- SECTION 2 — expire_stale_pending_bookings() is meant to run only as a
-- scheduled job (pg_cron under service_role), not be callable by the app or
-- its users. Low severity on its own (it only ever expires holds that are
-- ALREADY past their time — calling it early doesn't let anyone expire a
-- booking that isn't already due), but it has no business being reachable
-- by anon/authenticated at all. Tightened for cleanliness/defense-in-depth.
-- ============================================================================

revoke execute on function public.expire_stale_pending_bookings() from public, anon, authenticated;
-- postgres and service_role keep it implicitly (owner + superuser-like role).


-- ============================================================================
-- SECTION 3 — lookup_bookings_by_phone() / lookup_booking_groups_by_phone()
-- are correctly scoped by property_id + phone match (this was clearly a
-- previous, deliberate fix — see the comment in booking-status.tsx). Two
-- real gaps remained though:
--   a) No minimum-digit-count check INSIDE the function. The client only
--      validates the phone has >=10 digits before calling, which means
--      nothing to someone calling the RPC directly — e.g. calling with a
--      1-digit fragment returns every booking at that property whose phone
--      happens to end in that digit. Added the same length guard
--      server-side, where it actually matters.
--   b) `select b.*` / `select g.*` returned every column verbatim,
--      including agent_id, commission_amount, commission_paid,
--      commission_paid_date, payment_reference, and (bookings only)
--      invoice_notes — none of which a guest has any reason to receive,
--      even for their own booking. These are now stripped out with jsonb
--      subtraction (keeps every other column, including any added later,
--      so this can't silently start hiding a field the guest page needs).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lookup_bookings_by_phone(p_phone text, p_property_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(
    (to_jsonb(b) - 'agent_id' - 'commission_amount' - 'commission_paid'
                 - 'commission_paid_date' - 'payment_reference' - 'invoice_notes')
    || jsonb_build_object(
         'booking_charges', (
           select coalesce(jsonb_agg(bc), '[]'::jsonb)
           from booking_charges bc
           where bc.booking_id = b.id
         ),
         'rooms', (
           select jsonb_build_object('name', r.name)
           from rooms r
           where r.id = b.room_id
         )
       )
    order by b.created_at desc
  ), '[]'::jsonb)
  from bookings b
  where b.property_id = p_property_id
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
    and regexp_replace(b.guest_phone, '\D', '', 'g')
        like '%' || right(regexp_replace(p_phone, '\D', '', 'g'), 10)
$function$;

CREATE OR REPLACE FUNCTION public.lookup_booking_groups_by_phone(p_phone text, p_property_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(
    to_jsonb(g) - 'agent_id' - 'commission_amount' - 'commission_paid'
                - 'commission_paid_date' - 'payment_reference'
  ), '[]'::jsonb)
  from booking_groups g
  where g.property_id = p_property_id
    and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 10
    and regexp_replace(g.guest_phone, '\D', '', 'g')
        like '%' || right(regexp_replace(p_phone, '\D', '', 'g'), 10)
$function$;

-- get_invite_by_token() was reviewed and left as-is: it's correctly gated by
-- the token itself (two concatenated gen_random_uuid()s — unguessable), and
-- anon/authenticated access is required by design since a brand-new owner
-- following an invite link isn't logged in yet.


-- ============================================================================
-- SECTION 4 — bookings/booking_groups had exactly one INSERT policy each
-- (public_insert_booking / public_insert_booking_group), both completely
-- unconditional (`with_check: true`). That's the policy BOTH the public
-- guest-booking flow AND the owner's own "Add booking" flow relied on —
-- there was no separate owner-scoped insert policy at all. As written,
-- anyone with the anon key could insert a booking for ANY property (not
-- just their own or one they're actually booking) with status already
-- 'confirmed'/is_paid already true, an arbitrary total_amount, or a forged
-- agent_id + commission_amount.
--
-- Split into two policies per table, mirroring the shape
-- owners_update_bookings/owners_delete_bookings already use:
--   - owners_insert_*: unrestricted (beyond owning the property) — the
--     owner is trusted with their own data, exactly as UPDATE/DELETE
--     already trust them.
--   - public_insert_*: tightened to the exact shape useCreateBooking.ts
--     actually sends (verified against its source directly) — pending,
--     unpaid, no advance/discount, no agent/commission, not already
--     checked in/out, and only for a property that's actually active.
-- Postgres OR's multiple permissive policies together, so both flows keep
-- working exactly as before; only a raw API call trying to sneak in values
-- outside that shape now gets rejected.
-- ============================================================================

create policy "owners_insert_bookings" on bookings
  for insert
  with check (
    property_id in (select properties.id from properties where properties.owner_id = auth.uid())
  );

drop policy "public_insert_booking" on bookings;
create policy "public_insert_booking" on bookings
  for insert
  with check (
    status = 'pending'
    and is_paid = false
    and coalesce(advance_amount, 0) = 0
    and coalesce(discount_amount, 0) = 0
    and agent_id is null
    and commission_amount is null
    and commission_paid = false
    and checked_in_at is null
    and checked_out_at is null
    and property_id in (
      select id from properties
      where is_active = true and subscription_status in ('trial', 'active')
    )
  );

create policy "owners_insert_booking_groups" on booking_groups
  for insert
  with check (
    property_id in (select properties.id from properties where properties.owner_id = auth.uid())
  );

drop policy "public_insert_booking_group" on booking_groups;
create policy "public_insert_booking_group" on booking_groups
  for insert
  with check (
    status = 'pending'
    and is_paid = false
    and coalesce(advance_amount, 0) = 0
    and coalesce(discount_amount, 0) = 0
    and agent_id is null
    and commission_amount is null
    and commission_paid = false
    and property_id in (
      select id from properties
      where is_active = true and subscription_status in ('trial', 'active')
    )
  );


-- ============================================================================
-- SECTION 5 — booking_groups had no public DELETE policy at all, but
-- useCreateBooking.ts's own rollback path (when the group insert succeeds
-- but the per-room bookings insert then fails) tries to delete that group
-- row to avoid leaving it orphaned. Under RLS that delete was silently
-- matching zero rows every time — not erroring, just doing nothing — so a
-- failed multi-room booking attempt would leave a phantom empty group
-- (with real guest name/phone, zero actual rooms) sitting in the owner's
-- dashboard forever. Scoped tightly to the exact rollback case only: a
-- still-pending group with zero bookings attached. Can't be used to delete
-- anyone's real reservation, since a group with any attached booking will
-- never match.
-- ============================================================================

create policy "public_delete_orphaned_pending_group" on booking_groups
  for delete
  using (
    status = 'pending'
    and not exists (select 1 from bookings where bookings.group_id = booking_groups.id)
  );


-- ============================================================================
-- SECTION 6 — availability's SELECT policy was `using (true)` — fully
-- public, unscoped, across every property including inactive ones. That
-- includes the free-text `note` field owners type into BlockDatesModal
-- (e.g. "family visiting"), which they'd reasonably assume was private to
-- their own dashboard. Scoped to match rooms' own visibility rule: only
-- rows for rooms belonging to an active property.
-- ============================================================================

drop policy "public_read_availability" on availability;
create policy "public_read_availability" on availability
  for select
  using (
    room_id in (
      select r.id from rooms r
      join properties p on p.id = r.property_id
      where p.is_active = true
    )
  );


-- ============================================================================
-- SECTION 7 — rooms' public SELECT policy only checked the PROPERTY's
-- is_active, never the room's own is_active. The "Inactive — hidden from
-- new guests" toggle (relied on by the room-delete fix, so an owner has a
-- safe alternative to deleting a room with upcoming bookings) was only
-- being enforced by the trusted client filtering it out client-side — a
-- direct API call still returned inactive rooms.
-- ============================================================================

drop policy "public_read_active_rooms" on rooms;
create policy "public_read_active_rooms" on rooms
  for select
  using (
    is_active = true
    and exists (
      select 1 from properties
      where properties.id = rooms.property_id and properties.is_active = true
    )
  );


-- ============================================================================
-- SECTION 8 — properties had TWO separate policies that each independently
-- allow self-insert, so narrowing just one isn't enough:
--   1. owners_manage_property (ALL) — with_check (owner_id = auth.uid()),
--      trivially satisfiable by any authenticated user on a brand new row.
--   2. superadmin_read_all (ALL) — despite its name, this is also an ALL
--      policy, with qual `(owner_id = auth.uid()) OR (auth.email() =
--      '...')` and NO explicit WITH CHECK. In Postgres, when an ALL/INSERT
--      policy omits WITH CHECK, the USING expression is reused as the
--      check — so this policy ALSO independently permits the exact same
--      self-insert, via its own `owner_id = auth.uid()` branch, regardless
--      of what #1 says.
-- Neither self-insert path is used anywhere in the app — every property
-- creation goes through create_property_with_invite() (subdomain
-- uniqueness, invite token, trial status). And superadmin_read_all is
-- fully redundant once you have superadmin_manage_properties (ALL,
-- already scoped purely to the hardcoded superadmin email, no owner_id
-- branch at all) — so rather than narrow it, it's dropped outright.
--
-- If self-serve signup (without the superadmin's invite flow) IS actually
-- wanted, don't apply this section — everything else in this migration is
-- independent of it.
-- ============================================================================

drop policy "owners_manage_property" on properties;
drop policy "superadmin_read_all" on properties;

create policy "owners_select_property" on properties
  for select
  using (owner_id = auth.uid());

create policy "owners_update_property" on properties
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners_delete_property" on properties
  for delete
  using (owner_id = auth.uid());


-- ============================================================================
-- SECTION 9 — leads' superadmin_read_leads policy used
-- current_setting('app.superadmin_email', true) instead of the hardcoded
-- email literal every OTHER superadmin_* policy in this project uses. If
-- that database-level custom setting was never explicitly configured (via
-- `alter database ... set app.superadmin_email = ...`), current_setting(...,
-- true) silently returns NULL and the policy is never true for ANYONE,
-- including the real superadmin — a fail-closed bug rather than a security
-- hole, but still worth aligning with the pattern that's confirmed working
-- everywhere else.
-- ============================================================================

drop policy "superadmin_read_leads" on leads;
create policy "superadmin_read_leads" on leads
  for select
  using ((auth.jwt() ->> 'email') = 'thedelishlicks@gmail.com');
