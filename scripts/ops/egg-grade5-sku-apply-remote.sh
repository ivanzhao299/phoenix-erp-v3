#!/usr/bin/env bash
# Remote-side runner for the EGG GRADE_5 canonical SKU apply/dry-run/rollback.
# Executed ON the deploy host via SSH from the GitHub workflow (never through
# run-production-readonly-audit.sh — that script's DML keyword gate must never see the
# apply bundle). Gates: revision pin, expected_counts pre-state, then a single-transaction
# psql bundle with ON_ERROR_STOP=1, then a strictly read-only verify pass.
#
# Env (all required unless noted):
#   AUDIT_RUN_ID        github run id (numeric)
#   DEPLOY_PATH         production checkout path on this host
#   EXPECTED_REVISION   full git SHA the checkout must be fast-forwarded to
#   APPLY_KIND          apply | dry-run | rollback-soft | rollback-hard
#   MANIFEST_SHA256     64-hex manifest hash (remark audit chain)
#   EXPECTED_COUNTS     JSON: {"canonical_before":0,"legacy_g5":7,"total_skus":26,
#                        "mst_egg_active":1,"grade5_active":1,"spec3_active":1}
set -euo pipefail

run_id="${AUDIT_RUN_ID:?AUDIT_RUN_ID is required}"
case "$run_id" in *[!0-9]*) echo 'FAIL invalid run id' >&2; exit 2;; esac
kind="${APPLY_KIND:?APPLY_KIND is required}"
case "$kind" in apply|dry-run|rollback-soft|rollback-hard) ;; *) echo "FAIL invalid APPLY_KIND=$kind" >&2; exit 2;; esac
manifest_sha256="${MANIFEST_SHA256:?MANIFEST_SHA256 is required}"
case "$manifest_sha256" in *[!0-9a-f]*|'') echo 'FAIL invalid manifest sha256' >&2; exit 2;; esac
[ "${#manifest_sha256}" -eq 64 ] || { echo 'FAIL manifest sha256 must be 64 hex' >&2; exit 2; }
expected_counts="${EXPECTED_COUNTS:?EXPECTED_COUNTS is required}"

case "$DEPLOY_PATH" in '~/'*) DEPLOY_PATH="$HOME/${DEPLOY_PATH#\~/}";; /*) ;; *) echo 'FAIL invalid DEPLOY_PATH' >&2; exit 2;; esac

out="/tmp/phoenix-egg5-apply-$run_id"
install -d -m 700 "$out"
log="$out/apply.log"
result_json="$out/result.json"
write_result() {
  local rc="$?" status=FAIL
  [ "$rc" -eq 0 ] && status=PASS
  printf '{"schema":"phoenix.egg5-apply/v1","run_id":%s,"kind":"%s","status":"%s","rc":%s,"business_writes":%s,"log":"%s"}\n' \
    "$run_id" "$kind" "$status" "$rc" "$([ "$kind" = dry-run ] && echo 0 || echo 1)" "$log" > "$result_json" || true
  return "$rc"
}
trap write_result EXIT
exec > >(tee "$log") 2>&1

cd "$DEPLOY_PATH"
# Fast-forward-only sync, same mechanism as deploy.yml / preflight (no reset/force/detach).
git fetch origin main
if [ "$(git rev-parse HEAD)" != "$EXPECTED_REVISION" ]; then
  git symbolic-ref -q HEAD >/dev/null || git switch main
  git pull --ff-only origin main
fi
checkout="$(git rev-parse HEAD)"
[ "$checkout" = "$EXPECTED_REVISION" ] || { echo "FAIL revision checkout=$checkout expected=$EXPECTED_REVISION" >&2; exit 3; }
echo "PASS REVISION checkout=$checkout"

apply_sql='scripts/ops/readonly-audits/egg-grade5-sku-apply.sql'
dryrun_sql='scripts/ops/readonly-audits/egg-grade5-sku-apply-dryrun.sql'
verify_sql='scripts/ops/readonly-audits/egg-grade5-sku-verify.sql'
soft_sql='scripts/ops/readonly-audits/egg-grade5-sku-rollback-soft.sql'
hard_sql='scripts/ops/readonly-audits/egg-grade5-sku-rollback-hard.sql'
for f in "$apply_sql" "$dryrun_sql" "$verify_sql" "$soft_sql" "$hard_sql"; do
  [ -f "$f" ] || { echo "FAIL missing bundle $f" >&2; exit 2; }
done
case "$kind" in
  apply)         bundle="$apply_sql" ;;
  dry-run)       bundle="$dryrun_sql" ;;
  rollback-soft) bundle="$soft_sql" ;;
  rollback-hard) bundle="$hard_sql" ;;
esac
sql_sha256="$(sha256sum "$bundle" | awk '{print $1}')"
manifest_sha256_file="$(sha256sum scripts/ops/manifests/egg-grade5-candidate.json | awk '{print $1}')"
[ "$manifest_sha256_file" = "$manifest_sha256" ] || {
  echo "FAIL manifest sha256 checkout=$manifest_sha256_file input=$manifest_sha256" >&2; exit 4; }
echo "PASS MANIFEST sha256=$manifest_sha256 bundle=$bundle bundle_sha256=$sql_sha256"

# discover the production db container (same pattern as run-production-readonly-audit.sh)
db_container="$(docker compose ps -q db 2>/dev/null || true)"
[ -n "$db_container" ] || { echo 'FAIL production db container not found' >&2; exit 2; }
docker inspect --format '{{.Id}}' "$db_container" >/dev/null 2>&1 || { echo 'FAIL db container invalid' >&2; exit 2; }
psql_read()  { docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$db_container" sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'; }

# ── pre-state assertion vs expected_counts (read-only; apply/rollback-soft/hard only) ──
if [ "$kind" != dry-run ]; then
  actual="$(docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$db_container" \
    sh -c 'exec psql -X -tA -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"' <<'SQL'
SELECT json_build_object(
  'mst_egg_active', (SELECT count(*) FROM mst_products WHERE product_code='EGG' AND status='ACTIVE'),
  'grade5_active', (SELECT count(*) FROM product_grades WHERE grade_code='GRADE_5' AND status='ACTIVE'),
  'spec3_active', (SELECT count(*) FROM packaging_specs WHERE spec_code='PKG_PACK_SPEC_3' AND status='ACTIVE'),
  'canonical_before', (SELECT count(*) FROM product_skus WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3'),
  'legacy_g5', (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5'),
  'total_skus', (SELECT count(*) FROM product_skus))::text;
SQL
)"
  echo "PRE_STATE actual=$actual expected=$expected_counts"
  ACTUAL="$actual" EXPECTED="$expected_counts" python3 - <<'PY'
import json, os, sys
actual = json.loads(os.environ['ACTUAL']); expected = json.loads(os.environ['EXPECTED'])
mismatch = {k: (actual.get(k), v) for k, v in expected.items() if actual.get(k) != v}
if mismatch:
    print(f"FAIL pre-state mismatch vs expected_counts: {mismatch}", file=sys.stderr); sys.exit(5)
PY
  echo 'PASS PRE_STATE matches expected_counts'
fi

# ── execute the bundle in ONE transaction (ON_ERROR_STOP=1 aborts on any failure) ──
# stdin piping keeps the SQL identical to the reviewed repo file (no remote shell string).
if [ "$kind" = rollback-soft ] || [ "$kind" = rollback-hard ]; then
  RUN_ID="$run_id" docker exec -i "$db_container" sh -c '
      exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" \
        -v run_id="$RUN_ID"' < "$bundle"
else
  RUN_ID="$run_id" MANIFEST_SHA256="$manifest_sha256" docker exec -i "$db_container" sh -c '
      exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" \
        -v run_id="$RUN_ID" -v manifest_sha256="$MANIFEST_SHA256"' < "$bundle"
fi
echo "PASS BUNDLE kind=$kind bundle_sha256=$sql_sha256"

# ── post verify: strictly read-only assertion pass ──
case "$kind" in
  apply)
    # full V1-V11 verify bundle (READ ONLY + ROLLBACK inside the file)
    psql_read < "$verify_sql"
    echo 'PASS POST_VERIFY V1-V11'
    ;;
  dry-run)
    docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$db_container" \
      sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"' <<'SQL'
\pset pager off
BEGIN TRANSACTION READ ONLY;
DO $assert$
BEGIN
  IF (SELECT count(*) FROM product_skus WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'DRYRUN canonical row visible after ROLLBACK — leak!';
  END IF;
  IF (SELECT count(*) FROM product_skus) <> 26 THEN
    RAISE EXCEPTION 'DRYRUN total != 26 after ROLLBACK';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') <> 7 THEN
    RAISE EXCEPTION 'DRYRUN legacy drifted';
  END IF;
END
$assert$;
ROLLBACK;
SQL
    echo 'PASS POST_VERIFY dry-run zero-commit (canonical=0, total=26, legacy=7)'
    # evidence dump: production snapshot (canonical still 0 rows — V5 would rightly fail here)
    psql_read < 'scripts/ops/readonly-audits/egg-grade5-production-snapshot.sql'
    echo 'PASS POST_VERIFY dry-run snapshot evidence captured'
    ;;
  rollback-soft)
    docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$db_container" \
      sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"' <<'SQL'
\pset pager off
BEGIN TRANSACTION READ ONLY;
DO $assert$
BEGIN
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3' AND status='DISABLED') <> 1 THEN
    RAISE EXCEPTION 'SOFT canonical not DISABLED';
  END IF;
  IF (SELECT count(*) FROM product_skus) <> 27 THEN
    RAISE EXCEPTION 'SOFT total != 27';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5' AND status='ACTIVE') <> 7 THEN
    RAISE EXCEPTION 'SOFT legacy drifted';
  END IF;
END
$assert$;
ROLLBACK;
SQL
    echo 'PASS POST_VERIFY soft rollback (canonical DISABLED, total=27, legacy=7)'
    ;;
  rollback-hard)
    docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$db_container" \
      sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"' <<'SQL'
\pset pager off
BEGIN TRANSACTION READ ONLY;
DO $assert$
BEGIN
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN
    RAISE EXCEPTION 'HARD canonical still present';
  END IF;
  IF (SELECT count(*) FROM product_skus) <> 26 THEN
    RAISE EXCEPTION 'HARD total != 26';
  END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') <> 7 THEN
    RAISE EXCEPTION 'HARD legacy drifted';
  END IF;
END
$assert$;
ROLLBACK;
SQL
    echo 'PASS POST_VERIFY hard rollback (canonical gone, total=26, legacy=7)'
    ;;
esac

echo "PASS EGG5 kind=$kind run=$run_id manifest=$manifest_sha256 bundle_sha256=$sql_sha256 revision=$checkout"
