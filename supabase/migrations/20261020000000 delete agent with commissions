-- Deleting an agent on purpose: clear their commission records, then delete the agent —
-- all in one step, so it either fully happens or not at all.
--
-- Before: deleting an agent only set agent_id to NULL on their bookings (the foreign key
-- is ON DELETE SET NULL). The commission amount / paid flag stayed on those bookings but
-- the commission ledger only lists bookings that still have an agent, so unpaid commission
-- silently vanished from the totals and the CSV while the confirmation said "records are kept".
--
-- Now: the owner's choice is explicit ("delete the agent and their commission records"):
--   bookings / booking_groups of this agent: agent_id, commission_amount, commission_paid,
--   commission_paid_date are cleared (the booking itself, its amounts and its source stay),
--   then the agent row is deleted.
--
-- SECURITY INVOKER: runs as the signed-in owner, so row-level security decides what can be
-- touched — an owner can only affect their own property's agents and bookings. If nothing
-- was deleted (not your agent / no such agent) the whole thing is rolled back.
-- Safe to run more than once.

create or replace function public.delete_agent_with_commissions(p_agent_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bookings integer;
  v_groups   integer;
  v_deleted  integer;
begin
  update public.bookings
     set agent_id = null, commission_amount = null, commission_paid = false, commission_paid_date = null
   where agent_id = p_agent_id;
  get diagnostics v_bookings = row_count;

  update public.booking_groups
     set agent_id = null, commission_amount = null, commission_paid = false, commission_paid_date = null
   where agent_id = p_agent_id;
  get diagnostics v_groups = row_count;

  delete from public.agents where id = p_agent_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    -- Not found, or not this owner's agent. Raising rolls back the two updates above too.
    raise exception 'AGENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return jsonb_build_object('bookings', v_bookings, 'groups', v_groups);
end;
$$;

revoke all on function public.delete_agent_with_commissions(uuid) from public, anon;
grant execute on function public.delete_agent_with_commissions(uuid) to authenticated;
