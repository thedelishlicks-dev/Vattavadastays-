// src/hooks/useQuotes.ts — quotes (owner-only via RLS). Same conventions as useAgents.ts.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { QuoteLine } from "../lib/quotes";
import type { QuoteStatus, RoomQuoteLine } from "../lib/quoteBuilder";

function asError(err: { message?: string } | null): Error {
  return new Error(err?.message || "Unknown error");
}

/** What the owner selected — enough to re-open and edit a quote. */
export interface QuoteInputs {
  rooms: { room_id: string; guests: number }[];
  items: { kind: "addon" | "package"; item_id: string; variant_key: string | null; qty?: number; price?: number }[];
}

export interface Quote {
  id: string;
  property_id: string;
  guest_name: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  inputs: QuoteInputs;
  rooms: RoomQuoteLine[];
  lines: QuoteLine[];
  rooms_total: number;
  addons_total: number;
  discount_amount: number;
  total_amount: number;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  sent_at: string | null;
  converted_booking_id: string | null;
  created_at: string;
}

const normalize = (r: any): Quote => ({
  ...r,
  inputs: { rooms: r.inputs?.rooms ?? [], items: r.inputs?.items ?? [] },
  rooms: Array.isArray(r.rooms) ? r.rooms : [],
  lines: Array.isArray(r.lines) ? r.lines : [],
  rooms_total: Number(r.rooms_total ?? 0),
  addons_total: Number(r.addons_total ?? 0),
  discount_amount: Number(r.discount_amount ?? 0),
  total_amount: Number(r.total_amount ?? 0),
});

export const useQuotes = (propertyId: string) => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["quotes", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("property_id", propertyId)
        .order("created_at", { ascending: false });
      if (error) throw asError(error);
      return (data ?? []).map(normalize);
    },
    enabled: !!propertyId && isAuthenticated,
  });
};

/** Insert (no id) or update (id). Resolves to the row id either way. */
export function useSaveQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { propertyId: string; id?: string; values: Record<string, unknown> }): Promise<string> => {
      const values = { ...input.values, updated_at: new Date().toISOString() };
      if (input.id) {
        const { error } = await supabase.from("quotes").update(values).eq("id", input.id);
        if (error) throw asError(error);
        return input.id;
      }
      const { data, error } = await supabase
        .from("quotes")
        .insert({ ...values, property_id: input.propertyId })
        .select("id")
        .single();
      if (error) throw asError(error);
      return data.id as string;
    },
    onSuccess: (_id, v) => queryClient.invalidateQueries({ queryKey: ["quotes", v.propertyId] }),
  });
}

export function useSetQuoteStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { propertyId: string; id: string; status: QuoteStatus; markSent?: boolean }) => {
      const values: Record<string, unknown> = { status: input.status, updated_at: new Date().toISOString() };
      if (input.markSent) values.sent_at = new Date().toISOString();
      const { error } = await supabase.from("quotes").update(values).eq("id", input.id);
      if (error) throw asError(error);
    },
    onSuccess: (_d, v) => queryClient.invalidateQueries({ queryKey: ["quotes", v.propertyId] }),
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { propertyId: string; id: string }) => {
      const { error } = await supabase.from("quotes").delete().eq("id", input.id);
      if (error) throw asError(error);
    },
    onSuccess: (_d, v) => queryClient.invalidateQueries({ queryKey: ["quotes", v.propertyId] }),
  });
}
