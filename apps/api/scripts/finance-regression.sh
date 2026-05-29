#!/usr/bin/env bash
# Finance V2 Runtime 回归测试 — AP/AR/Expense/Reports
# 覆盖：Finance V2 Runtime（fin_ap_invoices / fin_ar_invoices / fin_ar_receipts / fin_expense_requests）
# 迁移说明：原 V1 /api/finance/* 端点已于 Runtime Cutover Phase 2A 删除，本脚本改为测试 V2 端点。
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

assert_eq()  { local n="$1" e="$2" a="$3"; if [ "$e" = "$a" ]; then green "  ✓ $n"; PASS=$((PASS+1)); else red "  ✗ $n"; red "      expected: $e"; red "      actual:   $a"; FAIL=$((FAIL+1)); FAILURES+=("$n | exp=$e act=$a"); fi; }
assert_ok()  { local n="$1" c="$2"; case "$c" in 20[0-9]) green "  ✓ $n (HTTP $c)"; PASS=$((PASS+1));; *) red "  ✗ $n HTTP $c"; FAIL=$((FAIL+1)); FAILURES+=("$n | HTTP=$c");; esac; }

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ token=${TOKEN:0:30}..."

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Seed — 清理旧测试数据"
CO="REGR-FIN-CO"

$PSQL $DB -q -c "DELETE FROM fin_ar_receipt_allocations WHERE receipt_id IN (SELECT id FROM fin_ar_receipts WHERE company_code='$CO');" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_ar_receipts WHERE company_code='$CO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_ar_invoices WHERE company_code='$CO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_ap_invoices WHERE company_code='$CO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_expense_requests WHERE company_code='$CO';" >/dev/null

green "  ✓ seed 清理完毕 company_code=$CO"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: AP Invoice 创建 (V2 POST /api/v2/finance/ap/invoices)"
R1=$(curl -s -o /tmp/fin_t1.json -w '%{http_code}' -X POST "$API/api/v2/finance/ap/invoices" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"companyCode\":\"$CO\",\"supplierName\":\"测试供应商\",\"currencyCode\":\"CNY\",\"amountOriginal\":3000,\"remark\":\"REGR-FIN AP\"}")
assert_ok "T1.1 createApInvoice 200" "$R1"

AP_NO=$(cat /tmp/fin_t1.json | grep -oE '"ap_no":"[^"]*"' | head -1 | cut -d'"' -f4)
# grep 同时兼容 "id":1（数字）和 "id":"1"（字符串，bigint 序列化产物），无需 jq
AP_ID=$(grep -oE '"id":"?[0-9]+"?' /tmp/fin_t1.json | head -1 | grep -oE '[0-9]+')
[ -n "$AP_NO" ] && green "  ✓ T1.1.1 ap_no=$AP_NO" && PASS=$((PASS+1)) || { red "  ✗ T1.1.1 missing ap_no (resp: $(cat /tmp/fin_t1.json | head -c 200))"; FAIL=$((FAIL+1)); FAILURES+=("T1.1.1"); }

AP_STATUS=$($PSQL $DB -tA -c "SELECT payment_status FROM fin_ap_invoices WHERE ap_no='$AP_NO';")
assert_eq "T1.2 fin_ap_invoices.payment_status=UNPAID" "UNPAID" "$AP_STATUS"
AP_AMT=$($PSQL $DB -tA -c "SELECT amount_original::int FROM fin_ap_invoices WHERE ap_no='$AP_NO';")
assert_eq "T1.3 fin_ap_invoices.amount_original=3000" "3000" "$AP_AMT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: AP Invoice 取消 (V2 POST /api/v2/finance/ap/invoices/:id/cancel)"
R2=$(curl -s -o /tmp/fin_t2.json -w '%{http_code}' -X POST "$API/api/v2/finance/ap/invoices/$AP_ID/cancel" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"回归测试清理"}')
assert_ok "T2.1 cancelApInvoice 200" "$R2"

AP_STATUS_AFTER=$($PSQL $DB -tA -c "SELECT status FROM fin_ap_invoices WHERE ap_no='$AP_NO';")
assert_eq "T2.2 fin_ap_invoices.status=CANCELLED" "CANCELLED" "$AP_STATUS_AFTER"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: AP Aging 接口 (V2 GET /api/v2/finance/ap/aging)"
R3=$(curl -s -o /tmp/fin_t3.json -w '%{http_code}' \
  "$API/api/v2/finance/ap/aging" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T3.1 ap-aging 200" "$R3"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: AR Invoice 创建 (V2 POST /api/v2/finance/ar/invoices)"
R4=$(curl -s -o /tmp/fin_t4.json -w '%{http_code}' -X POST "$API/api/v2/finance/ar/invoices" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"companyCode\":\"$CO\",\"customerName\":\"测试客户\",\"customerCode\":\"REGR-CUST\",\"currencyCode\":\"CNY\",\"amountOriginal\":500,\"remark\":\"REGR-FIN AR\"}")
assert_ok "T4.1 createArInvoice 200" "$R4"

AR_NO=$(cat /tmp/fin_t4.json | grep -oE '"ar_no":"[^"]*"' | head -1 | cut -d'"' -f4)
AR_ID=$(grep -oE '"id":"?[0-9]+"?' /tmp/fin_t4.json | head -1 | grep -oE '[0-9]+')
[ -n "$AR_NO" ] && green "  ✓ T4.1.1 ar_no=$AR_NO" && PASS=$((PASS+1)) || { red "  ✗ T4.1.1 missing ar_no (resp: $(cat /tmp/fin_t4.json | head -c 200))"; FAIL=$((FAIL+1)); FAILURES+=("T4.1.1"); }

AR_COLL=$($PSQL $DB -tA -c "SELECT collection_status FROM fin_ar_invoices WHERE ar_no='$AR_NO';")
assert_eq "T4.2 fin_ar_invoices.collection_status=UNRECEIVED" "UNRECEIVED" "$AR_COLL"
AR_AMT=$($PSQL $DB -tA -c "SELECT amount_original::int FROM fin_ar_invoices WHERE ar_no='$AR_NO';")
assert_eq "T4.3 fin_ar_invoices.amount_original=500" "500" "$AR_AMT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: AR 收款草稿 (V2 POST /api/v2/finance/ar/receipts)"
TODAY=$(date +%Y-%m-%d)
R5=$(curl -s -o /tmp/fin_t5.json -w '%{http_code}' -X POST "$API/api/v2/finance/ar/receipts" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"companyCode\":\"$CO\",\"customerName\":\"测试客户\",\"customerCode\":\"REGR-CUST\",\"receiptDate\":\"$TODAY\",\"currencyCode\":\"CNY\",\"amountOriginal\":500,\"remark\":\"REGR-FIN receipt\"}")
assert_ok "T5.1 createArReceipt 200" "$R5"

RECEIPT_ID=$(grep -oE '"id":"?[0-9]+"?' /tmp/fin_t5.json | head -1 | grep -oE '[0-9]+')
RECEIPT_NO=$(cat /tmp/fin_t5.json | grep -oE '"receipt_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$RECEIPT_ID" ] && green "  ✓ T5.1.1 receipt_id=$RECEIPT_ID" && PASS=$((PASS+1)) || { red "  ✗ T5.1.1 missing receipt id (resp: $(cat /tmp/fin_t5.json | head -c 200))"; FAIL=$((FAIL+1)); FAILURES+=("T5.1.1"); }

RECEIPT_STATUS=$($PSQL $DB -tA -c "SELECT status FROM fin_ar_receipts WHERE id=$RECEIPT_ID;")
assert_eq "T5.2 fin_ar_receipts.status=DRAFT" "DRAFT" "$RECEIPT_STATUS"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: AR 收款确认 + AR 核销 (V2 POST /api/v2/finance/ar/receipts/:id/confirm)"
R6=$(curl -s -o /tmp/fin_t6.json -w '%{http_code}' -X POST "$API/api/v2/finance/ar/receipts/$RECEIPT_ID/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"allocations\":[{\"arInvoiceId\":\"$AR_ID\",\"allocatedAmountOriginal\":500}]}")
assert_ok "T6.1 confirmArReceipt 200" "$R6"

RECEIPT_CONFIRMED=$($PSQL $DB -tA -c "SELECT status FROM fin_ar_receipts WHERE id=$RECEIPT_ID;")
assert_eq "T6.2 fin_ar_receipts.status=CONFIRMED" "CONFIRMED" "$RECEIPT_CONFIRMED"
AR_COLL_AFTER=$($PSQL $DB -tA -c "SELECT collection_status FROM fin_ar_invoices WHERE ar_no='$AR_NO';")
assert_eq "T6.3 fin_ar_invoices.collection_status=RECEIVED (全额核销)" "RECEIVED" "$AR_COLL_AFTER"
ALLOC_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM fin_ar_receipt_allocations WHERE receipt_id=$RECEIPT_ID;")
assert_eq "T6.4 fin_ar_receipt_allocations 1 行" "1" "$ALLOC_CNT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T7: AR Aging 接口 (V2 GET /api/v2/finance/ar/aging)"
R7=$(curl -s -o /tmp/fin_t7.json -w '%{http_code}' \
  "$API/api/v2/finance/ar/aging" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T7.1 ar-aging 200" "$R7"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T8: 费用申请 创建 (V2 POST /api/v2/finance/expenses)"
R8=$(curl -s -o /tmp/fin_t8.json -w '%{http_code}' -X POST "$API/api/v2/finance/expenses" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"companyCode\":\"$CO\",\"expenseType\":\"OFFICE\",\"currencyCode\":\"CNY\",\"amountOriginal\":200,\"description\":\"REGR-FIN expense test\"}")
assert_ok "T8.1 createExpenseRequest 200" "$R8"

EXP_ID=$(grep -oE '"id":"?[0-9]+"?' /tmp/fin_t8.json | head -1 | grep -oE '[0-9]+')
EXP_NO=$(cat /tmp/fin_t8.json | grep -oE '"expense_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$EXP_ID" ] && green "  ✓ T8.1.1 expense_id=$EXP_ID" && PASS=$((PASS+1)) || { red "  ✗ T8.1.1 missing expense id (resp: $(cat /tmp/fin_t8.json | head -c 200))"; FAIL=$((FAIL+1)); FAILURES+=("T8.1.1"); }

EXP_STATUS=$($PSQL $DB -tA -c "SELECT status FROM fin_expense_requests WHERE id=$EXP_ID;")
assert_eq "T8.2 fin_expense_requests.status=DRAFT" "DRAFT" "$EXP_STATUS"
EXP_AMT=$($PSQL $DB -tA -c "SELECT amount_original::int FROM fin_expense_requests WHERE id=$EXP_ID;")
assert_eq "T8.3 fin_expense_requests.amount_original=200" "200" "$EXP_AMT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T9: 费用申请 取消 (V2 POST /api/v2/finance/expenses/:id/cancel)"
R9=$(curl -s -o /tmp/fin_t9.json -w '%{http_code}' -X POST "$API/api/v2/finance/expenses/$EXP_ID/cancel" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"回归测试取消"}')
assert_ok "T9.1 cancelExpenseRequest 200" "$R9"

EXP_CANCELLED=$($PSQL $DB -tA -c "SELECT status FROM fin_expense_requests WHERE id=$EXP_ID;")
assert_eq "T9.2 fin_expense_requests.status=CANCELLED" "CANCELLED" "$EXP_CANCELLED"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T10: AR 汇总统计 (V2 GET /api/v2/finance/ar/summary)"
R10=$(curl -s -o /tmp/fin_t10.json -w '%{http_code}' \
  "$API/api/v2/finance/ar/summary" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T10.1 ar-summary 200" "$R10"

cyan ""
cyan "▶ T11: AP 汇总统计 (V2 GET /api/v2/finance/ap/summary)"
R11=$(curl -s -o /tmp/fin_t11.json -w '%{http_code}' \
  "$API/api/v2/finance/ap/summary" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T11.1 ap-summary 200" "$R11"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM fin_ar_receipt_allocations WHERE receipt_id IN (SELECT id FROM fin_ar_receipts WHERE company_code='$CO');" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_ar_receipts WHERE company_code='$CO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_ar_invoices WHERE company_code='$CO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_ap_invoices WHERE company_code='$CO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_expense_requests WHERE company_code='$CO';" >/dev/null
green "  ✓ test data 清理完毕 (company_code=$CO)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then green "✅ 全部 $PASS 项 PASS"; else red "❌ $FAIL 项 FAIL / $((PASS+FAIL))"; for f in "${FAILURES[@]}"; do red "  • $f"; done; fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
