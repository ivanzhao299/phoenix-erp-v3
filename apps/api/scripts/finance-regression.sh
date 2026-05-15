#!/usr/bin/env bash
# Finance V2 fidelity 回归测试 — AR/AP/aging/3 级审批
# 覆盖：commit v3-finance-done
set -u

API="${API_URL:-http://127.0.0.1:3100}"
ADMIN_U="${ADMIN_USER:-admin}"
ADMIN_P="${ADMIN_PASS:-admin123}"
PSQL=/Applications/Postgres.app/Contents/Versions/18/bin/psql
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
cyan "▶ Seed"
PO_NO="PO-REGR-FIN-$(date +%s | tail -c 6)"
PO_NO2="PO-REGR-FIN-2-$(date +%s | tail -c 6)"
CUST_CODE="CUST-FIN-$(date +%s | tail -c 5)"
ACC="CASH-CNY"

$PSQL $DB -q -c "DELETE FROM fin_invoices WHERE invoice_no LIKE 'AP-%' AND ref_no LIKE 'PO-REGR-FIN-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_transactions WHERE ref_no LIKE 'PO-REGR-FIN-%' OR ref_no LIKE 'AP-%' OR txn_no LIKE 'EXP-FIN-%' OR txn_no LIKE 'INC-FIN-%' OR note LIKE 'REGR-FIN %';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_accounts WHERE account_code='$ACC';" >/dev/null
$PSQL $DB -q -c "INSERT INTO fin_accounts (account_code, account_name, currency, balance, status) VALUES ('$ACC','测试现金账户','CNY',10000,'ACTIVE') ON CONFLICT (account_code) DO UPDATE SET balance=EXCLUDED.balance, status='ACTIVE';" >/dev/null

green "  ✓ seed PO=$PO_NO 账户=$ACC 余额=10000"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: AP 凭证生成 (V2 /ap-invoice)"
R1=$(curl -s -o /tmp/fin_t1.json -w '%{http_code}' -X POST "$API/api/finance/ap-invoice" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"po_no\":\"$PO_NO\",\"supplier\":\"测试供应商\",\"amount\":3000,\"item\":\"测试货物\",\"due_days\":30}")
assert_ok "T1.1 createApInvoice 200" "$R1"
INV_NO=$(cat /tmp/fin_t1.json | grep -oE '"invoice_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$INV_NO" ] && green "  ✓ T1.1.1 invoice_no=$INV_NO" && PASS=$((PASS+1)) || { red "  ✗ T1.1.1 missing invoice_no"; FAIL=$((FAIL+1)); FAILURES+=("T1.1.1"); }

INV_STATUS=$($PSQL $DB -tA -c "SELECT status FROM fin_invoices WHERE invoice_no='$INV_NO';")
assert_eq "T1.2 fin_invoices.status=UNPAID" "UNPAID" "$INV_STATUS"
INV_AMT=$($PSQL $DB -tA -c "SELECT amount::int FROM fin_invoices WHERE invoice_no='$INV_NO';")
assert_eq "T1.3 fin_invoices.amount=3000" "3000" "$INV_AMT"

# fin_transactions 同步写一条 AP-TRADE DEBIT
TXN_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM fin_transactions WHERE ref_no='$INV_NO' AND account_code='AP-TRADE' AND type='DEBIT';")
assert_eq "T1.4 fin_transactions AP-TRADE DEBIT +1" "1" "$TXN_CNT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: AP 凭证幂等 (同 po_no 重复请求)"
R2=$(curl -s -o /tmp/fin_t2.json -w '%{http_code}' -X POST "$API/api/finance/ap-invoice" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"po_no\":\"$PO_NO\",\"supplier\":\"测试供应商\",\"amount\":3000}")
assert_ok "T2.1 重复 ap-invoice 200" "$R2"
SKIP_FLAG=$(cat /tmp/fin_t2.json | grep -oE '"skipped":true')
[ -n "$SKIP_FLAG" ] && green "  ✓ T2.2 skipped=true" && PASS=$((PASS+1)) || { red "  ✗ T2.2 missing skipped"; FAIL=$((FAIL+1)); FAILURES+=("T2.2"); }
DUP_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM fin_invoices WHERE ref_no='$PO_NO';")
assert_eq "T2.3 仍仅 1 张凭证 (无重复)" "1" "$DUP_CNT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: AP 付款核销 (V2 /ap-payment)"
# 先付 1000 (部分)
R3=$(curl -s -o /tmp/fin_t3.json -w '%{http_code}' -X POST "$API/api/finance/ap-payment" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"invoice_no\":\"$INV_NO\",\"paid_amount\":1000}")
assert_ok "T3.1 ap-payment 1000 200" "$R3"
PAID_AFTER=$($PSQL $DB -tA -c "SELECT paid_amount::int FROM fin_invoices WHERE invoice_no='$INV_NO';")
assert_eq "T3.2 paid_amount=1000" "1000" "$PAID_AFTER"
STATUS_AFTER=$($PSQL $DB -tA -c "SELECT status FROM fin_invoices WHERE invoice_no='$INV_NO';")
assert_eq "T3.3 status=PARTIAL" "PARTIAL" "$STATUS_AFTER"

# 再付 2000 (剩余)
R3B=$(curl -s -o /tmp/fin_t3b.json -w '%{http_code}' -X POST "$API/api/finance/ap-payment" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"invoice_no\":\"$INV_NO\",\"paid_amount\":2000}")
assert_ok "T3.4 ap-payment 2000 (剩余) 200" "$R3B"
STATUS_FULL=$($PSQL $DB -tA -c "SELECT status FROM fin_invoices WHERE invoice_no='$INV_NO';")
assert_eq "T3.5 status=PAID" "PAID" "$STATUS_FULL"

# fin_transactions 应有 2 条 CREDIT (付款)
PAY_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM fin_transactions WHERE ref_no='$INV_NO' AND account_code='AP-TRADE' AND type='CREDIT';")
assert_eq "T3.6 fin_transactions CREDIT 2 行" "2" "$PAY_CNT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: 登记收入 / AR 自动核销 (V2 /income POST)"
# 先建一个测试订单（不存在则 ord_orders 写入会被忽略，主流程仍通过）
ORD_NO="ORD-REGR-FIN-$(date +%s | tail -c 5)"
$PSQL $DB -q -c "INSERT INTO ord_orders (order_no, customer_code, total_amount, paid_amount, status, created_at, updated_at) VALUES ('$ORD_NO','$CUST_CODE',500,0,'received',now(),now()) ON CONFLICT DO NOTHING;" >/dev/null

R4=$(curl -s -o /tmp/fin_t4.json -w '%{http_code}' -X POST "$API/api/finance/income" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"account_code\":\"$ACC\",\"amount\":500,\"ref_no\":\"$ORD_NO\",\"note\":\"REGR-FIN income\"}")
assert_ok "T4.1 register income 200" "$R4"

# fin_accounts 余额 +500
BAL=$($PSQL $DB -tA -c "SELECT balance::int FROM fin_accounts WHERE account_code='$ACC';")
assert_eq "T4.2 fin_accounts 余额 10000+500=10500" "10500" "$BAL"

# ord_orders.paid_amount 自动核销
ORD_PAID=$($PSQL $DB -tA -c "SELECT paid_amount::int FROM ord_orders WHERE order_no='$ORD_NO';")
assert_eq "T4.3 ord_orders.paid_amount=500 (自动核销)" "500" "$ORD_PAID"

# fin_transactions 新流水 CREDIT COMPLETED
INC_TXN=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM fin_transactions WHERE ref_no='$ORD_NO' AND type='CREDIT' AND status='COMPLETED';")
assert_eq "T4.4 fin_transactions INCOME CREDIT 1 行" "1" "$INC_TXN"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: 三级费用审批链 (FARM_MGR → REGION_MGR → CEO)"
# admin (ROLE_ADMIN) 跨级审批：单次 approve-chain 自动推进各级
EXP_TXN="EXP-FIN-$(date +%s | tail -c 6)"
$PSQL $DB -q -c "INSERT INTO fin_transactions (txn_no, transaction_no, type, amount, account_code, status, operator, note, created_at) VALUES ('$EXP_TXN','$EXP_TXN','EXPENSE',200,'$ACC','PENDING','test','REGR-FIN expense',now());" >/dev/null

# admin 第一次 approve-chain → 应推进到 approved_by_mgr
R5A=$(curl -s -o /tmp/fin_t5a.json -w '%{http_code}' -X POST "$API/api/finance/expense/$EXP_TXN/approve-chain" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"action":"APPROVE","comment":"第一级"}')
assert_ok "T5.1 admin approve L1 200" "$R5A"
MGR_VAL=$($PSQL $DB -tA -c "SELECT approved_by_mgr FROM fin_transactions WHERE txn_no='$EXP_TXN';")
[ "$MGR_VAL" = "admin" ] && green "  ✓ T5.1.1 approved_by_mgr=admin" && PASS=$((PASS+1)) || { red "  ✗ T5.1.1 approved_by_mgr='$MGR_VAL'"; FAIL=$((FAIL+1)); FAILURES+=("T5.1.1"); }

# admin 第二次 approve-chain → 推进到 approved_by_gm
R5B=$(curl -s -o /tmp/fin_t5b.json -w '%{http_code}' -X POST "$API/api/finance/expense/$EXP_TXN/approve-chain" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"action":"APPROVE","comment":"第二级"}')
assert_ok "T5.2 admin approve L2 200" "$R5B"
GM_VAL=$($PSQL $DB -tA -c "SELECT approved_by_gm FROM fin_transactions WHERE txn_no='$EXP_TXN';")
[ "$GM_VAL" = "admin" ] && green "  ✓ T5.2.1 approved_by_gm=admin" && PASS=$((PASS+1)) || { red "  ✗ T5.2.1 approved_by_gm='$GM_VAL'"; FAIL=$((FAIL+1)); FAILURES+=("T5.2.1"); }

# admin 第三次 approve-chain → 最终 COMPLETED + 余额扣减
R5C=$(curl -s -o /tmp/fin_t5c.json -w '%{http_code}' -X POST "$API/api/finance/expense/$EXP_TXN/approve-chain" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"action":"APPROVE","comment":"第三级"}')
assert_ok "T5.3 admin approve L3 (COMPLETED) 200" "$R5C"
TXN_STATUS=$($PSQL $DB -tA -c "SELECT status FROM fin_transactions WHERE txn_no='$EXP_TXN';")
assert_eq "T5.3.1 fin_transactions.status=COMPLETED" "COMPLETED" "$TXN_STATUS"
CEO_VAL=$($PSQL $DB -tA -c "SELECT approved_by_ceo FROM fin_transactions WHERE txn_no='$EXP_TXN';")
[ "$CEO_VAL" = "admin" ] && green "  ✓ T5.3.2 approved_by_ceo=admin" && PASS=$((PASS+1)) || { red "  ✗ T5.3.2"; FAIL=$((FAIL+1)); FAILURES+=("T5.3.2"); }
BAL_FINAL=$($PSQL $DB -tA -c "SELECT balance::int FROM fin_accounts WHERE account_code='$ACC';")
assert_eq "T5.3.3 fin_accounts 余额 10500-200=10300" "10300" "$BAL_FINAL"

# fin_approvals 应记录 3 条审批
APP_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM fin_approvals WHERE txn_id='$EXP_TXN' AND action='APPROVE';")
assert_eq "T5.4 fin_approvals 3 条审批" "3" "$APP_CNT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: 单客户 AR 账龄明细"
R6=$(curl -s -o /tmp/fin_t6.json -w '%{http_code}' \
  "$API/api/finance/ar-aging/customer/$CUST_CODE" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T6.1 ar-aging customer 200" "$R6"
# 该客户 ord_orders 已 paid 500/500 → balance=0 → 不应出现在结果
HAS_ROW=$(cat /tmp/fin_t6.json | grep -oE '"order_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -z "$HAS_ROW" ] && green "  ✓ T6.2 已全额核销订单不在结果中" && PASS=$((PASS+1)) || { red "  ✗ T6.2 不应有 order_no=$HAS_ROW"; FAIL=$((FAIL+1)); FAILURES+=("T6.2"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM fin_approvals WHERE txn_id LIKE 'EXP-FIN-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_transactions WHERE ref_no LIKE 'PO-REGR-FIN-%' OR ref_no LIKE 'AP-%' OR txn_no LIKE 'EXP-FIN-%' OR txn_no LIKE 'INC-FIN-%' OR ref_no='$ORD_NO' OR note LIKE 'REGR-FIN %';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_invoices WHERE ref_no LIKE 'PO-REGR-FIN-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_accounts WHERE account_code='$ACC';" >/dev/null
$PSQL $DB -q -c "DELETE FROM ord_orders WHERE order_no='$ORD_NO';" >/dev/null
green "  ✓ test data 清理完毕"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then green "✅ 全部 $PASS 项 PASS"; else red "❌ $FAIL 项 FAIL / $((PASS+FAIL))"; for f in "${FAILURES[@]}"; do red "  • $f"; done; fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
