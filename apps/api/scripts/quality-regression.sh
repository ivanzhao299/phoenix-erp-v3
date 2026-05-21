#!/usr/bin/env bash
# Quality V2 fidelity 回归 — 追溯 (forward/backward) + 质检 CRUD + NCR
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

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Seed"
BATCH_Q="REGR-QA-BAT-$(date +%s | tail -c 6)"
STORE_Q="ST-QA-REGR"
SALE_Q="POS-REGR-QA-$(date +%s | tail -c 6)"

$PSQL $DB -q -c "DELETE FROM inv_ledger WHERE batch_no='$BATCH_Q' OR ref_no LIKE 'REGR-QA-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH_Q';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sale_items WHERE sale_no='$SALE_Q';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sales WHERE sale_no='$SALE_Q';" >/dev/null
$PSQL $DB -q -c "DELETE FROM qa_inspections WHERE inspect_no LIKE 'INS-QA-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM qa_non_conformance WHERE nc_no LIKE 'NC-QA-REGR-%' OR batch_no='$BATCH_Q';" >/dev/null

$PSQL $DB -q -c "INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code) VALUES ('$BATCH_Q','REGR-PROD-Q',500,500,'AVAILABLE','WMS-VTE-MAIN','ALL');" >/dev/null
$PSQL $DB -q -c "INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note) VALUES ('$BATCH_Q','INBOUND',500,'test','ALL','REGR-QA-IB-1','QA seed inbound');" >/dev/null
$PSQL $DB -q -c "INSERT INTO pos_sales (sale_no, store_code, cashier, total_amount, net_amount, pay_method, status, created_at, updated_at) VALUES ('$SALE_Q','$STORE_Q','test',100,100,'CASH','COMPLETED',now()::text,now()::text);" >/dev/null
$PSQL $DB -q -c "INSERT INTO pos_sale_items (sale_no, product_code, batch_no, qty, unit_price, subtotal, store_code, created_at) VALUES ('$SALE_Q','REGR-PROD-Q','$BATCH_Q',10,10,100,'$STORE_Q',now());" >/dev/null
green "  ✓ seed batch=$BATCH_Q sale=$SALE_Q"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: 正向追溯 (batch → 流向 + 销售)"
R1=$(curl -s -o /tmp/qa_t1.json -w '%{http_code}' \
  "$API/api/quality/trace/forward?batch_no=$BATCH_Q" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T1.1 trace/forward 200" "$R1"
TF_TYPE=$(cat /tmp/qa_t1.json | grep -oE '"trace_type":"[^"]*"' | head -1 | cut -d'"' -f4)
assert_eq "T1.2 trace_type=FORWARD" "FORWARD" "$TF_TYPE"
TF_BATCH=$(cat /tmp/qa_t1.json | grep -oE "\"batch_no\":\"$BATCH_Q\"" | head -1)
[ -n "$TF_BATCH" ] && green "  ✓ T1.3 batch.batch_no=$BATCH_Q" && PASS=$((PASS+1)) || { red "  ✗ T1.3 missing batch_no"; FAIL=$((FAIL+1)); FAILURES+=("T1.3"); }
TF_HAS_SALE=$(cat /tmp/qa_t1.json | grep -oE "\"sale_no\":\"$SALE_Q\"" | head -1)
[ -n "$TF_HAS_SALE" ] && green "  ✓ T1.4 sales 含 $SALE_Q" && PASS=$((PASS+1)) || { red "  ✗ T1.4 missing sale_no"; FAIL=$((FAIL+1)); FAILURES+=("T1.4"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: 逆向追溯 (sale_no → 批次)"
R2=$(curl -s -o /tmp/qa_t2.json -w '%{http_code}' \
  "$API/api/quality/trace/backward?sale_no=$SALE_Q" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T2.1 trace/backward by sale_no 200" "$R2"
TB_TYPE=$(cat /tmp/qa_t2.json | grep -oE '"trace_type":"[^"]*"' | head -1 | cut -d'"' -f4)
assert_eq "T2.2 trace_type=BACKWARD" "BACKWARD" "$TB_TYPE"
TB_BATCH=$(cat /tmp/qa_t2.json | grep -oE "\"batch_no\":\"$BATCH_Q\"" | head -1)
[ -n "$TB_BATCH" ] && green "  ✓ T2.3 含 $BATCH_Q" && PASS=$((PASS+1)) || { red "  ✗ T2.3 missing batch_no"; FAIL=$((FAIL+1)); FAILURES+=("T2.3"); }
TB_RECALL=$(cat /tmp/qa_t2.json | grep -oE '"can_recall":true')
[ -n "$TB_RECALL" ] && green "  ✓ T2.4 recall_assessment.can_recall=true" && PASS=$((PASS+1)) || { red "  ✗ T2.4 missing can_recall=true"; FAIL=$((FAIL+1)); FAILURES+=("T2.4"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: 创建质检记录 (inspections POST)"
R3=$(curl -s -o /tmp/qa_t3.json -w '%{http_code}' -X POST "$API/api/quality/inspections" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"checkType\":\"FINAL\",\"inspector\":\"测试员\",\"result\":\"PASS\",\"items\":[\"$BATCH_Q\"],\"failItems\":[],\"remark\":\"REGR test\"}")
assert_ok "T3.1 createInspection 200" "$R3"
INS_NO=$(cat /tmp/qa_t3.json | grep -oE '"inspect_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$INS_NO" ] && green "  ✓ T3.2 inspect_no=$INS_NO" && PASS=$((PASS+1)) || { red "  ✗ T3.2 missing inspect_no"; FAIL=$((FAIL+1)); FAILURES+=("T3.2"); }

# 更新 inspect_no 命名以方便清理
$PSQL $DB -q -c "UPDATE qa_inspections SET inspect_no='INS-QA-REGR-${INS_NO#INS-}' WHERE inspect_no='$INS_NO';" >/dev/null
INS_NO="INS-QA-REGR-${INS_NO#INS-}"

INS_ITEMS=$($PSQL $DB -tA -c "SELECT items_json FROM qa_inspections WHERE inspect_no='$INS_NO';")
[ -n "$INS_ITEMS" ] && green "  ✓ T3.3 items_json 已存储" && PASS=$((PASS+1)) || { red "  ✗ T3.3 items_json 缺失"; FAIL=$((FAIL+1)); FAILURES+=("T3.3"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: 单条质检详情 (inspections/:no GET)"
R4=$(curl -s -o /tmp/qa_t4.json -w '%{http_code}' \
  "$API/api/quality/inspections/$INS_NO" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T4.1 getInspection 200" "$R4"
T4_PARSED=$(cat /tmp/qa_t4.json | grep -oE "\"items_parsed\":\[\"$BATCH_Q\"\]" | head -1)
[ -n "$T4_PARSED" ] && green "  ✓ T4.2 items_parsed 解析正确" && PASS=$((PASS+1)) || { red "  ✗ T4.2 items_parsed 不匹配"; FAIL=$((FAIL+1)); FAILURES+=("T4.2"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: 创建 NCR (non-conformances POST)"
R5=$(curl -s -o /tmp/qa_t5.json -w '%{http_code}' -X POST "$API/api/quality/non-conformances" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"issue_type\":\"BREAKAGE\",\"severity\":\"HIGH\",\"batch_no\":\"$BATCH_Q\",\"description\":\"REGR 破损测试\"}")
assert_ok "T5.1 createNC 200" "$R5"
NC_NO=$(cat /tmp/qa_t5.json | grep -oE '"nc_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$NC_NO" ] && green "  ✓ T5.2 nc_no=$NC_NO" && PASS=$((PASS+1)) || { red "  ✗ T5.2 missing nc_no"; FAIL=$((FAIL+1)); FAILURES+=("T5.2"); }

# rename for cleanup
$PSQL $DB -q -c "UPDATE qa_non_conformance SET nc_no='NC-QA-REGR-${NC_NO#NC-}' WHERE nc_no='$NC_NO';" >/dev/null
NC_NO="NC-QA-REGR-${NC_NO#NC-}"

NC_STATUS=$($PSQL $DB -tA -c "SELECT status FROM qa_non_conformance WHERE nc_no='$NC_NO';")
assert_eq "T5.3 NCR.status=OPEN" "OPEN" "$NC_STATUS"
NC_SEV=$($PSQL $DB -tA -c "SELECT severity FROM qa_non_conformance WHERE nc_no='$NC_NO';")
assert_eq "T5.4 NCR.severity=HIGH" "HIGH" "$NC_SEV"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: NCR 列表 + 列表过滤"
R6=$(curl -s -o /tmp/qa_t6.json -w '%{http_code}' \
  "$API/api/quality/non-conformances?status=OPEN&severity=HIGH" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T6.1 listNCs OPEN/HIGH 200" "$R6"
HAS_NC=$(cat /tmp/qa_t6.json | grep -oE "\"nc_no\":\"$NC_NO\"" | head -1)
[ -n "$HAS_NC" ] && green "  ✓ T6.2 列表含 $NC_NO" && PASS=$((PASS+1)) || { red "  ✗ T6.2 列表缺 $NC_NO"; FAIL=$((FAIL+1)); FAILURES+=("T6.2"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T7: 逆向追溯回填 NCR (sale_no → batch → ncr)"
R7=$(curl -s -o /tmp/qa_t7.json -w '%{http_code}' \
  "$API/api/quality/trace/backward?batch_no=$BATCH_Q" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T7.1 trace/backward by batch_no 200" "$R7"
T7_NC=$(cat /tmp/qa_t7.json | grep -oE "\"nc_no\":\"$NC_NO\"" | head -1)
[ -n "$T7_NC" ] && green "  ✓ T7.2 trace 中含 NCR=$NC_NO" && PASS=$((PASS+1)) || { red "  ✗ T7.2 trace 缺 NCR"; FAIL=$((FAIL+1)); FAILURES+=("T7.2"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T8: 质量标准列表"
R8=$(curl -s -o /tmp/qa_t8.json -w '%{http_code}' \
  "$API/api/quality/standards" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T8.1 listStandards 200" "$R8"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM inv_ledger WHERE batch_no='$BATCH_Q' OR ref_no LIKE 'REGR-QA-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH_Q';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sale_items WHERE sale_no='$SALE_Q';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sales WHERE sale_no='$SALE_Q';" >/dev/null
$PSQL $DB -q -c "DELETE FROM qa_inspections WHERE inspect_no LIKE 'INS-QA-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM qa_non_conformance WHERE nc_no LIKE 'NC-QA-REGR-%';" >/dev/null
green "  ✓ 清理完毕"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then green "✅ 全部 $PASS 项 PASS"; else red "❌ $FAIL 项 FAIL / $((PASS+FAIL))"; for f in "${FAILURES[@]}"; do red "  • $f"; done; fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
