#!/usr/bin/env bash
# Container rehearsal for the EGG GRADE_5 canonical SKU apply loop (design doc §8).
# Sequence: fixture -> dry-run -> apply -> verify(V1-V11) -> rollback-soft -> state assert
#           -> rollback-hard -> baseline assert. Every psql transcript is archived to
#           docs/ops/runs/packaging-sku-apply-rehearsal-20260912/.
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="docs/ops/runs/packaging-sku-apply-rehearsal-20260912"
mkdir -p "$OUT"
SUMMARY="$OUT/summary.log"
: > "$SUMMARY"
step() { printf '\n===== %s =====\n' "$1" | tee -a "$SUMMARY"; }

CNAME="phoenix-egg5-rehearsal-pg18"
IMAGE="postgres:18-alpine"
MANIFEST_SHA256="$(node scripts/ops/egg-grade5-manifest.mjs scripts/ops/manifests/egg-grade5-candidate.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).sha256))")"
RUN_ID="20260912"

cleanup() { docker rm -f "$CNAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

step "container"
docker run -d --name "$CNAME" -e POSTGRES_PASSWORD=rehearsal -e POSTGRES_DB=phoenix_erp "$IMAGE" >/dev/null
for i in $(seq 1 60); do docker exec "$CNAME" psql -U postgres -d phoenix_erp -tAc 'SELECT 1' >/dev/null 2>&1 && break; sleep 1; done
docker exec "$CNAME" psql -U postgres -d phoenix_erp -tAc 'SELECT 1' >/dev/null
psqlx() { docker exec -i "$CNAME" psql -X -v ON_ERROR_STOP=1 -P pager=off -U postgres -d phoenix_erp; }
psql_ro() { docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$CNAME" psql -X -v ON_ERROR_STOP=1 -P pager=off -U postgres -d phoenix_erp; }

step "fixture before-image"
psqlx < scripts/ops/egg-grade5-rehearsal-fixture.sql 2>&1 | tee "$OUT/00-fixture.log"
psqlx -tA <<< "SELECT 'fixture: total='||count(*)||' legacy_g5='||count(*) FILTER (WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5')||' canonical='||count(*) FILTER (WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3') FROM product_skus;" | tee -a "$SUMMARY"

step "baseline assertion (canonical=0, legacy=7, total=26)"
psqlx 2>&1 <<'SQL' | tee "$OUT/01-baseline.log"
DO $assert$ BEGIN
  IF (SELECT count(*) FROM product_skus WHERE product_code='EGG' AND grade_code='GRADE_5' AND spec_code='PKG_PACK_SPEC_3') <> 0 THEN RAISE EXCEPTION 'baseline canonical != 0'; END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') <> 7 THEN RAISE EXCEPTION 'baseline legacy != 7'; END IF;
  IF (SELECT count(*) FROM product_skus) <> 26 THEN RAISE EXCEPTION 'baseline total != 26'; END IF;
END $assert$;
SELECT 'PASS baseline' AS result;
SQL

step "dry-run (must roll back, zero commits)"
docker exec -i -e RUN_ID="$RUN_ID" -e MANIFEST_SHA256="$MANIFEST_SHA256" "$CNAME" \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U postgres -d phoenix_erp -v run_id="$RUN_ID" -v manifest_sha256="$MANIFEST_SHA256"' \
  < scripts/ops/readonly-audits/egg-grade5-sku-apply-dryrun.sql 2>&1 | tee "$OUT/02-dryrun.log"
psqlx -tA <<< "SELECT 'post-dryrun: total='||count(*)||' canonical='||count(*) FILTER (WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') FROM product_skus;" | tee -a "$SUMMARY"

step "apply (single transaction, commit)"
docker exec -i -e RUN_ID="$RUN_ID" -e MANIFEST_SHA256="$MANIFEST_SHA256" "$CNAME" \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U postgres -d phoenix_erp -v run_id="$RUN_ID" -v manifest_sha256="$MANIFEST_SHA256"' \
  < scripts/ops/readonly-audits/egg-grade5-sku-apply.sql 2>&1 | tee "$OUT/03-apply.log"

step "verify V1-V11 (read-only)"
psql_ro < scripts/ops/readonly-audits/egg-grade5-sku-verify.sql 2>&1 | tee "$OUT/04-verify.log"

step "duplicate apply must FAIL (Q3: no ALREADY_APPLIED)"
set +e
docker exec -i -e RUN_ID="$RUN_ID" -e MANIFEST_SHA256="$MANIFEST_SHA256" "$CNAME" \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U postgres -d phoenix_erp -v run_id="$RUN_ID" -v manifest_sha256="$MANIFEST_SHA256"' \
  < scripts/ops/readonly-audits/egg-grade5-sku-apply.sql > "$OUT/05-duplicate-apply.log" 2>&1
DUP_RC=$?
set -e
grep -q 'A4 canonical' "$OUT/05-duplicate-apply.log" && echo "PASS duplicate apply failed at A4 (rc=$DUP_RC)" | tee -a "$SUMMARY"
test "$DUP_RC" -ne 0
cat "$OUT/05-duplicate-apply.log" | tail -3 >> "$SUMMARY"

step "soft rollback (DISABLED by source_no)"
docker exec -i -e RUN_ID="$RUN_ID" "$CNAME" \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U postgres -d phoenix_erp -v run_id="$RUN_ID"' \
  < scripts/ops/readonly-audits/egg-grade5-sku-rollback-soft.sql 2>&1 | tee "$OUT/06-rollback-soft.log"

step "post-soft state (DISABLED=1, total=27, legacy=7)"
psqlx 2>&1 <<'SQL' | tee "$OUT/07-post-soft.log"
DO $assert$ BEGIN
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3' AND status='DISABLED') <> 1 THEN RAISE EXCEPTION 'soft: not DISABLED'; END IF;
  IF (SELECT count(*) FROM product_skus) <> 27 THEN RAISE EXCEPTION 'soft: total != 27'; END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5' AND status='ACTIVE') <> 7 THEN RAISE EXCEPTION 'soft: legacy drifted'; END IF;
END $assert$;
SELECT 'PASS post-soft state' AS result;
SQL

step "hard rollback (zero-reference gated DELETE; works from DISABLED state)"
docker exec -i -e RUN_ID="$RUN_ID" "$CNAME" \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U postgres -d phoenix_erp -v run_id="$RUN_ID"' \
  < scripts/ops/readonly-audits/egg-grade5-sku-rollback-hard.sql 2>&1 | tee "$OUT/08-rollback-hard.log"

step "post-hard baseline (canonical=0, total=26, legacy=7)"
psqlx 2>&1 <<'SQL' | tee "$OUT/09-post-hard.log"
DO $assert$ BEGIN
  IF (SELECT count(*) FROM product_skus WHERE sku_code='EGG-GRADE_5-PKG_PACK_SPEC_3') <> 0 THEN RAISE EXCEPTION 'hard: canonical still present'; END IF;
  IF (SELECT count(*) FROM product_skus) <> 26 THEN RAISE EXCEPTION 'hard: total != 26'; END IF;
  IF (SELECT count(*) FROM product_skus WHERE product_code='PRD-EGG-5' AND grade_code='GRADE_5') <> 7 THEN RAISE EXCEPTION 'hard: legacy drifted'; END IF;
END $assert$;
SELECT 'PASS post-hard baseline restored (world == before-image)' AS result;
SQL

step "re-apply after full rollback (idempotent loop re-entry)"
docker exec -i -e RUN_ID="$RUN_ID" -e MANIFEST_SHA256="$MANIFEST_SHA256" "$CNAME" \
  sh -c 'exec psql -X -v ON_ERROR_STOP=1 -P pager=off -U postgres -d phoenix_erp -v run_id="$RUN_ID" -v manifest_sha256="$MANIFEST_SHA256"' \
  < scripts/ops/readonly-audits/egg-grade5-sku-apply.sql 2>&1 | tee "$OUT/10-reapply.log"
psql_ro < scripts/ops/readonly-audits/egg-grade5-sku-verify.sql 2>&1 | tee "$OUT/11-reverify.log"

step "done"
printf 'REHEARSAL PASS manifest_sha256=%s run_id=%s\n' "$MANIFEST_SHA256" "$RUN_ID" | tee -a "$SUMMARY"
