#!/usr/bin/env bash
set -euo pipefail

mode="${1:---rehearse}"
case "$mode" in --validate|--rehearse|--execute) ;; *) echo "usage: $0 [--validate|--rehearse|--execute]" >&2; exit 2;; esac
root="${RECON_BUNDLE_DIR:-.}"
sql="$root/scripts/ops/cash-balance-reconciliation.sql"
audit_sql="$root/scripts/ops/cash-balance-formula-audit.sql"
test -f "$sql" && test -f "$audit_sql"
grep -q 'BAL_RECON_PREFLIGHT=PASS' "$sql"
grep -q 'BAL_RECON_POSTCHECK=PASS' "$sql"
grep -q 'EXCLUDED_RETIRED_G45_DUPLICATE' "$audit_sql"
[ "$mode" = --validate ] && { echo 'PASS cash balance reconciliation bundle validated'; exit 0; }

run_id="${RECON_RUN_ID:-local-$(date -u +%Y%m%dT%H%M%SZ)}"
case "$run_id" in *[!A-Za-z0-9_-]*) echo 'FAIL invalid run id' >&2; exit 2;; esac
out_dir="${RECON_OUTPUT_DIR:-/tmp/phoenix-cash-balance-reconciliation-$run_id}"
install -d -m 700 "$out_dir"
log="$out_dir/execution.log"
exec > >(tee "$log") 2>&1

psql_db() {
  if [ -n "${RECON_DB_CONTAINER:-}" ]; then
    docker exec -i "$RECON_DB_CONTAINER" sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
  else
    docker compose exec -T db sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
  fi
}

started_at="$(date -u +%FT%TZ)"
echo "RUN_ID=$run_id MODE=$mode STARTED_AT=$started_at"

# Backups are exported before any writable psql session starts.
accounts="'FH-101','FH-102','FH-10206','FH-10207','FH-10209','FH-10210','FH-10211','FH-10212','DP-01','DP-10','DP-11'"
psql_db -c "COPY (SELECT * FROM fin_cash_accounts WHERE account_code IN ($accounts) ORDER BY id) TO STDOUT WITH (FORMAT csv, HEADER true)" > "$out_dir/target-accounts-before.csv"
psql_db -c "COPY (SELECT x.* FROM fin_cash_transactions x WHERE account_code IN ($accounts) ORDER BY id) TO STDOUT WITH (FORMAT csv, HEADER true)" > "$out_dir/target-transactions-before.csv"
sha256sum "$out_dir/target-accounts-before.csv" "$out_dir/target-transactions-before.csv" > "$out_dir/SHA256SUMS"
sha256sum -c "$out_dir/SHA256SUMS"

# The rollback archive is deliberately narrow: remove this batch's OPENING rows,
# restore the only account fields changed, and restore all original balance_after values.
{
  printf '%s\n' '\set ON_ERROR_STOP on' 'BEGIN;'
  printf "DELETE FROM fin_cash_transactions WHERE txn_no LIKE 'OPENING-BAL-RECON-20260904-%%';\n"
  psql_db -tA -c "SELECT format('UPDATE fin_cash_accounts SET opening_balance=%L,current_balance=%L,updated_by=%L,updated_at=%L WHERE id=%L;',opening_balance,current_balance,updated_by,updated_at,id) FROM fin_cash_accounts WHERE account_code IN ($accounts) ORDER BY id"
  psql_db -tA -c "SELECT format('UPDATE fin_cash_transactions SET balance_after=%L WHERE id=%L;',balance_after,id) FROM fin_cash_transactions WHERE account_code IN ($accounts) ORDER BY id"
  printf '%s\n' 'COMMIT;' '-- Re-run cash-balance-formula-audit.sql and verify the archived SHA256SUMS after restore.'
} > "$out_dir/rollback.sql"
sha256sum "$out_dir/rollback.sql" >> "$out_dir/SHA256SUMS"
sha256sum -c "$out_dir/SHA256SUMS"
echo "BACKUP_DIR=$out_dir BACKUP_STATUS=PASS"

if [ "$mode" = --execute ]; then
  test "${RECON_APPROVAL_REF:-}" = 'BAL-RECON-20260904' || { echo 'FAIL exact RECON_APPROVAL_REF required' >&2; exit 2; }
  psql_db -v BAL_RECON_COMMIT=true < "$sql"
else
  psql_db -v BAL_RECON_COMMIT=false < "$sql"
fi

if [ "$mode" = --execute ]; then
  { printf '%s\n' 'BEGIN TRANSACTION READ ONLY;' "SET LOCAL statement_timeout='30s';"; cat "$audit_sql"; printf '%s\n' 'ROLLBACK;'; } | psql_db
  if [ -z "${RECON_DB_CONTAINER:-}" ]; then
    docker compose logs --since "$started_at" --no-color api > "$out_dir/api-error-window.log"
    if grep -Ei 'QueryFailedError|UnhandledPromiseRejection|\bERROR\b' "$out_dir/api-error-window.log"; then
      echo 'FAIL API error window is not clean' >&2
      exit 3
    fi
    echo 'API_ERROR_WINDOW=PASS'
  else
    echo 'API_ERROR_WINDOW=SKIP_LOCAL_CONTAINER_MODE'
  fi
else
  echo 'REHEARSAL_POSTCHECK=PASS (repair transaction rolled back; persistent-state audit intentionally skipped)'
fi
echo "RUN_ID=$run_id COMPLETED_AT=$(date -u +%FT%TZ) BACKUP_DIR=$out_dir"
