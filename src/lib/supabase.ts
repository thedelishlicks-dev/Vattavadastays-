import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";
import { env } from "../utils/env";

/**
 * Creates a Supabase client.
 * In TanStack Start, we use per-request clients to avoid cross-request state pollution.
 */
export const createClient = () => {
  return createSupabaseClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
};
