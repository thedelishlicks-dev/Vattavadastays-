import { createServerFn } from "@tanstack/react-start";
import { createClient } from "./supabase";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
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

      // Set session cookies explicitly since createClient cookies.setAll is a no-op
      setResponseHeader(
        "Set-Cookie",
        `sb-access-token=${access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expires_in}`,
      );
      setResponseHeader(
        "Set-Cookie",
        `sb-refresh-token=${refresh_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`, // 1 week
      );
    }

    return { user: data.user, error: null };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const request = getRequest();
  const cookieHeader = request?.headers.get("Cookie") ?? undefined;
  const supabase = createClient(cookieHeader);

  await supabase.auth.signOut();

  // Explicitly clear the session cookies
  setResponseHeader("Set-Cookie", "sb-access-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  setResponseHeader("Set-Cookie", "sb-refresh-token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
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
