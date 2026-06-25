#!/usr/bin/env bash
# Phoenix ERP V3 — UAT 测试账号种子脚本
#
# 用法：
#   bash scripts/seed-uat-users.sh
#
# 创建 9 个测试 persona（密码必须通过 ADMIN_PASS / UAT_TEST_PASSWORD 显式传入）：
#   admin               ROLE_ADMIN       系统超管
#   wang_ceo            ROLE_CEO         集团 CEO
#   test_farm_mgr       ROLE_FARM_MGR    场长
#   test_vet            ROLE_VET         兽医
#   test_pkg            ROLE_PKG_MGR     包装组长
#   test_wms            ROLE_WMS_OP      WMS 操作员
#   test_cashier        ROLE_CASHIER     收银员
#   test_fin            ROLE_FIN_ACCT    财务会计
#   test_store_mgr      ROLE_STORE_MGR   门店经理
#
# 设计要点：
#   - 通过 POST /api/system/users 走 V3 canonical 写入路径（sys_user + sys_user_role）
#   - 已存在的账号跳过（幂等）
#   - 所有角色不存在时自动 INSERT sys_role
set -eu

API="${API_URL:-http://127.0.0.1:3100}"
ADMIN_U="${ADMIN_USER:-admin}"
ADMIN_P="${ADMIN_PASS:-}"
PASS_UAT="${UAT_TEST_PASSWORD:-}"
PSQL="${PSQL:-$(command -v psql || echo /Applications/Postgres.app/Contents/Versions/18/bin/psql)}"
DB="${DB_NAME:-phoenix_erp}"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$1"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$1"; }

cyan "═══════════════════════════════════════════════════════════════════"
cyan "  Phoenix ERP V3 — UAT 9 个测试账号种子"
cyan "═══════════════════════════════════════════════════════════════════"

[ -n "$ADMIN_P" ] || { red "❌ ADMIN_PASS 必填，禁止使用脚本内默认管理员密码"; exit 2; }
[ -n "$PASS_UAT" ] || { red "❌ UAT_TEST_PASSWORD 必填，禁止使用脚本内默认测试密码"; exit 2; }

# ── 0) admin 登录 ─────────────────────────────────────────────────────────
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "❌ admin 登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "❌ token 空"; exit 99; }
green "  ✓ admin 登录成功"

# ── 1) 确保 9 个角色存在 (V3 sys_role) ─────────────────────────────────────
cyan ""
cyan "▶ 1) 校验 / 补齐 9 个 sys_role"
declare -a ROLES=(
  'ROLE_ADMIN|集团超管|MGMT|99'
  'ROLE_CEO|集团 CEO|MGMT|10'
  'ROLE_FARM_MGR|场长|MGMT|3'
  'ROLE_VET|兽医|BASE|1'
  'ROLE_PKG_MGR|包装组长|MGMT|2'
  'ROLE_WMS_OP|WMS 操作员|BASE|1'
  'ROLE_CASHIER|收银员|BASE|0'
  'ROLE_FIN_ACCT|财务会计|BASE|2'
  'ROLE_STORE_MGR|门店经理|MGMT|3'
)

for R in "${ROLES[@]}"; do
  CODE=$(echo "$R" | cut -d'|' -f1)
  NAME=$(echo "$R" | cut -d'|' -f2)
  TYPE=$(echo "$R" | cut -d'|' -f3)
  LEVEL=$(echo "$R" | cut -d'|' -f4)
  EXIST=$("$PSQL" "$DB" -tA -c "SELECT role_id FROM sys_role WHERE role_code='$CODE';" 2>/dev/null || echo "")
  if [ -z "$EXIST" ]; then
    "$PSQL" "$DB" -q -c "INSERT INTO sys_role (role_code, role_name_zh, role_type, approval_level) VALUES ('$CODE','$NAME','$TYPE',$LEVEL)" >/dev/null
    green "  ✓ INSERT role $CODE"
  else
    echo "  ▸ exists $CODE (role_id=$EXIST)"
  fi
done

# ── 2) 创建 9 个 persona 账号 ─────────────────────────────────────────────
cyan ""
cyan "▶ 2) 创建 / 更新 9 个 persona 账号"

# 注：admin 已存在（环境内置），仅记录到清单
declare -a USERS=(
  'wang_ceo|王总|ROLE_CEO|ALL'
  'test_farm_mgr|场长测试|ROLE_FARM_MGR|ALL'
  'test_vet|兽医测试|ROLE_VET|ALL'
  'test_pkg|包装组长测试|ROLE_PKG_MGR|ALL'
  'test_wms|WMS 操作员测试|ROLE_WMS_OP|ALL'
  'test_cashier|收银员测试|ROLE_CASHIER|ST-VTE-001'
  'test_fin|会计测试|ROLE_FIN_ACCT|ALL'
  'test_store_mgr|门店经理测试|ROLE_STORE_MGR|ST-VTE-001'
)

for U in "${USERS[@]}"; do
  USERNAME=$(echo "$U" | cut -d'|' -f1)
  NAME=$(echo "$U" | cut -d'|' -f2)
  ROLE=$(echo "$U" | cut -d'|' -f3)
  STORE=$(echo "$U" | cut -d'|' -f4)

  EXIST=$("$PSQL" "$DB" -tA -c "SELECT user_id FROM sys_user WHERE username='$USERNAME';" 2>/dev/null || echo "")
  if [ -n "$EXIST" ]; then
    # 已存在：仅重置密码 + 重新绑定角色 + 确保 status=1
    yellow "  ▸ exists $USERNAME (user_id=$EXIST) — 重置密码/角色"
    # 通过 API reset password 走 bcrypt
    curl -sf -X PUT "$API/api/system/users/$EXIST/password" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d "{\"password\":\"$PASS_UAT\"}" >/dev/null || true
    # 改角色（清旧 is_primary + 写新）
    curl -sf -X PUT "$API/api/system/users/$EXIST/role" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d "{\"role\":\"$ROLE\"}" >/dev/null || true
    # 设 store_code + status=ACTIVE
    "$PSQL" "$DB" -q -c "UPDATE sys_user SET store_code='$STORE', status=1, updated_at=now() WHERE user_id=$EXIST;" >/dev/null
  else
    # 新建
    HTTP=$(curl -s -o /tmp/uat_seed.json -w '%{http_code}' -X POST "$API/api/system/users" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d "{\"username\":\"$USERNAME\",\"real_name_zh\":\"$NAME\",\"role\":\"$ROLE\",\"password\":\"$PASS_UAT\",\"store_code\":\"$STORE\",\"user_type\":\"TEST\"}")
    case "$HTTP" in
      20[0-9])
        NEW_UID=$("$PSQL" "$DB" -tA -c "SELECT user_id FROM sys_user WHERE username='$USERNAME';")
        green "  ✓ CREATE $USERNAME (user_id=$NEW_UID, role=$ROLE, store=$STORE)"
        ;;
      *)
        red "  ✗ FAIL $USERNAME HTTP $HTTP"
        cat /tmp/uat_seed.json 2>&1 | head -3
        ;;
    esac
  fi
done

# ── 3) 健康自检：每个新账号能登录 ─────────────────────────────────────────
cyan ""
cyan "▶ 3) 健康自检 — 9 个账号登录冒烟"

ALL_USERS=("admin:$ADMIN_P" \
  "wang_ceo:$PASS_UAT" "test_farm_mgr:$PASS_UAT" "test_vet:$PASS_UAT" \
  "test_pkg:$PASS_UAT" "test_wms:$PASS_UAT" "test_cashier:$PASS_UAT" \
  "test_fin:$PASS_UAT" "test_store_mgr:$PASS_UAT")

PASS=0; FAIL=0
for entry in "${ALL_USERS[@]}"; do
  U=$(echo "$entry" | cut -d: -f1)
  P=$(echo "$entry" | cut -d: -f2-)
  TKN=$(curl -sf -X POST "$API/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$U\",\"password\":\"$P\"}" \
    | grep -oE '"token":"[^"]*"' | cut -d'"' -f4)
  if [ -n "$TKN" ]; then
    printf "  \033[32m✓\033[0m %-18s -> token=%s...\n" "$U" "${TKN:0:20}"
    PASS=$((PASS+1))
  else
    printf "  \033[31m✗\033[0m %-18s login FAIL\n" "$U"
    FAIL=$((FAIL+1))
  fi
done

cyan ""
cyan "═══════════════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  green "  ✅ 全部 $PASS 个账号可登录"
else
  red "  ❌ $FAIL 个账号不能登录"
fi
cyan "═══════════════════════════════════════════════════════════════════"
cyan "  UAT 账号密码:  由 UAT_TEST_PASSWORD 环境变量提供（不打印）"
cyan "═══════════════════════════════════════════════════════════════════"

exit $FAIL
