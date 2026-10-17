#!/usr/bin/env bash
# R4.2d production ledger collection — HOST SIDE (materialized, reviewable).
# Delivered to the deploy host over SSH by the runner-side chain
# (scripts/ci/ledger-collection-chain.mjs) and executed with bash. STRICT
# failure throughout. Phases:
#   stage    — decode the pinned collector, verify sha256 + node --check
#   collect  — single-shot READ ONLY collection (bounded by the collector's
#              defaults: lock 2s / statement 10s / client 30s)
#   validate — the document must be the collection schema with both row
#              arrays and a snapshot identity
#   emit     — print COLLECTION_SHA256=<digest> then the marked result line
#              COLLECTION_RESULT_B64=<base64> (stdout recovery)
#   evidence — the raw document and this run's digests stay under
#              $EVIDENCE_DIR for retrieval/archival; the staged script
#              directory is removed, the evidence directory is NOT (the
#              chain archives it on failure too)
# Inputs (env): COLLECTOR_B64, COLLECTOR_SHA256, DEPLOY_PATH, EVIDENCE_DIR
set -Eeuo pipefail
set +x

: "${COLLECTOR_B64:?COLLECTOR_B64 required}"
: "${COLLECTOR_SHA256:?COLLECTOR_SHA256 required}"
: "${DEPLOY_PATH:?DEPLOY_PATH required}"
: "${EVIDENCE_DIR:?EVIDENCE_DIR required}"

# the deploy path must be ABSOLUTE (a '~' in an env var never expands — a
# relative or tilde path is a misconfigured delivery, refused outright)
case "$DEPLOY_PATH" in
  /*) ;;
  *) echo "HOST_COLLECT_ERROR=DEPLOY_PATH_NOT_ABSOLUTE" >&2; exit 30 ;;
esac
# production runs as the deploy user, never root
if [ "$(id -u)" -eq 0 ]; then
  echo "HOST_COLLECT_ERROR=ROOT_REFUSED" >&2
  exit 30
fi
cd "$DEPLOY_PATH"

STAGE_DIR="$(mktemp -d /tmp/phoenix-ledger-collect.XXXXXX)"
trap 'rm -rf "$STAGE_DIR"' EXIT
mkdir -p -m 700 "$EVIDENCE_DIR"

# ── stage: decode the pinned collector and verify it ──────────────────────
printf '%s' "$COLLECTOR_B64" | base64 -d > "$STAGE_DIR/ledger-readonly-collect.mjs"
test -s "$STAGE_DIR/ledger-readonly-collect.mjs"
STAGED_SHA256="$(sha256sum "$STAGE_DIR/ledger-readonly-collect.mjs" | cut -d' ' -f1)"
test "$STAGED_SHA256" = "$COLLECTOR_SHA256" || { echo "HOST_COLLECT_ERROR=COLLECTOR_DIGEST_MISMATCH" >&2; exit 31; }
node --check "$STAGE_DIR/ledger-readonly-collect.mjs" || { echo "HOST_COLLECT_ERROR=COLLECTOR_SYNTAX" >&2; exit 31; }
echo "COLLECTION_STAGED=sha256:$STAGED_SHA256" | tee "$EVIDENCE_DIR/staging.txt"

# ── collect: the single read-only shot ────────────────────────────────────
if ! MIG_MODE=prod node "$STAGE_DIR/ledger-readonly-collect.mjs" --db-mode prod > "$EVIDENCE_DIR/collection.json" 2> "$EVIDENCE_DIR/collect.stderr"; then
  echo "HOST_COLLECT_ERROR=COLLECTION_FAILED" >&2
  cat "$EVIDENCE_DIR/collect.stderr" >&2 || true
  exit 32
fi
test -s "$EVIDENCE_DIR/collection.json"

# ── validate: the document must be a real collection document ─────────────
node -e '
const fs = require("node:fs");
const doc = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (doc.schema !== "phoenix.ledger-readonly-collection/v1"
  || !Array.isArray(doc.schema_migrations) || !Array.isArray(doc.migrations)
  || !doc.snapshot || !doc.server_version) process.exit(1);
console.log(`rows=${doc.schema_migrations.length}+${doc.migrations.length};snapshot=${doc.snapshot}`);
' "$EVIDENCE_DIR/collection.json" > "$EVIDENCE_DIR/validate.txt" || { echo "HOST_COLLECT_ERROR=COLLECTION_INVALID" >&2; exit 33; }
cat "$EVIDENCE_DIR/validate.txt"

# ── emit: stdout recovery of the RAW document plus its digest ─────────────
COLLECTION_SHA256="$(sha256sum "$EVIDENCE_DIR/collection.json" | cut -d' ' -f1)"
echo "$COLLECTION_SHA256" > "$EVIDENCE_DIR/collection.sha256"
echo "COLLECTION_EVIDENCE_DIR=$EVIDENCE_DIR"
echo "COLLECTION_SHA256=$COLLECTION_SHA256"
echo "COLLECTION_RESULT_B64=$(base64 -w0 "$EVIDENCE_DIR/collection.json")"
