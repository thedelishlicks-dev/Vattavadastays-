CREATE OR REPLACE FUNCTION public._is_guest_insert(p_property_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(auth.role(), '') in ('anon', 'authenticated')
     and not exists (
       select 1 from public.properties p
       where p.id = p_property_id and p.owner_id = auth.uid()
     );
$function$;


CREATE OR REPLACE FUNCTION public.client_errors_flood_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (select count(*) from public.client_errors
       where created_at > now() - interval '1 hour') >= 1000 then
    raise exception 'client_errors: hourly limit reached';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.consume_invite_token(p_token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE invite_tokens
  SET used_at = NOW()
  WHERE token = p_token
    AND used_at IS NULL;
END;
$function$;


CREATE OR REPLACE FUNCTION public.create_owner_auth_user(p_email text, p_password text, p_property_id uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_user_id UUID;
  v_identity_exists BOOLEAN;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

  IF v_user_id IS NULL THEN
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data,
      raw_user_meta_data, is_super_admin, role
    ) VALUES (
      gen_random_uuid(), p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider":"email","providers":["email"]}',
      '{}', false, 'authenticated'
    )
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = NOW(),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = v_user_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_user_id AND provider = 'email'
  ) INTO v_identity_exists;

  IF NOT v_identity_exists THEN
    INSERT INTO auth.identities (
      id, user_id, provider, provider_id, identity_data, created_at, updated_at
    ) VALUES (
      v_user_id,
      v_user_id,
      'email',
      p_email,
      jsonb_build_object('sub', v_user_id::TEXT, 'email', p_email),
      NOW(),
      NOW()
    );
  END IF;

  UPDATE invite_tokens SET used_at = NOW()
  WHERE token = p_token AND used_at IS NULL;

  UPDATE properties SET owner_id = v_user_id
  WHERE id = p_property_id;

  RETURN jsonb_build_object('user_id', v_user_id);
END;
$function$;


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


CREATE OR REPLACE FUNCTION public.enforce_booking_room_matches_property()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.rooms r
    where r.id = new.room_id and r.property_id = new.property_id
  ) then
    raise exception 'Room does not belong to this property' using errcode = '23514';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.enforce_guest_booking_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_price record;
  v_hours integer;
begin
  if not public._is_guest_insert(new.property_id) then
    return new;
  end if;

  if new.check_out is null or new.check_in is null or new.check_out <= new.check_in then
    raise exception 'check-out must be after check-in' using errcode = '23514';
  end if;
  if coalesce(new.guest_count, 0) < 1 then
    raise exception 'guest count must be at least 1' using errcode = '23514';
  end if;

  -- The room must belong to the property the guest is booking (the live DB
  -- has a similar trigger; this keeps pricing safe even without it).
  if not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.property_id = new.property_id and coalesce(r.is_active, true)
  ) then
    raise exception 'room not found for this property' using errcode = '23514';
  end if;

  select * into v_price from public.stay_room_price(new.room_id, new.check_in, new.check_out, new.guest_count);
  if not found then
    raise exception 'room not found or invalid dates' using errcode = '23514';
  end if;

  new.room_price         := v_price.room_price;
  new.extra_guest_charge := v_price.extra_guest_charge;
  new.total_amount       := v_price.total;

  new.status             := 'pending';
  new.is_paid            := false;
  new.advance_amount     := 0;
  new.discount_amount    := 0;
  new.discount_reason    := null;
  new.agent_id           := null;
  new.commission_amount  := null;
  new.commission_paid    := false;
  new.commission_paid_date := null;
  new.source             := 'direct';

  select greatest(coalesce(pending_hold_hours, 24), 24) into v_hours
    from public.properties where id = new.property_id;
  v_hours := coalesce(v_hours, 24);
  new.hold_expires_at := least(coalesce(new.hold_expires_at, now() + make_interval(hours => v_hours)),
                               now() + make_interval(hours => v_hours));
  return new;
end $function$;


CREATE OR REPLACE FUNCTION public.enforce_guest_group_terms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hours integer;
begin
  if not public._is_guest_insert(new.property_id) then
    return new;
  end if;
  new.total_amount      := 0;           -- set from member bookings below
  new.status            := 'pending';
  new.is_paid           := false;
  new.advance_amount    := 0;
  new.discount_amount   := 0;
  new.discount_reason   := null;
  new.agent_id          := null;
  new.commission_amount := null;
  new.commission_paid   := false;
  new.commission_paid_date := null;
  new.source            := 'direct';
  select greatest(coalesce(pending_hold_hours, 24), 24) into v_hours
    from public.properties where id = new.property_id;
  v_hours := coalesce(v_hours, 24);
  new.hold_expires_at := least(coalesce(new.hold_expires_at, now() + make_interval(hours => v_hours)),
                               now() + make_interval(hours => v_hours));
  return new;
end $function$;


CREATE OR REPLACE FUNCTION public.expire_stale_pending_bookings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  expired_group_ids uuid[];
begin
  -- 1. Cancel expired group bookings.
  with expired_groups as (
    update booking_groups
    set status = 'cancelled', hold_expires_at = null
    where status = 'pending'
      and hold_expires_at is not null
      and hold_expires_at < now()
    returning id
  )
  select coalesce(array_agg(id), '{}') into expired_group_ids from expired_groups;

  -- 2. Snapshot which bookings are ABOUT to expire, before cancelling
  --    them — same set of rows the UPDATE in step 3 will affect. Captured
  --    here (not derived from step 3's RETURNING) specifically so step 4
  --    can run as its own statement afterward, letting it see step 3's
  --    committed cancellation instead of being chained into the same
  --    statement via CTE.
  create temporary table _expiring on commit drop as
  select room_id, check_in, check_out
  from bookings
  where status = 'pending'
    and (
      (hold_expires_at is not null and hold_expires_at < now())
      or group_id = any(expired_group_ids)
    );

  -- 3. Now actually cancel those bookings.
  update bookings
  set status = 'cancelled', hold_expires_at = null
  where status = 'pending'
    and (
      (hold_expires_at is not null and hold_expires_at < now())
      or group_id = any(expired_group_ids)
    );

  -- 4. Release each occupied night from step 2's snapshot, but only where
  --    no OTHER still-active booking on that room needs it. This is a
  --    separate statement from step 3's UPDATE — the "not exists" check
  --    below now correctly sees those bookings as already 'cancelled'.
  delete from availability a
  using (
    select distinct room_id,
      generate_series(check_in, check_out - interval '1 day', interval '1 day')::date as night
    from _expiring
  ) n
  where a.room_id = n.room_id
    and a.date = n.night
    and not exists (
      select 1 from bookings b
      where b.room_id = a.room_id
        and b.status <> 'cancelled'
        and b.check_in <= a.date
        and b.check_out > a.date
    );
end;
$function$;


CREATE OR REPLACE FUNCTION public.free_nights_on_cancel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.availability a
     set is_available = true
   where a.room_id = new.room_id
     and a.date >= new.check_in
     and a.date <  new.check_out
     and a.is_available = false
     and not exists (
       select 1
         from public.bookings b
        where b.room_id = a.room_id
          and b.id <> new.id
          and b.status <> 'cancelled'
          and a.date >= b.check_in
          and a.date <  b.check_out
     );
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.generate_group_reference()
 RETURNS text
 LANGUAGE sql
AS $function$
  select 'GRP-' || upper(substring(gen_random_uuid()::text, 1, 6));
$function$;


CREATE OR REPLACE FUNCTION public.get_invite_by_token(p_token text)
 RETURNS TABLE(email text, property_name text, property_id uuid, used_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT it.email, p.name, p.id, it.used_at, it.expires_at
  FROM invite_tokens it
  JOIN properties p ON p.id = it.property_id
  WHERE it.token = p_token
  LIMIT 1;
END;
$function$;


CREATE OR REPLACE FUNCTION public.handle_booking_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin

  -- -------------------------------------------------------------------------
  -- Booking just became confirmed → block the dates
  -- -------------------------------------------------------------------------
  if NEW.status = 'confirmed' and (OLD.status is distinct from 'confirmed') then

    -- Upsert: if rows exist, mark unavailable. If somehow missing, insert them.
    insert into availability (room_id, date, is_available)
    select
      NEW.room_id,
      gs.date::date,
      false
    from generate_series(NEW.check_in, NEW.check_out - interval '1 day', interval '1 day') as gs(date)
    on conflict (room_id, date)
    do update set is_available = false;

  end if;

  -- -------------------------------------------------------------------------
  -- Booking just became cancelled or pending (was confirmed) → re-open dates,
  -- but only if no other confirmed booking covers those dates for this room.
  -- -------------------------------------------------------------------------
  if OLD.status = 'confirmed' and NEW.status in ('cancelled', 'pending') then

    update availability a
    set    is_available = true
    from   generate_series(NEW.check_in, NEW.check_out - interval '1 day', interval '1 day') as gs(date)
    where  a.room_id = NEW.room_id
      and  a.date    = gs.date::date
      -- Only re-open if no other confirmed booking covers this date
      and  not exists (
        select 1
        from   bookings b
        where  b.room_id = NEW.room_id
          and  b.id     != NEW.id
          and  b.status  = 'confirmed'
          and  b.check_in  <= gs.date::date
          and  b.check_out  > gs.date::date
      );

  end if;

  return NEW;
end;
$function$;


CREATE OR REPLACE FUNCTION public.leads_flood_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (select count(*) from public.leads
       where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'leads: hourly limit reached';
  end if;
  return new;
end;
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


CREATE OR REPLACE FUNCTION public.mark_booking_nights_unavailable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from 'cancelled'
     and new.room_id is not null
     and new.check_in is not null
     and new.check_out is not null
     and new.check_out::date > new.check_in::date then
    insert into public.availability (room_id, date, is_available)
    select new.room_id, d::date, false
    from generate_series(new.check_in::date, new.check_out::date - 1, interval '1 day') as d
    on conflict (room_id, date) do update set is_available = false;
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.prevent_superadmin_as_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if new.owner_id is not null and exists (
    select 1 from auth.users u
    where u.id = new.owner_id
      and lower(u.email) = 'thedelishlicks@gmail.com'
  ) then
    raise exception 'The platform admin login cannot be a property owner. Use a separate owner email.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.protect_property_billing_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  c text;
  protected_cols text[] := array[
    'subscription_status', 'subscription_tier', 'subscription_end_date',
    'setup_fee_paid', 'is_active'
  ];
begin
  -- superadmin
  if (auth.jwt() ->> 'email') = 'thedelishlicks@gmail.com' then
    return new;
  end if;
  -- service key / SQL editor / server-side code: no logged-in user
  if auth.uid() is null then
    return new;
  end if;

  foreach c in array protected_cols loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'Only the platform admin can change "%" on a property', c
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.purge_old_client_errors()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from public.client_errors where created_at < now() - interval '30 days';
$function$;


CREATE OR REPLACE FUNCTION public.room_ical_feeds_room_matches_property()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.rooms r where r.id = new.room_id and r.property_id = new.property_id) then
    raise exception 'room does not belong to this property' using errcode = '23514';
  end if;
  return new;
end $function$;


CREATE OR REPLACE FUNCTION public.room_rates_room_matches_property()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.property_id = new.property_id
  ) then
    raise exception 'room does not belong to this property' using errcode = '23514';
  end if;
  return new;
end $function$;


CREATE OR REPLACE FUNCTION public.stay_room_price(p_room_id uuid, p_check_in date, p_check_out date, p_guests integer)
 RETURNS TABLE(nights integer, room_price numeric, extra_guest_charge numeric, total numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (
    select id, property_id, base_price, coalesce(extra_guest_price, 0) as extra_guest_price,
           coalesce(weekend_multiplier, 1) as weekend_multiplier, max_guests
    from public.rooms where id = p_room_id
  ),
  nights as (
    select g::date as d
    from generate_series(p_check_in::timestamp, (p_check_out - 1)::timestamp, interval '1 day') g
    where p_check_out > p_check_in
  ),
  priced as (
    select n.d,
      coalesce(
        (select case when rr.kind = 'fixed' then rr.value
                     else round(r.base_price * (100 + rr.value) / 100) end
           from public.room_rates rr
          where rr.property_id = r.property_id
            and (rr.room_id = r.id or rr.room_id is null)
            and n.d between rr.start_date and rr.end_date
          order by (rr.room_id is not null) desc, rr.start_date desc, rr.created_at desc
          limit 1),
        r.base_price
      ) as nightly,
      (extract(dow from n.d) in (5, 6)) as weekend,   -- Fri, Sat nights
      r.weekend_multiplier, r.extra_guest_price, r.max_guests
    from nights n cross join r
  ),
  sums as (
    select count(*)::int as nights,
           round(sum(nightly * case when weekend then weekend_multiplier else 1 end), 2) as room_price,
           max(extra_guest_price) as egp, max(max_guests) as mg
    from priced
  )
  select s.nights,
         s.room_price,
         round(greatest(0, p_guests - s.mg) * s.egp * s.nights, 2),
         s.room_price + round(greatest(0, p_guests - s.mg) * s.egp * s.nights, 2)
  from sums s
  where s.nights > 0;
$function$;


CREATE OR REPLACE FUNCTION public.sync_guest_group_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.group_id is not null and public._is_guest_insert(new.property_id) then
    update public.booking_groups g
       set total_amount = (select coalesce(sum(b.total_amount), 0) from public.bookings b where b.group_id = g.id)
     where g.id = new.group_id and g.property_id = new.property_id;
  end if;
  return null;
end $function$;
