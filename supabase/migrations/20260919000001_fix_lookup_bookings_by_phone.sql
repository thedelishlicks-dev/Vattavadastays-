-- Hotfix: lookup_bookings_by_phone was wrapping its per-row jsonb object in
-- an extra subquery column (aliased row_data) before calling row_to_json(t)
-- on it — since that subquery only had one column, row_to_json(t) produced
-- {"row_data": {...}} instead of a flat {...} object, so every field the
-- guest tracking page reads (guest_name, check_in, check_out, total_amount)
-- came back undefined/NaN. Fixed by aggregating the jsonb object directly,
-- the same way lookup_booking_groups_by_phone already (correctly) does.

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
