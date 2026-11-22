import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { fetchAllRows } from "../lib/paginate";
import { useAuth } from "./useAuth";
import type { Expense, ExpenseCategory } from "@/types/database";

// Supabase's PostgrestError is a plain object, not an Error: wrap it so `e instanceof Error`
// in the UI shows the real message (same helper pattern as useAgents).
function asError(err: { message?: string } | null): Error {
  return new Error(err?.message || "Unknown error");
}

export interface ExpenseFilters {
  /** expense_date on/after this date (YYYY-MM-DD, local date) */
  startDate?: string;
  /** expense_date on/before this date (YYYY-MM-DD, inclusive) */
  endDate?: string;
  category?: ExpenseCategory;
}

/**
 * Expenses of one property, newest first. Key starts with "expenses" + property id: every mutation
 * below invalidates ["expenses", propertyId] with exact:false, which refreshes every filter at once.
 */
export const useExpenses = (propertyId: string, filters?: ExpenseFilters) => {
  const { isAuthenticated } = useAuth();
  return useQuery<Expense[]>({
    queryKey: ["expenses", propertyId, filters ?? null],
    queryFn: async () => {
      // Paginated: PostgREST caps one request at 1,000 rows (see lib/paginate.ts).
      const rows = await fetchAllRows<Expense>((from, to) => {
        let query = supabase
          .from("expenses")
          .select("*", { count: "exact" })
          .eq("property_id", propertyId)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id");
        if (filters?.startDate) query = query.gte("expense_date", filters.startDate);
        if (filters?.endDate) query = query.lte("expense_date", filters.endDate);
        if (filters?.category) query = query.eq("category", filters.category);
        return query.range(from, to);
      });
      return rows.map((r) => ({ ...r, amount: Number(r.amount) })) as Expense[];
    },
    enabled: !!propertyId && isAuthenticated,
  });
};

export interface ExpenseInput {
  propertyId: string;
  expense_date: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  payment_method?: string;
  notes?: string;
  booking_id?: string | null;
}

function toRow(input: Omit<ExpenseInput, "propertyId">) {
  return {
    expense_date: input.expense_date,
    category: input.category,
    amount: input.amount,
    description: input.description?.trim() || null,
    payment_method: input.payment_method?.trim() || null,
    notes: input.notes?.trim() || null,
    ...(input.booking_id !== undefined ? { booking_id: input.booking_id } : {}),
  };
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ propertyId, ...input }: ExpenseInput) => {
      const { data, error } = await supabase
        .from("expenses")
        .insert({ property_id: propertyId, ...toRow(input) })
        .select()
        .single();
      if (error) throw asError(error);
      return data as Expense;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.propertyId], exact: false });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, propertyId, ...input }: ExpenseInput & { id: string }) => {
      const { data, error } = await supabase
        .from("expenses")
        .update(toRow(input))
        .eq("id", id)
        .eq("property_id", propertyId)
        .select()
        .single();
      if (error) throw asError(error);
      return data as Expense;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.propertyId], exact: false });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, propertyId }: { id: string; propertyId: string }) => {
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", id)
        .eq("property_id", propertyId);
      if (error) throw asError(error);
      return { id };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["expenses", variables.propertyId], exact: false });
    },
  });
}
