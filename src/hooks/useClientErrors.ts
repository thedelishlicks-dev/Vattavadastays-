 // src/hooks/useClientErrors.ts
//
// Reads the client error log for the superadmin Errors tab.
// RLS: only the superadmin's session can SELECT/DELETE (see migration
// 20261009000000_client_error_log.sql).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ClientErrorRow {
  id: string;
  created_at: string;
  source: string;
  category: string;
  message: string;
  stack: string | null;
  url: string | null;
  hostname: string | null;
  user_agent: string | null;
  app_version: string | null;
  context: Record<string, unknown> | null;
}

export interface ErrorGroup {
  key: string;
  source: string;
  category: string;
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  hosts: string[];
  versions: string[];
  sample: ClientErrorRow; // most recent occurrence (stack, url, context, UA)
}

/** Same error repeated = one row with a count. Input must be newest-first. */
export function groupErrors(rows: ClientErrorRow[]): ErrorGroup[] {
  const map = new Map<string, ErrorGroup>();
  for (const r of rows) {
    const key = `${r.source}|${r.message.slice(0, 120)}`;
    const g = map.get(key);
    if (!g) {
      map.set(key, {
        key,
        source: r.source,
        category: r.category,
        message: r.message,
        count: 1,
        firstSeen: r.created_at,
        lastSeen: r.created_at,
        hosts: r.hostname ? [r.hostname] : [],
        versions: r.app_version ? [r.app_version] : [],
        sample: r,
      });
    } else {
      g.count += 1;
      if (r.created_at < g.firstSeen) g.firstSeen = r.created_at;
      if (r.hostname && !g.hosts.includes(r.hostname)) g.hosts.push(r.hostname);
      if (r.app_version && !g.versions.includes(r.app_version)) g.versions.push(r.app_version);
    }
  }
  return [...map.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}

export function useClientErrors(days: number) {
  return useQuery<ClientErrorRow[]>({
    queryKey: ["client-errors", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("client_errors")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ClientErrorRow[];
    },
  });
}

export function useClearClientErrors() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // PostgREST refuses a delete with no filter; this matches every row.
      const { error } = await supabase
        .from("client_errors")
        .delete()
        .gte("created_at", "1970-01-01T00:00:00Z");
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-errors"] }),
  });
}
