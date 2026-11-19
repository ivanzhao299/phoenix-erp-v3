# The Actions runner invokes this fixed source with the one request on stdin.
set -Eeuo pipefail
set +x
umask 077
trap 'echo MODERN_SCHEMA_HOST_TRANSPORT_HOLD >&2' ERR

operation=$1
case "$operation" in prepare|run) ;; *) exit 2 ;; esac
[[ "$TARGET_SHA" =~ ^[a-f0-9]{40}$ ]]
[[ "$APPROVED_PREVIOUS_FLOOR_SHA" =~ ^[a-f0-9]{40}$ && "$APPROVED_PREVIOUS_FLOOR_SHA" != "$TARGET_SHA" ]]
[[ "$DEPLOY_RUN_ID" =~ ^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$ && "$DEPLOY_RUN_ID" = *-"$DEPLOY_RUN_ATTEMPT" ]]
test "$APPROVED_CONFIG_FLOOR_SHA" = "$TARGET_SHA"

cd /data/phoenix-erp
DEPLOY_REPO_ROOT="$(pwd -P)"
export DEPLOY_REPO_ROOT
eval "$(printf '%s' "$PRODUCTION_CONTROL_BOOTSTRAP_B64" | base64 -d)"
export STATE_DIR
unset PRODUCTION_CONTROL_BOOTSTRAP_B64 PRODUCTION_CONTRACT_B64 PRODUCTION_PATH_HELPER_B64
repo_git() { command git -c "safe.directory=$DEPLOY_REPO_ROOT" "$@"; }
test "$(repo_git symbolic-ref -q --short HEAD)" = main
test -z "$(repo_git status --porcelain --untracked-files=all)"
repo_git fetch origin main >/dev/null 2>&1
test "$(repo_git rev-parse refs/remotes/origin/main)" = "$TARGET_SHA"
test "$(repo_git ls-remote --exit-code origin refs/heads/main)" = "$(printf '%s\trefs/heads/main' "$TARGET_SHA")"
repo_git merge-base --is-ancestor HEAD "$TARGET_SHA"

stage="$STATE_DIR/modern-schema-stage-$DEPLOY_RUN_ID"
manifest=scripts/ops/modern-schema-stage-files.txt
entry=scripts/ops/production-modern-schema-release.mjs
files=$(repo_git show "$TARGET_SHA:$manifest")
if [ "$operation" = prepare ]; then
  mkdir -m 700 "$stage"
fi
test -d "$stage" && test ! -L "$stage"
test "$(stat -c '%u:%a' "$stage")" = 0:700

declare -A staged=()
while IFS= read -r file; do
  [[ "$file" =~ ^[A-Za-z0-9_./-]+$ && "$file" != /* && "/$file/" != *"/../"* && "/$file/" != *"/./"* ]]
  case "$file" in
    scripts/ops/*|scripts/ci/*|scripts/ledger-preflight.mjs|scripts/deploy-schema-first.sh|apps/api/src/common/database/api-bootstrap-schema-contract.json|.github/workflows/deploy.yml|docker-compose.yml) ;;
    *) exit 2 ;;
  esac
  test -z "${staged[$file]+seen}"
  staged[$file]=1
  tree_line=$(repo_git ls-tree "$TARGET_SHA" -- "$file")
  [[ "$tree_line" =~ ^100(644|755)\ blob\ [a-f0-9]{40}$'\t' ]]
  staged_file="$stage/$file"
  if [ "$operation" = prepare ]; then
    mkdir -p -m 700 "$(dirname "$staged_file")"
    (set -o noclobber; repo_git show "$TARGET_SHA:$file" > "$staged_file")
  fi
  test -f "$staged_file" && test ! -L "$staged_file"
  test "$(stat -c '%u:%a:%h' "$staged_file")" = 0:600:1
  cmp -s "$staged_file" <(repo_git show "$TARGET_SHA:$file")
done <<< "$files"
test -n "${staged[$entry]+seen}"

public_receipt() {
  node -e '
    const fs = require("node:fs");
    const [operation, owner, targetSha, status] = process.argv.slice(1);
    const buffer = Buffer.alloc(8193);
    let used = 0;
    while (used < buffer.length) {
      const count = fs.readSync(0, buffer, used, buffer.length - used, null);
      if (count === 0) break;
      used += count;
    }
    if (used >= buffer.length) process.exit(2);
    let value;
    try { value = JSON.parse(buffer.subarray(0, used).toString("utf8")); } catch { process.exit(2); }
    if (value?.owner !== owner || value.targetSha !== targetSha || Object.getPrototypeOf(value) !== Object.prototype) process.exit(2);
    const keys = Object.keys(value).sort().join(",");
    if (operation === "prepare") {
      if (status === "0") {
        if (keys !== "owner,preparationSha256,prepared,schema,targetSha" || value.schema !== "phoenix.modern-schema-public-preparation/v1" ||
            value.prepared !== true || typeof value.preparationSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.preparationSha256)) process.exit(2);
      } else {
        const failures = new Set("BOOTSTRAP FLOOR HOST_SURFACE PLAN BACKUP REHEARSAL HISTORICAL_AUDIT UNSPECIFIED".split(" "));
        if (keys !== "failure,owner,prepared,schema,targetSha" || value.schema !== "phoenix.modern-schema-public-preparation-hold/v1" ||
            value.prepared !== false || !failures.has(value.failure)) process.exit(2);
      }
    } else if (keys !== "defaultOff,outcome,owner,schema,targetSha" || value.schema !== "phoenix.modern-schema-public-result/v1" ||
        value.defaultOff !== true || !["SUCCESS","HOLD"].includes(value.outcome)) process.exit(2);
    console.log(JSON.stringify(value));
  ' "$operation" "$DEPLOY_RUN_ID" "$TARGET_SHA" "$1"
}

if [ "$operation" = prepare ]; then
  # The registry credential stays in this wrapper, never in the application
  # process environment or the reviewed release CLI's stdin.
  IFS= read -r registry_token
  [[ "$registry_token" =~ ^[A-Za-z0-9_.-]{10,2048}$ ]]
  if IFS= read -r extra || [ -n "${extra:-}" ]; then exit 2; fi
  printf '%s' "$registry_token" |
    command env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
      DOCKER_CONFIG=/home/phoenix-codex-deploy/.docker DOCKER_HOST=unix:///var/run/docker.sock \
      /usr/bin/docker login ghcr.io -u ivanzhao299 --password-stdin >/dev/null 2>&1
  unset registry_token
fi

# Run as the only child of the original FD9 holder while the CLI inventories
# the host. The receipt filter runs only after the CLI exits.
raw_receipt="$STATE_DIR/.transport-$DEPLOY_RUN_ID-$operation.receipt"
status=0
set -o noclobber
exec {receipt_fd}>"$raw_receipt"
set +o noclobber
if [ "$operation" = prepare ]; then
  node "$stage/$entry" prepare </dev/null >&"$receipt_fd" 2>/dev/null || status=$?
else
  node "$stage/$entry" run >&"$receipt_fd" 2>/dev/null || status=$?
fi
exec {receipt_fd}>&-
test -f "$raw_receipt" && test ! -L "$raw_receipt"
test "$(stat -c '%u:%a:%h' "$raw_receipt")" = "$(id -u):600:1"
public_receipt "$status" < "$raw_receipt"
exit "$status"
