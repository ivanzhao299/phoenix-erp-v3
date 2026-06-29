#!/usr/bin/env bash
# PDA Terminal V2 fidelity 回归 — CRUD + register + heartbeat + config
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

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ token=${TOKEN:0:30}..."

# Seed cleanup
SER1="REGR-PDA-$(date +%s | tail -c 6)"
SER2="REGR-PDA-DEV-$(date +%s | tail -c 5)"
$PSQL $DB -q -c "DELETE FROM pda_terminals WHERE serial IN ('$SER1','$SER2') OR name LIKE 'REGR-PDA-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pda_system_config WHERE config_key LIKE 'regr_%';" >/dev/null

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: 创建终端 (POST /api/pda/terminals)"
R1=$(curl -s -o /tmp/pda_t1.json -w '%{http_code}' -X POST "$API/api/pda/terminals" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"REGR-PDA-T1\",\"brand\":\"Newland\",\"model\":\"N7\",\"serial\":\"$SER1\",\"scan_protocol\":\"newland\",\"location\":\"REGR-WH\"}")
assert_ok "T1.1 createTerminal 200" "$R1"
T1_ID=$(cat /tmp/pda_t1.json | grep -oE '"id":[0-9]+' | head -1 | cut -d: -f2)
[ -n "$T1_ID" ] && green "  ✓ T1.2 id=$T1_ID" && PASS=$((PASS+1)) || { red "  ✗ T1.2 missing id"; FAIL=$((FAIL+1)); FAILURES+=("T1.2"); }
T1_STATUS=$($PSQL $DB -tA -c "SELECT status FROM pda_terminals WHERE id=$T1_ID;")
assert_eq "T1.3 status=active" "active" "$T1_STATUS"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: 终端列表 + 重复 serial 409"
R2=$(curl -s -o /tmp/pda_t2.json -w '%{http_code}' "$API/api/pda/terminals" -H "Authorization: Bearer $TOKEN")
assert_ok "T2.1 listTerminals 200" "$R2"
HAS_T1=$(cat /tmp/pda_t2.json | grep -oE "\"serial\":\"$SER1\"" | head -1)
[ -n "$HAS_T1" ] && green "  ✓ T2.2 列表含 $SER1" && PASS=$((PASS+1)) || { red "  ✗ T2.2 列表缺 $SER1"; FAIL=$((FAIL+1)); FAILURES+=("T2.2"); }

R2B=$(curl -s -o /tmp/pda_t2b.json -w '%{http_code}' -X POST "$API/api/pda/terminals" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"REGR-PDA-T1-DUP\",\"serial\":\"$SER1\"}")
case "$R2B" in 409|4*) green "  ✓ T2.3 重复 serial 拒绝 (HTTP $R2B)"; PASS=$((PASS+1));; *) red "  ✗ T2.3 应拒绝 HTTP=$R2B"; FAIL=$((FAIL+1)); FAILURES+=("T2.3");; esac

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: 更新终端 (PUT /api/pda/terminals/:id)"
R3=$(curl -s -o /tmp/pda_t3.json -w '%{http_code}' -X PUT "$API/api/pda/terminals/$T1_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"location":"REGR-WH-UPDATED","status":"inactive"}')
assert_ok "T3.1 updateTerminal 200" "$R3"
T3_LOC=$($PSQL $DB -tA -c "SELECT location FROM pda_terminals WHERE id=$T1_ID;")
assert_eq "T3.2 location=REGR-WH-UPDATED" "REGR-WH-UPDATED" "$T3_LOC"
T3_STATUS=$($PSQL $DB -tA -c "SELECT status FROM pda_terminals WHERE id=$T1_ID;")
assert_eq "T3.3 status=inactive" "inactive" "$T3_STATUS"

# 改回 active 用于后续测试
$PSQL $DB -q -c "UPDATE pda_terminals SET status='active' WHERE id=$T1_ID;" >/dev/null

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: 设备自注册 (POST /api/pda/register 公开)"
# 第一次注册新设备 → 202 pending
R4=$(curl -s -o /tmp/pda_t4.json -w '%{http_code}' -X POST "$API/api/pda/register" \
  -H 'Content-Type: application/json' \
  -d "{\"serial\":\"$SER2\",\"brand\":\"Zebra\",\"model\":\"TC25\",\"app_version\":\"3.0.0\"}")
assert_ok "T4.1 register (公开) 200" "$R4"
T4_CODE=$(cat /tmp/pda_t4.json | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T4.2 新设备 code=202 (pending)" "202" "$T4_CODE"
T4_STATUS=$($PSQL $DB -tA -c "SELECT status FROM pda_terminals WHERE serial='$SER2';")
assert_eq "T4.3 DB.status=pending" "pending" "$T4_STATUS"

# 管理员激活后再次注册 → code 0 (active)
$PSQL $DB -q -c "UPDATE pda_terminals SET status='active', scan_protocol='zebra', scan_prefix='\\\\x02', enabled_modules='[\"receipt\",\"picking\"]' WHERE serial='$SER2';" >/dev/null
R4B=$(curl -s -o /tmp/pda_t4b.json -w '%{http_code}' -X POST "$API/api/pda/register" \
  -H 'Content-Type: application/json' \
  -d "{\"serial\":\"$SER2\",\"app_version\":\"3.0.1\"}")
assert_ok "T4.4 register active 200" "$R4B"
T4B_CODE=$(cat /tmp/pda_t4b.json | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T4.5 active code=0" "0" "$T4B_CODE"
T4B_PROTO=$(cat /tmp/pda_t4b.json | grep -oE '"protocol":"[^"]*"' | head -1 | cut -d'"' -f4)
assert_eq "T4.6 scanner_config.protocol=zebra" "zebra" "$T4B_PROTO"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: 心跳 (POST /api/pda/heartbeat 公开)"
R5=$(curl -s -o /tmp/pda_t5.json -w '%{http_code}' -X POST "$API/api/pda/heartbeat" \
  -H 'Content-Type: application/json' -d "{\"serial\":\"$SER2\"}")
assert_ok "T5.1 heartbeat 200" "$R5"
T5_LAST=$($PSQL $DB -tA -c "SELECT last_seen FROM pda_terminals WHERE serial='$SER2';")
[ -n "$T5_LAST" ] && green "  ✓ T5.2 last_seen 已更新" && PASS=$((PASS+1)) || { red "  ✗ T5.2 last_seen 缺"; FAIL=$((FAIL+1)); FAILURES+=("T5.2"); }

# 列表查询时 online=true
R5B=$(curl -s -o /tmp/pda_t5b.json -w '%{http_code}' "$API/api/pda/terminals" -H "Authorization: Bearer $TOKEN")
ONLINE_FLAG=$(cat /tmp/pda_t5b.json | python3 -c "import sys,json;d=json.load(sys.stdin);print([t.get('online') for t in d.get('data',[]) if t.get('serial')=='$SER2'][0])" 2>/dev/null)
[ "$ONLINE_FLAG" = "True" ] || [ "$ONLINE_FLAG" = "true" ] && green "  ✓ T5.3 online=true" && PASS=$((PASS+1)) || { red "  ✗ T5.3 online=$ONLINE_FLAG"; FAIL=$((FAIL+1)); FAILURES+=("T5.3"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: 全局系统配置 (PUT /api/pda/system-config)"
R6=$(curl -s -o /tmp/pda_t6.json -w '%{http_code}' -X PUT "$API/api/pda/system-config" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"server_url":"https://regr.local","scan_debounce_ms":"150","auto_approve":"true","not_allowed_key":"ignored"}')
assert_ok "T6.1 updateSystemConfig 200" "$R6"
T6_URL=$($PSQL $DB -tA -c "SELECT config_value FROM pda_system_config WHERE config_key='server_url';")
assert_eq "T6.2 server_url=https://regr.local" "https://regr.local" "$T6_URL"
T6_DEBOUNCE=$($PSQL $DB -tA -c "SELECT config_value FROM pda_system_config WHERE config_key='scan_debounce_ms';")
assert_eq "T6.3 scan_debounce_ms=150" "150" "$T6_DEBOUNCE"
# allow list 之外的 key 不应入库
T6_NOT=$($PSQL $DB -tA -c "SELECT config_value FROM pda_system_config WHERE config_key='not_allowed_key';")
assert_eq "T6.4 not_allowed_key 未入库" "" "$T6_NOT"

R6B=$(curl -s -o /tmp/pda_t6b.json -w '%{http_code}' "$API/api/pda/system-config")
assert_ok "T6.5 getSystemConfig 公开 200" "$R6B"
T6B_HAS=$(cat /tmp/pda_t6b.json | grep -oE '"server_url":"https://regr.local"')
[ -n "$T6B_HAS" ] && green "  ✓ T6.6 getSystemConfig 含 server_url" && PASS=$((PASS+1)) || { red "  ✗ T6.6 server_url 缺"; FAIL=$((FAIL+1)); FAILURES+=("T6.6"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T7: scanner-config 按 serial 下发"
R7=$(curl -s -o /tmp/pda_t7.json -w '%{http_code}' "$API/api/pda/scanner-config/$SER2")
assert_ok "T7.1 scannerConfig 200" "$R7"
T7_PROTO=$(cat /tmp/pda_t7.json | grep -oE '"protocol":"[^"]*"' | head -1 | cut -d'"' -f4)
assert_eq "T7.2 protocol=zebra" "zebra" "$T7_PROTO"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T8: APK 元信息 + 旧 latest 兼容"
R8=$(curl -s -o /tmp/pda_t8.json -w '%{http_code}' "$API/api/pda/app/info")
assert_ok "T8.1 app/info 200" "$R8"
T8_VER=$(cat /tmp/pda_t8.json | grep -oE '"version":"[^"]*"' | head -1 | cut -d'"' -f4)
assert_eq "T8.2 version=3.0.0" "3.0.0" "$T8_VER"

R8B=$(curl -s -o /tmp/pda_t8b.json -w '%{http_code}' "$API/api/pda/app/latest")
assert_ok "T8.3 app/latest 兼容 200" "$R8B"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T9: 删除终端"
R9=$(curl -s -o /tmp/pda_t9.json -w '%{http_code}' -X DELETE "$API/api/pda/terminals/$T1_ID" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T9.1 deleteTerminal 200" "$R9"
T9_GONE=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM pda_terminals WHERE id=$T1_ID;")
assert_eq "T9.2 终端已删 (count=0)" "0" "$T9_GONE"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM pda_terminals WHERE serial IN ('$SER1','$SER2');" >/dev/null
$PSQL $DB -q -c "DELETE FROM pda_system_config WHERE config_key IN ('server_url','scan_debounce_ms','auto_approve');" >/dev/null
green "  ✓ 清理完毕"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then green "✅ 全部 $PASS 项 PASS"; else red "❌ $FAIL 项 FAIL / $((PASS+FAIL))"; for f in "${FAILURES[@]}"; do red "  • $f"; done; fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
