#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Dedicated manual Phase 1 path; legacy replay and bridge application are not
# part of this controlled schema authority.
: "${PRESERVE_ARTIFACTS:?PRESERVE_ARTIFACTS=true is required}"
[[ "$PRESERVE_ARTIFACTS" = true ]] || { echo 'PHASE1_EXECUTION_BLOCKED=PRESERVE_ARTIFACTS_REQUIRED'; exit 1; }
: "${TARGET_SHA:?TARGET_SHA is required}"
: "${EXPECTED_PRODUCTION_SHA:?EXPECTED_PRODUCTION_SHA is required}"
: "${PRODUCTION_SHA:?PRODUCTION_SHA is required}"
: "${API_IMAGE_ID:?API_IMAGE_ID is required}"
: "${INVENTORY_FILE:?INVENTORY_FILE is required}"
: "${PREFLIGHT_FILE:?PREFLIGHT_FILE is required}"
: "${MANIFEST_FILE:?MANIFEST_FILE is required}"
: "${EVIDENCE_DIR:?EVIDENCE_DIR is required}"
: "${API_IMAGE:?API_IMAGE is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RUN_ID:?RUN_ID is required}"
ROOT_DIR=${ROOT_DIR:-$PWD}
COMPOSE_DIR=${COMPOSE_DIR:-$PWD}

[[ "$PRODUCTION_SHA" = "$EXPECTED_PRODUCTION_SHA" ]] || { echo 'PHASE1_EXECUTION_BLOCKED=PRODUCTION_SHA_CHANGED'; exit 20; }
export API_IMAGE
mkdir -p "$EVIDENCE_DIR"; chmod 700 "$EVIDENCE_DIR"
printf '%s\n' "$TARGET_SHA" > "$EVIDENCE_DIR/target-sha.txt"
printf '%s\n' "$PRODUCTION_SHA" > "$EVIDENCE_DIR/production-sha.txt"
printf '%s\n' "$API_IMAGE_ID" > "$EVIDENCE_DIR/api-image-id.txt"
cp "$INVENTORY_FILE" "$EVIDENCE_DIR/candidate-inventory.json"
cp "$PREFLIGHT_FILE" "$EVIDENCE_DIR/preflight.json"
cp "$MANIFEST_FILE" "$EVIDENCE_DIR/phase1-manifest.json"
cd "$COMPOSE_DIR"

node "$ROOT_DIR/scripts/ci/phase1-production-execution-gate.mjs" --mode pre --input <(node -e 'const fs=require("fs"); const [inv,pre,man,img]=process.argv.slice(1); const i=JSON.parse(fs.readFileSync(inv)); const p=JSON.parse(fs.readFileSync(pre)); fs.writeFileSync(process.stdout.fd, JSON.stringify({manifestFile:man,preflight:p,pending:p.diagnostics.canonical_typeorm_pending,candidateInventory:i.canonicalTypeorm||i,imageId:img,executionImageId:img}));' "$INVENTORY_FILE" "$PREFLIGHT_FILE" "$MANIFEST_FILE" "$API_IMAGE_ID") > "$EVIDENCE_DIR/phase1-precheck.json"
echo 'PHASE1_PRECHECK=PASS'

# This wrapper performs and verifies the backup before the immutable candidate
# migration and post-migration gates.
BEFORE_INVARIANTS="$EVIDENCE_DIR/data-invariants-before.json"
AFTER_INVARIANTS="$EVIDENCE_DIR/data-invariants-after.json"
INVARIANT_DB_MODE=prod node "$ROOT_DIR/scripts/ci/phase1-production-invariants.mjs" --capture --output "$BEFORE_INVARIANTS"

mkdir -p "$(dirname "$BACKUP_FILE")"; chmod 700 "$(dirname "$BACKUP_FILE")"
(cd "$COMPOSE_DIR" && docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 --no-owner --no-privileges') > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
(cd "$COMPOSE_DIR" && docker compose exec -T db pg_restore --list) < "$BACKUP_FILE" > "$EVIDENCE_DIR/backup-toc.txt"
grep -cvE '^;|^$' "$EVIDENCE_DIR/backup-toc.txt" > "$EVIDENCE_DIR/backup-toc-count.txt"
test "$(cat "$EVIDENCE_DIR/backup-toc-count.txt")" -gt 0
sha256sum "$BACKUP_FILE" | tee "$EVIDENCE_DIR/backup.sha256"
sha256sum -c "$EVIDENCE_DIR/backup.sha256"
printf '%s\n' 'BACKUP_CHECKSUM_VERIFIED=YES' > "$EVIDENCE_DIR/backup-checksum-verified.txt"

set +e
(cd "$COMPOSE_DIR" && docker compose run --no-deps -T --user phoenix \
  -e PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' \
  --entrypoint ./node_modules/.bin/typeorm api \
  -d dist/database/data-source.js migration:run --transaction all > "$EVIDENCE_DIR/migration-run.log" 2>&1)
MIGRATION_RC=$?
set -e
echo "$MIGRATION_RC" > "$EVIDENCE_DIR/migration-exit-code.txt"
if [ "$MIGRATION_RC" -ne 0 ]; then
  echo 'PHASE1_EXECUTION_BLOCKED=MIGRATION_FAILED'
  exit "$MIGRATION_RC"
fi

(cd "$COMPOSE_DIR" && docker compose run --no-deps -T --user phoenix \
  --entrypoint ./node_modules/.bin/typeorm api \
  -d dist/database/data-source.js migration:show > "$EVIDENCE_DIR/migration-show.log" 2>&1)
INVARIANT_DB_MODE=prod node "$ROOT_DIR/scripts/ci/phase1-production-invariants.mjs" --capture --output "$AFTER_INVARIANTS" > "$EVIDENCE_DIR/schema-invariants.log"
node -e 'const fs=require("fs"); fs.writeFileSync(process.argv[1], JSON.stringify({before:JSON.parse(fs.readFileSync(process.argv[2])),after:JSON.parse(fs.readFileSync(process.argv[3]))}));' "$EVIDENCE_DIR/invariant-pair.json" "$BEFORE_INVARIANTS" "$AFTER_INVARIANTS"
node "$ROOT_DIR/scripts/ci/phase1-production-invariants.mjs" "$EVIDENCE_DIR/invariant-pair.json" > "$EVIDENCE_DIR/data-invariants.log" 2>&1 || {
  echo 'PHASE1_EXECUTION_BLOCKED=INVARIANTS_FAILED'; exit 1;
}
POSTFLIGHT_FILE="$EVIDENCE_DIR/postflight.json"
MIG_MODE=prod MIG_DIR=apps/api node "$ROOT_DIR/scripts/ledger-preflight.mjs" --mode post-migration --inventory "$INVENTORY_FILE" > "$POSTFLIGHT_FILE"
node -e 'const fs=require("fs"); const [post,man,inv]=process.argv.slice(1); const p=JSON.parse(fs.readFileSync(post)); const m=JSON.parse(fs.readFileSync(man)); const i=JSON.parse(fs.readFileSync(inv)); fs.writeFileSync(process.stdout.fd, JSON.stringify({manifestFile:man,postflight:p,applied:p.diagnostics.canonical_typeorm_applied,candidateInventory:i.canonicalTypeorm||i,imageId:process.env.API_IMAGE_ID,executionImageId:process.env.API_IMAGE_ID,invariants:{schema:true,data:true}}));' "$POSTFLIGHT_FILE" "$MANIFEST_FILE" "$INVENTORY_FILE" > "$EVIDENCE_DIR/post-input.json"
node "$ROOT_DIR/scripts/ci/phase1-production-execution-gate.mjs" --mode post --input "$EVIDENCE_DIR/post-input.json" > "$EVIDENCE_DIR/phase1-postcheck.json"
echo 'PHASE1_POSTCHECK=PASS'
PROBE_NAME="phoenix-phase1-api-probe-${RUN_ID}"
set +e
(cd "$COMPOSE_DIR" && API_IMAGE="$API_IMAGE" docker compose run --no-deps -d --name "$PROBE_NAME" api) > "$EVIDENCE_DIR/api-probe.log" 2>&1
PROBE_RC=$?
set -e
if [ "$PROBE_RC" -ne 0 ]; then
  printf '%s\n' 'PHASE1_EXECUTION_STATE=DB_CHANGED_APPLICATION_NOT_SWITCHED' > "$EVIDENCE_DIR/execution-result.txt"
  exit 1
fi
set +e
(cd "$COMPOSE_DIR" && for _ in $(seq 1 30); do docker exec "$PROBE_NAME" node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && exit 0; sleep 2; done; exit 1) >> "$EVIDENCE_DIR/api-probe.log" 2>&1
PROBE_HEALTH_RC=$?
set -e
(cd "$COMPOSE_DIR" && docker rm -f "$PROBE_NAME") >/dev/null 2>&1 || true
if [ "$PROBE_HEALTH_RC" -ne 0 ]; then
  printf '%s\n' 'PHASE1_EXECUTION_STATE=DB_CHANGED_APPLICATION_NOT_SWITCHED' > "$EVIDENCE_DIR/execution-result.txt"
  exit 1
fi
if ! (cd "$COMPOSE_DIR" && API_IMAGE="$API_IMAGE" docker compose up -d --no-deps --wait api) || ! curl -fsSL --max-time 20 http://127.0.0.1:3100/api/health -o /dev/null; then
  printf '%s\n' 'PHASE1_EXECUTION_STATE=DB_CHANGED_APPLICATION_SWITCH_FAILED' > "$EVIDENCE_DIR/execution-result.txt"
  exit 1
fi
if ! (cd "$COMPOSE_DIR" && WEB_IMAGE="$WEB_IMAGE" docker compose up -d --no-deps --wait web) || ! curl -fsSL --max-time 20 http://127.0.0.1:3000/ -o /dev/null; then
  printf '%s\n' 'PHASE1_EXECUTION_STATE=DB_CHANGED_APPLICATION_SWITCH_FAILED' > "$EVIDENCE_DIR/execution-result.txt"
  exit 1
fi
echo 'API_SWITCH_AUTHORIZED=true'
printf '%s\n' 'API_SWITCH_AUTHORIZED=true' > "$EVIDENCE_DIR/execution-result.txt"
