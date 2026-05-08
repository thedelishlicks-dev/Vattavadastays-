import { createBrowserClient, createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { Database } from "../types/supabase";
import { env } from "../utils/env";

/**
 * Creates a Supabase client.
 * In TanStack Start, we use per-request clients to avoid cross-request state pollution.
 * This client is safe for both SSR and client-side use.
 */
export const createClient = (cookieHeader?: string) => {
  if (typeof window !== "undefined") {
    return createBrowserClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  }

  return createServerClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader ?? "");
      },
      setAll(cookiesToSet) {
        // In TanStack Start loaders/actions, we usually handle cookie setting
        // via the response headers or specialized middleware.
        // For simple data fetching, we don't always need to set cookies here.
      },
    },
  });
};
