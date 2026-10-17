#!/usr/bin/env bash
set -euo pipefail
[[ "${PGHOST:?}" = 127.0.0.1 && "${PGDATABASE:?}" = ledger_collect_schema_release ]] || exit 2
createdb "$PGDATABASE"
psql -v ON_ERROR_STOP=1 -c 'CREATE TABLE migrations (id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL);'
node scripts/ops/build-chanjet-admission-sql.mjs > "$RUNNER_TEMP/admission.sql"
psql -v ON_ERROR_STOP=1 -f "$RUNNER_TEMP/admission.sql"
test "$(psql -At -c 'SELECT count(*) FROM migrations')" = 1
test "$(psql -At -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'chanjet_%guard'")" = 4
echo 'CONTROLLED_ADMISSION_SQL_PG16=PASS'
