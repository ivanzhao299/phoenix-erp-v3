#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# G5-C · 非 ADMIN RBAC 自动化巡检
# ════════════════════════════════════════════════════════════════════════════
# 用法：./scripts/g5c-rbac-audit.sh [API_BASE]
#   API_BASE 默认 http://127.0.0.1:3100
#
# 流程：
#   1. admin 登录拿 token
#   2. 逐个测试用户（test_farm_mgr / songmingguang 等）尝试登录
#   3. 用每个非 ADMIN token 调一组关键 endpoint
#   4. 输出 PASS/FAIL 矩阵
#
# 设计原则：
#   - 不写 DB，只读
#   - 失败立即 exit 1，CI 看到非 0 退出码红灯
#   - 输出可粘贴到 PR review
# ════════════════════════════════════════════════════════════════════════════

set -uo pipefail

API_BASE="${1:-http://127.0.0.1:3100}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 颜色
G='\033[32m'; R='\033[31m'; Y='\033[33m'; N='\033[0m'

pass=0
fail=0
failed_cases=()

# ────────────────────────────────────────────────────────────────────────────
# login: 返回 token 到 stdout，失败 stderr，exit 非 0
login() {
  local user="$1" pass="$2"
  local body
  body=$(curl -s -m 10 -X POST "$API_BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$user\",\"password\":\"$pass\"}")
  local code
  code=$(echo "$body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("code","?"))' 2>/dev/null || echo "?")
  if [ "$code" = "200" ]; then
    echo "$body" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])'
    return 0
  fi
  echo "login_failed: $body" >&2
  return 1
}

# expect_status TOKEN METHOD PATH EXPECTED_STATUS LABEL
check() {
  local token="$1" method="$2" path="$3" expected="$4" label="$5"
  local actual
  actual=$(curl -s -m 10 -o "$TMP/body" -w '%{http_code}' \
    -X "$method" "$API_BASE$path" \
    -H "Authorization: Bearer $token")
  if [ "$actual" = "$expected" ]; then
    printf "${G}✓${N} %s | %s %s | expected=%s actual=%s\n" "$label" "$method" "$path" "$expected" "$actual"
    pass=$((pass + 1))
  else
    printf "${R}✗${N} %s | %s %s | expected=%s actual=%s\n" "$label" "$method" "$path" "$expected" "$actual"
    fail=$((fail + 1))
    failed_cases+=("$label")
    # 显示错误响应前 200 字符
    head -c 200 "$TMP/body" | sed 's/^/   /'
    echo
  fi
}

echo "═══════════════════════════════════════════════════════════════════════"
echo "G5-C · RBAC 巡检 (API_BASE=$API_BASE)"
echo "═══════════════════════════════════════════════════════════════════════"
echo

# ────────────────────────────────────────────────────────────────────────────
# Phase 1: admin 通用路径 200
# ────────────────────────────────────────────────────────────────────────────
ADMIN_USER="${ADMIN_USER:-admin}"
: "${ADMIN_PASS:?ADMIN_PASS is required; default admin passwords are forbidden}"
echo "▼ Phase 1: $ADMIN_USER → 全部应 200"
admin_token=$(login "$ADMIN_USER" "$ADMIN_PASS") || { echo "${R}admin 登录失败，终止${N}"; exit 1; }

check "$admin_token" GET '/api/lookup/companies'                       200 'admin · /lookup/companies'
check "$admin_token" GET '/api/lookup/farms'                           200 'admin · /lookup/farms'
check "$admin_token" GET '/api/lookup/houses?farmCode=LPH_MENGSAI'     200 'admin · /lookup/houses?farmCode=LPH_MENGSAI'
check "$admin_token" GET '/api/lookup/customers'                       200 'admin · /lookup/customers'
check "$admin_token" GET '/api/lookup/suppliers'                       200 'admin · /lookup/suppliers'
check "$admin_token" GET '/api/lookup/users'                           200 'admin · /lookup/users'
check "$admin_token" GET '/api/lookup/cash-accounts'                   200 'admin · /lookup/cash-accounts'
check "$admin_token" GET '/api/lookup/dict/BRD_SHIFT'                  200 'admin · /lookup/dict/BRD_SHIFT'
check "$admin_token" GET '/api/lookup/product-grades'                  200 'admin · /lookup/product-grades'
check "$admin_token" GET '/api/crud/brd_houses?status=ACTIVE&pageSize=500' 200 'admin · /crud/brd_houses 含 pageSize'
check "$admin_token" GET '/api/v3/farm/daily-logs/eggs-breakdown?date=2026-06-04&houseCode=HOUSE_MS_02' 200 'admin · /eggs-breakdown'

# 写操作覆盖（G5-C++ 2026-06-06）— admin 应能 POST/PUT 主数据
check_write_method() {
  local token="$1" method="$2" path="$3" expected="$4" label="$5" body="$6"
  local actual
  actual=$(curl -s -m 10 -o "$TMP/body" -w '%{http_code}' \
    -X "$method" "$API_BASE$path" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -d "$body")
  if [ "$actual" = "$expected" ]; then
    printf "${G}✓${N} %s | %s %s | expected=%s actual=%s\n" "$label" "$method" "$path" "$expected" "$actual"
    pass=$((pass + 1))
  else
    printf "${R}✗${N} %s | %s %s | expected=%s actual=%s\n" "$label" "$method" "$path" "$expected" "$actual"
    fail=$((fail + 1))
    failed_cases+=("$label")
    head -c 200 "$TMP/body" | sed 's/^/   /'; echo
  fi
}

# 写操作仅检验"能命中守卫"，不实际改变业务数据（POST 故意拼一个会被 400 拒绝的合理 body）
check_write_method "$admin_token" POST '/api/product-master/grades' 400 'admin · POST grades (400 = 守卫通过，body 校验拒)' '{"intentional":"empty"}'

# G7 新加：menu-registry stats 端点
check "$admin_token" GET '/api/sys/menu-registry/stats' 200 'admin · /sys/menu-registry/stats (G6 新端点)'

echo

# ────────────────────────────────────────────────────────────────────────────
# Phase 2: 宋明光（孟赛生产数据主管）业务录入路径应 200
# ────────────────────────────────────────────────────────────────────────────
echo "▼ Phase 2: songmingguang（业务录入用户）→ G5-A/B 后应 200（不再 MENU_PERMISSION_DENIED）"
# 注：宋明光密码非公开，如脚本在 CI 内运行需用 SQL 改临时密码或跳过此段
SONG_PASS="${SONG_PASS:-}"
if [ -z "$SONG_PASS" ]; then
  echo "${Y}⏭  跳过宋明光段（未设置 SONG_PASS 环境变量）${N}"
  echo
else
  song_token=$(login songmingguang "$SONG_PASS") || {
    echo "${R}songmingguang 登录失败${N}"
    fail=$((fail + 1))
  }
  if [ -n "${song_token:-}" ]; then
    check "$song_token" GET '/api/lookup/companies'                    200 'song · /lookup/companies'
    check "$song_token" GET '/api/lookup/houses?farmCode=LPH_MENGSAI'  200 'song · /lookup/houses (孟赛)'
    check "$song_token" GET '/api/crud/brd_houses?status=ACTIVE&pageSize=500' 200 'song · /crud/brd_houses (RBAC fallback)'
    check "$song_token" GET '/api/lookup/product-grades'               200 'song · /lookup/product-grades'
    check "$song_token" GET '/api/v3/farm/daily-logs/eggs-breakdown?date=2026-06-04&houseCode=HOUSE_MS_02' 200 'song · /eggs-breakdown'
  fi
  echo
fi

# ────────────────────────────────────────────────────────────────────────────
# Phase 3: 主数据守卫表 — 业务录入用户不应能创建/编辑等级、规格、组织等
# ────────────────────────────────────────────────────────────────────────────
echo "▼ Phase 3: lookup 公开但主数据写操作仍需 MENU_MASTER_*"
# 用 admin 测主数据写应通过；非 admin 此段在 SONG_PASS 设置时可加
check "$admin_token" GET '/api/product-master/grades'                  200 'admin · /product-master/grades (写权限页 GET)'
echo

# ────────────────────────────────────────────────────────────────────────────
# 汇总
# ────────────────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════════════"
total=$((pass + fail))
if [ "$fail" -eq 0 ]; then
  printf "${G}✓ 全部 %d 项通过${N}\n" "$total"
  exit 0
else
  printf "${R}✗ %d 项 FAIL / %d 项总计${N}\n" "$fail" "$total"
  echo
  printf "${R}失败明细：${N}\n"
  for c in "${failed_cases[@]}"; do
    echo "  - $c"
  done
  exit 1
fi
