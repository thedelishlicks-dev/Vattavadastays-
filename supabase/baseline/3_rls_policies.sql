alter table public.addons enable row level security;
alter table public.agents enable row level security;
alter table public.availability enable row level security;
alter table public.booking_charges enable row level security;
alter table public.booking_groups enable row level security;
alter table public.bookings enable row level security;
alter table public.client_errors enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.leads enable row level security;
alter table public.packages enable row level security;
alter table public.price_seasons enable row level security;
alter table public.properties enable row level security;
alter table public.quotes enable row level security;
alter table public.room_ical_feeds enable row level security;
alter table public.room_rates enable row level security;
alter table public.rooms enable row level security;

create policy owners_manage_addons on public.addons as PERMISSIVE for ALL to public
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))))
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy superadmin_manage_addons on public.addons as PERMISSIVE for ALL to public
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy owners_manage_agents on public.agents as PERMISSIVE for ALL to public
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))))
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy owners_manage_availability on public.availability as PERMISSIVE for ALL to public
  using ((room_id IN ( SELECT rooms.id
   FROM rooms
  WHERE (rooms.property_id IN ( SELECT properties.id
           FROM properties
          WHERE (properties.owner_id = auth.uid()))))))
  with check ((room_id IN ( SELECT rooms.id
   FROM rooms
  WHERE (rooms.property_id IN ( SELECT properties.id
           FROM properties
          WHERE (properties.owner_id = auth.uid()))))));

create policy public_read_availability on public.availability as PERMISSIVE for SELECT to public
  using ((room_id IN ( SELECT r.id
   FROM (rooms r
     JOIN properties p ON ((p.id = r.property_id)))
  WHERE (p.is_active = true))));

create policy superadmin_manage_availability on public.availability as PERMISSIVE for ALL to authenticated
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy owners_manage_charges on public.booking_charges as PERMISSIVE for ALL to public
  using (((EXISTS ( SELECT 1
   FROM (bookings b
     JOIN properties p ON ((p.id = b.property_id)))
  WHERE ((b.id = booking_charges.booking_id) AND (p.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (booking_groups bg
     JOIN properties p ON ((p.id = bg.property_id)))
  WHERE ((bg.id = booking_charges.group_id) AND (p.owner_id = auth.uid()))))))
  with check (((EXISTS ( SELECT 1
   FROM (bookings b
     JOIN properties p ON ((p.id = b.property_id)))
  WHERE ((b.id = booking_charges.booking_id) AND (p.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (booking_groups bg
     JOIN properties p ON ((p.id = bg.property_id)))
  WHERE ((bg.id = booking_charges.group_id) AND (p.owner_id = auth.uid()))))));

create policy owners_insert_booking_groups on public.booking_groups as PERMISSIVE for INSERT to public
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy owners_manage_booking_groups on public.booking_groups as PERMISSIVE for ALL to public
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy public_delete_orphaned_pending_group on public.booking_groups as PERMISSIVE for DELETE to public
  using (((status = 'pending'::text) AND (NOT (EXISTS ( SELECT 1
   FROM bookings
  WHERE (bookings.group_id = booking_groups.id))))));

create policy public_insert_booking_group on public.booking_groups as PERMISSIVE for INSERT to public
  with check (((status = 'pending'::text) AND (is_paid = false) AND (COALESCE(advance_amount, (0)::numeric) = (0)::numeric) AND (COALESCE(discount_amount, (0)::numeric) = (0)::numeric) AND (agent_id IS NULL) AND (commission_amount IS NULL) AND (commission_paid = false) AND (property_id IN ( SELECT properties.id
   FROM properties
  WHERE ((properties.is_active = true) AND (properties.subscription_status = ANY (ARRAY['trial'::text, 'active'::text])))))));

create policy superadmin_manage_booking_groups on public.booking_groups as PERMISSIVE for ALL to public
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy owners_delete_bookings on public.bookings as PERMISSIVE for DELETE to authenticated
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy owners_insert_bookings on public.bookings as PERMISSIVE for INSERT to public
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy owners_read_bookings on public.bookings as PERMISSIVE for SELECT to authenticated
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy owners_update_bookings on public.bookings as PERMISSIVE for UPDATE to authenticated
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))))
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy public_insert_booking on public.bookings as PERMISSIVE for INSERT to public
  with check (((status = 'pending'::text) AND (is_paid = false) AND (COALESCE(advance_amount, (0)::numeric) = (0)::numeric) AND (COALESCE(discount_amount, (0)::numeric) = (0)::numeric) AND (agent_id IS NULL) AND (commission_amount IS NULL) AND (commission_paid = false) AND (checked_in_at IS NULL) AND (checked_out_at IS NULL) AND (property_id IN ( SELECT properties.id
   FROM properties
  WHERE ((properties.is_active = true) AND (properties.subscription_status = ANY (ARRAY['trial'::text, 'active'::text])))))));

create policy superadmin_manage_bookings on public.bookings as PERMISSIVE for ALL to authenticated
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy anyone_can_log_error on public.client_errors as PERMISSIVE for INSERT to anon, authenticated
  with check (true);

create policy superadmin_delete_client_errors on public.client_errors as PERMISSIVE for DELETE to authenticated
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy superadmin_read_client_errors on public.client_errors as PERMISSIVE for SELECT to authenticated
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy superadmin_only_invite_tokens on public.invite_tokens as PERMISSIVE for ALL to public
  using (false)
  with check (false);

create policy public_insert_lead on public.leads as PERMISSIVE for INSERT to public
  with check (true);

create policy superadmin_read_leads on public.leads as PERMISSIVE for SELECT to public
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy owners_manage_packages on public.packages as PERMISSIVE for ALL to public
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))))
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy superadmin_manage_packages on public.packages as PERMISSIVE for ALL to public
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy owners_manage_price_seasons on public.price_seasons as PERMISSIVE for ALL to public
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))))
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy superadmin_manage_price_seasons on public.price_seasons as PERMISSIVE for ALL to public
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy owners_delete_property on public.properties as PERMISSIVE for DELETE to public
  using ((owner_id = auth.uid()));

create policy owners_select_property on public.properties as PERMISSIVE for SELECT to public
  using ((owner_id = auth.uid()));

create policy owners_update_property on public.properties as PERMISSIVE for UPDATE to public
  using ((owner_id = auth.uid()))
  with check ((owner_id = auth.uid()));

create policy public_read_active_properties on public.properties as PERMISSIVE for SELECT to public
  using (((is_active = true) AND (subscription_status = ANY (ARRAY['trial'::text, 'active'::text]))));

create policy superadmin_manage_properties on public.properties as PERMISSIVE for ALL to authenticated
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy owners_manage_quotes on public.quotes as PERMISSIVE for ALL to public
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))))
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy superadmin_manage_quotes on public.quotes as PERMISSIVE for ALL to public
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));

create policy room_ical_feeds_owner_all on public.room_ical_feeds as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = room_ical_feeds.property_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = room_ical_feeds.property_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))));

create policy room_rates_owner_all on public.room_rates as PERMISSIVE for ALL to authenticated
  using ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = room_rates.property_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))))
  with check ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = room_rates.property_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))));

create policy room_rates_public_read on public.room_rates as PERMISSIVE for SELECT to anon, authenticated
  using ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = room_rates.property_id) AND (p.subscription_status = ANY (ARRAY['trial'::text, 'active'::text]))))));

create policy owners_manage_rooms on public.rooms as PERMISSIVE for ALL to public
  using ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))))
  with check ((property_id IN ( SELECT properties.id
   FROM properties
  WHERE (properties.owner_id = auth.uid()))));

create policy public_read_active_rooms on public.rooms as PERMISSIVE for SELECT to public
  using (((is_active = true) AND (EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = rooms.property_id) AND (properties.is_active = true))))));

create policy superadmin_manage_rooms on public.rooms as PERMISSIVE for ALL to authenticated
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));
