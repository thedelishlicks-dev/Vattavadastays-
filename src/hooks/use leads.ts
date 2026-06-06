// src/hooks/useLeads.ts
//
// Fetches all demo-request leads for the superadmin dashboard.
// RLS: requires authenticated session (superadmin email).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  property_name: string | null;
  tier: string | null;
  created_at: string;
}

export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, phone, property_name, tier, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}
