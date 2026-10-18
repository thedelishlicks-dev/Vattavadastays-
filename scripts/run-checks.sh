#!/usr/bin/env bash
# Runs every scripts/*.check.ts. prefetch.check.ts needs Vite's import.meta.env,
# so it runs through vite-node with placeholder env vars (as its header says).
set -uo pipefail
fail=0
for f in scripts/adminWindow.check.ts scripts/calendarState.check.ts scripts/errorLog.check.ts scripts/pricing.check.ts; do
  echo "== $f"
  npx --yes tsx "$f" || fail=1
done
echo "== scripts/prefetch.check.ts"
VITE_SUPABASE_URL=${VITE_SUPABASE_URL:-https://x.supabase.co} VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY:-x} \
  npx --yes vite-node scripts/prefetch.check.ts || fail=1
exit $fail
