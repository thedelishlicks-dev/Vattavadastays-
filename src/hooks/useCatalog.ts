// src/hooks/useCatalog.ts
//
// Data access for the Quotes catalog: seasons, add-ons, packages.
// Same conventions as useAgents.ts: TanStack Query, RLS does the security,
// Supabase errors are wrapped so `e instanceof Error` works in the UI.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import {
  bulkFillVariants,
  type Addon,
  type BulkFillMode,
  type Package,
  type PriceSeason,
  type PriceVariant,
} from "../lib/quotes";

function asError(err: { message?: string } | null): Error {
  return new Error(err?.message || "Unknown error");
}

type CatalogTable = "price_seasons" | "addons" | "packages";

const QUERY_KEY: Record<CatalogTable, string> = {
  price_seasons: "priceSeasons",
  addons: "addons",
  packages: "packages",
};

/** JSONB comes back untyped and may predate a field — make it safe to use. */
function normalizeVariants(raw: unknown): PriceVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => ({
    key: String(v?.key ?? "standard"),
    label: String(v?.label ?? "Standard"),
    base_price: Number(v?.base_price ?? 0),
    season_prices: v?.season_prices && typeof v.season_prices === "object" ? v.season_prices : {},
  }));
}

function useCatalogQuery<T>(table: CatalogTable, propertyId: string, normalize: (row: any) => T) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: [QUERY_KEY[table], propertyId],
    queryFn: async () => {
      let q = supabase.from(table).select("*").eq("property_id", propertyId);
      q =
        table === "price_seasons"
          ? q.order("start_date", { ascending: true })
          : q.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      const { data, error } = await q;
      if (error) throw asError(error);
      return (data ?? []).map(normalize) as T[];
    },
    enabled: !!propertyId && isAuthenticated,
  });
}

export const useSeasons = (propertyId: string) =>
  useCatalogQuery<PriceSeason>("price_seasons", propertyId, (r) => ({
    id: r.id,
    name: r.name,
    start_date: r.start_date,
    end_date: r.end_date,
    recurs_yearly: !!r.recurs_yearly,
    priority: Number(r.priority ?? 0),
  }));

export const useAddons = (propertyId: string) =>
  useCatalogQuery<Addon>("addons", propertyId, (r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    variants: normalizeVariants(r.variants),
    is_active: !!r.is_active,
    sort_order: Number(r.sort_order ?? 0),
  }));

export const usePackages = (propertyId: string) =>
  useCatalogQuery<Package>("packages", propertyId, (r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    unit: r.unit,
    included: Array.isArray(r.included) ? r.included : [],
    variants: normalizeVariants(r.variants),
    is_active: !!r.is_active,
    sort_order: Number(r.sort_order ?? 0),
  }));

/** Insert (no id) or update (id) one row in a catalog table. */
export function useSaveRow(table: CatalogTable) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { propertyId: string; id?: string; values: Record<string, unknown> }) => {
      const values =
        table === "price_seasons" ? input.values : { ...input.values, updated_at: new Date().toISOString() };
      if (input.id) {
        const { error } = await supabase.from(table).update(values).eq("id", input.id);
        if (error) throw asError(error);
      } else {
        const { error } = await supabase.from(table).insert({ ...values, property_id: input.propertyId });
        if (error) throw asError(error);
      }
    },
    onSuccess: (_d, v) => queryClient.invalidateQueries({ queryKey: [QUERY_KEY[table], v.propertyId] }),
  });
}

export function useDeleteRow(table: CatalogTable) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { propertyId: string; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", input.id);
      if (error) throw asError(error);
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY[table], v.propertyId] });
      // Deleting a season leaves orphaned season_prices keys in variants;
      // they're ignored everywhere (lookups are by existing season id).
    },
  });
}

/** Fill blank cells of one season across every add-on and package. */
export function useBulkFillSeason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      propertyId: string;
      seasonId: string;
      mode: BulkFillMode;
      addons: Addon[];
      packages: Package[];
    }) => {
      const jobs: PromiseLike<{ error: { message?: string } | null }>[] = [];
      const now = new Date().toISOString();
      for (const [table, rows] of [
        ["addons", input.addons],
        ["packages", input.packages],
      ] as const) {
        for (const row of rows) {
          const next = bulkFillVariants(row.variants, input.seasonId, input.mode);
          if (JSON.stringify(next) === JSON.stringify(row.variants)) continue;
          jobs.push(supabase.from(table).update({ variants: next, updated_at: now }).eq("id", row.id));
        }
      }
      const results = await Promise.all(jobs);
      const failed = results.find((r) => r.error);
      if (failed) throw asError(failed.error);
      return jobs.length;
    },
    onSuccess: (_n, v) => {
      queryClient.invalidateQueries({ queryKey: ["addons", v.propertyId] });
      queryClient.invalidateQueries({ queryKey: ["packages", v.propertyId] });
    },
  });
}
