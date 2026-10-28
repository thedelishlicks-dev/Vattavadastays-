import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

// ── Single booking charges ──────────────────────────────────────────────────

export const useBookingCharges = (bookingId: string) => {
  return useQuery({
    queryKey: ["bookingCharges", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_charges")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!bookingId,
  });
};

export const useAddCharge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (charge: { booking_id: string; description: string; qty: number; unit_price: number }) => {
      const { error } = await supabase.from("booking_charges").insert(charge);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["bookingCharges", variables.booking_id], exact: false });
    },
  });
};

/**
 * Add several charge rows to ONE booking or ONE group in a single insert, so a catalog item that
 * spans a season change is added whole or not at all. Refreshes the charges lists and the booking
 * lists (their cards show the extras total).
 */
export const useAddChargeRows = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      target: { booking_id: string } | { group_id: string };
      rows: { description: string; qty: number; unit_price: number }[];
    }) => {
      if (input.rows.length === 0) return;
      const { error } = await supabase
        .from("booking_charges")
        .insert(input.rows.map((r) => ({ ...input.target, ...r })));
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      if ("booking_id" in variables.target) queryClient.invalidateQueries({ queryKey: ["bookingCharges", variables.target.booking_id], exact: false });
      if ("group_id" in variables.target) queryClient.invalidateQueries({ queryKey: ["groupCharges", variables.target.group_id], exact: false });
      queryClient.invalidateQueries({ queryKey: ["bookings"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["bookingGroups"], exact: false });
    },
  });
};

export const useDeleteCharge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, bookingId }: { id: string; bookingId?: string; groupId?: string }) => {
      const { error } = await supabase.from("booking_charges").delete().eq("id", id);
      if (error) throw error;
      return { id, bookingId };
    },
    onSuccess: (_data, variables) => {
      if (variables.bookingId) queryClient.invalidateQueries({ queryKey: ["bookingCharges", variables.bookingId], exact: false });
      if (variables.groupId) queryClient.invalidateQueries({ queryKey: ["groupCharges", variables.groupId], exact: false });
    },
  });
};

// ── Group charges ───────────────────────────────────────────────────────────

export const useGroupCharges = (groupId: string) => {
  return useQuery({
    queryKey: ["groupCharges", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_charges")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!groupId,
  });
};

export const useAddGroupCharge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (charge: { group_id: string; description: string; qty: number; unit_price: number }) => {
      const { error } = await supabase.from("booking_charges").insert(charge);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["groupCharges", variables.group_id], exact: false });
    },
  });
};

export const useDeleteGroupCharge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId: string }) => {
      const { error } = await supabase.from("booking_charges").delete().eq("id", id);
      if (error) throw error;
      return { id, groupId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["groupCharges", variables.groupId], exact: false });
    },
  });
};
