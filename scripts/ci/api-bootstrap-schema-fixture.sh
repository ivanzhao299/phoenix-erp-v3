#!/usr/bin/env bash
# Reproduce existing legacy schema in isolated CI, separately from application bootstrap.
set -Eeuo pipefail
[[ "${NODE_ENV:-}" = test && "${MIG_MODE:-}" = ci ]]
[[ "${PGHOST:-}" = 127.0.0.1 || "${PGHOST:-}" = localhost ]]
[[ "${PGDATABASE:-}" = api_bootstrap_fixture || "${PGDATABASE:-}" = phoenix_erp ]]
[[ "${PGUSER:-}" = bootstrap_fixture || "${PGUSER:-}" = phoenix_v3 ]]
psql -X -v ON_ERROR_STOP=1 -f "$(dirname "$0")/api-bootstrap-schema-fixture.sql"
