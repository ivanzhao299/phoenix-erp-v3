# Only the signed-off Hosted Actions recovery workflow supplies this source.
set -Eeuo pipefail
set +x
umask 077
trap 'echo ORIGINAL_RECOVERY_HOST_TRANSPORT_HOLD >&2' ERR
case "${1:-}" in
 recover-original) recovery_mode=original ;;
 recover-target) recovery_mode=target ;;
 check-held) recovery_mode=check-held ;;
 *) exit 2 ;;
esac
export OPERATOR_RECOVERY_MODE="$recovery_mode"
[[ "$ORIGINAL_RELEASE_OWNER" =~ ^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$ && "$OPERATOR_RECOVERY_OWNER" =~ ^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$ ]]
[[ "$TARGET_SHA" =~ ^[a-f0-9]{40}$ && "$MODERN_SCHEMA_EXECUTION_SHA" =~ ^[a-f0-9]{40}$ ]]
test "$OPERATOR_RECOVERY_OWNER" != "$ORIGINAL_RELEASE_OWNER"
if [ -n "$OPERATOR_COMMITTED_OWNER" ]; then
 [[ "$OPERATOR_COMMITTED_OWNER" =~ ^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$ ]]
 test "$OPERATOR_COMMITTED_OWNER" != "$OPERATOR_RECOVERY_OWNER"
 test "$OPERATOR_COMMITTED_OWNER" != "$ORIGINAL_RELEASE_OWNER"
fi
if [ "$recovery_mode" = target ]; then
 test "$ORIGINAL_RELEASE_OWNER" = 44917766283-1
 test "$TARGET_SHA" = eaeec067bbc5f0e9c70cefc50b665d988d55b153
 IFS= read -r registry_token
 [[ "$registry_token" =~ ^[A-Za-z0-9_.-]{10,2048}$ ]]
fi
if IFS= read -r extra || [ -n "${extra:-}" ]; then exit 2; fi

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
test "$(repo_git rev-parse refs/remotes/origin/main)" = "$MODERN_SCHEMA_EXECUTION_SHA"
test "$(repo_git ls-remote --exit-code origin refs/heads/main)" = "$(printf '%s\trefs/heads/main' "$MODERN_SCHEMA_EXECUTION_SHA")"
repo_git merge-base --is-ancestor HEAD "$TARGET_SHA"
repo_git merge-base --is-ancestor "$TARGET_SHA" "$MODERN_SCHEMA_EXECUTION_SHA"

stage="$STATE_DIR/modern-schema-stage-$OPERATOR_RECOVERY_OWNER"
manifest=scripts/ops/modern-schema-stage-files.txt
entry=scripts/ops/production-modern-schema-operator-cli.mjs
if [ "$recovery_mode" = check-held ]; then
 test "$ORIGINAL_RELEASE_OWNER" = 45144287071-1
 test "$TARGET_SHA" = 98dfab3411fbddb8c1646f2db20df2799291cd3d
 test -z "$OPERATOR_COMMITTED_OWNER"
 entry=scripts/ops/production-remediation-held-facts.mjs
fi
files=$(repo_git show "$MODERN_SCHEMA_EXECUTION_SHA:$manifest")
mkdir -m 700 "$stage"
declare -A staged=()
while IFS= read -r file; do
 [[ "$file" =~ ^[A-Za-z0-9_./-]+$ && "$file" != /* && "/$file/" != *"/../"* && "/$file/" != *"/./"* ]]
 case "$file" in
  scripts/ops/*|scripts/ci/*|scripts/ledger-preflight.mjs|scripts/deploy-schema-first.sh|apps/api/src/common/database/api-bootstrap-schema-contract.json|.github/workflows/deploy.yml|docker-compose.yml) ;;
  *) exit 2 ;;
 esac
 test -z "${staged[$file]+seen}"
 staged[$file]=1
 tree_line=$(repo_git ls-tree "$MODERN_SCHEMA_EXECUTION_SHA" -- "$file")
 [[ "$tree_line" =~ ^100(644|755)\ blob\ [a-f0-9]{40}$'\t' ]]
 staged_file="$stage/$file"
 mkdir -p -m 700 "$(dirname "$staged_file")"
 (set -o noclobber; repo_git show "$MODERN_SCHEMA_EXECUTION_SHA:$file" > "$staged_file")
 test -f "$staged_file" && test ! -L "$staged_file"
 test "$(stat -c '%u:%a:%h' "$staged_file")" = 0:600:1
 cmp -s "$staged_file" <(repo_git show "$MODERN_SCHEMA_EXECUTION_SHA:$file")
done <<< "$files"
test -n "${staged[$entry]+seen}"

# Warm the already-built Web image without switching any running service.
# Its independent Web transaction checks the immutable digest after API OPEN.
if [ "$recovery_mode" = target ]; then
 web_config="$(/usr/bin/mktemp -d /run/phoenix-forward-web.XXXXXXXX)"
 web_ref="ghcr.io/ivanzhao299/phoenix-erp-v3/web:sha-$TARGET_SHA"
 docker_web() {
   /usr/bin/timeout "${1}s" /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin DOCKER_CONFIG="$web_config" \
     DOCKER_HOST=unix:///var/run/docker.sock /usr/bin/docker "${@:2}"
 }
 if builtin printf '%s' "$registry_token" | docker_web 25 login ghcr.io -u ivanzhao299 --password-stdin >/dev/null 2>&1; then
   docker_web 70 pull "$web_ref" >/dev/null 2>&1 || true
 fi
 unset registry_token
 if [ -f "$web_config/config.json" ]; then /usr/bin/unlink "$web_config/config.json"; fi
 /usr/bin/rmdir "$web_config"
fi


raw="$STATE_DIR/.transport-$OPERATOR_RECOVERY_OWNER-recover-$recovery_mode.receipt"
set -o noclobber
exec {receipt_fd}>"$raw"
set +o noclobber
status=0
node "$stage/$entry" </dev/null >&"$receipt_fd" 2>/dev/null || status=$?
exec {receipt_fd}>&-
test -f "$raw" && test ! -L "$raw"
test "$(stat -c '%u:%a:%h' "$raw")" = 0:600:1
test "$(stat -c '%s' "$raw")" -le 8192
cat "$raw"
exit "$status"
