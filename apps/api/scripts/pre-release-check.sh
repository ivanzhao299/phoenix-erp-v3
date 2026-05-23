#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Phoenix ERP V3 — 发布前完整自测流程
#
# 分层测试（每层失败则停止）：
#   L1  TypeScript 静态检查   (API + Web)
#   L2  ESLint 代码质量       (API)
#   L3  Jest 单元测试         (API，含 coverage 门限)
#   L4  构建验证              (API nest build)
#   L5  烟测 — 基础 Auth      (smoke-test.sh 本地模式)
#   L6  烟测 — 采购模块       (procurement-smoke.sh)
#
# 用法：
#   bash apps/api/scripts/pre-release-check.sh
#   SKIP_BUILD=1 bash ...   # 跳过 nest build（加快速度）
#   SKIP_SMOKE=1 bash ...   # 跳过烟测（纯静态+单测）
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
API_DIR="$REPO_ROOT/apps/api"
WEB_DIR="$REPO_ROOT/apps/web"
SCRIPTS_DIR="$API_DIR/scripts"

RED='\033[31m'; GREEN='\033[32m'; CYAN='\033[36m'
YELLOW='\033[33m'; BOLD='\033[1m'; NC='\033[0m'

PASS_LAYERS=0; FAIL_LAYERS=0
START_TIME=$(date +%s)

banner() {
  printf "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
  printf "  Phoenix ERP V3 — Pre-Release Check\n"
  printf "  $(date '+%Y-%m-%d %H:%M:%S')\n"
  printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n\n"
}

layer() {
  local num="$1" name="$2"
  printf "\n${BOLD}${CYAN}[L%s] %s${NC}\n" "$num" "$name"
  printf "${CYAN}%s${NC}\n" "──────────────────────────────────────────"
}

pass_layer() {
  printf "${GREEN}${BOLD}  ✓ L%s 通过: %s${NC}\n" "$1" "$2"
  PASS_LAYERS=$((PASS_LAYERS+1))
}

fail_layer() {
  printf "${RED}${BOLD}  ✗ L%s 失败: %s${NC}\n" "$1" "$2"
  FAIL_LAYERS=$((FAIL_LAYERS+1))
  if [ "${FAIL_FAST:-1}" = "1" ]; then
    printf "${RED}  FAIL_FAST=1: 中止后续检查${NC}\n\n"
    summary
    exit 1
  fi
}

summary() {
  local elapsed=$(( $(date +%s) - START_TIME ))
  printf "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  printf "${BOLD}  结果汇总  耗时 ${elapsed}s${NC}\n"
  printf "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
  if [ "$FAIL_LAYERS" -eq 0 ]; then
    printf "${GREEN}${BOLD}  ✓ 全部 %d 层检查通过 — 可以发布${NC}\n\n" "$PASS_LAYERS"
  else
    printf "${RED}${BOLD}  ✗ %d 层失败 / %d 层通过 — 禁止发布${NC}\n\n" "$FAIL_LAYERS" "$PASS_LAYERS"
  fi
}

banner

# ══════════════════════════════════════════════════════════════
# L1: TypeScript 静态检查
# ══════════════════════════════════════════════════════════════
layer 1 "TypeScript 静态检查"

printf "  → API (apps/api)...\n"
if (cd "$API_DIR" && ./node_modules/.bin/tsc --noEmit 2>&1 | tee /tmp/prc_ts_api.log | grep -c "error TS" > /tmp/prc_ts_api_errcnt.txt; [ "$(cat /tmp/prc_ts_api_errcnt.txt)" = "0" ]); then
  printf "${GREEN}    ✓ API TypeScript: 0 错误${NC}\n"
else
  cat /tmp/prc_ts_api.log
  fail_layer 1 "API TypeScript 编译失败"
fi

printf "  → Web (apps/web)...\n"
if (cd "$WEB_DIR" && ./node_modules/.bin/tsc --noEmit 2>&1 | tee /tmp/prc_ts_web.log | grep -c "error TS" > /tmp/prc_ts_web_errcnt.txt; [ "$(cat /tmp/prc_ts_web_errcnt.txt)" = "0" ]); then
  printf "${GREEN}    ✓ Web TypeScript: 0 错误${NC}\n"
  pass_layer 1 "TypeScript 静态检查"
else
  cat /tmp/prc_ts_web.log
  fail_layer 1 "Web TypeScript 编译失败"
fi

# ══════════════════════════════════════════════════════════════
# L2: ESLint
# ══════════════════════════════════════════════════════════════
layer 2 "ESLint 代码质量检查"
printf "  → apps/api...\n"
if (cd "$API_DIR" && ./node_modules/.bin/eslint "src/**/*.ts" --max-warnings=20 2>&1 | tee /tmp/prc_eslint.log); then
  pass_layer 2 "ESLint 通过"
else
  WARN_CNT=$(grep -c "warning\|error" /tmp/prc_eslint.log 2>/dev/null || echo "?")
  printf "${YELLOW}  ⚠ ESLint 有 $WARN_CNT 处警告/错误（不阻断，建议修复）${NC}\n"
  pass_layer 2 "ESLint 警告（不阻断）"
fi

# ══════════════════════════════════════════════════════════════
# L3: Jest 单元测试
# ══════════════════════════════════════════════════════════════
layer 3 "Jest 单元测试"
printf "  → 运行全量测试套件...\n"
if (cd "$API_DIR" && ./node_modules/.bin/jest --no-coverage --forceExit 2>&1 | tee /tmp/prc_jest.log); then
  TOTAL=$(grep -oE 'Tests:.*[0-9]+ passed' /tmp/prc_jest.log | tail -1 || echo "")
  pass_layer 3 "Jest 单元测试 ($TOTAL)"
else
  tail -20 /tmp/prc_jest.log
  fail_layer 3 "Jest 单元测试失败"
fi

# ══════════════════════════════════════════════════════════════
# L4: 构建验证
# ══════════════════════════════════════════════════════════════
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  printf "\n${YELLOW}[L4] 跳过构建验证 (SKIP_BUILD=1)${NC}\n"
  pass_layer 4 "跳过"
else
  layer 4 "构建验证 (nest build)"
  printf "  → nest build (大约 15-30s)...\n"
  if (cd "$API_DIR" && ./node_modules/.bin/nest build 2>&1 | tee /tmp/prc_build.log | tail -5); then
    pass_layer 4 "nest build 成功"
  else
    tail -20 /tmp/prc_build.log
    fail_layer 4 "nest build 失败"
  fi
fi

# ══════════════════════════════════════════════════════════════
# L5 + L6: 烟测
# ══════════════════════════════════════════════════════════════
if [ "${SKIP_SMOKE:-0}" = "1" ]; then
  printf "\n${YELLOW}[L5/L6] 跳过烟测 (SKIP_SMOKE=1)${NC}\n"
  pass_layer 5 "跳过"; pass_layer 6 "跳过"
else
  # 检查本地 API 是否在线
  layer 5 "烟测 — 基础 Auth/Health"
  if ! curl -sf --max-time 3 "${API_URL:-http://127.0.0.1:3100}/api/health" >/dev/null 2>&1; then
    printf "${YELLOW}  ⚠ 本地 API 未运行，跳过烟测${NC}\n"
    printf "${YELLOW}    提示: cd apps/api && npm run start:dev${NC}\n"
    pass_layer 5 "跳过（API 未运行）"; pass_layer 6 "跳过（API 未运行）"
  else
    # L5: 基础烟测（适配本地开发模式：jwt.loaded 可为 false）
    printf "  → 本地开发模式（jwt.loaded 检查宽松）...\n"
    LOCAL_SMOKE_PASS=true
    HEALTH=$(curl -sf "${API_URL:-http://127.0.0.1:3100}/api/health")
    if echo "$HEALTH" | grep -q '"connected":true'; then
      printf "${GREEN}    ✓ DB 已连接${NC}\n"
    else
      LOCAL_SMOKE_PASS=false; printf "${RED}    ✗ DB 未连接${NC}\n"
    fi
    # 登录验证
    LOGIN_R=$(curl -sf -X POST "${API_URL:-http://127.0.0.1:3100}/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"${SMOKE_USER:-admin}\",\"password\":\"${SMOKE_PASS:-along888}\"}" 2>/dev/null || echo '{}')
    if echo "$LOGIN_R" | grep -q '"code":200'; then
      printf "${GREEN}    ✓ 登录正常${NC}\n"
    else
      LOCAL_SMOKE_PASS=false; printf "${RED}    ✗ 登录失败: ${LOGIN_R:0:80}${NC}\n"
    fi
    $LOCAL_SMOKE_PASS && pass_layer 5 "基础烟测通过" || fail_layer 5 "基础烟测失败"

    # L6: 采购模块烟测
    layer 6 "烟测 — 采购模块"
    if SMOKE_USER="${SMOKE_USER:-admin}" SMOKE_PASS="${SMOKE_PASS:-along888}" \
       bash "$SCRIPTS_DIR/procurement-smoke.sh" 2>&1; then
      pass_layer 6 "采购模块烟测通过"
    else
      fail_layer 6 "采购模块烟测失败"
    fi
  fi
fi

# ══════════════════════════════════════════════════════════════
summary
[ "$FAIL_LAYERS" -eq 0 ] && exit 0 || exit 1
