#!/usr/bin/env bash
# 系统设置 V2 fidelity 回归 — sys_users CRUD + status + role + password + brand
set -u

API="${API_URL:-http://127.0.0.1:3100}"
ADMIN_U="${ADMIN_USER:-admin}"
ADMIN_P="${ADMIN_PASS:-admin123}"
PSQL=${PSQL:-$(which psql)}
DB=phoenix_erp

PASS=0; FAIL=0
declare -a FAILURES

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$1"; }

assert_eq() { local n="$1" e="$2" a="$3"; if [ "$e" = "$a" ]; then green "  ✓ $n"; PASS=$((PASS+1)); else red "  ✗ $n"; red "      exp: $e"; red "      act: $a"; FAIL=$((FAIL+1)); FAILURES+=("$n | exp=$e act=$a"); fi; }
assert_ok() { local n="$1" c="$2"; case "$c" in 20[0-9]) green "  ✓ $n (HTTP $c)"; PASS=$((PASS+1));; *) red "  ✗ $n HTTP $c"; FAIL=$((FAIL+1)); FAILURES+=("$n | HTTP=$c");; esac; }
assert_fail(){ local n="$1" c="$2"; case "$c" in 4*|5*) green "  ✓ $n (HTTP $c)"; PASS=$((PASS+1));; *) red "  ✗ $n 应失败但 HTTP $c"; FAIL=$((FAIL+1)); FAILURES+=("$n | HTTP=$c");; esac; }

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ token=${TOKEN:0:30}..."

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Seed"
USER_REGR="regr_user_$(date +%s | tail -c 6)"
$PSQL $DB -q -c "DELETE FROM sys_user_role WHERE user_id IN (SELECT user_id FROM sys_user WHERE username LIKE 'regr_user_%');" >/dev/null
$PSQL $DB -q -c "DELETE FROM sys_user WHERE username LIKE 'regr_user_%';" >/dev/null
# 确保 sys_role 有一些可用角色
$PSQL $DB -q -c "INSERT INTO sys_role (role_code, role_name_zh, role_name_lo, role_type, description) VALUES ('ROLE_CASHIER','收银员','Cashier','BASE','POS 收银') ON CONFLICT DO NOTHING;" >/dev/null
$PSQL $DB -q -c "INSERT INTO sys_role (role_code, role_name_zh, role_type, description) VALUES ('ROLE_FARM_MGR','场长','MGMT','农场场长') ON CONFLICT DO NOTHING;" >/dev/null
green "  ✓ seed user=$USER_REGR"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: 创建用户 (POST /api/system/users)"
R1=$(curl -s -o /tmp/sys_t1.json -w '%{http_code}' -X POST "$API/api/system/users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_REGR\",\"real_name_zh\":\"回归测试员\",\"role\":\"ROLE_CASHIER\",\"password\":\"Pass123456\",\"user_type\":\"TEST\"}")
assert_ok "T1.1 create user 200" "$R1"
USER_ID=$($PSQL $DB -tA -c "SELECT user_id FROM sys_user WHERE username='$USER_REGR';")
[ -n "$USER_ID" ] && green "  ✓ T1.2 user_id=$USER_ID" && PASS=$((PASS+1)) || { red "  ✗ T1.2 user_id 缺"; FAIL=$((FAIL+1)); FAILURES+=("T1.2"); }
T1_STATUS=$($PSQL $DB -tA -c "SELECT status FROM sys_user WHERE user_id=$USER_ID;")
assert_eq "T1.3 status=1 (ACTIVE)" "1" "$T1_STATUS"
T1_HASH=$($PSQL $DB -tA -c "SELECT substr(password_hash,1,4) FROM sys_user WHERE user_id=$USER_ID;")
assert_eq "T1.4 bcrypt 哈希 \$2 开头" "\$2b\$" "$T1_HASH"

# sys_user_role 同步（V3 canonical）
T1_LINK=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM sys_user_role ur JOIN sys_role r ON ur.role_id=r.role_id WHERE ur.user_id=$USER_ID AND r.role_code='ROLE_CASHIER' AND ur.is_primary=true;")
assert_eq "T1.5 sys_user_role 关联 +1 (is_primary)" "1" "$T1_LINK"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: 重复用户名拒绝 + 弱密码拒绝"
R2A=$(curl -s -o /tmp/sys_t2a.json -w '%{http_code}' -X POST "$API/api/system/users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_REGR\",\"real_name_zh\":\"重复\",\"password\":\"Pass123456\"}")
assert_fail "T2.1 重复用户名拒绝" "$R2A"

R2B=$(curl -s -o /tmp/sys_t2b.json -w '%{http_code}' -X POST "$API/api/system/users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"username\":\"regr_weak_pw\",\"real_name_zh\":\"弱密码\",\"password\":\"short\"}")
assert_fail "T2.2 密码长度<8 拒绝" "$R2B"

R2C=$(curl -s -o /tmp/sys_t2c.json -w '%{http_code}' -X POST "$API/api/system/users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"username\":\"regr_weak_pw\",\"real_name_zh\":\"无数字\",\"password\":\"OnlyLetters\"}")
assert_fail "T2.3 密码无数字 拒绝" "$R2C"

R2D=$(curl -s -o /tmp/sys_t2d.json -w '%{http_code}' -X POST "$API/api/system/users" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"username\":\"regr_no_role\",\"real_name_zh\":\"测试\",\"role\":\"ROLE_NOT_EXIST\",\"password\":\"Pass123456\"}")
assert_fail "T2.4 角色不存在 拒绝" "$R2D"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: 状态切换 PUT /:id/status"
R3=$(curl -s -o /tmp/sys_t3.json -w '%{http_code}' -X PUT "$API/api/system/users/$USER_ID/status" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"FROZEN"}')
assert_ok "T3.1 setStatus FROZEN 200" "$R3"
T3_S=$($PSQL $DB -tA -c "SELECT status FROM sys_user WHERE user_id=$USER_ID;")
assert_eq "T3.2 DB.status=0 (FROZEN)" "0" "$T3_S"

R3B=$(curl -s -o /tmp/sys_t3b.json -w '%{http_code}' -X PUT "$API/api/system/users/$USER_ID/status" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"INVALID_STATUS"}')
assert_fail "T3.3 无效状态值拒绝" "$R3B"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: 变更角色 PUT /:id/role"
# 准备另一个角色
$PSQL $DB -q -c "INSERT INTO sys_role (role_code, role_name_zh, role_type, description) VALUES ('ROLE_FARM_MGR','场长','MGMT','农场场长') ON CONFLICT DO NOTHING;" >/dev/null

R4=$(curl -s -o /tmp/sys_t4.json -w '%{http_code}' -X PUT "$API/api/system/users/$USER_ID/role" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"ROLE_FARM_MGR"}')
assert_ok "T4.1 setRole 200" "$R4"
T4_R=$($PSQL $DB -tA -c "SELECT r.role_code FROM sys_user_role ur JOIN sys_role r ON ur.role_id=r.role_id WHERE ur.user_id=$USER_ID AND ur.is_primary=true LIMIT 1;")
assert_eq "T4.2 sys_user_role primary=ROLE_FARM_MGR" "ROLE_FARM_MGR" "$T4_R"
T4_LINK=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM sys_user_role ur JOIN sys_role r ON ur.role_id=r.role_id WHERE ur.user_id=$USER_ID AND r.role_code='ROLE_FARM_MGR';")
assert_eq "T4.3 sys_user_role +1 关联" "1" "$T4_LINK"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: 重置密码 PUT /:id/password"
NEW_PW="NewPass456789"
R5=$(curl -s -o /tmp/sys_t5.json -w '%{http_code}' -X PUT "$API/api/system/users/$USER_ID/password" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"password\":\"$NEW_PW\"}")
assert_ok "T5.1 resetPassword 200" "$R5"

# 验证新密码可用（先解冻）
$PSQL $DB -q -c "UPDATE sys_user SET status=1 WHERE user_id=$USER_ID;" >/dev/null
LOGIN_TEST=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_REGR\",\"password\":\"$NEW_PW\"}" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T5.2 用新密码登录成功 code=200" "200" "$LOGIN_TEST"

# 旧密码应失败
OLD_LOGIN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_REGR\",\"password\":\"Pass123456\"}" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
case "$OLD_LOGIN" in 401|400|""|undefined) green "  ✓ T5.3 旧密码登录拒绝 (code=$OLD_LOGIN)"; PASS=$((PASS+1));; 200) red "  ✗ T5.3 旧密码不应能登录"; FAIL=$((FAIL+1)); FAILURES+=("T5.3");; *) green "  ✓ T5.3 旧密码登录失败 ($OLD_LOGIN)"; PASS=$((PASS+1));; esac

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: 编辑基本信息 PUT /:id"
R6=$(curl -s -o /tmp/sys_t6.json -w '%{http_code}' -X PUT "$API/api/system/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"real_name_zh":"更新姓名","store_code":"ST-REGR"}')
assert_ok "T6.1 updateInfo 200" "$R6"
T6_NAME=$($PSQL $DB -tA -c "SELECT real_name FROM sys_user WHERE user_id=$USER_ID;")
assert_eq "T6.2 real_name=更新姓名" "更新姓名" "$T6_NAME"
T6_STORE=$($PSQL $DB -tA -c "SELECT store_code FROM sys_user WHERE user_id=$USER_ID;")
assert_eq "T6.3 store_code=ST-REGR" "ST-REGR" "$T6_STORE"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T7: 列表含新用户"
R7=$(curl -s -o /tmp/sys_t7.json -w '%{http_code}' "$API/api/system/users" -H "Authorization: Bearer $TOKEN")
assert_ok "T7.1 list users 200" "$R7"
HAS_USER=$(cat /tmp/sys_t7.json | grep -oE "\"username\":\"$USER_REGR\"" | head -1)
[ -n "$HAS_USER" ] && green "  ✓ T7.2 列表含 $USER_REGR" && PASS=$((PASS+1)) || { red "  ✗ T7.2 列表缺 $USER_REGR"; FAIL=$((FAIL+1)); FAILURES+=("T7.2"); }
HAS_ROLES=$(cat /tmp/sys_t7.json | grep -oE '"roles":\[')
[ -n "$HAS_ROLES" ] && green "  ✓ T7.3 含 roles 数组" && PASS=$((PASS+1)) || { red "  ✗ T7.3 缺 roles 数组"; FAIL=$((FAIL+1)); FAILURES+=("T7.3"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T8: 品牌配置 (V3 已有，仅冒烟)"
R8=$(curl -s -o /tmp/sys_t8.json -w '%{http_code}' "$API/api/system/brand")
assert_ok "T8.1 GET /api/system/brand (公开) 200" "$R8"
T8_OK=$(cat /tmp/sys_t8.json | grep -oE '"data":\{')
[ -n "$T8_OK" ] && green "  ✓ T8.2 含 data 对象" && PASS=$((PASS+1)) || { red "  ✗ T8.2 缺 data"; FAIL=$((FAIL+1)); FAILURES+=("T8.2"); }

R8B=$(curl -s -o /tmp/sys_t8b.json -w '%{http_code}' -X PUT "$API/api/system/brand" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"system_name":"REGR测试系统"}')
assert_ok "T8.3 PUT /api/system/brand 200" "$R8B"
T8B_SYS=$($PSQL $DB -tA -c "SELECT value FROM sys_settings WHERE key='brand.system_name';")
assert_eq "T8.4 sys_settings 持久化 system_name" "REGR测试系统" "$T8B_SYS"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T9: 主数据 stores + products"
R9=$(curl -s -o /tmp/sys_t9.json -w '%{http_code}' "$API/api/master/stores" -H "Authorization: Bearer $TOKEN")
assert_ok "T9.1 master/stores 200" "$R9"
R9B=$(curl -s -o /tmp/sys_t9b.json -w '%{http_code}' "$API/api/master/products" -H "Authorization: Bearer $TOKEN")
assert_ok "T9.2 master/products 200" "$R9B"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM sys_user_role WHERE user_id=$USER_ID;" >/dev/null
$PSQL $DB -q -c "DELETE FROM sys_user WHERE user_id=$USER_ID;" >/dev/null
$PSQL $DB -q -c "UPDATE sys_settings SET value='凤凰农业ERP管理系统' WHERE key='brand.system_name';" >/dev/null
green "  ✓ 清理完毕"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then green "✅ 全部 $PASS 项 PASS"; else red "❌ $FAIL 项 FAIL / $((PASS+FAIL))"; for f in "${FAILURES[@]}"; do red "  • $f"; done; fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
