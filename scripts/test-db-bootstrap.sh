#!/usr/bin/env bash
# Deterministic isolated-test bootstrap: schema/legacy SQL, then TypeORM migrations.
set -euo pipefail

: "${MIG_MODE:=ci}"
: "${MIG_DIR:=apps/api}"

if [[ "${NODE_ENV:-}" != "test" ]]; then
  echo "test-db-bootstrap requires NODE_ENV=test" >&2
  exit 1
fi

MIG_MODE="$MIG_MODE" MIG_DIR="$MIG_DIR" bash "$(dirname "$0")/db-migrate.sh"

NODE_ENV=test MIG_MODE=ci bash "$(dirname "$0")/ci/api-bootstrap-schema-fixture.sh"

psql -v ON_ERROR_STOP=1 <<'SQL'
DO $check$
BEGIN
  IF to_regclass('public.prc2_projects') IS NULL THEN
    RAISE EXCEPTION 'bootstrap incomplete: prc2_projects is missing';
  END IF;
  IF to_regclass('public.pkg_work_shifts') IS NULL THEN
    RAISE EXCEPTION 'bootstrap incomplete: pkg_work_shifts is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='prc2_projects' AND column_name='company_code' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'bootstrap incomplete: prc2_projects.company_code must be NOT NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pkg_work_shifts' AND column_name='is_test') THEN
    RAISE EXCEPTION 'bootstrap incomplete: pkg_work_shifts.is_test is missing';
  END IF;
END
$check$;
SQL
echo "✅ isolated test database bootstrap assertions passed"
