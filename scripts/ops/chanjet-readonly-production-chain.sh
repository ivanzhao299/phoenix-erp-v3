#!/usr/bin/env bash
# R4.2d 受控首次同步链（生产）：audit -> prepare -> handover -> first-sync。
# 由独立获批的 first-sync operation（chanjet-readonly-first-sync.yml）在部署
# 主机上调用；FD9（mutation.lock）与 handover/审计证据目录由该工作流交付。
# 本脚本不自行放宽任何护栏：audit 失败/BLOCK 在登记与任何 provider HTTP 之前
# 阻断（零登记、零 HTTP）；首同步失败保持 HOLD，绝不回滚部署。
#
# 输入（env，全部由工作流交付）：
#   R42D_MANIFEST_FILE          审批 manifest JSON 文件（workflow 输入 b64 解码）
#   R42D_MANIFEST_SHA256        workflow 侧计算的 manifest sha256（溯源绑定）
#   EXPECTED_FLOOR_SHA          已批准 floor 精确 merged main SHA
#   TARGET_SHA                  发布完成的部署精确 SHA（必须 == EXPECTED_FLOOR_SHA）
#   DEPLOY_RUN_ID               部署事务 run id（含 attempt）
#   FIRST_SYNC_RUN_ID           首同步证据 run id（与部署 run 分开绑定）
#   STATE_DIR                   生产 state 目录（audit/handover/首同步证据落位处）
#   CHANJET_SYNC_OPERATOR_TOKEN 既有受保护 API 契约操作员令牌（repo secret）
#   API_CONTAINER               API 容器名（默认 phoenix-v3-api）
#   DB_CONTAINER                DB 容器名（默认 phoenix-v3-db）
# 可信交付位置：
#   审计程序与 preflight SQL —— TARGET_SHA 检出（工作流已同步的受审代码）
#   prepare/first-sync 执行 —— API 容器内 /app/dist + /app/node_modules +
#                              容器自身 DB_*/CHANJET_* 配置
set -Eeuo pipefail

: "${R42D_MANIFEST_FILE:?R42D_MANIFEST_FILE required}"
: "${R42D_MANIFEST_SHA256:?R42D_MANIFEST_SHA256 required}"
: "${EXPECTED_FLOOR_SHA:?EXPECTED_FLOOR_SHA required}"
: "${TARGET_SHA:?TARGET_SHA required}"
: "${DEPLOY_RUN_ID:?DEPLOY_RUN_ID required}"
: "${FIRST_SYNC_RUN_ID:?FIRST_SYNC_RUN_ID required}"
: "${STATE_DIR:?STATE_DIR required}"
: "${CHANJET_SYNC_OPERATOR_TOKEN:?CHANJET_SYNC_OPERATOR_TOKEN required}"
API_CONTAINER="${API_CONTAINER:-phoenix-v3-api}"
DB_CONTAINER="${DB_CONTAINER:-phoenix-v3-db}"
DEPLOY_REPO_ROOT="${DEPLOY_REPO_ROOT:-$(pwd -P)}"
FIRST_SYNC_ROOT="${FIRST_SYNC_ROOT:-$DEPLOY_REPO_ROOT}"

test "$TARGET_SHA" = "$EXPECTED_FLOOR_SHA" || { echo "FIRST_SYNC_HOLD=TARGET_FLOOR_MISMATCH"; exit 28; }

# 受审 checkout 上的 git（safe.directory 与核心钩子禁用与工作流一致）
git() { command git -c "safe.directory=$DEPLOY_REPO_ROOT" -c core.hooksPath=/dev/null -c core.fsmonitor=false "$@"; }

# ── FD9 身份与 stage 唯一所有者 ──────────────────────────────────────────
# FD9 是工作流持有的 mutation.lock；链进程必须验证继承的 fd 9 就是该锁文件，
# 且该锁确被持有（他人持有或未加锁均拒绝）。stage 由 flock 唯一所有。
FIRST_SYNC_LOCK_FILE="${FIRST_SYNC_LOCK_FILE:-$STATE_DIR/mutation.lock}"
test "$(realpath /proc/self/fd/9 2>/dev/null || true)" = "$(realpath "$FIRST_SYNC_LOCK_FILE")" || { echo "FIRST_SYNC_HOLD=FD9_IDENTITY"; exit 28; }
flock -n 9 || { echo "FIRST_SYNC_HOLD=FD9_NOT_HELD"; exit 28; }

R42D_STAGE="$STATE_DIR/run-${DEPLOY_RUN_ID}/r42d"
test ! -e "$R42D_STAGE"
mkdir -m 700 -p "$R42D_STAGE"
exec 200>"$R42D_STAGE/.owner-lock"
flock -n 200 || { echo "FIRST_SYNC_HOLD=STAGE_BUSY"; exit 28; }

# ── manifest 溯源 ────────────────────────────────────────────────────────
test "$(sha256sum "$R42D_MANIFEST_FILE" | cut -d' ' -f1)" = "$R42D_MANIFEST_SHA256" || { echo "FIRST_SYNC_HOLD=MANIFEST_DIGEST"; exit 28; }

# ── 受控生产上下文中的真实只读 audit（fail-closed）────────────────────────
# 审计程序与 preflight SQL 来自 TARGET_SHA 检出（工作流同步的受审代码）。
# EXPECTED_PRODUCTION_SHA=部署精确 SHA；CANDIDATE_MAIN_SHA=已批准 floor；
# 审计失败/HOLD/BLOCK/UNPARSEABLE → 非零退出 → 登记与 provider HTTP 永不发生。
AUDIT_DIR="$STATE_DIR/run-${DEPLOY_RUN_ID}/readonly-audit-${FIRST_SYNC_RUN_ID}"
test ! -e "$AUDIT_DIR"
mkdir -m 700 -p "$AUDIT_DIR"
cp scripts/ops/chanjet-readonly-production-audit.mjs "$AUDIT_DIR/audit.mjs"
cp scripts/ops/readonly-audits/chanjet-restoration-preflight.sql "$AUDIT_DIR/preflight.sql"
chmod 600 "$AUDIT_DIR/audit.mjs" "$AUDIT_DIR/preflight.sql"
AUDIT_STAGE=PRODUCTION_AUDIT
EXPECTED_PRODUCTION_SHA="$TARGET_SHA" CANDIDATE_MAIN_SHA="$EXPECTED_FLOOR_SHA" \
  node "$AUDIT_DIR/audit.mjs" "$AUDIT_DIR/preflight.sql" > "$AUDIT_DIR/audit.json"
node -e '
  const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
  const bad=[];
  if(a.deployedSha!==process.env.TARGET_SHA)bad.push("DEPLOYED_SHA");
  if(a.chanjetPolicy!=="READONLY_VERIFY")bad.push("POLICY");
  if((a.flags||{}).CHANJET_SYNC_POLICY!=="READONLY_VERIFY")bad.push("TUPLE_SYNC");
  if((a.flags||{}).CHANJET_READONLY_SYNC_ENABLED!=="false")bad.push("TUPLE_ENABLED");
  if((a.flags||{}).CHANJET_ERP_INBOUND_SYNC_ENABLED!=="false")bad.push("TUPLE_INBOUND");
  if(a.apiHttp!=="200")bad.push("API_HTTP");
  if(Object.values(a.health||{}).some(h=>h!=="healthy"))bad.push("HEALTH");
  if(bad.length)throw Error("FIRST_SYNC_HOLD=AUDIT:"+bad.join(","));
' "$AUDIT_DIR/audit.json" "$TARGET_SHA" 2>/dev/null || { echo "FIRST_SYNC_HOLD=AUDIT_FAILED"; exit 29; }

# ── prepare：登记 + probe + SYNCING 起始 + handover（API 容器内）──────────
# 容器内 /app/dist + /app/node_modules + DB_*/CHANJET_* 配置即为可信交付；
# prepare 在登记与 provider HTTP 前核验 VERIFY 元组/当前审批/映射。
docker exec phoenix-v3-api mkdir -p /tmp/r42d-state /tmp/r42d/scripts/ops
docker cp "$R42D_MANIFEST_FILE" "phoenix-v3-api:/tmp/r42d/approval-manifest.json"
docker cp scripts/ops/chanjet-readonly-production-prepare.mjs "phoenix-v3-api:/tmp/r42d/scripts/ops/chanjet-readonly-production-prepare.mjs"
PREPARE_OUT="$(docker exec \
  -e R42D_MANIFEST="$(cat "$R42D_STAGE/approval-manifest.json" 2>/dev/null || cat "$R42D_MANIFEST_FILE")" \
  -e EXPECTED_FLOOR_SHA="$EXPECTED_FLOOR_SHA" \
  -e R42D_STATE=/tmp/r42d-state \
  "$API_CONTAINER" node /tmp/r42d/scripts/ops/chanjet-readonly-production-prepare.mjs)"
echo "$PREPARE_OUT"
HANDOVER_JSON="$(printf '%s\n' "$PREPARE_OUT" | sed -n 's/^PREPARE=PASS;//p')"
test -n "$HANDOVER_JSON" || { echo "FIRST_SYNC_HOLD=PREPARE"; exit 26; }
node -e 'const fs=require("fs");const [,,file,json]=process.argv;const tmp=file+".tmp-"+Date.now();fs.writeFileSync(tmp,json);fs.renameSync(tmp,file);' "$STATE_DIR/prepare-sync-handover.json" "$HANDOVER_JSON"
chmod 600 "$STATE_DIR/prepare-sync-handover.json"

# ── first-sync：受审入口（真实护栏 + handover + 有界守卫停止）────────────
# 首同步证据 run id（FIRST_SYNC_RUN_ID）与部署 run（DEPLOY_RUN_ID）分开绑定；
# 失败保持 HOLD 证据保留，绝不回滚部署。
FIRST_SYNC_RUN_ID="$FIRST_SYNC_RUN_ID" \
FIRST_SYNC_ROOT="$FIRST_SYNC_ROOT" \
node scripts/ops/chanjet-readonly-first-sync.mjs
