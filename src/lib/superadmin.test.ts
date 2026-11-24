import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SUPERADMIN_EMAIL,
  isSuperAdminEmail,
  normalizeEmail,
  postLoginPath,
  resolveManagedSubdomain,
} from "./superadmin";
import { validateOwnerEmail } from "./onboarding";

// ─── Recognition ────────────────────────────────────────────────────────────

test("the superadmin is recognised", () => {
  assert.equal(isSuperAdminEmail(SUPERADMIN_EMAIL), true);
});

test("a normal owner is not the superadmin", () => {
  assert.equal(isSuperAdminEmail("owner@example.com"), false);
  assert.equal(isSuperAdminEmail("admin@stayidom.in"), false);
});

test("lookalike addresses are not the superadmin", () => {
  assert.equal(isSuperAdminEmail(`x${SUPERADMIN_EMAIL}`), false);
  assert.equal(isSuperAdminEmail(`${SUPERADMIN_EMAIL}.evil.com`), false);
  assert.equal(isSuperAdminEmail(SUPERADMIN_EMAIL.replace("@", "+tag@")), false);
});

test("case and surrounding spaces do not change who the superadmin is", () => {
  assert.equal(isSuperAdminEmail(SUPERADMIN_EMAIL.toUpperCase()), true);
  assert.equal(isSuperAdminEmail(`  ${SUPERADMIN_EMAIL}  `), true);
  assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
});

test("missing or blank email is never the superadmin", () => {
  assert.equal(isSuperAdminEmail(undefined), false);
  assert.equal(isSuperAdminEmail(null), false);
  assert.equal(isSuperAdminEmail(""), false);
  assert.equal(isSuperAdminEmail("   "), false);
});

// ─── Route behaviour ────────────────────────────────────────────────────────

test("login sends the superadmin to /superadmin and everyone else to the owner dashboard", () => {
  assert.equal(postLoginPath(SUPERADMIN_EMAIL), "/superadmin");
  assert.equal(postLoginPath("owner@example.com"), "/admin/dashboard");
  assert.equal(postLoginPath(undefined), "/admin/dashboard");
});

// ─── Property loading ───────────────────────────────────────────────────────

test("an owner cannot pick another property through ?property= or a stored value", () => {
  assert.equal(resolveManagedSubdomain("owner@example.com", "someoneelse", "stored"), "");
  assert.equal(resolveManagedSubdomain(undefined, "someoneelse", "stored"), "");
});

test("the superadmin manages the property named in the URL, else the remembered one", () => {
  assert.equal(resolveManagedSubdomain(SUPERADMIN_EMAIL, "fromurl", "stored"), "fromurl");
  assert.equal(resolveManagedSubdomain(SUPERADMIN_EMAIL, "", "stored"), "stored");
  assert.equal(resolveManagedSubdomain(SUPERADMIN_EMAIL, null, null), "");
});

// ─── Onboarding uses the same definition ────────────────────────────────────

test("the superadmin login cannot be entered as a property owner, in any casing", () => {
  assert.match(validateOwnerEmail(SUPERADMIN_EMAIL), /platform admin/);
  assert.match(validateOwnerEmail(SUPERADMIN_EMAIL.toUpperCase()), /platform admin/);
  assert.equal(validateOwnerEmail("owner@example.com"), "");
});

// ─── Cross-layer drift guard ────────────────────────────────────────────────
// The database and the invite-owner Edge Function intentionally keep their own copy of the
// address (they are the security boundary / a separate runtime). If someone changes one layer
// and forgets the others, the superadmin silently loses access or a wrong login gains it.
// These tests fail instead.

const ROOT = new URL("../../", import.meta.url).pathname;

function filesUnder(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...filesUnder(rel, ext));
    else if (name.endsWith(ext)) out.push(rel);
  }
  return out;
}

// `auth.jwt() ->> 'email' = '<x>'`, `... is distinct from '<x>'`, `coalesce(..., '') <> '<x>'`,
// and the `lower(u.email) = '<x>'` owner-guard trigger.
const SQL_EMAIL_COMPARISON =
  /(?:->>\s*'email'(?:::text)?(?:\s*,\s*'')?|lower\(\s*u\.email\s*\))\)*\s*(?:=|<>|is\s+distinct\s+from)\s*'([^']*)'/gi;

test("every SQL authorization check compares against the app's superadmin email", () => {
  const files = [
    ...filesUnder("supabase/baseline", ".sql"),
    ...filesUnder("supabase/migrations", ".sql"),
  ];
  let found = 0;
  for (const file of files) {
    const sql = readFileSync(join(ROOT, file), "utf8");
    for (const m of sql.matchAll(SQL_EMAIL_COMPARISON)) {
      found++;
      assert.equal(m[1].toLowerCase(), SUPERADMIN_EMAIL, `${file}: SQL compares against ${m[1]}`);
    }
  }
  // If the pattern stops matching, this test would pass vacuously — make that loud.
  assert.ok(found >= 20, `expected to inspect the existing RLS/trigger checks, found ${found}`);
});

test("the invite-owner Edge Function gates on the same superadmin email", () => {
  const src = readFileSync(join(ROOT, "supabase/functions/invite-owner/index.ts"), "utf8");
  const m = src.match(/const SUPERADMIN_EMAIL = "([^"]+)";/);
  assert.ok(m, "invite-owner must define SUPERADMIN_EMAIL");
  assert.equal(m[1], SUPERADMIN_EMAIL);
  // The caller must be verified server-side (getUser on the JWT) and lower-cased before comparing.
  assert.match(src, /auth\.getUser\(jwt\)/);
  assert.match(src, /callerEmail !== SUPERADMIN_EMAIL/);
  assert.match(src, /toLowerCase\(\)/);
});

test("app code has exactly one copy of the superadmin address (src/lib/superadmin.ts)", () => {
  const offenders = filesUnder("src", ".ts")
    .concat(filesUnder("src", ".tsx"))
    .filter((f) => !f.endsWith("superadmin.ts") && !f.endsWith(".test.ts"))
    .filter((f) => readFileSync(join(ROOT, f), "utf8").toLowerCase().includes(SUPERADMIN_EMAIL));
  assert.deepEqual(offenders, []);
});

test("nothing reads the superadmin identity from a client-exposed env var", () => {
  const offenders = filesUnder("src", ".ts")
    .concat(filesUnder("src", ".tsx"))
    .filter((f) => !f.endsWith(".test.ts"))
    .filter((f) =>
      readFileSync(join(ROOT, f), "utf8").includes("import.meta.env.VITE_SUPERADMIN_EMAIL"),
    );
  assert.deepEqual(offenders, []);
});
