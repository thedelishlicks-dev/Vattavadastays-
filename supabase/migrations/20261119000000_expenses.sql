-- Expenses: the first step of the business-intelligence foundation.
-- One row per cost an owner records (electricity, staff, supplies, ...). Nothing reads this table
-- except the new Money → Expenses page and src/lib/businessMetrics.ts; no booking behaviour changes.
--
-- Access follows the repo convention (see baseline/3_rls_policies.sql):
--   * owners manage rows of properties where properties.owner_id = auth.uid()
--   * the superadmin (by JWT email, same literal the other superadmin_manage_* policies use) manages all
--   * anon has no access at all
-- An expense may point at a booking (e.g. an OTA commission), but only a booking of the SAME property.
--
-- Safe to run more than once.

create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id) on delete cascade,
  expense_date   date not null default current_date,
  category       text not null,
  description    text,
  amount         numeric(12,2) not null,
  payment_method text,
  booking_id     uuid references public.bookings(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_category_check') then
    alter table public.expenses add constraint expenses_category_check check (category in (
      'electricity', 'cleaning', 'staff', 'maintenance', 'supplies', 'food',
      'ota_commission', 'property_tax', 'internet', 'marketing', 'transport', 'other'
    ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_amount_positive') then
    alter table public.expenses add constraint expenses_amount_positive check (amount > 0);
  end if;
end $$;

create index if not exists expenses_property_date_idx on public.expenses (property_id, expense_date desc);

-- keep updated_at honest on every UPDATE
create or replace function public.set_expenses_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_expenses_updated_at on public.expenses;
create trigger trg_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_expenses_updated_at();

alter table public.expenses enable row level security;

-- Signed-in users only; RLS below decides which rows. Anonymous visitors get no access at all.
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

drop policy if exists owners_manage_expenses on public.expenses;
create policy owners_manage_expenses on public.expenses as permissive for all to authenticated
  using (property_id in (select properties.id from properties where properties.owner_id = auth.uid()))
  with check (
    property_id in (select properties.id from properties where properties.owner_id = auth.uid())
    and (
      booking_id is null
      or exists (select 1 from bookings b where b.id = expenses.booking_id and b.property_id = expenses.property_id)
    )
  );

drop policy if exists superadmin_manage_expenses on public.expenses;
create policy superadmin_manage_expenses on public.expenses as permissive for all to authenticated
  using (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text))
  with check (((auth.jwt() ->> 'email'::text) = 'thedelishlicks@gmail.com'::text));
