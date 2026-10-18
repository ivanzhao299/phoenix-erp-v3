#!/usr/bin/env bash
# R4.2d 受控首次同步链（生产）：deploy-complete 核验 → audit → prepare →
# handover → first-sync。由独立获批的 first-sync operation 在部署主机上调用；
# FD9（mutation.lock）由该 operation 持有并由本链体验证身份。本链不自行放宽
# 任何护栏：audit 失败/BLOCK 在登记与任何 provider HTTP 之前阻断（零登记、
# 零 HTTP）；首同步失败保持 HOLD 证据保留，绝不回滚部署。
#
# 输入（env，全部由工作流交付）：
#   R42D_MANIFEST_FILE / R42D_MANIFEST_SHA256   审批 manifest 及其溯源摘要
#   APPROVED_CONFIG_FLOOR_SHA / TARGET_SHA      已批准 floor 与部署精确 SHA
#   DEPLOY_RUN_ID / FIRST_SYNC_RUN_ID           部署事务 run / 首同步证据 run（分开绑定）
#   STATE_DIR                                   生产 state 目录
#   CHANJET_SYNC_OPERATOR_TOKEN                 既有受保护 API 契约操作员令牌
#   FIRST_SYNC_LOCK_FILE                        FD9 互斥锁文件（默认 mutation.lock）
#   API_CONTAINER / DB_CONTAINER                容器名（默认 phoenix-v3-api / phoenix-v3-db）
set -Eeuo pipefail

: "${R42D_MANIFEST_FILE:?R42D_MANIFEST_FILE required}"
: "${R42D_MANIFEST_SHA256:?R42D_MANIFEST_SHA256 required}"
: "${APPROVED_CONFIG_FLOOR_SHA:?APPROVED_CONFIG_FLOOR_SHA required}"
: "${TARGET_SHA:?TARGET_SHA required}"
: "${DEPLOY_RUN_ID:?DEPLOY_RUN_ID required}"
: "${FIRST_SYNC_RUN_ID:?FIRST_SYNC_RUN_ID required}"
: "${STATE_DIR:?STATE_DIR required}"
: "${CHANJET_SYNC_OPERATOR_TOKEN:?CHANJET_SYNC_OPERATOR_TOKEN required}"
API_CONTAINER="${API_CONTAINER:-phoenix-v3-api}"
DB_CONTAINER="${DB_CONTAINER:-phoenix-v3-db}"
FIRST_SYNC_LOCK_FILE="${FIRST_SYNC_LOCK_FILE:-$STATE_DIR/mutation.lock}"

# git on the reviewed checkout
git() { command git -c "safe.directory=$(pwd -P)" -c core.hooksPath=/dev/null -c core.fsmonitor=false "$@"; }

# ── 宿主 checkout 精确 SHA（先于一切登记与 HTTP）─────────────────────────
test "$(git rev-parse HEAD)" = "$TARGET_SHA" || { echo "FIRST_SYNC_HOLD=CHECKOUT_SHA"; exit 30; }

# ── FD9 身份与 stage 唯一所有者 ──────────────────────────────────────────
# FD9 是 first-sync operation 持有的 mutation.lock；链进程验证继承的 fd 9
# 就是该锁文件，且该锁确被本 operation 持有。
test "$(realpath /proc/self/fd/9 2>/dev/null || true)" = "$(realpath "$FIRST_SYNC_LOCK_FILE")" || { echo "FIRST_SYNC_HOLD=FD9_IDENTITY"; exit 28; }
flock -n 9 || { echo "FIRST_SYNC_HOLD=FD9_NOT_HELD"; exit 28; }

R42D_STAGE="$STATE_DIR/run-${DEPLOY_RUN_ID}/r42d"
test ! -e "$R42D_STAGE"
mkdir -m 700 -p "$R42D_STAGE"
exec 200>"$R42D_STAGE/.owner-lock"
flock -n 200 || { echo "FIRST_SYNC_HOLD=STAGE_BUSY"; exit 28; }

# ── manifest 溯源 ────────────────────────────────────────────────────────
test "$(sha256sum "$R42D_MANIFEST_FILE" | cut -d' ' -f1)" = "$R42D_MANIFEST_SHA256" || { echo "FIRST_SYNC_HOLD=MANIFEST_DIGEST"; exit 28; }

# ── 发布完成核验（绑定精确部署 run/attempt 与目标 SHA）────────────────────
# deploy-<RUN_ID>.json 是部署事务状态文件：只有 outcome=SUCCESS（complete 操
# 作在证据绑定核验后写入）、configSha/active.api.revision 精确等于 TARGET_SHA、
# 且部署事务标记（transaction.json）已关闭，发布才算完成。
test -e "$STATE_DIR/deploy-${DEPLOY_RUN_ID}.json" || { echo "FIRST_SYNC_HOLD=DEPLOY_NOT_COMPLETE"; exit 29; }
test ! -e "$STATE_DIR/transaction.json" || { echo "FIRST_SYNC_HOLD=DEPLOY_NOT_COMPLETE"; exit 29; }
node -e '
const fs = require("fs");
const [, file, target] = process.argv;
let s;
try { s = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(1); }
const ok = s.version === 3 && s.outcome === "SUCCESS" && s.configSha === target
  && s.active?.api?.revision === target && s.target === target;
process.exit(ok ? 0 : 1);
' "$STATE_DIR/deploy-${DEPLOY_RUN_ID}.json" "$TARGET_SHA" || { echo "FIRST_SYNC_HOLD=DEPLOY_NOT_COMPLETE"; exit 29; }

# ── 受控生产上下文中的真实只读 audit（fail-closed）────────────────────────
# 审计程序与 preflight SQL 来自本 checkout（TARGET_SHA 已同步的受审代码）。
# EXPECTED_PRODUCTION_SHA=部署精确 SHA；CANDIDATE_MAIN_SHA=已批准 floor。
# 审计失败/HOLD/BLOCK → 非零退出 → 登记与 provider HTTP 永不发生。
AUDIT_DIR="$STATE_DIR/run-${DEPLOY_RUN_ID}/readonly-audit-${FIRST_SYNC_RUN_ID}"
test ! -e "$AUDIT_DIR"
mkdir -m 700 -p "$AUDIT_DIR"
# Carry the verifier from this reviewed checkout; an older installed helper
# cannot implement a newer evidence protocol. The stage stays root-private.
for helper in production-deployment-evidence.mjs production-atomic-state.mjs production-config-contract.json production-config-guard.mjs production-trusted-paths.mjs capture-production-runtime.mjs update-managed-chanjet-env.mjs chanjet-readonly-policy.mjs chanjet-admission-schema-receipt.mjs; do
  cp "scripts/ops/$helper" "$AUDIT_DIR/$helper"
  chmod 600 "$AUDIT_DIR/$helper"
done
cp scripts/ops/chanjet-readonly-production-audit.mjs "$AUDIT_DIR/audit.mjs"
cp scripts/ops/readonly-audits/chanjet-restoration-preflight.sql "$AUDIT_DIR/preflight.sql"
chmod 600 "$AUDIT_DIR/audit.mjs" "$AUDIT_DIR/preflight.sql"
EXPECTED_PRODUCTION_SHA="$TARGET_SHA" CANDIDATE_MAIN_SHA="$APPROVED_CONFIG_FLOOR_SHA" \
  node "$AUDIT_DIR/audit.mjs" "$AUDIT_DIR/preflight.sql" > "$AUDIT_DIR/audit.json"

# 审计裁决复核（与审计自身的 fail-closed 分类互为冗余）：健康、readiness、
# 部署证据、live 元组、deployedSha 绑定任一不满足 → 登记与 provider HTTP
# 永不发生。
node -e '
const fs = require("fs");
const [, file, target] = process.argv;
let a;
try { a = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(1); }
const ok = a.schema === "phoenix.chanjet-restoration-audit/v1"
  && a.deployedSha === target && a.expectedProductionSha === target
  && a.apiHttp === "200"
  && ["db", "api", "web"].every((s) => a.health?.[s] === "healthy")
  && a.deploymentEvidence?.status === "PASS"
  && a.flags?.CHANJET_SYNC_POLICY === "READONLY_VERIFY"
  && a.flags?.CHANJET_READONLY_SYNC_ENABLED === "true"
  && a.flags?.CHANJET_ERP_INBOUND_SYNC_ENABLED === "false";
process.exit(ok ? 0 : 1);
' "$AUDIT_DIR/audit.json" "$TARGET_SHA" || { echo "FIRST_SYNC_HOLD=AUDIT_VERDICT"; exit 25; }

# ── 停止通道运行依赖交付（先于 prepare：登记之前完成并证明可加载）──────────
# 首同步的有界停止通道在宿主运行受审编译模块（admission store）——模块必须
# 来自 DEPLOYED API IMAGE 并逐字节溯源，运行依赖同源自镜像交付，绝不手工预置。
# 交付失败发生在登记之前：零登记、零 provider HTTP。
DELIVERY="$STATE_DIR/run-${DEPLOY_RUN_ID}/stop-channel-delivery"
test ! -e "$DELIVERY"
mkdir -m 700 -p "$DELIVERY"
docker cp "$API_CONTAINER:/app/dist" "$DELIVERY/dist" || { echo "FIRST_SYNC_HOLD=STOP_DELIVERY"; exit 31; }
docker cp "$API_CONTAINER:/app/node_modules" "$DELIVERY/node_modules" || { echo "FIRST_SYNC_HOLD=STOP_DELIVERY"; exit 31; }
IMAGE_DIST_DIGEST="$(docker exec "$API_CONTAINER" sh -c 'cd /app && find dist -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum' | cut -d' ' -f1)"
LOCAL_DIST_DIGEST="$(cd "$DELIVERY" && find dist -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)"
test -n "$IMAGE_DIST_DIGEST" && test "$IMAGE_DIST_DIGEST" = "$LOCAL_DIST_DIGEST" || { echo "FIRST_SYNC_HOLD=STOP_DELIVERY_DIGEST"; exit 31; }
test -e "$DELIVERY/node_modules/reflect-metadata" && test -e "$DELIVERY/node_modules/typeorm" && test -e "$DELIVERY/node_modules/pg" || { echo "FIRST_SYNC_HOLD=STOP_DELIVERY_DEPS"; exit 31; }
export CHANJET_EXECUTION_DIST_ROOT="$DELIVERY/dist"
# 交付物可加载性：受审编译模块 + 运行依赖在宿主真实解析加载（停止通道可用）
node --input-type=module -e '
const path = await import("node:path");
const { pathToFileURL } = await import("node:url");
const { createRequire } = await import("node:module");
const store = path.join(process.env.CHANJET_EXECUTION_DIST_ROOT, "modules/chanjet/chanjet-execution-admission.store.js");
const entryRequire = createRequire(pathToFileURL(store));
entryRequire("reflect-metadata");
const { ChanjetExecutionAdmissionStore } = await import(pathToFileURL(store).href);
if (typeof ChanjetExecutionAdmissionStore !== "function") process.exit(1);
' || { echo "FIRST_SYNC_HOLD=STOP_DELIVERY_UNLOADABLE"; exit 31; }

# ── 登记（prepare）之后的任何失败 → 有界 HOLD 收尾 ────────────────────────
# 幂等：仅当可信行仍处 SYNCING 时经交付的受审编译模块 + docker-exec 停止通道
# 落 HOLD；已停止/未登记的执行原样报告，绝不重复停止、绝不改写退出码。
CHAIN_HOLD_ARMED=0
chain_hold_finalizer() {
  [ "$CHAIN_HOLD_ARMED" = "1" ] || return 0
  R42D_HOLD_CLASS="CANCELLED" node scripts/ops/chanjet-first-sync-hold-finalizer.mjs || echo "FIRST_SYNC_DURABLE_STOP=UNCONFIRMED"
}
trap chain_hold_finalizer EXIT

# ── prepare：登记 + probe + SYNCING 起始 + handover（API 容器内）──────────
# 容器内 /app/dist + /app/node_modules + DB_*/CHANJET_* 配置即为可信交付；
# prepare 在登记与 provider HTTP 前核验 VERIFY 元组/当前审批/映射。
# 登记后（含 prepare 自身失败于注册之后）的任何失败由 EXIT trap 收尾。
CHAIN_HOLD_ARMED=1
docker exec "$API_CONTAINER" mkdir -p /tmp/r42d-state /tmp/r42d/scripts/ops
docker cp "$R42D_MANIFEST_FILE" "$API_CONTAINER:/tmp/r42d/approval-manifest.json"
docker cp scripts/ops/chanjet-readonly-production-prepare.mjs "$API_CONTAINER:/tmp/r42d/scripts/ops/chanjet-readonly-production-prepare.mjs"
if ! PREPARE_OUT="$(docker exec \
  -e R42D_MANIFEST="$(cat "$R42D_STAGE/approval-manifest.json" 2>/dev/null || cat "$R42D_MANIFEST_FILE")" \
  -e EXPECTED_FLOOR_SHA="$APPROVED_CONFIG_FLOOR_SHA" \
  -e R42D_STATE=/tmp/r42d-state \
  "$API_CONTAINER" node /tmp/r42d/scripts/ops/chanjet-readonly-production-prepare.mjs 2>&1)"; then
  echo "$PREPARE_OUT"
  echo "FIRST_SYNC_HOLD=PREPARE"
  exit 26
fi
echo "$PREPARE_OUT"
HANDOVER_JSON="$(printf '%s\n' "$PREPARE_OUT" | sed -n 's/^PREPARE=PASS;//p')"
test -n "$HANDOVER_JSON" || { echo "FIRST_SYNC_HOLD=PREPARE"; exit 26; }
node -e 'const fs=require("fs");const [,file,json]=process.argv;const tmp=file+".tmp-"+Date.now();fs.writeFileSync(tmp,json);fs.renameSync(tmp,file);' "$STATE_DIR/prepare-sync-handover.json" "$HANDOVER_JSON"
chmod 600 "$STATE_DIR/prepare-sync-handover.json"

# ── 停止通道运行依赖交付（宿主侧，源自部署镜像）──────────────────────────
# 首同步的有界停止通道在宿主运行受审编译模块（admission store）——模块必须
# 来自 DEPLOYED API IMAGE 并逐字节溯源，运行依赖同源自镜像交付，绝不手工预置。
# ── first-sync：受审入口 ────────────────────────────────────────────────
# 首同步证据 run id（FIRST_SYNC_RUN_ID）与部署事务 run（DEPLOY_RUN_ID）分开
# 绑定；失败保持 HOLD 证据保留，绝不回滚部署。
FIRST_SYNC_RUN_ID="$FIRST_SYNC_RUN_ID" \
node scripts/ops/chanjet-readonly-first-sync.mjs
# 入口成功（VERIFIED）：解除收尾器——trap 不再触碰已终止的执行
CHAIN_HOLD_ARMED=0
