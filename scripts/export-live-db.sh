#!/usr/bin/env bash
# Captures the LIVE Supabase schema into supabase/baseline/ so it can be
# committed and the database rebuilt from the repo.
#
#   1. Supabase dashboard → Project Settings → Database → Connection string (URI,
#      "Session pooler" or "Direct"). Replace [YOUR-PASSWORD].
#   2. SUPABASE_DB_URL='postgresql://postgres...' bash scripts/export-live-db.sh
#
# Needs pg_dump 15+ (brew install libpq / apt install postgresql-client).
# Read-only. Review the output for anything sensitive before committing
# (the schema contains no row data, but policies can mention email addresses).
set -euo pipefail
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Postgres connection string of your Supabase project}"
cd "$(dirname "$0")/.."
mkdir -p supabase/baseline

echo "→ schema (tables, constraints, functions, triggers, policies, grants)"
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --schema=public \
  --file=supabase/baseline/public_schema.sql

echo "→ scheduled jobs (pg_cron) and extensions"
psql "$SUPABASE_DB_URL" -At -v ON_ERROR_STOP=1 -c \
  "select format('select cron.schedule(%L, %L, %L);', jobname, schedule, command) from cron.job order by jobname" \
  > supabase/baseline/cron_jobs.sql || echo "-- pg_cron not readable with this role" > supabase/baseline/cron_jobs.sql
psql "$SUPABASE_DB_URL" -At -c \
  "select format('create extension if not exists %I;', extname) from pg_extension order by extname" \
  > supabase/baseline/extensions.sql

echo "Done. Review supabase/baseline/ then commit it."
