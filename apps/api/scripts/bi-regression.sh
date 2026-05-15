#!/usr/bin/env bash
# BI Dashboard V2 fidelity 回归 — KPI + store-analysis + integrity
set -u

API="${API_URL:-http://127.0.0.1:3100}"
ADMIN_U="${ADMIN_USER:-admin}"
ADMIN_P="${ADMIN_PASS:-admin123}"
PSQL=/Applications/Postgres.app/Contents/Versions/18/bin/psql
DB=phoenix_erp

PASS=0; FAIL=0
declare -a FAILURES

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$1"; }

assert_eq() { local n="$1" e="$2" a="$3"; if [ "$e" = "$a" ]; then green "  ✓ $n"; PASS=$((PASS+1)); else red "  ✗ $n"; red "      exp: $e"; red "      act: $a"; FAIL=$((FAIL+1)); FAILURES+=("$n | exp=$e act=$a"); fi; }
assert_ok() { local n="$1" c="$2"; case "$c" in 20[0-9]) green "  ✓ $n (HTTP $c)"; PASS=$((PASS+1));; *) red "  ✗ $n HTTP $c"; FAIL=$((FAIL+1)); FAILURES+=("$n | HTTP=$c");; esac; }
assert_has() { local n="$1" k="$2" data="$3"; if printf '%s' "$data" | grep -qE "\"$k\""; then green "  ✓ $n (含 $k)"; PASS=$((PASS+1)); else red "  ✗ $n 缺 $k"; FAIL=$((FAIL+1)); FAILURES+=("$n missing $k"); fi; }

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ token=${TOKEN:0:30}..."

# Seed 一些销售数据用于 store-analysis
STORE_BI="ST-BI-REGR"
SALE_BI="POS-REGR-BI-$(date +%s | tail -c 6)"
BATCH_BI="REGR-BI-BAT-$(date +%s | tail -c 5)"
$PSQL $DB -q -c "DELETE FROM pos_sale_items WHERE sale_no='$SALE_BI';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sales WHERE sale_no='$SALE_BI';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH_BI';" >/dev/null
$PSQL $DB -q -c "INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code) VALUES ('$BATCH_BI','REGR-BI',300,300,'AVAILABLE','WMS-VTE-MAIN');" >/dev/null
$PSQL $DB -q -c "INSERT INTO pos_sales (sale_no, store_code, cashier, net_amount, pay_method, status, created_at, updated_at) VALUES ('$SALE_BI','$STORE_BI','test',888,'CASH','COMPLETED',now()::text,now()::text);" >/dev/null
$PSQL $DB -q -c "INSERT INTO pos_sale_items (sale_no, product_code, product_name_zh, batch_no, qty, unit_price, subtotal, store_code, created_at) VALUES ('$SALE_BI','REGR-BI','BI测试品','$BATCH_BI',10,88.8,888,'$STORE_BI',now());" >/dev/null

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: KPI 主仪表盘"
R1=$(curl -s -o /tmp/bi_t1.json -w '%{http_code}' "$API/api/dashboard/kpi" -H "Authorization: Bearer $TOKEN")
assert_ok "T1.1 dashboard/kpi 200" "$R1"
T1_BODY=$(cat /tmp/bi_t1.json)
assert_has "T1.2 含 stats.eggs"  "eggs"      "$T1_BODY"
assert_has "T1.3 含 stats.stock" "stock"     "$T1_BODY"
assert_has "T1.4 含 stats.sales" "sales"     "$T1_BODY"
assert_has "T1.5 含 alertList"   "alertList" "$T1_BODY"
assert_has "T1.6 含 chartData"   "chartData" "$T1_BODY"
assert_has "T1.7 含 deviceStats" "deviceStats" "$T1_BODY"
assert_has "T1.8 含 meta.today"  "today"     "$T1_BODY"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: store-analysis 单店分析"
R2=$(curl -s -o /tmp/bi_t2.json -w '%{http_code}' \
  "$API/api/dashboard/store-analysis?store_code=$STORE_BI" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T2.1 store-analysis 200" "$R2"
T2_BODY=$(cat /tmp/bi_t2.json)
assert_has "T2.2 含 kpi.sales"   "sales"   "$T2_BODY"
assert_has "T2.3 含 kpi.txns"    "txns"    "$T2_BODY"
assert_has "T2.4 含 kpi.avg"     "avg"     "$T2_BODY"
assert_has "T2.5 含 chart.days"  "days"    "$T2_BODY"
assert_has "T2.6 含 topItems"    "topItems" "$T2_BODY"

# 验证刚 seed 的销售在 kpi.sales 中
T2_SALES=$(cat /tmp/bi_t2.json | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('kpi',{}).get('sales',0))" 2>/dev/null)
case "$T2_SALES" in 888|888.0) green "  ✓ T2.7 kpi.sales=888 (匹配 seed)"; PASS=$((PASS+1));; *) red "  ✗ T2.7 kpi.sales=$T2_SALES (期望 888)"; FAIL=$((FAIL+1)); FAILURES+=("T2.7");; esac

T2_TOP=$(cat /tmp/bi_t2.json | grep -oE '"item":"BI测试品"' | head -1)
[ -n "$T2_TOP" ] && green "  ✓ T2.8 topItems 含 BI测试品" && PASS=$((PASS+1)) || { red "  ✗ T2.8 topItems 缺 BI测试品"; FAIL=$((FAIL+1)); FAILURES+=("T2.8"); }

# 7 天补齐
T2_DAYS=$(cat /tmp/bi_t2.json | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',{}).get('chart',{}).get('days',[])))" 2>/dev/null)
assert_eq "T2.9 chart.days 共 7 天" "7" "$T2_DAYS"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: integrity 多维度评分"
R3=$(curl -s -o /tmp/bi_t3.json -w '%{http_code}' "$API/api/dashboard/integrity" -H "Authorization: Bearer $TOKEN")
assert_ok "T3.1 integrity 200" "$R3"
T3_BODY=$(cat /tmp/bi_t3.json)
T3_SCORE=$(cat /tmp/bi_t3.json | grep -oE '"score":[0-9]+' | head -1 | cut -d: -f2)
T3_GRADE=$(cat /tmp/bi_t3.json | grep -oE '"grade":"[ABCD]"' | head -1 | cut -d'"' -f4)
[ -n "$T3_SCORE" ] && green "  ✓ T3.2 总分=$T3_SCORE" && PASS=$((PASS+1)) || { red "  ✗ T3.2 missing score"; FAIL=$((FAIL+1)); FAILURES+=("T3.2"); }
case "$T3_GRADE" in A|B|C|D) green "  ✓ T3.3 grade=$T3_GRADE"; PASS=$((PASS+1));; *) red "  ✗ T3.3 grade=$T3_GRADE"; FAIL=$((FAIL+1)); FAILURES+=("T3.3");; esac
assert_has "T3.4 含 5 个 dimensions" "dimensions" "$T3_BODY"
T3_DIM_CNT=$(cat /tmp/bi_t3.json | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',{}).get('dimensions',[])))" 2>/dev/null)
assert_eq "T3.5 dimensions 共 5 项" "5" "$T3_DIM_CNT"

# 各维度都有 maxScore=20
T3_MAX=$(cat /tmp/bi_t3.json | python3 -c "import sys,json;d=json.load(sys.stdin);print(all(x.get('maxScore')==20 for x in d.get('data',{}).get('dimensions',[])))" 2>/dev/null)
[ "$T3_MAX" = "True" ] && green "  ✓ T3.6 所有维度 maxScore=20" && PASS=$((PASS+1)) || { red "  ✗ T3.6 maxScore 不一致"; FAIL=$((FAIL+1)); FAILURES+=("T3.6"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM pos_sale_items WHERE sale_no='$SALE_BI';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sales WHERE sale_no='$SALE_BI';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH_BI';" >/dev/null
green "  ✓ 清理完毕"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then green "✅ 全部 $PASS 项 PASS"; else red "❌ $FAIL 项 FAIL / $((PASS+FAIL))"; for f in "${FAILURES[@]}"; do red "  • $f"; done; fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
