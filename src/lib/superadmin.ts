/**
 * The ONE application-level definition of "who is the platform superadmin".
 *
 * WHAT THIS IS FOR — UI convenience only. It decides which screen to show
 * (login redirect, /superadmin vs /admin, the "manage property" switcher, owner-email
 * validation in the onboarding form). It is NOT an authorization boundary: anything the
 * superadmin can actually *do* is enforced by Postgres RLS / triggers (JWT email check) and
 * by the `invite-owner` Edge Function, never by this file. A user who tampers with the
 * browser gets a different screen, but the database still refuses their queries.
 *
 * WHY IT IS A CONSTANT AND NOT `VITE_SUPERADMIN_EMAIL`: the database policies hard-code the
 * same address, so the superadmin identity can only change together with a SQL migration.
 * An env var could only ever drift from the database (UI says A is admin, RLS says B), and
 * `VITE_` values are bundled into the public JS anyway. The address is not a secret.
 *
 * KEEP IN SYNC — these places intentionally hold their own copy (see
 * docs/superadmin-authorization.md for why, and src/lib/superadmin.test.ts, which fails if
 * any of them disagrees with the constant below):
 *   - supabase/functions/invite-owner/index.ts   (separate Deno runtime, pasted into the dashboard)
 *   - supabase/baseline/*.sql and supabase/migrations/*.sql  (the database security boundary)
 */
export const SUPERADMIN_EMAIL = "thedelishlicks@gmail.com";

/** Supabase stores auth emails lower-cased; compare the same way so " Name@X.com " still matches. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** True only when `email` is the platform superadmin. Missing / blank / other emails → false. */
export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const e = normalizeEmail(email);
  return e !== "" && e === SUPERADMIN_EMAIL;
}

/**
 * Which property subdomain a signed-in user is "managing" through `?property=`.
 *
 * Only the superadmin may pick a property this way; for everyone else the URL parameter and any
 * stored value are ignored (an owner's property is found by `owner_id`, and RLS enforces it).
 * The URL parameter wins over the one remembered for the session.
 */
export function resolveManagedSubdomain(
  email: string | null | undefined,
  urlParam: string | null | undefined,
  storedParam: string | null | undefined,
): string {
  if (!isSuperAdminEmail(email)) return "";
  return urlParam || storedParam || "";
}

/** Where to send a user after login. */
export function postLoginPath(
  email: string | null | undefined,
): "/superadmin" | "/admin/dashboard" {
  return isSuperAdminEmail(email) ? "/superadmin" : "/admin/dashboard";
}
