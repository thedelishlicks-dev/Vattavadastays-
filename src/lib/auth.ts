import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./supabase";
import { getRequest, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { User } from "@supabase/supabase-js";

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data: { email, password } }) => {
    const request = getRequest();
    const cookieHeader = request?.headers.get("Cookie") ?? undefined;
    const supabase = createClient(cookieHeader);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (data.session) {
      const { access_token, refresh_token, expires_in } = data.session;

      // Set session cookies
      // We use the default Supabase SSR cookie names: sb-<project-id>-auth-token
      // But since we are manually managing them and createClient has no-op setAll,
      // we'll use a consistent base name and configure Supabase to use it if possible,
      // or just use what createServerClient expects by default.

      setCookie("sb-session-access-token", access_token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: expires_in,
      });
      setCookie("sb-session-refresh-token", refresh_token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 604800, // 1 week
      });
    }

    return { user: data.user, error: null };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const request = getRequest();
  const cookieHeader = request?.headers.get("Cookie") ?? undefined;
  const supabase = createClient(cookieHeader);

  await supabase.auth.signOut();

  // Explicitly clear the session cookies
  deleteCookie("sb-session-access-token", { path: "/" });
  deleteCookie("sb-session-refresh-token", { path: "/" });
});

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookieHeader = request?.headers.get("Cookie") ?? undefined;
  const supabase = createClient(cookieHeader);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user: user as User | null };
});
