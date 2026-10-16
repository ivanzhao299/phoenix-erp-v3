#!/usr/bin/env bash
# R4.2d 受控首次同步链（生产）：prepare -> handover -> first-sync。
# 由单独获批的 exact-SHA 根控制工作流（deploy.yml 的 VERIFY floor 分支）在
# FD9 与 floor/审批/manifest 交付齐备后调用；本脚本不自行放宽任何护栏。
#
# 输入（env，全部由工作流交付）：
#   R42D_MANIFEST_FILE      审批 manifest JSON 文件（workflow 输入 b64 解码）
#   EXPECTED_FLOOR_SHA      已批准 floor 精确 SHA
#   DEPLOY_RUN_ID           部署运行 ID（证据目录隔离）
#   STATE_DIR               生产 state 目录（handover 文件落位处）
#   CHANJET_SYNC_OPERATOR_TOKEN  既有受保护 API 契约操作员令牌（repo secret）
# 可信交付位置：
#   编译执行模块与运行依赖 —— 从【已部署的 API 镜像】docker cp 提取（精确运行版本）
#   停止通道 —— 既有 DB 容器访问（docker exec phoenix-v3-db psql，现有 DB 配置）
#   容器内 prepare —— API 容器自身 /app/dist + /app/node_modules + DB_*/CHANJET_* 配置
set -Eeuo pipefail

: "${R42D_MANIFEST_FILE:?R42D_MANIFEST_FILE required}"
: "${EXPECTED_FLOOR_SHA:?EXPECTED_FLOOR_SHA required}"
: "${DEPLOY_RUN_ID:?DEPLOY_RUN_ID required}"
: "${STATE_DIR:?STATE_DIR required}"
: "${CHANJET_SYNC_OPERATOR_TOKEN:?CHANJET_SYNC_OPERATOR_TOKEN required}"

R42D_STAGE="$STATE_DIR/run-${DEPLOY_RUN_ID}/r42d"
test ! -e "$R42D_STAGE"
mkdir -m 700 -p "$R42D_STAGE"
cp "$R42D_MANIFEST_FILE" "$R42D_STAGE/approval-manifest.json"
chmod 600 "$R42D_STAGE/approval-manifest.json"

# 交付受审入口与 helper（从 TARGET_SHA 提取，与工作流其余 helper 同源）
for helper in chanjet-readonly-first-sync.mjs chanjet-readonly-production-prepare.mjs chanjet-execution-manifest.mjs production-config-guard.mjs production-config-contract.json production-trusted-paths.mjs production-atomic-state.mjs production-deployment-state.mjs capture-production-runtime.mjs chanjet-readonly-policy.mjs chanjet-readonly-production-audit.mjs; do
  git show "$EXPECTED_FLOOR_SHA:scripts/ops/$helper" > "$R42D_STAGE/$helper"
  chmod 600 "$R42D_STAGE/$helper"
done
mkdir -p "$R42D_STAGE/readonly-audits"
git show "$EXPECTED_FLOOR_SHA:scripts/ops/readonly-audits/chanjet-restoration-preflight.sql" > "$R42D_STAGE/readonly-audits/chanjet-restoration-preflight.sql"

# 编译执行模块与运行依赖：从【已部署的 API 容器】交付（精确运行版本，
# docker cp 从容器直接复制；无需镜像提取，无新增挂载）
EXEC_DIST="$STATE_DIR/run-${DEPLOY_RUN_ID}/execution-dist"
test ! -e "$EXEC_DIST"
mkdir -m 700 -p "$EXEC_DIST"
docker cp "phoenix-v3-api:/app/dist" "$EXEC_DIST/dist"
docker cp "phoenix-v3-api:/app/node_modules" "$EXEC_DIST/node_modules"

# 停止通道：既有 DB 容器配置
CHANJET_EXECUTION_PG_URL="$(docker exec phoenix-v3-db sh -c 'printf "postgresql://%s:%s@127.0.0.1:5432/%s" "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$POSTGRES_DB"')"
export CHANJET_EXECUTION_PG_URL CHANJET_EXECUTION_DIST_ROOT="$EXEC_DIST/dist"

# 容器内交付（workflow 驱动，非手工预置）：prepare 在 API 容器内运行，
# 使用容器自身的 /app/dist + /app/node_modules + DB_*/CHANJET_* 配置
docker exec phoenix-v3-api mkdir -p /tmp/r42d-state /tmp/r42d/scripts/ops/readonly-audits
docker cp "$R42D_STAGE/." "phoenix-v3-api:/tmp/r42d/scripts/ops/"

# prepare: 登记 + probe + SYNCING 起始 + handover（真实 provider READ 一次，admission 计数）
PREPARE_OUT="$(docker exec \
  -e R42D_MANIFEST="$(cat "$R42D_STAGE/approval-manifest.json")" \
  -e EXPECTED_FLOOR_SHA="$EXPECTED_FLOOR_SHA" \
  -e R42D_STATE=/tmp/r42d-state \
  phoenix-v3-api node /tmp/r42d/scripts/ops/chanjet-readonly-production-prepare.mjs)"
echo "$PREPARE_OUT"
HANDOVER_JSON="$(printf '%s\n' "$PREPARE_OUT" | sed -n 's/^PREPARE=PASS;//p')"
test -n "$HANDOVER_JSON" || { echo "DEPLOY_EVIDENCE_HOLD=PREPARE"; exit 26; }
node -e 'const fs=require("fs");const [,,file,json]=process.argv;const tmp=file+".tmp-"+Date.now();fs.writeFileSync(tmp,json);fs.renameSync(tmp,file);' "$STATE_DIR/prepare-sync-handover.json" "$HANDOVER_JSON"
chmod 600 "$STATE_DIR/prepare-sync-handover.json"

# first-sync: 受审入口（真实护栏 + handover + 有界守卫停止）
CHANJET_SYNC_OPERATOR_TOKEN="$CHANJET_SYNC_OPERATOR_TOKEN" \
FIRST_SYNC_ROOT="$DEPLOY_REPO_ROOT" \
node scripts/ops/chanjet-readonly-first-sync.mjs
