import { createBrowserClient, createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { Database } from "../types/database";
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
        const cookies = parseCookieHeader(cookieHeader ?? "");
        return cookies.map((c) => ({ name: c.name, value: c.value ?? "" }));
      },
      setAll(_cookiesToSet) {
        // Token refresh is handled by Supabase Auth's
        // onAuthStateChange listener — this is intentionally
        // a no-op at client creation time.
        // Session cookies are written explicitly in auth.ts signIn/signOut.
      },
    },
  });
};
