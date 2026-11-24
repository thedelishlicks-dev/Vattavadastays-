# Superadmin identity: where it lives and why

The platform superadmin is identified by one email address. Three layers need to know it, for
three different reasons. Only one of them is a security boundary.

| Layer | Where | Purpose | Authoritative? |
| --- | --- | --- | --- |
| **App (UI)** | `src/lib/superadmin.ts` → `SUPERADMIN_EMAIL`, `isSuperAdminEmail()` | Choose which screen to show: login redirect, `/superadmin` vs `/admin`, "manage property" switcher, owner-email validation in the onboarding form | **No.** Convenience only. |
| **Edge Function** | `supabase/functions/invite-owner/index.ts` | Gate a function that holds the service-role key | **Yes**, for that function |
| **Database** | RLS policies and triggers in `supabase/baseline/*.sql` and `supabase/migrations/*.sql` | Decide what the superadmin may read or write | **Yes.** The real boundary. |

## Flow

1. The browser signs in through Supabase Auth and gets a JWT containing the user's email.
2. `isSuperAdminEmail(user.email)` picks the UI (route redirects, `useOwnerProperty` loading
   `?property=`). Editing the browser can change what is *shown*, nothing else.
3. Every query then carries the JWT. Postgres evaluates `auth.jwt() ->> 'email' = '<superadmin>'`
   in the `superadmin_*` RLS policies. An owner who fakes the UI still gets only their own rows.
4. Owner invites go to the `invite-owner` Edge Function, which verifies the JWT server-side
   (`auth.admin.getUser`) and refuses any other caller before it touches the service key.
5. Triggers (`protect_property_billing_columns`, `protect_season_pricing_switch`,
   `prevent_superadmin_as_owner`) protect billing columns and stop the admin login being used as
   an owner.

## Decisions

**App layer: one constant, no env var.** `VITE_SUPERADMIN_EMAIL` was removed. The database hard-codes
the address, so the identity cannot change without a SQL migration; an env var could only drift from
it (UI says A, RLS says B). `VITE_` values also ship in the public bundle. The address is not a
secret, but there is no reason to make it configurable per deployment. You may delete
`VITE_SUPERADMIN_EMAIL` from Vercel; leaving it set is harmless because nothing reads it.

**Database: copies intentionally remain.** RLS policies must be evaluated inside Postgres from the
verified JWT. Replacing the literal with a database setting (`current_setting('app.superadmin_email')`)
was tried in the first leads migration and silently failed closed for everyone when the setting was
not configured (see `20260919000000_security_hardening.sql`, section 9). A `superadmins` table would
work but changes every policy and trigger on a live database; that is a separate, reviewed migration,
not part of this cleanup. Historical migrations are not rewritten.

**Edge Function: copy intentionally remains.** It is pasted into the Supabase dashboard as a single
file, so it cannot import app code. It fails closed.

## Drift protection

`src/lib/superadmin.test.ts` (part of `npm test`) fails if any SQL authorization check or the
Edge Function compares against a different address than `SUPERADMIN_EMAIL`, if a second copy of the
address appears in app code, or if app code reads `VITE_SUPERADMIN_EMAIL` again.

## Changing the superadmin

1. Add a migration that recreates every `superadmin_*` policy and the three triggers above.
2. Update `supabase/functions/invite-owner/index.ts` and redeploy it.
3. Update `SUPERADMIN_EMAIL` in `src/lib/superadmin.ts`.
4. `npm test` shows if any layer was missed.

Possible later improvement: a `superadmins` table plus an `is_superadmin()` SQL function used by all
policies, and by the Edge Function through an RPC. That would make the database the single source.
