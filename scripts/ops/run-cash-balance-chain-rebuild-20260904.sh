#!/usr/bin/env bash
set -euo pipefail
mode="${1:---verify}"
case "$mode" in --validate|--verify|--rehearse|--execute) ;; *) echo "usage: $0 [--validate|--verify|--rehearse|--execute]" >&2; exit 2;; esac
root="${BAL_CHAIN_BUNDLE_DIR:-.}"
sql="$root/scripts/ops/cash-balance-chain-rebuild-20260904.sql"
verify_sql="$root/scripts/ops/cash-balance-chain-verify-20260904.sql"
test -f "$sql" && test -f "$verify_sql"
grep -q 'BAL_CHAIN_PREFLIGHT=6/23/21+2/29' "$sql"
grep -q 'BAL_CHAIN_POSTCHECK=ALL_ACTIVE_BREAKPOINTS_0' "$sql"
[ "$mode" = --validate ] && { echo 'PASS cash balance chain rebuild bundle validated'; exit 0; }

run_id="${BAL_CHAIN_RUN_ID:-local-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$run_id" in *[!A-Za-z0-9_-]*) echo 'FAIL invalid run id' >&2; exit 2;; esac
out_dir="${BAL_CHAIN_OUTPUT_DIR:-/tmp/phoenix-cash-balance-chain-$run_id/evidence}"
install -d -m 700 "$out_dir"
exec > >(tee "$out_dir/execution.log") 2>&1

expected_revision='7ba93975e4122d75d48a3c27b57e3294ee10f550'
actual_revision="$(git rev-parse HEAD)"
test "$actual_revision" = "$expected_revision" || { echo "FAIL revision=$actual_revision expected=$expected_revision" >&2; exit 3; }

container="$(docker compose ps -q db)"
test -n "$container"
db_tmp="/tmp/bal-chain-$run_id"
docker exec "$container" sh -c 'mkdir -p "$1" && chown postgres:postgres "$1" && chmod 700 "$1"' sh "$db_tmp"

psql_args=(-X -v ON_ERROR_STOP=1 -P pager=off -U "$(docker exec "$container" printenv POSTGRES_USER)" -d "$(docker exec "$container" printenv POSTGRES_DB)")
vars=(
  -v "accounts_csv=$db_tmp/accounts-before.csv"
  -v "breakpoints_csv=$db_tmp/breakpoints-before.csv"
  -v "tail_before_csv=$db_tmp/tail-before.csv"
  -v "other_before_csv=$db_tmp/other-before.csv"
  -v "rollback_body=$db_tmp/rollback-body.sql"
  -v "tail_after_csv=$db_tmp/tail-after.csv"
  -v "other_after_csv=$db_tmp/other-after.csv"
)

if [ "$mode" = --verify ]; then
  docker exec -e PGOPTIONS='-c default_transaction_read_only=on' -i "$container" psql "${psql_args[@]}" < "$verify_sql"
  echo "PASS RUN_ID=$run_id READONLY_VERIFY=1 COMPLETED_AT=$(date -u +%FT%TZ)"
  exit 0
fi

commit=false
[ "$mode" = --execute ] && {
  test "${BAL_CHAIN_APPROVAL_REF:-}" = 'BAL-CHAIN-REBUILD-20260904' || { echo 'FAIL exact approval reference required' >&2; exit 3; }
  commit=true
}
started_at="$(date -u +%FT%TZ)"
echo "RUN_ID=$run_id MODE=$mode REVISION=$actual_revision STARTED_AT=$started_at"
docker exec -i "$container" psql "${psql_args[@]}" "${vars[@]}" -v "BAL_CHAIN_COMMIT=$commit" < "$sql"

for name in accounts-before.csv breakpoints-before.csv tail-before.csv other-before.csv rollback-body.sql tail-after.csv other-after.csv; do
  docker cp "$container:$db_tmp/$name" "$out_dir/$name"
done
{
  echo '\set ON_ERROR_STOP on'
  echo 'BEGIN;'
  cat "$out_dir/rollback-body.sql"
  echo 'COMMIT;'
  echo '-- Verify all chain/hash assertions after restore.'
} > "$out_dir/rollback.sql"
sha256sum "$out_dir"/*.csv "$out_dir/rollback.sql" > "$out_dir/SHA256SUMS"
sha256sum -c "$out_dir/SHA256SUMS"

test "$(($(wc -l < "$out_dir/accounts-before.csv")-1))" -eq 6
test "$(($(wc -l < "$out_dir/breakpoints-before.csv")-1))" -eq 23
test "$(($(wc -l < "$out_dir/tail-before.csv")-1))" -eq 29
cmp "$out_dir/other-before.csv" "$out_dir/other-after.csv"

if [ "$mode" = --execute ]; then
  docker compose logs --since "$started_at" --no-color api > "$out_dir/api-error-window.log"
  if grep -Ei 'QueryFailedError|UnhandledPromiseRejection|numeric.*NaN|\bERROR\b' "$out_dir/api-error-window.log"; then
    echo 'FAIL API_ERROR_WINDOW' >&2; exit 4
  fi
  echo 'PASS API_ERROR_WINDOW=0'
fi
echo "PASS RUN_ID=$run_id BACKUP_DIR=$out_dir COMPLETED_AT=$(date -u +%FT%TZ)"
