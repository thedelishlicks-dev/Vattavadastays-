// Supabase Edge Function: invite-owner
//
// One click from the superadmin screen: email the owner a "set your password"
// link (or, if they already have a login, just link it) and attach that login
// to the property.
//
// SECURITY MODEL (read before changing):
//  * This function holds the service key. It must only ever act for the
//    platform admin. The Supabase gateway only checks that SOME valid key was
//    sent (the public anon key passes), so the function itself verifies the
//    caller's login and refuses everyone except SUPERADMIN_EMAIL.
//  * The email and property come from the request, but only the superadmin can
//    send one, so they are trusted. The superadmin's own login can never be
//    made an owner (also enforced by a database trigger).
//  * Nothing here resets an existing account's password.
//
// Deploy: Supabase dashboard > Edge Functions > Deploy a new function > name it
// exactly "invite-owner" > paste this file. Leave "Verify JWT" ON.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPERADMIN_EMAIL = "thedelishlicks@gmail.com";
const DEFAULT_SITE = "https://stayidom.in";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, message: string) {
  return json({ error: code, code, message }, status);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  try {
    // ── 1) Who is calling? Only the superadmin. ───────────────────────────
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return fail(401, "not_signed_in", "Please sign in again.");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // With only the anon key, getUser() returns no user, so this rejects it.
    const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
    const callerEmail = caller?.user?.email?.toLowerCase();
    if (callerErr || !caller?.user || !caller.user.email_confirmed_at) {
      return fail(401, "not_signed_in", "Please sign in again.");
    }
    if (callerEmail !== SUPERADMIN_EMAIL) {
      return fail(403, "forbidden", "Only the platform admin can invite owners.");
    }

    // ── 2) Validate input ─────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const propertyId = String(body?.property_id ?? "");
    const email = String(body?.email ?? "").trim().toLowerCase();
    const replace = body?.replace === true;

    if (!UUID_RE.test(propertyId)) return fail(400, "bad_property", "Unknown property.");
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return fail(400, "bad_email", "Enter a valid email address.");
    }
    if (email === SUPERADMIN_EMAIL) {
      return fail(400, "superadmin_email", "That is the platform admin login. Use a separate email for the owner.");
    }

    const { data: property, error: propErr } = await admin
      .from("properties")
      .select("id, name, owner_id")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr) throw propErr;
    if (!property) return fail(404, "property_not_found", "Property not found.");

    if (property.owner_id && !replace) {
      return fail(409, "already_linked", "This property already has an owner. Confirm to replace them.");
    }

    // ── 3) Find the login, or invite a new one ────────────────────────────
    const findUser = async () => {
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const hit = data.users.find((u) => u.email?.toLowerCase() === email);
        if (hit) return hit;
        if (data.users.length < 1000) return null;
      }
      return null;
    };

    let userId: string;
    let outcome: "invited" | "linked_existing";

    const existing = await findUser();
    if (existing) {
      userId = existing.id;
      outcome = "linked_existing";
    } else {
      // Always the main site, so only ONE address has to be allowed in
      // Supabase > Authentication > URL Configuration > Redirect URLs.
      const redirectTo = `${DEFAULT_SITE}/reset-password`;
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error) {
        if (/rate limit/i.test(error.message)) {
          return fail(429, "email_rate_limit",
            "Supabase's email limit was reached. Wait a while, or add your own SMTP provider in Supabase > Authentication > SMTP.");
        }
        if (/already (been )?registered/i.test(error.message)) {
          const again = await findUser();
          if (!again) throw error;
          userId = again.id;
          outcome = "linked_existing";
          // fall through to linking
          const { error: linkErr } = await admin.from("properties").update({ owner_id: userId }).eq("id", propertyId);
          if (linkErr) throw linkErr;
          console.log(JSON.stringify({ fn: "invite-owner", propertyId, outcome }));
          return json({ outcome, user_id: userId });
        }
        throw error;
      }
      userId = data.user.id;
      outcome = "invited";
    }

    // ── 4) Link the property to that login ────────────────────────────────
    const { error: linkErr } = await admin.from("properties").update({ owner_id: userId }).eq("id", propertyId);
    if (linkErr) throw linkErr;

    console.log(JSON.stringify({ fn: "invite-owner", propertyId, outcome }));
    return json({ outcome, user_id: userId });
  } catch (e) {
    console.error("invite-owner failed:", (e as Error)?.message);
    return fail(500, "server_error", "Could not complete the invite. Please try again.");
  }
});
