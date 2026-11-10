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

MIGRATIONS="supabase/migrations/20261015000000_room_rates.sql supabase/migrations/20261015000100_server_side_booking_price.sql supabase/migrations/20261015000200_room_ical_feeds.sql supabase/migrations/20261020000000_delete_agent_with_commissions.sql supabase/migrations/20261029000000_public_read_catalog.sql supabase/migrations/20261030000000_property_gallery_instagram.sql supabase/migrations/20261031000000_room_photos_limit.sql supabase/migrations/20261101000000_room_max_occupancy.sql supabase/migrations/20261104000000_directions_by_name.sql supabase/migrations/20261109000000_unified_seasons.sql"
for pass in 1 2; do
  for f in $MIGRATIONS; do $PSQL -d "$DB" -f "$f" 2>&1 | grep -v NOTICE || true; done
  echo "migrations applied (pass $pass)"
done
$PSQL -o /dev/null -d "$DB" -f supabase/tests/migrations.test.sql
$PSQL -o /dev/null -d "$DB" -f supabase/tests/seasons.test.sql
# Last: copy any late room_rates into seasons, then switch everything to seasons
# (this changes the default the tests above rely on)
$PSQL -d "$DB" -f supabase/migrations/20261109000000_unified_seasons.sql 2>&1 | grep -v NOTICE || true
$PSQL -d "$DB" -f supabase/migrations/20261110000000_seasons_always_on.sql
$PSQL -o /dev/null -d "$DB" -f supabase/tests/seasons_always_on.test.sql
