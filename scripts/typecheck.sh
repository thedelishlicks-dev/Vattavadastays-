#!/usr/bin/env bash
# Type-checks the app. Ignores src/supabase/functions/* — those are Deno edge
# functions (jsr: imports, Deno global) that the Node/Vite compiler can't type.
# Run `npm run build` first on a fresh checkout: it generates src/routeTree.gen.ts.
set -uo pipefail
out=$(npx tsc --noEmit -p . 2>&1 | grep -v '^src/supabase/functions/' | grep -v '^  ' || true)
if echo "$out" | grep -q 'error TS'; then
  echo "$out"
  echo "Type check FAILED"
  exit 1
fi
echo "Type check passed"
