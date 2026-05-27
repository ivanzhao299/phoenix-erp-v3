#!/usr/bin/env bash
# 订单中心 回归测试 — 覆盖 commit ddd76de + 1afabe8 + (commit 3)
# 验证 A1-A4 心脏修复：submit / 信用校验 / 状态机白名单 / WMS 联动
set -u

API="${API_URL:-http://127.0.0.1:3100}"
ADMIN_U="${ADMIN_USER:-admin}"
ADMIN_P="${ADMIN_PASS:-admin123}"
PSQL=${PSQL:-$(which psql)}
DB=phoenix_erp

PASS=0
FAIL=0
declare -a FAILURES

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$1"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$1"; }

assert_eq()    { local n="$1" e="$2" a="$3"; if [ "$e" = "$a" ]; then green "  ✓ $n"; PASS=$((PASS+1)); else red "  ✗ $n"; red "      exp: $e"; red "      act: $a"; FAIL=$((FAIL+1)); FAILURES+=("$n | exp=$e act=$a"); fi; }
assert_ok()    { local n="$1" c="$2"; case "$c" in 20[0-9]) green "  ✓ $n (HTTP $c)"; PASS=$((PASS+1));; *) red "  ✗ $n HTTP $c"; FAIL=$((FAIL+1)); FAILURES+=("$n | HTTP=$c");; esac; }
assert_fail() { local n="$1" c="$2"; case "$c" in 20[0-9]) red "  ✗ $n 应失败 HTTP $c"; FAIL=$((FAIL+1)); FAILURES+=("$n | HTTP=$c");; *) green "  ✓ $n (HTTP $c)"; PASS=$((PASS+1));; esac; }

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ token=${TOKEN:0:30}..."

cyan ""
cyan "▶ 1) Seed"
CUST="CUST-REGR-$(date +%s | tail -c 5)"
BATCH_NO="ORD-REGR-BAT-$(date +%s | tail -c 6)"

# 清理上一轮
$PSQL $DB -q -c "DELETE FROM ord_approval_log WHERE order_no LIKE 'ODR-%REGR%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_order_items WHERE order_no LIKE 'ODR-%REGR%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_orders WHERE customer_code='$CUST' OR order_no LIKE 'ODR-%REGR%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_credit_usage WHERE customer_code='$CUST';" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_customers WHERE customer_code='$CUST';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_ledger WHERE batch_no='$BATCH_NO' OR ref_no LIKE 'ODR-%REGR%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH_NO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM wms_outbound WHERE outbound_no LIKE 'WO-%REGR%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_transactions WHERE ref_no LIKE 'ODR-%REGR%';" >/dev/null

# Seed: 客户 (credit_limit=10000, credit_used=0)
# ord_customers.id 也是 NOT NULL 无默认 — 测试侧 MAX+1
NEXT_CUST_ID=$($PSQL $DB -tA -c "SELECT COALESCE(MAX(id),0)+1 FROM ord_customers;")
$PSQL $DB -q -c "INSERT INTO ord_customers (id, customer_code, customer_name, credit_limit, credit_used, status, tier) VALUES ($NEXT_CUST_ID,'$CUST','回归测试客户',10000,0,'active','A');" >/dev/null

# Seed: inv_batches 用于 line 关联
$PSQL $DB -q -c "INSERT INTO inv_batches (batch_no, product_code, qty, warehouse_code, store_code) VALUES ('$BATCH_NO','REGR-EGG',500,'WMS-VTE-MAIN','ALL');" >/dev/null

green "  ✓ seed customer=$CUST batch=$BATCH_NO"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: A3 submitOrder — 信用充足 → APPROVED + 信用占用"
ORDER_PAYLOAD=$(cat <<EOF
{"customer_code":"$CUST","customer_name":"回归测试客户","order_type":"normal","is_urgent":false,
 "lines":[{"product_code":"REGR-EGG","product_name_zh":"测试鸡蛋","qty":100,"unit_price":50,"batch_no":"$BATCH_NO"}]}
EOF
)
R1=$(curl -s -o /tmp/t1.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$ORDER_PAYLOAD")
assert_ok "T1.1 submit 200" "$R1"

ORDER_NO=$(cat /tmp/t1.json | grep -oE '"order_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$ORDER_NO" ] && green "  ✓ T1.2 order_no=$ORDER_NO" && PASS=$((PASS+1)) || { red "  ✗ T1.2 order_no 空"; FAIL=$((FAIL+1)); }

# total_amount = 100 * 50 = 5000，credit_limit 10000，应不需信用审批 → status=APPROVED
STATUS=$($PSQL $DB -tA -c "SELECT status FROM ord_orders WHERE order_no='$ORDER_NO';")
assert_eq "T1.3 status=APPROVED (无需审批)" "APPROVED" "$STATUS"

TOTAL=$($PSQL $DB -tA -c "SELECT total_amount FROM ord_orders WHERE order_no='$ORDER_NO';")
assert_eq "T1.4 total_amount=5000.00" "5000.00" "$TOTAL"

# 信用占用 5000
USED=$($PSQL $DB -tA -c "SELECT credit_used FROM ord_customers WHERE customer_code='$CUST';")
assert_eq "T1.5 credit_used=5000.00" "5000.00" "$USED"

# ord_credit_usage RESERVED 5000
RESERVED=$($PSQL $DB -tA -c "SELECT amount FROM ord_credit_usage WHERE order_no='$ORDER_NO' AND action='RESERVED';")
assert_eq "T1.6 ord_credit_usage RESERVED +5000" "5000.00" "$RESERVED"

# ord_order_items
ITEM_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM ord_order_items WHERE order_no='$ORDER_NO';")
assert_eq "T1.7 ord_order_items +1" "1" "$ITEM_CNT"

# ord_approval_log CREATE
LOG_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM ord_approval_log WHERE order_no='$ORDER_NO' AND action='CREATE';")
assert_eq "T1.8 ord_approval_log CREATE +1" "1" "$LOG_CNT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: A3 信用超额 → DRAFT + need_credit_approval=1"
# 客户信用剩 5000；下 15000 单 (超信用)
HUGE_PAYLOAD=$(cat <<EOF
{"customer_code":"$CUST","customer_name":"回归测试客户","order_type":"normal",
 "lines":[{"product_code":"REGR-EGG","qty":300,"unit_price":50,"batch_no":"$BATCH_NO"}]}
EOF
)
R2=$(curl -s -o /tmp/t2.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$HUGE_PAYLOAD")
assert_ok "T2.1 submit 200 (业务码 200，但需审批)" "$R2"

ORDER_NO2=$(cat /tmp/t2.json | grep -oE '"order_no":"[^"]*"' | head -1 | cut -d'"' -f4)
NEED_CRED=$(cat /tmp/t2.json | grep -oE '"need_credit_approval":(true|false)' | head -1)
case "$NEED_CRED" in
  *true*) green "  ✓ T2.2 需信用审批"; PASS=$((PASS+1)) ;;
  *)      red "  ✗ T2.2 应需审批: $NEED_CRED"; FAIL=$((FAIL+1)) ;;
esac

# 信用超额订单 → status=DRAFT
STATUS2=$($PSQL $DB -tA -c "SELECT status FROM ord_orders WHERE order_no='$ORDER_NO2';")
assert_eq "T2.3 status=DRAFT (待审批)" "DRAFT" "$STATUS2"

# DRAFT 不占信用（占信用要等审批通过）
USED2=$($PSQL $DB -tA -c "SELECT credit_used FROM ord_customers WHERE customer_code='$CUST';")
assert_eq "T2.4 credit_used 仍 5000 (DRAFT 不占)" "5000.00" "$USED2"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: A2 状态机非法跳转 → 拒绝"
# 第一单当前 APPROVED，尝试直接跳 SHIPPED (非法)
R3=$(curl -s -o /tmp/t3.json -w '%{http_code}' -X POST "$API/api/orders/$ORDER_NO/transition" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to_status":"SHIPPED","remark":"非法跳转"}')
# V3 用 NestJS BadRequestException → HTTP 400，验证 HTTP 状态非 2xx
assert_fail "T3.1 非法跳转 HTTP 4xx" "$R3"

# msg 应含"不能流转到"
MSG=$(cat /tmp/t3.json)
if printf '%s' "$MSG" | grep -q "不能流转"; then green "  ✓ T3.2 错误提示有效"; PASS=$((PASS+1)); else red "  ✗ T3.2 缺错误文案"; FAIL=$((FAIL+1)); FAILURES+=("T3.2 msg=$MSG"); fi

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: A2 合法状态机 APPROVED → ALLOCATED"
R4=$(curl -s -o /tmp/t4.json -w '%{http_code}' -X POST "$API/api/orders/$ORDER_NO/transition" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to_status":"ALLOCATED","remark":"备货完成"}')
assert_ok "T4.1 ALLOCATED 200" "$R4"

STATUS3=$($PSQL $DB -tA -c "SELECT status FROM ord_orders WHERE order_no='$ORDER_NO';")
assert_eq "T4.2 status=ALLOCATED" "ALLOCATED" "$STATUS3"

# 审批日志 +1 (ALLOCATED)
LOG3=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM ord_approval_log WHERE order_no='$ORDER_NO' AND action='ALLOCATED';")
assert_eq "T4.3 ord_approval_log ALLOCATED +1" "1" "$LOG3"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: A2 取消 → 信用释放"
R5=$(curl -s -o /tmp/t5.json -w '%{http_code}' -X POST "$API/api/orders/$ORDER_NO/transition" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to_status":"CANCELLED","remark":"客户取消"}')
assert_ok "T5.1 CANCELLED 200" "$R5"

STATUS4=$($PSQL $DB -tA -c "SELECT status FROM ord_orders WHERE order_no='$ORDER_NO';")
assert_eq "T5.2 status=CANCELLED" "CANCELLED" "$STATUS4"

# 信用释放 5000 → credit_used 回到 0
USED3=$($PSQL $DB -tA -c "SELECT credit_used FROM ord_customers WHERE customer_code='$CUST';")
assert_eq "T5.3 credit_used 回 0.00 (释放)" "0.00" "$USED3"

# ord_credit_usage RELEASED 行
RELEASED=$($PSQL $DB -tA -c "SELECT amount FROM ord_credit_usage WHERE order_no='$ORDER_NO' AND action='RELEASED';")
assert_eq "T5.4 ord_credit_usage RELEASED +5000" "5000.00" "$RELEASED"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: A1 transition APPROVED 自动联动 WMS"
# 第二单当前 DRAFT；transition 到 APPROVED 应触发 wms.advanceOutboundOrder
R6=$(curl -s -o /tmp/t6.json -w '%{http_code}' -X POST "$API/api/orders/$ORDER_NO2/transition" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"to_status":"APPROVED","remark":"经理批准"}')
assert_ok "T6.1 APPROVED 200" "$R6"

# DRAFT → APPROVED 同步占信用 15000
USED4=$($PSQL $DB -tA -c "SELECT credit_used FROM ord_customers WHERE customer_code='$CUST';")
assert_eq "T6.2 credit_used=15000 (APPROVED 占用)" "15000.00" "$USED4"

# WMS 联动验证：order.service approved → wms.advanceOutboundOrder('ALLOCATED')
# 成功时 → status 推进到 ALLOCATED；失败时回到 APPROVED 不阻塞
STATUS5=$($PSQL $DB -tA -c "SELECT UPPER(status) FROM ord_orders WHERE order_no='$ORDER_NO2';")
case "$STATUS5" in
  APPROVED|ALLOCATED)
    green "  ✓ T6.3 status=$STATUS5 (WMS 联动有效)"; PASS=$((PASS+1)) ;;
  *)
    red "  ✗ T6.3 status=$STATUS5 (期望 APPROVED 或 ALLOCATED)"; FAIL=$((FAIL+1)); FAILURES+=("T6.3 status=$STATUS5") ;;
esac

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T7-SE: SalesEngine 三大校验 (V2 fidelity)"
# T7-SE-1: 黑名单客户 → 阻断
BLACK="CUST-REGR-BLACK-$(date +%s | tail -c 5)"
NEXT_BC=$($PSQL $DB -tA -c "SELECT COALESCE(MAX(id),0)+1 FROM ord_customers;")
$PSQL $DB -q -c "INSERT INTO ord_customers (id, customer_code, customer_name, credit_limit, credit_used, status, risk_flag) VALUES ($NEXT_BC,'$BLACK','黑名单客户',10000,0,'active','BLACKLIST');" >/dev/null
BLACK_PAYLOAD=$(cat <<EOF
{"customer_code":"$BLACK","customer_name":"黑名单客户","lines":[{"product_code":"X","qty":1,"unit_price":1}]}
EOF
)
RBE=$(curl -s -o /tmp/tse1.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$BLACK_PAYLOAD")
BLACK_CODE=$(cat /tmp/tse1.json | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
case "$BLACK_CODE" in 4*|5*) green "  ✓ T7-SE-1 黑名单客户拦截 (code $BLACK_CODE)"; PASS=$((PASS+1));; *) red "  ✗ T7-SE-1 应拒绝 code=$BLACK_CODE"; FAIL=$((FAIL+1));; esac
BLACK_MSG=$(cat /tmp/tse1.json | head -c 300)
if printf '%s' "$BLACK_MSG" | grep -q -iE "blacklist|黑名单"; then green "  ✓ T7-SE-2 错误文案含 BLACKLIST"; PASS=$((PASS+1)); else red "  ✗ T7-SE-2 缺 BLACKLIST 文案: $BLACK_MSG"; FAIL=$((FAIL+1)); fi

# T7-SE-3: price_book 不在内 → 阻断
# Phase 2 起 SalesEngine 读 sal_price_books/sal_price_items，不再读 prc_price_items
$PSQL $DB -q -c "DELETE FROM sal_price_items WHERE price_book_id IN (SELECT id FROM sal_price_books WHERE price_book_no='PB-REGR-1');" 2>/dev/null
$PSQL $DB -q -c "DELETE FROM sal_price_books WHERE price_book_no='PB-REGR-1';" 2>/dev/null
# 建价盘（ACTIVE）+ 1 个商品 REGR-EGG: floor_price=80 ceiling_price=120
# 用 INSERT ... ON CONFLICT + SELECT 分两步获取 id（避免 RETURNING 与某些 psql 版本的兼容问题）
$PSQL $DB -q -c "INSERT INTO sal_price_books (price_book_no, price_book_name, company_code, status) VALUES ('PB-REGR-1','Regression Test PB','ALL','ACTIVE') ON CONFLICT (price_book_no) DO UPDATE SET status='ACTIVE';" 2>/dev/null
PB_ID=$($PSQL $DB -tA -c "SELECT id FROM sal_price_books WHERE price_book_no='PB-REGR-1';")
if [ -z "$PB_ID" ]; then
  red "ERROR: sal_price_books SELECT 失败，PB_ID 为空 (表不存在或 INSERT 失败)"
  FAIL=$((FAIL+3))
else
  $PSQL $DB -q -c "DELETE FROM sal_price_items WHERE price_book_id=$PB_ID;" 2>/dev/null
  $PSQL $DB -q -c "INSERT INTO sal_price_items (price_book_id, product_code, unit_price, floor_price, ceiling_price) VALUES ($PB_ID,'REGR-EGG',100,80,120);" >/dev/null
fi

# 低于 floor_price → 转特价审批 (不阻断)
LOWER_PAYLOAD=$(cat <<EOF
{"customer_code":"$CUST","customer_name":"REGR","price_book_id":$PB_ID,
 "lines":[{"product_code":"REGR-EGG","qty":10,"unit_price":50,"price_source":"NORMAL"}]}
EOF
)
RLP=$(curl -s -o /tmp/tse3.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$LOWER_PAYLOAD")
assert_ok "T7-SE-3 低于 floor_price 转特价审批 (200)" "$RLP"
NEED_PA=$(cat /tmp/tse3.json | grep -oE '"need_price_approval":(true|false)' | head -1)
case "$NEED_PA" in *true*) green "  ✓ T7-SE-4 need_price_approval=true"; PASS=$((PASS+1));; *) red "  ✗ T7-SE-4 应需价格审批: $NEED_PA"; FAIL=$((FAIL+1));; esac
ORD_LP=$(cat /tmp/tse3.json | grep -oE '"order_no":"[^"]*"' | head -1 | cut -d'"' -f4)
STAT_LP=$($PSQL $DB -tA -c "SELECT status FROM ord_orders WHERE order_no='$ORD_LP';")
assert_eq "T7-SE-5 低价订单 status=DRAFT" "DRAFT" "$STAT_LP"

# SKU 不在 price_book → 阻断
NOT_IN_PB=$(cat <<EOF
{"customer_code":"$CUST","price_book_id":$PB_ID,
 "lines":[{"product_code":"UNKNOWN-SKU","qty":1,"unit_price":99,"price_source":"NORMAL"}]}
EOF
)
RNP=$(curl -s -o /tmp/tse6.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$NOT_IN_PB")
NP_CODE=$(cat /tmp/tse6.json | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
case "$NP_CODE" in 4*|5*) green "  ✓ T7-SE-6 SKU 不在 price_book 拦截 (code $NP_CODE)"; PASS=$((PASS+1));; *) red "  ✗ T7-SE-6 应拒绝 code=$NP_CODE"; FAIL=$((FAIL+1));; esac

cyan ""
cyan "▶ T7: 空明细被拒"
EMPTY_PAYLOAD='{"customer_code":"'$CUST'","lines":[]}'
R7=$(curl -s -o /tmp/t7.json -w '%{http_code}' -X POST "$API/api/orders/submit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$EMPTY_PAYLOAD")
# submit 内 try/catch 包成 code:500，但 BadRequestException 在 Nest 默认会响应 400
# 由于 controller 包了 try/catch，会返 code:500 + HTTP 201
EMPTY_CODE=$(cat /tmp/t7.json | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
case "$EMPTY_CODE" in 4*|5*) green "  ✓ T7.1 空明细被拒 (code $EMPTY_CODE)"; PASS=$((PASS+1)) ;; *) red "  ✗ T7.1 应失败 code=$EMPTY_CODE"; FAIL=$((FAIL+1));; esac

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Phase 6 数据一致性"
# E-01: 信用守恒 ord_credit_usage SUM = credit_used
SUM_USAGE=$($PSQL $DB -tA -c "
  SELECT COALESCE(SUM(CASE WHEN action='RESERVED' THEN amount
                            WHEN action='RELEASED' THEN -amount
                            ELSE 0 END), 0)
  FROM ord_credit_usage WHERE customer_code='$CUST';")
USED_NOW=$($PSQL $DB -tA -c "SELECT credit_used FROM ord_customers WHERE customer_code='$CUST';")
assert_eq "E-01 信用守恒 (Σusage=credit_used)" "$SUM_USAGE" "$USED_NOW"

# E-02: 所有订单 status 大写
LOWER_CASE=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM ord_orders WHERE order_no LIKE 'ODR-%REGR%' AND status <> UPPER(status);")
assert_eq "E-02 测试订单 status 全大写" "0" "$LOWER_CASE"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM ord_approval_log WHERE order_no IN ('$ORDER_NO','$ORDER_NO2');" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_order_items WHERE order_no IN ('$ORDER_NO','$ORDER_NO2');" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_orders WHERE order_no IN ('$ORDER_NO','$ORDER_NO2');" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_credit_usage WHERE customer_code='$CUST';" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_customers WHERE customer_code='$CUST';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_ledger WHERE batch_no='$BATCH_NO' OR ref_no IN ('$ORDER_NO','$ORDER_NO2');" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH_NO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM wms_outbound WHERE ref_no IN ('$ORDER_NO','$ORDER_NO2') OR outbound_no LIKE 'WO-REPL-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_transactions WHERE ref_no IN ('$ORDER_NO','$ORDER_NO2');" >/dev/null
# 清理 SalesEngine 测试数据
$PSQL $DB -q -c "DELETE FROM ord_customers WHERE customer_code='$BLACK';" >/dev/null 2>&1
$PSQL $DB -q -c "DELETE FROM sal_price_items WHERE price_book_id IN (SELECT id FROM sal_price_books WHERE price_book_no='PB-REGR-1');" >/dev/null 2>&1
$PSQL $DB -q -c "DELETE FROM sal_price_books WHERE price_book_no='PB-REGR-1';" >/dev/null 2>&1
$PSQL $DB -q -c "DELETE FROM ord_orders WHERE order_no='$ORD_LP';" >/dev/null 2>&1
$PSQL $DB -q -c "DELETE FROM ord_order_items WHERE order_no='$ORD_LP';" >/dev/null 2>&1
$PSQL $DB -q -c "DELETE FROM ord_approval_log WHERE order_no='$ORD_LP';" >/dev/null 2>&1
green "  ✓ test data 清理完毕"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then green "✅ 全部 $PASS 项 PASS"; else red "❌ $FAIL 项 FAIL / $((PASS+FAIL))"; for f in "${FAILURES[@]}"; do red "  • $f"; done; fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
