-- Marketing leads captured from stayidom.in landing page signup form
create table if not exists leads (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  phone         text        not null,
  property_name text,
  tier          text,
  created_at    timestamptz default now()
);

alter table leads enable row level security;

-- Anyone can submit a lead from the public landing page
create policy "public_insert_lead" on leads
  for insert with check (true);

-- Only the superadmin can read leads
create policy "superadmin_read_leads" on leads
  for select using (
    auth.email() = current_setting('app.superadmin_email', true)
  );
