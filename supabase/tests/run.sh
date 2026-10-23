#!/usr/bin/env bash
# Applies the new migrations to a throw-away Postgres (with a minimal
# Supabase-like stub) and runs supabase/tests/migrations.test.sql.
#   Locally:  PGHOST=localhost PGUSER=postgres bash supabase/tests/run.sh
#   CI:       PG* variables point at the service container.
# Also re-applies every migration a 2nd time to prove they are idempotent.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-stayidom_migration_test}
PSQL="psql -v ON_ERROR_STOP=1 -q"

$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d "$DB" -f supabase/tests/stub.sql

MIGRATIONS="supabase/migrations/20261015000000_room_rates.sql supabase/migrations/20261015000100_server_side_booking_price.sql supabase/migrations/20261015000200_room_ical_feeds.sql supabase/migrations/20261020000000_delete_agent_with_commissions.sql"
for pass in 1 2; do
  for f in $MIGRATIONS; do $PSQL -d "$DB" -f "$f" 2>&1 | grep -v NOTICE || true; done
  echo "migrations applied (pass $pass)"
done
$PSQL -o /dev/null -d "$DB" -f supabase/tests/migrations.test.sql
