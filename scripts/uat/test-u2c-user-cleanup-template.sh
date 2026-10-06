#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
EXEC_SQL="$ROOT_DIR/scripts/uat/uat-user-cleanup-execution.sql"
POSTCHECK_SQL="$ROOT_DIR/scripts/uat/uat-user-cleanup-postcheck.sql"

grep -Fq '\if :{?DRY_RUN}' "$EXEC_SQL"
grep -Fq '\set DRY_RUN true' "$EXEC_SQL"
grep -Fq '\if :{?PRODUCTION_DELETE_AUTHORIZED}' "$EXEC_SQL"
grep -Fq '\set PRODUCTION_DELETE_AUTHORIZED false' "$EXEC_SQL"
grep -Fq 'BEGIN ISOLATION LEVEL SERIALIZABLE;' "$EXEC_SQL"
grep -Fq 'FOR UPDATE;' "$EXEC_SQL"

test "$(grep -Ec '^      DELETE FROM public\.sys_user$' "$EXEC_SQL")" -eq 1
grep -Fq "WHERE user_id = 298 AND username = 'pilot_wms' AND status = 0;" "$EXEC_SQL"
! grep -Eq "LIKE[[:space:]]+'%?pilot_" "$EXEC_SQL"
! grep -Eq '^[[:space:]]*(UPDATE|INSERT|TRUNCATE|ALTER|DROP|CREATE)[[:space:]]' "$EXEC_SQL"

grep -Fq "pilot_sales','pilot_cashier','pilot_driver','pilot_finance','pilot_manager" "$POSTCHECK_SQL"
grep -Fq "username = 'wang_ceo'" "$POSTCHECK_SQL"

echo 'u2c-template-static=PASS'
