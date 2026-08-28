import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { Agent, CommissionType } from "@/types/database";

// Supabase's PostgrestError is a plain object, not a native Error — so
// `catch (e) { e instanceof Error ? e.message : "fallback" }` in the UI
// silently swallows the real message (RLS violation, constraint failure,
// etc.) and shows a generic string instead. Wrap it so that check works.
function asError(err: { message?: string } | null): Error {
  return new Error(err?.message || "Unknown error");
}

export const useAgents = (propertyId: string) => {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ["agents", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("property_id", propertyId)
        .order("name", { ascending: true });
      if (error) throw asError(error);
      return (data ?? []) as Agent[];
    },
    enabled: !!propertyId && isAuthenticated,
  });
};

export interface AgentInput {
  propertyId: string;
  name: string;
  phone?: string;
  default_commission_type: CommissionType;
  default_commission_value: number;
  notes?: string;
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AgentInput) => {
      const { data, error } = await supabase
        .from("agents")
        .insert({
          property_id: input.propertyId,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          default_commission_type: input.default_commission_type,
          default_commission_value: input.default_commission_value,
          notes: input.notes?.trim() || null,
        })
        .select()
        .single();
      if (error) throw asError(error);
      return data as Agent;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents", variables.propertyId] });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AgentInput & { id: string }) => {
      const { data, error } = await supabase
        .from("agents")
        .update({
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          default_commission_type: input.default_commission_type,
          default_commission_value: input.default_commission_value,
          notes: input.notes?.trim() || null,
        })
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw asError(error);
      return data as Agent;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents", variables.propertyId] });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; propertyId: string }) => {
      // Bookings referencing this agent keep their history — agent_id is
      // ON DELETE SET NULL, so past commission records aren't destroyed,
      // they just lose the live agent link (source/commission_amount stay).
      const { error } = await supabase.from("agents").delete().eq("id", id);
      if (error) throw asError(error);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["agents", variables.propertyId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
