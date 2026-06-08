#!/usr/bin/env bash
# G22-2 · 部署后 smoke test — 防 CI 绿 ≠ 业务可用
#
# 用途：部署完毕后核心 endpoint + DB 状态验证，任一失败立即报警
#
# 用法：
#   ./scripts/smoke-test.sh                  # 测本地 dev (127.0.0.1:3100)
#   ./scripts/smoke-test.sh prod             # SSH erp 测生产
#
# 验证项：
#   1. 健康检查 /api/health
#   2. 登录 admin/along888 → 拿 token
#   3. 核心 lookup endpoint：houses/customers/warehouses（DictSelect 依赖）
#   4. 核心字典：INV_OUTBOUND_TYPE/INV_INBOUND_TYPE/BRD_MORTALITY_REASON（业务关键）
#   5. 关键 DB 表行数：sys_dict / sys_menu / brd_houses
#   6. 宋明光权限收口验证：MENU_FIN2_CASH_MASTER 应**无** 权限
set -euo pipefail

MODE="${1:-local}"
case "$MODE" in
  prod)
    API="http://127.0.0.1:3100"
    SSH="ssh -o ConnectTimeout=30 erp"
    DB_CMD="$SSH docker exec phoenix-v3-db psql -U phoenix_v3 -d phoenix_erp -tA -c"
    CURL_PREFIX="$SSH curl -s --max-time 10"
    ;;
  local)
    API="http://127.0.0.1:3100"
    DB_CMD="psql -U mac -d phoenix_erp -tA -c"
    CURL_PREFIX="curl -s --max-time 10"
    ;;
  *)
    echo "Usage: $0 [local|prod]"; exit 1
    ;;
esac

PASS=0; FAIL=0
check() {
  local name="$1" cond="$2" expect="$3"
  local actual
  actual=$(eval "$cond" 2>&1 || echo "ERROR")
  if [[ "$actual" =~ $expect ]]; then
    echo "  ✓ $name → $actual"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name → expected /$expect/, got: $actual"
    FAIL=$((FAIL+1))
  fi
}

echo "═══ Phase 1: API health & auth ═══"
check "health endpoint"     "$CURL_PREFIX $API/api/health"                         "ok|OK|status.*up"
TOKEN=$($CURL_PREFIX -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"along888"}' | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token","NO_TOKEN"))' 2>&1)
check "admin login"         "echo $TOKEN | head -c 5"                              "eyJ"

if [[ "$TOKEN" == "NO_TOKEN" || "$TOKEN" == ERROR* ]]; then
  echo "::error::admin login failed, aborting"; exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

echo "═══ Phase 2: 核心 lookup endpoint ═══"
check "lookup/houses count"      "$CURL_PREFIX -H '$AUTH' $API/api/lookup/houses | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get(\"data\",[])))'" "^[1-9]"
check "lookup/customers count"   "$CURL_PREFIX -H '$AUTH' $API/api/lookup/customers | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get(\"data\",[])))'" "^[0-9]"
check "lookup/warehouses count"  "$CURL_PREFIX -H '$AUTH' $API/api/lookup/warehouses | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get(\"data\",[])))'" "^[1-9]"

echo "═══ Phase 3: 核心字典存在 ═══"
check "INV_OUTBOUND_TYPE 7 项"     "$DB_CMD \"SELECT count(*) FROM sys_dict WHERE dict_type='INV_OUTBOUND_TYPE'\""        "^7$"
check "INV_INBOUND_TYPE 5 项"      "$DB_CMD \"SELECT count(*) FROM sys_dict WHERE dict_type='INV_INBOUND_TYPE'\""         "^5$"
check "BRD_MORTALITY_REASON 5 项"  "$DB_CMD \"SELECT count(*) FROM sys_dict WHERE dict_type='BRD_MORTALITY_REASON'\""     "^5$"
check "BRD_HOUSE_TYPE 6 项"        "$DB_CMD \"SELECT count(*) FROM sys_dict WHERE dict_type='BRD_HOUSE_TYPE'\""           "^6$"

echo "═══ Phase 4: 关键表行数 ═══"
check "sys_menu >100 行"           "$DB_CMD \"SELECT count(*) FROM sys_menu\""           "^[1-9][0-9]{2,}$"
check "sys_dict >200 行"           "$DB_CMD \"SELECT count(*) FROM sys_dict\""           "^[2-9][0-9]{2,}$"
check "brd_houses ACTIVE 5+"       "$DB_CMD \"SELECT count(*) FROM brd_houses WHERE status='ACTIVE'\""  "^[5-9]|^[1-9][0-9]+$"

echo "═══ Phase 5: 宋明光权限收口 (G20-2) ═══"
check "MENU_FIN2_CASH_MASTER seeded"  "$DB_CMD \"SELECT count(*) FROM sys_menu WHERE menu_code='MENU_FIN2_CASH_MASTER'\""  "^1$"
check "宋明光无 MASTER:C 权"  "$DB_CMD \"SELECT count(*) FROM sys_role_menu_permission rmp JOIN sys_menu m ON m.menu_id=rmp.menu_id JOIN sys_role r ON r.role_id=rmp.role_id WHERE r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR' AND m.menu_code='MENU_FIN2_CASH_MASTER'\""  "^0$"
check "宋明光持 TXN:V,C"  "$DB_CMD \"SELECT perm_codes FROM sys_role_menu_permission rmp JOIN sys_menu m ON m.menu_id=rmp.menu_id JOIN sys_role r ON r.role_id=rmp.role_id WHERE r.role_code='ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR' AND m.menu_code='MENU_FIN2_CASH_TXN'\""  "V,C"

echo ""
echo "═════════════════════════════"
echo "Result: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] && echo "✅ All smoke tests passed" && exit 0
echo "❌ $FAIL test(s) failed"; exit 1
