// src/lib/leads.ts
//
// Writes marketing demo requests to the `leads` table in Supabase.
//
// ── Supabase SQL (run once if not already done) ───────────────────────────────
//
//   create table if not exists leads (
//     id            uuid         primary key default gen_random_uuid(),
//     name          text         not null,
//     phone         text         not null,
//     property_name text,
//     tier          text,
//     created_at    timestamptz  default now()
//   );
//   alter table leads enable row level security;
//   create policy "public_insert_lead" on leads for insert with check (true);
//   -- Superadmin reads all leads (owner_id check via service key in dashboard,
//   --   or add a select policy for authenticated users):
//   create policy "auth_read_leads" on leads for select using (auth.role() = 'authenticated');
//
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

export interface LeadPayload {
  name: string;
  phone: string;
  property_name?: string;
  tier?: string;
}

export async function submitLead(data: LeadPayload): Promise<void> {
  const { error } = await supabase.from("leads").insert({
    name:          data.name.trim(),
    phone:         data.phone.trim(),
    property_name: data.property_name?.trim() || null,
    tier:          data.tier || null,
  });

  if (error) {
    console.error("submitLead error:", error.message);
    throw error;          // let the modal's catch handle it gracefully
  }
}
