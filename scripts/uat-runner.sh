#!/usr/bin/env bash
# Phoenix ERP V3 — UAT 端到端测试编排
#
# 阶段：
#   P1 单模块冒烟（10 模块）— 多 persona 登录 + 读写关键路径
#   P2 跨模块业务链（14 节点）— 1 单完整业务流，5 角色接力
#   P3 RBAC 边界（10 用例）— 越权应被拦截
#   P4 异常路径（12 用例）— 优雅失败
#   P5 性能 p95（10 关键操作）
#
# 输出：
#   UAT_RESULT.csv  逐用例 PASS/FAIL/BLOCKED
#   UAT_REPORT.md   汇总报告（人类可读）
#
# 用法：
#   bash scripts/uat-runner.sh                 # 跑全部
#   PHASE=P1 bash scripts/uat-runner.sh         # 只跑 P1
#   PHASE=P2 bash scripts/uat-runner.sh
set -u

cd "$(dirname "$0")/.."

API="${API_URL:-http://127.0.0.1:3100}"
PSQL="${PSQL:-$(command -v psql || echo /Applications/Postgres.app/Contents/Versions/18/bin/psql)}"
DB="${DB_NAME:-phoenix_erp}"
OUT_CSV="UAT_RESULT.csv"
OUT_MD="UAT_REPORT.md"
PHASE="${PHASE:-ALL}"

# macOS bash 3.2 不支持 declare -A，用 /tmp 文件 + 函数代替
STATE_DIR="/tmp/phoenix-uat-$$"
mkdir -p "$STATE_DIR"
trap "rm -rf $STATE_DIR" EXIT

tok_set() { echo "$2" > "$STATE_DIR/tok-$1"; }
tok_get() { cat "$STATE_DIR/tok-$1" 2>/dev/null || echo ""; }

phase_inc() {
  local phase="$1" key="$2"
  local f="$STATE_DIR/${phase}-${key}"
  local v=$(cat "$f" 2>/dev/null || echo 0)
  echo $((v+1)) > "$f"
}
phase_get() {
  cat "$STATE_DIR/$1-$2" 2>/dev/null || echo 0
}

ALL_PASS=0; ALL_FAIL=0; ALL_BLOCKED=0
FAILED_CASES_FILE="$STATE_DIR/failures.list"
: > "$FAILED_CASES_FILE"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$1"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$1"; }
bold()  { printf '\033[1m%s\033[0m\n' "$1"; }

# ──────────────────────────────────────────────────────────────────────────
# CSV header
# ──────────────────────────────────────────────────────────────────────────
echo "phase,case_id,module,persona,description,result,actual,expected" > "$OUT_CSV"

record() {
  # record <phase> <case_id> <module> <persona> <result> <description> [actual] [expected]
  local phase="$1" cid="$2" mod="$3" persona="$4" result="$5" desc="$6"
  local actual="${7:-}" expected="${8:-}"
  printf '%s,%s,%s,%s,"%s",%s,"%s","%s"\n' \
    "$phase" "$cid" "$mod" "$persona" "$desc" "$result" "$actual" "$expected" >> "$OUT_CSV"

  phase_inc "$phase" TOTAL
  case "$result" in
    PASS)
      phase_inc "$phase" PASS
      ALL_PASS=$((ALL_PASS+1))
      green "  ✓ [$cid] $desc"
      ;;
    FAIL)
      phase_inc "$phase" FAIL
      ALL_FAIL=$((ALL_FAIL+1))
      red "  ✗ [$cid] $desc  exp=$expected act=$actual"
      printf '[%s] %s/%s: %s | exp=%s act=%s\n' "$cid" "$mod" "$persona" "$desc" "$expected" "$actual" >> "$FAILED_CASES_FILE"
      ;;
    BLOCKED)
      ALL_BLOCKED=$((ALL_BLOCKED+1))
      yellow "  ⊘ [$cid] $desc  (BLOCKED)"
      ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────
# 登录所有 personas
# ──────────────────────────────────────────────────────────────────────────
login_persona() {
  local user="$1" pass="$2"
  local tok
  tok=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$user\",\"password\":\"$pass\"}" 2>/dev/null \
    | grep -oE '"token":"[^"]*"' | cut -d'"' -f4)
  tok_set "$user" "$tok"
  if [ -n "$tok" ]; then return 0; else return 1; fi
}

cyan "═══════════════════════════════════════════════════════════════════"
bold  "  Phoenix ERP V3 — UAT 端到端测试"
cyan "═══════════════════════════════════════════════════════════════════"
cyan "  时间:    $(date)"
cyan "  阶段:    $PHASE"
cyan "  API:     $API"
cyan "  DB:      $DB"
cyan "  输出:    $OUT_CSV / $OUT_MD"
cyan "═══════════════════════════════════════════════════════════════════"

cyan ""
cyan "▶ 0) 登录所有 personas"
declare -a USERS=(admin:admin123 wang_ceo:Test@1234 test_farm_mgr:Test@1234 \
  test_vet:Test@1234 test_pkg:Test@1234 test_wms:Test@1234 \
  test_cashier:Test@1234 test_fin:Test@1234 test_store_mgr:Test@1234)
for entry in "${USERS[@]}"; do
  U=${entry%%:*}; P=${entry#*:}
  if login_persona "$U" "$P"; then
    green "  ✓ $U"
  else
    red "  ✗ $U 登录失败 — 检查 seed-uat-users.sh"
    exit 99
  fi
done

# ══════════════════════════════════════════════════════════════════════════
# P1 单模块冒烟 (10 模块)
# ══════════════════════════════════════════════════════════════════════════
phase_p1() {
  bold ""
  bold "═════════ P1 单模块冒烟 ═════════"

  # P1-1 系统设置 (admin)
  cyan ""; cyan "▶ P1-1 系统设置 (admin)"
  TK=$(tok_get admin)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/system/users" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-1.1 system admin PASS "GET /api/system/users 200" "$HTTP" 200 || record P1 P1-1.1 system admin FAIL "GET /api/system/users" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/system/brand")
  [ "$HTTP" = "200" ] && record P1 P1-1.2 system admin PASS "GET /api/system/brand 公开 200" "$HTTP" 200 || record P1 P1-1.2 system admin FAIL "GET /api/system/brand" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/master/stores" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-1.3 system admin PASS "GET /api/master/stores" "$HTTP" 200 || record P1 P1-1.3 system admin FAIL "GET /api/master/stores" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/master/products" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-1.4 system admin PASS "GET /api/master/products" "$HTTP" 200 || record P1 P1-1.4 system admin FAIL "GET /api/master/products" "$HTTP" 200

  # P1-2 养殖管理 (test_farm_mgr)
  cyan ""; cyan "▶ P1-2 养殖 (test_farm_mgr)"
  TK=$(tok_get test_farm_mgr)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/crud/brd_farms?limit=10" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-2.1 breeding test_farm_mgr PASS "GET brd_farms" "$HTTP" 200 || record P1 P1-2.1 breeding test_farm_mgr FAIL "GET brd_farms" "$HTTP" 200
  HAS_UAT=$(cat /tmp/u.json | grep -oE '"farm_code":"UAT-F-VTE-001"' | head -1)
  [ -n "$HAS_UAT" ] && record P1 P1-2.2 breeding test_farm_mgr PASS "fixture 海蓝养殖场 可见" "" "" || record P1 P1-2.2 breeding test_farm_mgr FAIL "fixture 海蓝养殖场" "missing" "found"
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/crud/brd_flocks?limit=10" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-2.3 breeding test_farm_mgr PASS "GET brd_flocks" "$HTTP" 200 || record P1 P1-2.3 breeding test_farm_mgr FAIL "GET brd_flocks" "$HTTP" 200

  # P1-3 包装 (test_pkg)
  cyan ""; cyan "▶ P1-3 包装 (test_pkg)"
  TK=$(tok_get test_pkg)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/packaging/tasks" -H "Authorization: Bearer $TK")
  case "$HTTP" in 20[0-9]) record P1 P1-3.1 packaging test_pkg PASS "GET /api/packaging/tasks" "$HTTP" 200 ;; *) record P1 P1-3.1 packaging test_pkg FAIL "GET /api/packaging/tasks" "$HTTP" 200 ;; esac

  # P1-4 WMS (test_wms)
  cyan ""; cyan "▶ P1-4 WMS (test_wms)"
  TK=$(tok_get test_wms)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/crud/inv_batches?limit=500" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-4.1 wms test_wms PASS "GET inv_batches" "$HTTP" 200 || record P1 P1-4.1 wms test_wms FAIL "GET inv_batches" "$HTTP" 200
  HAS_INIT=$(cat /tmp/u.json | grep -oE '"batch_no":"UAT-BAT-INIT-EGG1"' | head -1)
  [ -n "$HAS_INIT" ] && record P1 P1-4.2 wms test_wms PASS "fixture 起始批次可见" "" "" || record P1 P1-4.2 wms test_wms FAIL "fixture 起始批次" "missing" "found"
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/crud/wms_inbound?limit=20" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-4.3 wms test_wms PASS "GET wms_inbound" "$HTTP" 200 || record P1 P1-4.3 wms test_wms FAIL "GET wms_inbound" "$HTTP" 200

  # P1-5 订单 (wang_ceo)
  cyan ""; cyan "▶ P1-5 订单 (wang_ceo)"
  TK=$(tok_get wang_ceo)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/crud/ord_orders?limit=20" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-5.1 order wang_ceo PASS "GET ord_orders" "$HTTP" 200 || record P1 P1-5.1 order wang_ceo FAIL "GET ord_orders" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/crud/ord_customers?limit=20" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-5.2 order wang_ceo PASS "GET ord_customers" "$HTTP" 200 || record P1 P1-5.2 order wang_ceo FAIL "GET ord_customers" "$HTTP" 200

  # P1-6 POS (test_cashier)
  cyan ""; cyan "▶ P1-6 POS (test_cashier)"
  TK=$(tok_get test_cashier)
  # 开班
  R=$(curl -s -o /tmp/u.json -w '%{http_code}' -X POST "$API/api/v3/pos/sessions" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d '{"store_code":"ST-VTE-001","opening_cash":1000}')
  case "$R" in 20[0-9]) record P1 P1-6.1 pos test_cashier PASS "开班 sessions" "$R" 200 ;; *) record P1 P1-6.1 pos test_cashier FAIL "开班 sessions" "$R" 200 ;; esac
  SES=$(cat /tmp/u.json | grep -oE '"session_no":"[^"]*"' | head -1 | cut -d'"' -f4)
  # 销售
  if [ -n "$SES" ]; then
    SALE_NO="UAT-POS-$(date +%s)"
    R=$(curl -s -o /tmp/u.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
      -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
      -d "{\"sale_no\":\"$SALE_NO\",\"session_no\":\"$SES\",\"items\":[{\"product_code\":\"PRD-EGG-1\",\"batch_no\":\"UAT-BAT-INIT-EGG1\",\"qty\":2,\"unit_price\":12}]}")
    case "$R" in 20[0-9]) record P1 P1-6.2 pos test_cashier PASS "POS 销售 createSale" "$R" 200 ;; *) record P1 P1-6.2 pos test_cashier FAIL "POS 销售" "$R" 200 ;; esac
    # 当日汇总
    R=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/v3/pos/today" -H "Authorization: Bearer $TK")
    [ "$R" = "200" ] && record P1 P1-6.3 pos test_cashier PASS "getTodaySummary 200" "$R" 200 || record P1 P1-6.3 pos test_cashier FAIL "getTodaySummary" "$R" 200
  else
    record P1 P1-6.2 pos test_cashier BLOCKED "POS 销售 (no session)" "" ""
    record P1 P1-6.3 pos test_cashier BLOCKED "getTodaySummary" "" ""
  fi

  # P1-7 财务 (test_fin)
  cyan ""; cyan "▶ P1-7 财务 (test_fin)"
  TK=$(tok_get test_fin)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/finance/ar-aging" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-7.1 finance test_fin PASS "AR 账龄" "$HTTP" 200 || record P1 P1-7.1 finance test_fin FAIL "AR 账龄" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/finance/ap-aging" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-7.2 finance test_fin PASS "AP 账龄" "$HTTP" 200 || record P1 P1-7.2 finance test_fin FAIL "AP 账龄" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/finance/summary" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-7.3 finance test_fin PASS "财务概览" "$HTTP" 200 || record P1 P1-7.3 finance test_fin FAIL "财务概览" "$HTTP" 200

  # P1-8 质检 (admin)
  cyan ""; cyan "▶ P1-8 质检 (admin)"
  TK=$(tok_get admin)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/quality/inspections?limit=10" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-8.1 quality admin PASS "质检列表" "$HTTP" 200 || record P1 P1-8.1 quality admin FAIL "质检列表" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/quality/non-conformances" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-8.2 quality admin PASS "NCR 列表" "$HTTP" 200 || record P1 P1-8.2 quality admin FAIL "NCR 列表" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/quality/trace/forward?batch_no=UAT-BAT-INIT-EGG1" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-8.3 quality admin PASS "正向追溯 UAT 批次" "$HTTP" 200 || record P1 P1-8.3 quality admin FAIL "正向追溯" "$HTTP" 200

  # P1-9 PDA (admin)
  cyan ""; cyan "▶ P1-9 PDA (admin)"
  TK=$(tok_get admin)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/pda/terminals" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-9.1 pda admin PASS "PDA 终端列表" "$HTTP" 200 || record P1 P1-9.1 pda admin FAIL "PDA 终端列表" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/pda/system-config")
  [ "$HTTP" = "200" ] && record P1 P1-9.2 pda admin PASS "PDA 系统配置(公开)" "$HTTP" 200 || record P1 P1-9.2 pda admin FAIL "PDA 系统配置" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/pda/app/info")
  [ "$HTTP" = "200" ] && record P1 P1-9.3 pda admin PASS "APK 元信息(公开)" "$HTTP" 200 || record P1 P1-9.3 pda admin FAIL "APK 元信息" "$HTTP" 200

  # P1-10 BI (wang_ceo)
  cyan ""; cyan "▶ P1-10 BI (wang_ceo)"
  TK=$(tok_get wang_ceo)
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/dashboard/kpi" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-10.1 bi wang_ceo PASS "Dashboard KPI" "$HTTP" 200 || record P1 P1-10.1 bi wang_ceo FAIL "Dashboard KPI" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/dashboard/store-analysis?store_code=ST-VTE-001" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-10.2 bi wang_ceo PASS "单店分析" "$HTTP" 200 || record P1 P1-10.2 bi wang_ceo FAIL "单店分析" "$HTTP" 200
  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/dashboard/integrity" -H "Authorization: Bearer $TK")
  [ "$HTTP" = "200" ] && record P1 P1-10.3 bi wang_ceo PASS "数据完整性评分" "$HTTP" 200 || record P1 P1-10.3 bi wang_ceo FAIL "数据完整性" "$HTTP" 200
}

# ══════════════════════════════════════════════════════════════════════════
# P2 跨模块业务链 (14 节点)
# ══════════════════════════════════════════════════════════════════════════
phase_p2() {
  bold ""
  bold "═════════ P2 跨模块业务链（单业务流 14 节点）═════════"

  # 准备：清理上轮 P2 + 重新种基线
  $PSQL "$DB" -q -c "DELETE FROM inv_ledger WHERE ref_no LIKE 'UAT-P2-%' OR batch_no LIKE 'UAT-P2-%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "DELETE FROM inv_batches WHERE batch_no LIKE 'UAT-P2-%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "DELETE FROM ord_order_items WHERE order_no LIKE 'UAT-P2-%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "DELETE FROM ord_orders WHERE order_no LIKE 'UAT-P2-%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "UPDATE ord_customers SET credit_used=0 WHERE customer_code='UAT-CUST-A';" >/dev/null 2>&1
  # 清今日 daily_close (test_cashier 的 ST-VTE-001) + 关联 acc_ledger / fin_transactions
  TODAY_LOCAL=$($PSQL "$DB" -tA -c "SELECT to_char(CURRENT_DATE,'YYYYMMDD')")
  $PSQL "$DB" -q -c "DELETE FROM acc_ledger WHERE ref_no LIKE 'DCL-${TODAY_LOCAL}-ST-VTE-001%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "DELETE FROM fin_transactions WHERE ref_no LIKE 'DCL-${TODAY_LOCAL}-ST-VTE-001%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "DELETE FROM daily_close WHERE close_no LIKE 'DCL-${TODAY_LOCAL}-ST-VTE-001%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "DELETE FROM pos_sale_items WHERE sale_no LIKE 'UAT-P2-POS-%' OR sale_no LIKE 'UAT-POS-%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "DELETE FROM pos_sales WHERE sale_no LIKE 'UAT-P2-POS-%' OR sale_no LIKE 'UAT-POS-%';" >/dev/null 2>&1
  $PSQL "$DB" -q -c "DELETE FROM pos_sessions WHERE session_no LIKE 'SES-ST-VTE-001-%' AND substr(open_time,1,10)=to_char(CURRENT_DATE,'YYYY-MM-DD');" >/dev/null 2>&1
  # 准备 1 个新批次给本流程独占
  P2_BATCH="UAT-P2-BAT-$(date +%s | tail -c 6)"
  $PSQL "$DB" -q -c "INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code) VALUES ('$P2_BATCH','PRD-EGG-1',1000,1000,'AVAILABLE','WMS-VTE-MAIN','ALL');" >/dev/null

  # 节点 1：场长录日报 → 钩子加蛋
  TK=$(tok_get test_farm_mgr)
  TODAY=$($PSQL "$DB" -tA -c "SELECT to_char(CURRENT_DATE,'YYYY-MM-DD')")
  LOG_NO="UAT-P2-LOG-$(date +%s | tail -c 6)"
  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/crud/brd_daily_logs" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d "{\"flock_no\":\"UAT-FK-2025-001\",\"log_date\":\"$TODAY\",\"shift\":\"MORNING\",\"eggs_produced\":2400,\"mortality_qty\":5,\"feed_qty\":380,\"operator\":\"test_farm_mgr\"}")
  case "$R" in 20[0-9]) record P2 P2-1 breeding test_farm_mgr PASS "录日报 2400 蛋/死淘 5" "$R" 200 ;; *) record P2 P2-1 breeding test_farm_mgr FAIL "录日报" "$R" 200 ;; esac

  # 节点 2：客户基线 credit_used=0
  CRED=$($PSQL "$DB" -tA -c "SELECT credit_used::int FROM ord_customers WHERE customer_code='UAT-CUST-A';")
  [ "$CRED" = "0" ] && record P2 P2-2 order admin PASS "客户 A 信用占用基线=0" "$CRED" 0 || record P2 P2-2 order admin FAIL "客户基线" "$CRED" 0

  # 节点 3：下单 PRD-EGG-1 × 500 @ 12 (在 [8,15] 价格带内)
  TK=$(tok_get wang_ceo)
  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d '{"customer_code":"UAT-CUST-A","price_book_id":"UAT-PB-RETAIL-2026","total_amount":6000,"lines":[{"product_code":"PRD-EGG-1","qty":500,"unit_price":12}]}')
  case "$R" in 20[0-9]) record P2 P2-3 order wang_ceo PASS "submitOrder 200" "$R" 200 ;; *) record P2 P2-3 order wang_ceo FAIL "submitOrder" "$R" 200 ;; esac
  ORD=$(cat /tmp/p2.json | grep -oE '"order_no":"[^"]*"' | head -1 | cut -d'"' -f4)

  # 节点 4：信用占用 + 价格保护通过
  CRED=$($PSQL "$DB" -tA -c "SELECT credit_used::int FROM ord_customers WHERE customer_code='UAT-CUST-A';")
  [ "$CRED" = "6000" ] && record P2 P2-4 order wang_ceo PASS "信用占用=6000" "$CRED" 6000 || record P2 P2-4 order wang_ceo FAIL "信用占用" "$CRED" 6000

  # 节点 5：黑名单客户下单应被拦
  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d '{"customer_code":"UAT-CUST-BLACK","lines":[{"product_code":"PRD-EGG-1","qty":1,"unit_price":12}]}')
  case "$R" in 4*) record P2 P2-5 order wang_ceo PASS "黑名单客户拦截 4xx" "$R" 4xx ;; *) record P2 P2-5 order wang_ceo FAIL "黑名单未拦截" "$R" 4xx ;; esac

  # 节点 6：价格保护拦截 (unit=5 < retail_lower=8)
  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d '{"customer_code":"UAT-CUST-A","price_book_id":"UAT-PB-RETAIL-2026","lines":[{"product_code":"PRD-EGG-1","qty":1,"unit_price":5}]}')
  NEED=$(cat /tmp/p2.json | grep -oE '"need_price_approval":true' | head -1)
  [ -n "$NEED" ] && record P2 P2-6 order wang_ceo PASS "低价转 DRAFT/审批" "" "" || record P2 P2-6 order wang_ceo FAIL "价格保护" "$R" "need_price_approval:true"
  # 清理低价单
  LOW=$(cat /tmp/p2.json | grep -oE '"order_no":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$LOW" ] && $PSQL "$DB" -q -c "DELETE FROM ord_order_items WHERE order_no='$LOW'; DELETE FROM ord_orders WHERE order_no='$LOW';" >/dev/null

  # 节点 7：状态机推进 APPROVED→ALLOCATED→PICKED→LOADED
  if [ -n "$ORD" ]; then
    STATUS_OK=true
    for S in ALLOCATED PICKED LOADED; do
      R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/orders/$ORD/transition" \
        -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
        -d "{\"to_status\":\"$S\"}")
      case "$R" in 20[0-9]) : ;; *) STATUS_OK=false ;; esac
    done
    $STATUS_OK && record P2 P2-7 order wang_ceo PASS "状态机推进 → LOADED" "" "" || record P2 P2-7 order wang_ceo FAIL "状态机推进" "$R" 200
  else
    record P2 P2-7 order wang_ceo BLOCKED "无 order_no" "" ""
  fi

  # 节点 8：WMS 出库 SHIPPED → 扣库 + ledger
  TK=$(tok_get test_wms)
  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/outbound/orders/$ORD/advance" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d "{\"next_status\":\"SHIPPED\",\"items\":[{\"batch_no\":\"$P2_BATCH\",\"qty\":500,\"product_code\":\"PRD-EGG-1\"}]}")
  case "$R" in 20[0-9]) record P2 P2-8 wms test_wms PASS "WMS 出库 SHIPPED" "$R" 200 ;; *) record P2 P2-8 wms test_wms FAIL "WMS 出库" "$R" 200 ;; esac

  # 节点 9：批次 qty 减 500
  QTY_NOW=$($PSQL "$DB" -tA -c "SELECT qty FROM inv_batches WHERE batch_no='$P2_BATCH';")
  [ "$QTY_NOW" = "500" ] && record P2 P2-9 wms test_wms PASS "批次 qty 1000→500" "$QTY_NOW" 500 || record P2 P2-9 wms test_wms FAIL "批次 qty" "$QTY_NOW" 500

  # 节点 10：inv_ledger OUTBOUND 流水
  LED=$($PSQL "$DB" -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE batch_no='$P2_BATCH' AND change_type IN ('OUTBOUND','SALE_OUT');")
  [ "$LED" -ge "1" ] && record P2 P2-10 wms test_wms PASS "inv_ledger OUTBOUND +1" "$LED" "≥1" || record P2 P2-10 wms test_wms FAIL "inv_ledger" "$LED" "≥1"

  # 节点 11：签收 RECEIVED
  TK=$(tok_get wang_ceo)
  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/orders/$ORD/transition" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d '{"to_status":"RECEIVED"}')
  case "$R" in 20[0-9]) record P2 P2-11 order wang_ceo PASS "签收 RECEIVED" "$R" 200 ;; *) record P2 P2-11 order wang_ceo FAIL "签收" "$R" 200 ;; esac

  # 节点 12：财务收款 income → AR 自动核销
  TK=$(tok_get test_fin)
  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/finance/income" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d "{\"account_code\":\"UAT-CASH-CNY\",\"amount\":6000,\"ref_no\":\"$ORD\",\"note\":\"UAT P2 收款\"}")
  case "$R" in 20[0-9]) record P2 P2-12 finance test_fin PASS "收入入账 6000" "$R" 200 ;; *) record P2 P2-12 finance test_fin FAIL "收入入账" "$R" 200 ;; esac
  PAID=$($PSQL "$DB" -tA -c "SELECT paid_amount::int FROM ord_orders WHERE order_no='$ORD';")
  [ "$PAID" = "6000" ] && record P2 P2-12b finance test_fin PASS "AR 自动核销 paid_amount=6000" "$PAID" 6000 || record P2 P2-12b finance test_fin FAIL "AR 自动核销" "$PAID" 6000

  # 节点 13：日结 (test_cashier → 1 单 POS + daily-close)
  TK=$(tok_get test_cashier)
  P2_SALE="UAT-P2-POS-$(date +%s)"
  curl -s -o /dev/null -X POST "$API/api/v3/pos/sales" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d "{\"sale_no\":\"$P2_SALE\",\"items\":[{\"product_code\":\"PRD-EGG-1\",\"batch_no\":\"$P2_BATCH\",\"qty\":1,\"unit_price\":12}]}"
  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/v3/store/daily-close-v2/submit" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d '{"cash_actual":12,"note":"UAT P2 daily close"}')
  case "$R" in 20[0-9]) record P2 P2-13 store test_cashier PASS "日结提交" "$R" 200 ;; *) record P2 P2-13 store test_cashier FAIL "日结" "$R" 200 ;; esac
  DC=$(cat /tmp/p2.json | grep -oE '"close_no":"[^"]*"' | head -1 | cut -d'"' -f4)

  # 节点 14：双账落地 acc_ledger SALES_REVENUE + fin_transactions REV-STORE
  if [ -n "$DC" ]; then
    SALES_REV=$($PSQL "$DB" -tA -c "SELECT amount::int FROM acc_ledger WHERE ref_no='$DC' AND ledger_type='SALES_REVENUE';")
    [ -n "$SALES_REV" ] && [ "$SALES_REV" != "0" ] && record P2 P2-14a finance test_cashier PASS "acc_ledger SALES_REVENUE" "$SALES_REV" "≥1" || record P2 P2-14a finance test_cashier FAIL "acc_ledger" "$SALES_REV" "≥1"
    FIN_REV=$($PSQL "$DB" -tA -c "SELECT amount::int FROM fin_transactions WHERE ref_no='$DC' AND account_code='REV-STORE' AND type='CREDIT';")
    [ -n "$FIN_REV" ] && [ "$FIN_REV" != "0" ] && record P2 P2-14b finance test_cashier PASS "fin_transactions REV-STORE CREDIT" "$FIN_REV" "≥1" || record P2 P2-14b finance test_cashier FAIL "fin_transactions REV-STORE" "$FIN_REV" "≥1"
  else
    record P2 P2-14a finance test_cashier BLOCKED "无 close_no" "" ""
    record P2 P2-14b finance test_cashier BLOCKED "无 close_no" "" ""
  fi
}

# ══════════════════════════════════════════════════════════════════════════
# P3 RBAC 越权 (10 用例)
# ══════════════════════════════════════════════════════════════════════════
phase_p3() {
  bold ""
  bold "═════════ P3 RBAC 越权应被拦截 ═════════"

  # 帮助函数：期望 403 / 401 / 4xx
  rbac_expect_deny() {
    local cid="$1" persona="$2" desc="$3"; shift 3
    local R
    R=$(curl -s -o /tmp/p3.json -w '%{http_code}' "$@")
    case "$R" in 401|403) record P3 "$cid" rbac "$persona" PASS "$desc → 拒($R)" "$R" "401/403" ;;
                  4*)     record P3 "$cid" rbac "$persona" PASS "$desc → 4xx拒" "$R" "4xx" ;;
                  *)      record P3 "$cid" rbac "$persona" FAIL "$desc 未拒" "$R" "401/403" ;;
    esac
  }

  TK_CASHIER=$(tok_get test_cashier)
  TK_FARM=$(tok_get test_farm_mgr)
  TK_VET=$(tok_get test_vet)
  TK_WMS=$(tok_get test_wms)
  TK_STORE=$(tok_get test_store_mgr)

  # 1. 收银员 改价格簿
  rbac_expect_deny P3-1 test_cashier "收银员改价格 PUT prc_price_items" \
    -X PUT "$API/api/crud/prc_price_items/item_id/UAT-PI-EGG1" \
    -H "Authorization: Bearer $TK_CASHIER" -H 'Content-Type: application/json' \
    -d '{"retail_lower":99}'

  # 2. 收银员 改用户角色
  rbac_expect_deny P3-2 test_cashier "收银员改其他用户角色" \
    -X PUT "$API/api/system/users/13/role" \
    -H "Authorization: Bearer $TK_CASHIER" -H 'Content-Type: application/json' \
    -d '{"role":"ROLE_ADMIN"}'

  # 3. 收银员 删农场
  rbac_expect_deny P3-3 test_cashier "收银员删农场 DELETE brd_farms" \
    -X DELETE "$API/api/crud/brd_farms/farm_code/UAT-F-VTE-001" \
    -H "Authorization: Bearer $TK_CASHIER"

  # 4. 场长 POS 销售
  rbac_expect_deny P3-4 test_farm_mgr "场长跑 POS sale" \
    -X POST "$API/api/v3/pos/sales" \
    -H "Authorization: Bearer $TK_FARM" -H 'Content-Type: application/json' \
    -d '{"sale_no":"NOPE","items":[]}'

  # 5. 场长 改财务凭证
  rbac_expect_deny P3-5 test_farm_mgr "场长建 AP 凭证" \
    -X POST "$API/api/finance/ap-invoice" \
    -H "Authorization: Bearer $TK_FARM" -H 'Content-Type: application/json' \
    -d '{"po_no":"PO-X","supplier":"X","amount":100}'

  # 6. 兽医 删鸡群
  rbac_expect_deny P3-6 test_vet "兽医删鸡群" \
    -X DELETE "$API/api/crud/brd_flocks/flock_no/UAT-FK-2025-001" \
    -H "Authorization: Bearer $TK_VET"

  # 7. WMS 操作员 改商品定价
  rbac_expect_deny P3-7 test_wms "WMS 改 prc_price_items" \
    -X PUT "$API/api/crud/prc_price_items/item_id/UAT-PI-EGG1" \
    -H "Authorization: Bearer $TK_WMS" -H 'Content-Type: application/json' \
    -d '{"retail_upper":999}'

  # 8. 门店经理 改 RBAC 角色码
  rbac_expect_deny P3-8 test_store_mgr "门店经理建新角色" \
    -X POST "$API/api/crud/sys_role" \
    -H "Authorization: Bearer $TK_STORE" -H 'Content-Type: application/json' \
    -d '{"role_code":"ROLE_HACK","role_name_zh":"hack","role_type":"BASE"}'

  # 9. 兽医 改鸡舍
  rbac_expect_deny P3-9 test_vet "兽医 PUT brd_houses" \
    -X PUT "$API/api/crud/brd_houses/house_code/UAT-H-001" \
    -H "Authorization: Bearer $TK_VET" -H 'Content-Type: application/json' \
    -d '{"capacity":1}'

  # 10. 未登录访问
  rbac_expect_deny P3-10 anon "无 Token 访问 ord_orders" \
    -X GET "$API/api/crud/ord_orders"
}

# ══════════════════════════════════════════════════════════════════════════
# P4 异常路径 (12 用例)
# ══════════════════════════════════════════════════════════════════════════
phase_p4() {
  bold ""
  bold "═════════ P4 异常路径应优雅失败 ═════════"

  TK=$(tok_get admin)
  TK_CASHIER=$(tok_get test_cashier)

  # 1. 无效 Token
  R=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/crud/ord_orders" -H "Authorization: Bearer INVALID_TOKEN_XYZ")
  case "$R" in 401) record P4 P4-1 except admin PASS "无效 Token → 401" "$R" 401 ;; *) record P4 P4-1 except admin FAIL "无效 Token" "$R" 401 ;; esac

  # 2. 过期 Token (用 sha1 假 payload)
  EXPIRED='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwiZXhwIjoxNTAwMDAwMDAwfQ.x'
  R=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/crud/ord_orders" -H "Authorization: Bearer $EXPIRED")
  case "$R" in 401) record P4 P4-2 except admin PASS "过期 Token → 401" "$R" 401 ;; *) record P4 P4-2 except admin FAIL "过期 Token" "$R" 401 ;; esac

  # 3. 库存不足
  R=$(curl -s -o /tmp/p4.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
    -H "Authorization: Bearer $TK_CASHIER" -H 'Content-Type: application/json' \
    -d '{"sale_no":"UAT-P4-OVER","items":[{"product_code":"PRD-EGG-1","batch_no":"UAT-BAT-INIT-EGG1","qty":99999,"unit_price":12}]}')
  case "$R" in 4*) record P4 P4-3 except test_cashier PASS "库存不足 → 4xx" "$R" 4xx ;; *) record P4 P4-3 except test_cashier FAIL "库存不足" "$R" 4xx ;; esac

  # 4. 重复 sale_no 幂等
  R1=$(curl -s -o /tmp/p4a.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
    -H "Authorization: Bearer $TK_CASHIER" -H 'Content-Type: application/json' \
    -d '{"sale_no":"UAT-P4-IDEM-1","items":[{"product_code":"PRD-EGG-1","batch_no":"UAT-BAT-INIT-EGG1","qty":1,"unit_price":12}]}')
  R2=$(curl -s -o /tmp/p4b.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
    -H "Authorization: Bearer $TK_CASHIER" -H 'Content-Type: application/json' \
    -d '{"sale_no":"UAT-P4-IDEM-1","items":[{"product_code":"PRD-EGG-1","batch_no":"UAT-BAT-INIT-EGG1","qty":1,"unit_price":12}]}')
  IDEM=$(cat /tmp/p4b.json | grep -oE '"idempotent":true' | head -1)
  [ -n "$IDEM" ] && record P4 P4-4 except test_cashier PASS "重复 sale_no 幂等 idempotent:true" "" "" || record P4 P4-4 except test_cashier FAIL "幂等" "$R2" "idempotent:true"

  # 5. 非法状态机跳跃 SHIPPED→DRAFT
  R=$(curl -s -o /tmp/p4.json -w '%{http_code}' -X POST "$API/api/orders/UAT-NOEXIST/transition" \
    -H "Authorization: Bearer $TK" -H 'Content-Type: application/json' \
    -d '{"to_status":"DRAFT"}')
  case "$R" in 4*|5*) record P4 P4-5 except admin PASS "不存在订单 → 4xx/5xx" "$R" 4xx ;; *) record P4 P4-5 except admin FAIL "不存在订单" "$R" 4xx ;; esac

  # 6. SQL 注入 (search)
  PAYLOAD="'; DROP TABLE ord_orders; --"
  PAYLOAD_ENC=$(printf %s "$PAYLOAD" | python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.stdin.read()))" 2>/dev/null || echo "%27%3B%20DROP")
  R=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/crud/ord_orders?keyword=$PAYLOAD_ENC" -H "Authorization: Bearer $TK")
  # 该表仍存在
  STILL_EXIST=$($PSQL "$DB" -tA -c "SELECT 1 FROM information_schema.tables WHERE table_name='ord_orders' LIMIT 1;")
  [ "$STILL_EXIST" = "1" ] && record P4 P4-6 except admin PASS "SQL 注入无害（ord_orders 仍存在）" "$STILL_EXIST" 1 || record P4 P4-6 except admin FAIL "SQL 注入" "$STILL_EXIST" 1

  # 7. 密码错误登录 5 次（不锁账户但应返 401）
  FAIL_CNT=0
  for i in 1 2 3 4 5; do
    R=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/auth/login" \
      -H 'Content-Type: application/json' -d '{"username":"admin","password":"WRONG"}')
    case "$R" in 401|400) FAIL_CNT=$((FAIL_CNT+1)) ;; esac
  done
  [ "$FAIL_CNT" -eq "5" ] && record P4 P4-7 except admin PASS "5 次密码错误均 401" "$FAIL_CNT" 5 || record P4 P4-7 except admin FAIL "密码错误响应" "$FAIL_CNT" 5

  # 8. /api/health DEGRADED 检测
  HEALTH=$(curl -s "$API/api/health" | grep -oE '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  [ "$HEALTH" = "OK" ] && record P4 P4-8 except admin PASS "/api/health status=OK" "$HEALTH" OK || record P4 P4-8 except admin FAIL "/api/health" "$HEALTH" OK

  # 9. /api/readiness
  R=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/readiness")
  [ "$R" = "200" ] && record P4 P4-9 except admin PASS "/api/readiness 200" "$R" 200 || record P4 P4-9 except admin FAIL "/api/readiness" "$R" 200

  # 10. /api/metrics Prometheus
  METRICS=$(curl -s "$API/api/metrics" | grep -c "^phoenix_")
  [ "$METRICS" -ge "8" ] && record P4 P4-10 except admin PASS "/api/metrics 暴露 $METRICS 个指标" "$METRICS" "≥8" || record P4 P4-10 except admin FAIL "/api/metrics" "$METRICS" "≥8"

  # 11. 不存在 endpoint → 404
  R=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/this-does-not-exist" -H "Authorization: Bearer $TK")
  [ "$R" = "404" ] && record P4 P4-11 except admin PASS "不存在路径 → 404" "$R" 404 || record P4 P4-11 except admin FAIL "不存在路径" "$R" 404

  # 12. 缺必填字段
  R=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/orders/submit" \
    -H "Authorization: Bearer $(tok_get wang_ceo)" -H 'Content-Type: application/json' \
    -d '{}')
  case "$R" in 4*) record P4 P4-12 except wang_ceo PASS "submitOrder 缺字段 → 4xx" "$R" 4xx ;; *) record P4 P4-12 except wang_ceo FAIL "缺字段" "$R" 4xx ;; esac
}

# ══════════════════════════════════════════════════════════════════════════
# P5 性能 p95
# ══════════════════════════════════════════════════════════════════════════
phase_p5() {
  bold ""
  bold "═════════ P5 性能 p95 (each 20 次取 95-th) ═════════"

  TK=$(tok_get admin)

  perf_test() {
    local cid="$1" desc="$2" target_ms="$3"; shift 3
    local times=()
    for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
      local t=$(curl -s -o /dev/null -w '%{time_total}\n' "$@")
      times+=("$t")
    done
    # 取 95% (第 19 项，sorted)
    local p95=$(printf '%s\n' "${times[@]}" | sort -n | sed -n '19p')
    local p95_ms=$(awk -v t="$p95" 'BEGIN{printf "%.0f", t*1000}')
    if [ "$p95_ms" -le "$target_ms" ]; then
      record P5 "$cid" perf admin PASS "$desc p95=${p95_ms}ms ≤ ${target_ms}ms" "${p95_ms}ms" "≤${target_ms}ms"
    else
      record P5 "$cid" perf admin FAIL "$desc p95=${p95_ms}ms > ${target_ms}ms" "${p95_ms}ms" "≤${target_ms}ms"
    fi
  }

  perf_test P5-1 "/api/health" 200 "$API/api/health"
  perf_test P5-2 "/api/dashboard/kpi" 2000 "$API/api/dashboard/kpi" -H "Authorization: Bearer $TK"
  perf_test P5-3 "/api/orders 列表" 1000 "$API/api/crud/ord_orders?limit=20" -H "Authorization: Bearer $TK"
  perf_test P5-4 "/api/finance/ar-aging" 2000 "$API/api/finance/ar-aging" -H "Authorization: Bearer $TK"
  perf_test P5-5 "/api/metrics" 500 "$API/api/metrics"
  perf_test P5-6 "/api/quality/trace/forward" 1000 "$API/api/quality/trace/forward?batch_no=UAT-BAT-INIT-EGG1" -H "Authorization: Bearer $TK"
  perf_test P5-7 "/api/crud/inv_batches limit=200" 2000 "$API/api/crud/inv_batches?limit=200" -H "Authorization: Bearer $TK"
  perf_test P5-8 "/api/master/products" 500 "$API/api/master/products" -H "Authorization: Bearer $TK"
  perf_test P5-9 "/api/pda/system-config" 500 "$API/api/pda/system-config"
  perf_test P5-10 "/api/dashboard/integrity" 3000 "$API/api/dashboard/integrity" -H "Authorization: Bearer $TK"
}

# ──────────────────────────────────────────────────────────────────────────
# RUN
# ──────────────────────────────────────────────────────────────────────────
case "$PHASE" in
  P1) phase_p1 ;;
  P2) phase_p2 ;;
  P3) phase_p3 ;;
  P4) phase_p4 ;;
  P5) phase_p5 ;;
  ALL|*)
    phase_p1
    phase_p2
    phase_p3
    phase_p4
    phase_p5
    ;;
esac

# ──────────────────────────────────────────────────────────────────────────
# 写汇总报告 UAT_REPORT.md
# ──────────────────────────────────────────────────────────────────────────
TOTAL=$((ALL_PASS+ALL_FAIL+ALL_BLOCKED))
RATE=$([ "$TOTAL" -gt 0 ] && awk -v p=$ALL_PASS -v t=$TOTAL 'BEGIN{printf "%.1f", p*100/t}' || echo 0)

{
  echo "# Phoenix ERP V3 — UAT 测试报告"
  echo ""
  echo "**生成时间**：$(date)"
  echo "**测试阶段**：$PHASE"
  echo ""
  echo "## 总览"
  echo ""
  echo "| 指标 | 数值 |"
  echo "|------|------|"
  echo "| 总用例 | $TOTAL |"
  echo "| ✅ PASS | $ALL_PASS |"
  echo "| ❌ FAIL | $ALL_FAIL |"
  echo "| ⊘ BLOCKED | $ALL_BLOCKED |"
  echo "| 通过率 | ${RATE}% |"
  echo ""
  echo "## 分阶段统计"
  echo ""
  echo "| 阶段 | 总数 | PASS | FAIL | 通过率 |"
  echo "|------|------|------|------|--------|"
  for P in P1 P2 P3 P4 P5; do
    T=$(phase_get "$P" TOTAL)
    OK=$(phase_get "$P" PASS)
    NG=$(phase_get "$P" FAIL)
    if [ "$T" -gt 0 ]; then
      RT=$(awk -v p=$OK -v t=$T 'BEGIN{printf "%.0f%%", p*100/t}')
    else
      RT="-"
    fi
    printf "| %s | %s | %s | %s | %s |\n" "$P" "$T" "$OK" "$NG" "$RT"
  done
  echo ""
  if [ "$ALL_FAIL" -gt 0 ]; then
    echo "## 失败用例明细"
    echo ""
    while IFS= read -r f; do
      [ -n "$f" ] && echo "- $f"
    done < "$FAILED_CASES_FILE"
    echo ""
  fi
  echo "## GO/NO-GO 评估"
  echo ""
  if [ "$ALL_FAIL" -eq 0 ]; then
    echo "🟢 **GO** — 全部用例通过，可以进入阶段 6 上线 checklist。"
  elif [ "$ALL_FAIL" -le 3 ]; then
    echo "🟡 **CONDITIONAL GO** — $ALL_FAIL 个失败需审查；如均为非阻塞类（dev-warn / 数据洁净度），可继续。"
  else
    echo "🔴 **NO-GO** — $ALL_FAIL 个失败超过容忍阈值，需修复后重测。"
  fi
  echo ""
  echo "## 详细数据"
  echo ""
  echo "见 \`UAT_RESULT.csv\`（${TOTAL} 行用例数据）"
} > "$OUT_MD"

cyan ""
cyan "═══════════════════════════════════════════════════════════════════"
if [ "$ALL_FAIL" -eq 0 ]; then
  green "  ✅ UAT 全部 $ALL_PASS 项 PASS  (通过率 ${RATE}%)"
elif [ "$ALL_FAIL" -le 3 ]; then
  yellow "  🟡 UAT $ALL_PASS PASS / $ALL_FAIL FAIL / $ALL_BLOCKED BLOCKED  (通过率 ${RATE}%)"
else
  red "  ❌ UAT $ALL_PASS PASS / $ALL_FAIL FAIL / $ALL_BLOCKED BLOCKED  (通过率 ${RATE}%)"
fi
cyan "  报告: $OUT_MD"
cyan "  数据: $OUT_CSV"
cyan "═══════════════════════════════════════════════════════════════════"

exit $ALL_FAIL
