#!/usr/bin/env bash
# 仓储 WMS 模块回归测试 — 覆盖 commit df3a3b4 + 328ff53 + (commit 3)
#
# 用法：API_URL=http://127.0.0.1:3100 ADMIN_USER=admin ADMIN_PASS=admin123 bash wms-regression.sh
set -u

API="${API_URL:-http://127.0.0.1:3100}"
ADMIN_U="${ADMIN_USER:-admin}"
ADMIN_P="${ADMIN_PASS:-admin123}"
PSQL=${PSQL:-$(which psql)}
DB="${DB_NAME:-phoenix_erp}"

PASS=0
FAIL=0
declare -a FAILURES

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$1"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$1"; }

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then green "  ✓ $name"; PASS=$((PASS+1));
  else red "  ✗ $name"; red "      expected: $expected"; red "      actual:   $actual"; FAIL=$((FAIL+1)); FAILURES+=("$name | expected=$expected actual=$actual"); fi
}
assert_ok() {
  local name="$1" code="$2"
  case "$code" in 20[0-9]) green "  ✓ $name (HTTP $code)"; PASS=$((PASS+1)) ;; *) red "  ✗ $name HTTP $code"; FAIL=$((FAIL+1)); FAILURES+=("$name | HTTP=$code") ;; esac
}

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ 已登录"

cyan ""
cyan "▶ 1) Seed 测试数据"
RUN="REGR-WMS-$(date +%s)-$$"
WH_A="$RUN-A"
WH_B="$RUN-B"
MATERIAL_CODE=MAT-REGR-WMS
BATCH_NO="$RUN-BATCH"
TASK_NO="$RUN-INB"

# Seed: 仓库。PURCHASE 回归必须使用采购允许的 usage，避免测试夹具绕过生产规则。
$PSQL $DB -q -c "INSERT INTO wms_warehouses (warehouse_code, warehouse_name_zh, company_code, type, domain, status) VALUES ('$WH_A','回归测试仓A','COMP-REGR','PURCHASE_RECV','OPERATIONAL','ACTIVE'),('$WH_B','回归测试仓B','COMP-REGR','PURCHASE_RECV','OPERATIONAL','ACTIVE') ON CONFLICT (warehouse_code) DO UPDATE SET company_code=EXCLUDED.company_code, type=EXCLUDED.type, domain=EXCLUDED.domain, status=EXCLUDED.status;" >/dev/null

# Seed: 真实 ACTIVE 物料主数据。入库治理禁止虚构 product_code 绕过主数据。
$PSQL $DB -q -c "INSERT INTO mst_materials (material_code, material_name, material_type, unit, status, created_by) VALUES ('$MATERIAL_CODE','WMS回归测试物料','OTHER','件','ACTIVE','CI') ON CONFLICT (material_code) DO UPDATE SET status='ACTIVE', material_name=EXCLUDED.material_name, material_type=EXCLUDED.material_type, unit=EXCLUDED.unit;" >/dev/null

# Seed: 一个 inv_batches 作为调拨/出库源
$PSQL $DB -q -c "INSERT INTO inv_batches (batch_no, material_code, item_type, material_type, unit, qty, qty_available, warehouse_code, location_code, store_code, company_code) VALUES ('$BATCH_NO','$MATERIAL_CODE','MATERIAL','OTHER','件',1000,1000,'$WH_A','LOC-01','ALL','COMP-REGR');" >/dev/null

# Seed: 一个 wms_inbound task 用于 A3 测试
$PSQL $DB -q -c "INSERT INTO wms_inbound (task_no, status, warehouse_code, type, item, qty) VALUES ('$TASK_NO','PENDING','$WH_A','PURCHASE','REGR测试品',500);" >/dev/null
$PSQL $DB -q -c "INSERT INTO wms_inbound_items(task_no,batch_no,warehouse_code,item_type,material_code,unit,qty,expected_qty)
 VALUES ('$TASK_NO','$BATCH_NO','$WH_A','MATERIAL','$MATERIAL_CODE','件',500,500);" >/dev/null


green "  ✓ seed 完成 (WH=$WH_A/$WH_B, batch=$BATCH_NO, task=$TASK_NO)"

LEDGER_BASE=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger;")

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: A3 confirmInbound — 同步写采购入库语义流水"
# 先调 inventory API（注意 InboundController 路由是 /api/inbound）
# 实际 confirmInbound 在 wms.service，让我们直接通过 inventory.controller 或 inbound.controller 的路径调
# 这里走 receiving/orders/:order_no/confirm（已挂 wms.service.confirmReceivingOrder，仅 update 状态）
# A3 fix 实际在 confirmInbound，路由通过 inbound.controller (POST /api/inbound/confirm)
R1=$(curl -s -o /tmp/r1.json -w '%{http_code}' -X POST "$API/api/inbound/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"task_no\":\"$TASK_NO\",\"items\":[{\"batch_no\":\"$BATCH_NO\",\"material_code\":\"$MATERIAL_CODE\",\"item_type\":\"MATERIAL\",\"qty\":500,\"warehouse_code\":\"$WH_A\"}]}")
assert_ok "T1.1 confirmInbound 200" "$R1"
if [[ "$R1" != 20* ]]; then
  red "      response: $(head -c 500 /tmp/r1.json)"
fi

# UPSERT: $BATCH_NO 原 1000 + 入库 500 = 1500
QTY_AFTER=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T1.2 UPSERT 累加 1000+500=1500" "1500" "$QTY_AFTER"

# PURCHASE 入库必须写入细分后的采购入库流水，并保留业务类型用于对账。
LEDGER_INB=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE batch_no='$BATCH_NO' AND change_type='PURCHASE_INBOUND' AND business_type='PURCHASE';")
assert_eq "T1.3 inv_ledger PURCHASE_INBOUND/PURCHASE 流水 +1" "1" "$LEDGER_INB"

# wms_inbound.status → COMPLETED
INB_STATUS=$($PSQL $DB -tA -c "SELECT status FROM wms_inbound WHERE task_no='$TASK_NO';")
assert_eq "T1.4 wms_inbound.status → COMPLETED" "COMPLETED" "$INB_STATUS"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: A4 confirmTransfer — 调拨原子事务"
R2=$(curl -s -o /tmp/r2.json -w '%{http_code}' -X POST "$API/api/inventory/transfer/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"transfer_no\":\"$RUN-TR\",\"from_warehouse\":\"$WH_A\",\"to_warehouse\":\"$WH_B\",\"items\":[{\"batch_no\":\"$BATCH_NO\",\"qty\":300}]}")
assert_ok "T2.1 confirmTransfer 200" "$R2"

# 源 batch 减 300: 1500 - 300 = 1200
SRC_QTY=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T2.2 源 batch 1500-300=1200" "1200" "$SRC_QTY"

# 目标新建一个 BATCH_NO-T-XXX batch
DST_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_batches WHERE batch_no LIKE '$BATCH_NO-T-%' AND warehouse_code='$WH_B';")
assert_eq "T2.3 目标新建 1 个 batch 在 WH_B" "1" "$DST_CNT"

DST_QTY=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no LIKE '$BATCH_NO-T-%' LIMIT 1;")
assert_eq "T2.4 目标 batch qty=300" "300" "$DST_QTY"

# 双向 ledger
LEDGER_OUT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE batch_no='$BATCH_NO' AND change_type='TRANSFER_OUT';")
assert_eq "T2.5 TRANSFER_OUT 流水 +1" "1" "$LEDGER_OUT"
LEDGER_IN=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE batch_no LIKE '$BATCH_NO-T-%' AND change_type='TRANSFER_IN';")
assert_eq "T2.6 TRANSFER_IN 流水 +1" "1" "$LEDGER_IN"

# 库存守恒: 源 1200 + 目标 300 = 总 1500 (即入库后的量)
TOTAL=$($PSQL $DB -tA -c "SELECT SUM(qty)::integer FROM inv_batches WHERE batch_no='$BATCH_NO' OR batch_no LIKE '$BATCH_NO-T-%';")
assert_eq "T2.7 总量守恒 (1200+300=1500)" "1500" "$TOTAL"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: A4 余量不足 → 整笔事务回滚"
R3=$(curl -s -o /tmp/r3.json -w '%{http_code}' -X POST "$API/api/inventory/transfer/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"transfer_no\":\"$RUN-TR-INVALID\",\"from_warehouse\":\"$WH_A\",\"to_warehouse\":\"$WH_B\",\"items\":[{\"batch_no\":\"$BATCH_NO\",\"qty\":99999}]}")
case "$R3" in 5*|4*) green "  ✓ T3.1 余量不足返非 2xx (HTTP $R3)"; PASS=$((PASS+1)) ;;
  *) red "  ✗ T3.1 应失败但返 $R3"; FAIL=$((FAIL+1)); FAILURES+=("T3.1 expected non-2xx got $R3") ;;
esac

SRC_UNCHANGED=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T3.2 源 batch 未变 (仍 1200)" "1200" "$SRC_UNCHANGED"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: A5 approveStocktake — 差额入账"
STK_NO="ST-$RUN"
$PSQL $DB -q -c "INSERT INTO wms_stocktake (stocktake_no, warehouse_code, batch_no, item, book_qty, actual_qty, status) VALUES ('$STK_NO','$WH_A','$BATCH_NO','$MATERIAL_CODE',1200,1198,'DONE');" >/dev/null

R4=$(curl -s -o /tmp/r4.json -w '%{http_code}' -X POST "$API/api/inventory/stocktake/approve" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"stocktake_no\":\"$STK_NO\",\"batch_no\":\"$BATCH_NO\",\"diff_qty\":-2,\"item\":\"REGR-PROD\"}")
assert_ok "T4.1 approveStocktake 200" "$R4"

STK_QTY=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T4.2 batch.qty 1200-2=1198" "1198" "$STK_QTY"

STK_LEDGER=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE batch_no='$BATCH_NO' AND change_type='STOCKTAKE_DOWN' AND ref_no='$STK_NO';")
assert_eq "T4.3 STOCKTAKE_DOWN 流水 +1" "1" "$STK_LEDGER"

STK_STATUS=$($PSQL $DB -tA -c "SELECT status FROM wms_stocktake WHERE stocktake_no='$STK_NO';")
assert_eq "T4.4 stocktake.status → APPROVED" "APPROVED" "$STK_STATUS"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: A5 approveLoss — 损耗扣减"
LR_NO="LR-$RUN"
$PSQL $DB -q -c "INSERT INTO wms_stocktake (stocktake_no, warehouse_code, batch_no, item, quantity_delta, reason, status) VALUES ('$LR_NO','$WH_A','$BATCH_NO','$MATERIAL_CODE',-50,'过期报损','DONE');" >/dev/null

R5=$(curl -s -o /tmp/r5.json -w '%{http_code}' -X POST "$API/api/inventory/loss/approve" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"loss_no\":\"$LR_NO\",\"batch_no\":\"$BATCH_NO\",\"loss_qty\":50,\"reason\":\"过期报损\"}")
assert_ok "T5.1 approveLoss 200" "$R5"

LOSS_QTY=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T5.2 batch.qty 1198-50=1148" "1148" "$LOSS_QTY"

LOSS_LEDGER=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE batch_no='$BATCH_NO' AND change_type='LOSS';")
assert_eq "T5.3 LOSS 流水 +1" "1" "$LOSS_LEDGER"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: 仓级日结的采集首日与影子核对"
CAPTURE_DAY=$($PSQL $DB -tA -c "SELECT (initialized_at AT TIME ZONE 'Asia/Singapore')::date FROM wms_close_capture_epoch;")
CLOSE_DAY=$($PSQL $DB -tA -c "SELECT (initialized_at AT TIME ZONE 'Asia/Singapore')::date+1 FROM wms_close_capture_epoch;")
R6=$(curl -s -o /tmp/r6.json -w '%{http_code}' "$API/api/stocktake/daily-close?warehouse_code=$WH_A&date=$CLOSE_DAY" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T6.1 GET daily-close summary 200" "$R6"
CLOSE_SUMMARY=$(node -pe "const {data}=JSON.parse(require('node:fs').readFileSync('/tmp/r6.json','utf8')); Array.isArray(data?.totals?.units) && data.eligible===false")
assert_eq "T6.2 仓库返回业务日实物汇总，影子核对禁止封账" "true" "$CLOSE_SUMMARY"
R6_HISTORY=$(curl -s -o /tmp/r6_history.json -w '%{http_code}' "$API/api/stocktake/daily-close?warehouse_code=$WH_A&date=$CAPTURE_DAY" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T6.3 GET 采集未满一日的历史状态" "$R6_HISTORY"
CLOSE_HISTORY=$(node -pe "const {data}=JSON.parse(require('node:fs').readFileSync('/tmp/r6_history.json','utf8')); data?.historical===true && data.totals===null")
assert_eq "T6.4 采集未满一日时明确待核且无快照" "true" "$CLOSE_HISTORY"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T7: B5 wms_zones.warehouse_code 列已存在"
HAS_COL=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='wms_zones' AND column_name='warehouse_code';")
assert_eq "T7.1 wms_zones.warehouse_code 列存在" "1" "$HAS_COL"

# ══════════════════════════════════════════════════════════════════════════
# V2 FIDELITY BACKFILL — WMS 收货严格校验 + 锁批拦截 + PDA 幂等
# 来源：V2 inbound.js + 业务诉求 (actual+broken=expected)
# ══════════════════════════════════════════════════════════════════════════
cyan ""
cyan "▶ Phase V2-WMS V2 fidelity — 收货严格校验 / 锁批 / PDA 幂等"

# 准备一个新批次的入库单
TASK_V2="$RUN-V2-IB"
BATCH_V2="$RUN-V2-BATCH"
$PSQL $DB -q -c "INSERT INTO wms_inbound (task_no, status, warehouse_code, type, item, qty, store_code) VALUES ('$TASK_V2','PENDING','$WH_A','PURCHASE','REGR测试品',100,'ALL');" >/dev/null
$PSQL $DB -q -c "INSERT INTO wms_inbound_items(task_no,batch_no,warehouse_code,item_type,material_code,unit,qty,expected_qty)
 VALUES ('$TASK_V2','$BATCH_V2','$WH_A','MATERIAL','$MATERIAL_CODE','件',100,100);" >/dev/null


# T8-V2.1 严格校验 — actual=80 broken=15 expected=100 → 失败 (80+15≠100)
R_V2_1=$(curl -s -o /tmp/v2_ib1.json -w '%{http_code}' -X POST "$API/api/inbound/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"task_no\":\"$TASK_V2\",\"items\":[{\"batch_no\":\"$BATCH_V2\",\"material_code\":\"$MATERIAL_CODE\",\"item_type\":\"MATERIAL\",\"actual_qty\":80,\"broken_qty\":15,\"expected_qty\":100,\"warehouse_code\":\"$WH_A\"}]}")
case "$R_V2_1" in 4*) green "  ✓ T8-V2.1 校验失败拦截 (HTTP $R_V2_1)"; PASS=$((PASS+1));; *) red "  ✗ T8-V2.1 应失败 但 HTTP=$R_V2_1"; FAIL=$((FAIL+1)); FAILURES+=("T8-V2.1");; esac

# 入库单状态应仍为 PENDING（事务回滚 / 校验前置）
V2_TASK_STATUS=$($PSQL $DB -tA -c "SELECT status FROM wms_inbound WHERE task_no='$TASK_V2';")
assert_eq "T8-V2.1.1 task 仍 PENDING" "PENDING" "$V2_TASK_STATUS"

# T8-V2.2 正确入库 — actual=80 broken=20 expected=100 → STANDARD batch +80 + DEFECT_SALE batch +20
R_V2_2=$(curl -s -o /tmp/v2_ib2.json -w '%{http_code}' -X POST "$API/api/inbound/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"task_no\":\"$TASK_V2\",\"items\":[{\"batch_no\":\"$BATCH_V2\",\"material_code\":\"$MATERIAL_CODE\",\"item_type\":\"MATERIAL\",\"actual_qty\":80,\"broken_qty\":20,\"expected_qty\":100,\"warehouse_code\":\"$WH_A\"}]}")
assert_ok "T8-V2.2 严格校验通过 confirmInbound 200" "$R_V2_2"
if [[ "$R_V2_2" != 20* ]]; then
  red "      response: $(head -c 500 /tmp/v2_ib2.json)"
fi
QTY_AV=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_V2';")
assert_eq "T8-V2.2.1 AVAILABLE batch qty=80" "80" "$QTY_AV"
STAT_AV=$($PSQL $DB -tA -c "SELECT status FROM inv_batches WHERE batch_no='$BATCH_V2';")
assert_eq "T8-V2.2.2 AVAILABLE batch.status=AVAILABLE" "AVAILABLE" "$STAT_AV"
QTY_BRK=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_V2-BROKEN';")
assert_eq "T8-V2.2.3 DEFECT_SALE batch qty=20" "20" "$QTY_BRK"
STAT_BRK=$($PSQL $DB -tA -c "SELECT status FROM inv_batches WHERE batch_no='$BATCH_V2-BROKEN';")
assert_eq "T8-V2.2.4 DEFECT_SALE batch.status=AVAILABLE" "AVAILABLE" "$STAT_BRK"
AVAIL_BRK=$($PSQL $DB -tA -c "SELECT qty_available::integer FROM inv_batches WHERE batch_no='$BATCH_V2-BROKEN';")
assert_eq "T8-V2.2.5 DEFECT_SALE batch.qty_available=20" "20" "$AVAIL_BRK"

# T8-V2.3 幂等：再次 confirmInbound → 拒绝
R_V2_3=$(curl -s -o /tmp/v2_ib3.json -w '%{http_code}' -X POST "$API/api/inbound/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"task_no\":\"$TASK_V2\",\"items\":[{\"batch_no\":\"$BATCH_V2-2\",\"material_code\":\"$MATERIAL_CODE\",\"item_type\":\"MATERIAL\",\"actual_qty\":50,\"warehouse_code\":\"$WH_A\"}]}")
case "$R_V2_3" in 4*) green "  ✓ T8-V2.3 重复确认拒绝 (HTTP $R_V2_3)"; PASS=$((PASS+1));; 20*)
  # 兼容返回 code:400 in body 但 HTTP 201
  BODY_CODE=$(cat /tmp/v2_ib3.json | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
  if [ "$BODY_CODE" = "400" ]; then green "  ✓ T8-V2.3 重复确认拒绝 (body code=400)"; PASS=$((PASS+1)); else red "  ✗ T8-V2.3 重复确认应拒绝 HTTP=$R_V2_3 code=$BODY_CODE"; FAIL=$((FAIL+1)); FAILURES+=("T8-V2.3"); fi;;
  *) red "  ✗ T8-V2.3 重复确认应拒绝 HTTP=$R_V2_3"; FAIL=$((FAIL+1)); FAILURES+=("T8-V2.3");;
esac

# T8-V2.4 EXPIRED 批次拦截 — 准备一个 LOCKED 批次后尝试入库
LOCKED_BATCH="$RUN-LOCKED"
$PSQL $DB -q -c "INSERT INTO inv_batches (batch_no, material_code, item_type, material_type, unit, qty, qty_available, status, warehouse_code, location_code, store_code, company_code) VALUES ('$LOCKED_BATCH','$MATERIAL_CODE','MATERIAL','OTHER','件',50,0,'FROZEN','$WH_A','LOC-01','ALL','COMP-REGR');" >/dev/null
TASK_V2_LK="$RUN-LOCKED-IB"
$PSQL $DB -q -c "INSERT INTO wms_inbound (task_no, status, warehouse_code, type, item, qty, store_code) VALUES ('$TASK_V2_LK','PENDING','$WH_A','PURCHASE','REGR测试品',30,'ALL');" >/dev/null
$PSQL $DB -q -c "INSERT INTO wms_inbound_items(task_no,batch_no,warehouse_code,item_type,material_code,unit,qty,expected_qty)
 VALUES ('$TASK_V2_LK','$LOCKED_BATCH','$WH_A','MATERIAL','$MATERIAL_CODE','件',30,30);" >/dev/null

R_V2_4=$(curl -s -o /tmp/v2_ib4.json -w '%{http_code}' -X POST "$API/api/inbound/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"task_no\":\"$TASK_V2_LK\",\"items\":[{\"batch_no\":\"$LOCKED_BATCH\",\"material_code\":\"$MATERIAL_CODE\",\"item_type\":\"MATERIAL\",\"actual_qty\":30,\"expected_qty\":30,\"warehouse_code\":\"$WH_A\"}]}")
case "$R_V2_4" in 5*|4*) green "  ✓ T8-V2.4 LOCKED 批次入库拦截 (HTTP $R_V2_4)"; PASS=$((PASS+1));; *) red "  ✗ T8-V2.4 应拦截 HTTP=$R_V2_4"; FAIL=$((FAIL+1)); FAILURES+=("T8-V2.4");; esac
LOCKED_QTY_AFTER=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$LOCKED_BATCH';")
assert_eq "T8-V2.4.1 LOCKED batch qty 未变 (仍 50)" "50" "$LOCKED_QTY_AFTER"

# T8-V2.5 旧日志入口退役，由真正盘点过账提供回执。
assert_eq "T8-V2.5 旧 PDA 同步已退役" "410" "$(curl -s -o /tmp/wms_sync_retired.json -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' "$API/api/inventory/sync-pda")"
PDA_KEY=$(node -p "require('node:crypto').randomUUID()")
BATCH_VERSION=$($PSQL $DB -tA -c "SELECT xmin::text FROM inv_batches WHERE batch_no='$BATCH_NO';")
PDA_PAYLOAD=$(node -pe 'const [request_key,batch_no,batch_version]=process.argv.slice(1); JSON.stringify({request_key,lines:[{batch_no,batch_version,counted_qty:1147}]})' \
  "$PDA_KEY" "$BATCH_NO" "$BATCH_VERSION")
for attempt in 1 2; do
  PDA_STATUS=$(curl -s -o "/tmp/wms_pda_count_$attempt.json" -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$PDA_PAYLOAD" "$API/api/inventory/stocktake/pda-count")
  assert_ok "T8-V2.6 盘点请求第 $attempt 次返回回执" "$PDA_STATUS"
done
PDA_STK_NO=$(node -pe "JSON.parse(require('node:fs').readFileSync('/tmp/wms_pda_count_1.json','utf8')).results?.[0]?.stocktake_no ?? ''")
receipts_equal=$(node -pe 'const fs=require("node:fs");
  const [first,second]=process.argv.slice(1).map(file=>JSON.parse(fs.readFileSync(file,"utf8")));
  require("node:util").isDeepStrictEqual(first,second)' /tmp/wms_pda_count_1.json /tmp/wms_pda_count_2.json)
assert_eq "T8-V2.7 重试仍返回原回执" "true" "$receipts_equal"
PDA_FACT=$($PSQL $DB -tA -c "SELECT count(*) FROM inv_ledger WHERE ref_no='$PDA_STK_NO' AND batch_no='$BATCH_NO' AND qty_change=-1;")
assert_eq "T8-V2.8 PDA 重试仅有一次实物过账" "1" "$PDA_FACT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Phase 6 数据一致性"
# E-01: 测试期间 inv_ledger 至少新增 5 条流水 (INBOUND + TRANSFER_OUT + TRANSFER_IN + STOCKTAKE_DOWN + LOSS)
LEDGER_END=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger;")
LEDGER_DELTA=$((LEDGER_END - LEDGER_BASE))
if [ "$LEDGER_DELTA" -ge 5 ]; then
  green "  ✓ E-01 ledger 新增 $LEDGER_DELTA 条 (≥5 条预期)"; PASS=$((PASS+1));
else
  red "  ✗ E-01 ledger 新增不足 (${LEDGER_DELTA} < 5)"; FAIL=$((FAIL+1)); FAILURES+=("E-01 ledger delta=$LEDGER_DELTA")
fi

# E-02: 源 + 目标 + 各种调整后总账与 ledger SUM 守恒
SRC_FINAL=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
DST_FINAL=$($PSQL $DB -tA -c "SELECT COALESCE(SUM(qty),0)::integer::integer FROM inv_batches WHERE batch_no LIKE '$BATCH_NO-T-%';")
TOTAL_FINAL=$((SRC_FINAL + DST_FINAL))
LEDGER_SUM=$($PSQL $DB -tA -c "SELECT COALESCE(SUM(qty_change),0)::integer::integer FROM inv_ledger WHERE batch_no='$BATCH_NO' OR batch_no LIKE '$BATCH_NO-T-%';")
# 1000 (seed) + ledger_sum 应 = total_final
EXPECTED=$((1000 + LEDGER_SUM))
assert_eq "E-02 库存守恒 (seed 1000 + Σledger = 总库存)" "$EXPECTED" "$TOTAL_FINAL"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -v ON_ERROR_STOP=1 -q -c "
  DELETE FROM wms_stocktake_submissions WHERE request_key='$PDA_KEY';
  DELETE FROM wms_stocktake WHERE stocktake_no IN ('$STK_NO','$LR_NO','$PDA_STK_NO');
  DELETE FROM wms_inbound_confirmation_receipts WHERE task_no IN ('$TASK_NO','$TASK_V2','$TASK_V2_LK');
  DELETE FROM wms_inbound_items WHERE task_no IN ('$TASK_NO','$TASK_V2','$TASK_V2_LK');
  DELETE FROM wms_inbound WHERE task_no IN ('$TASK_NO','$TASK_V2','$TASK_V2_LK');
  DELETE FROM wms_atomic_transfer_receipts WHERE transfer_no='$RUN-TR';
  DELETE FROM wms_transfer_items WHERE transfer_no='$RUN-TR';
  DELETE FROM wms_transfer WHERE transfer_no='$RUN-TR';
  DELETE FROM inv_ledger WHERE warehouse_code IN ('$WH_A','$WH_B');
  DELETE FROM inv_batches WHERE warehouse_code IN ('$WH_A','$WH_B');
  DELETE FROM wms_close_capture WHERE warehouse_code IN ('$WH_A','$WH_B');
  DELETE FROM wms_warehouses WHERE warehouse_code IN ('$WH_A','$WH_B');
" >/dev/null || { red "清理本次数据失败"; exit 1; }
green "  ✓ test data 清理完毕"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  green "✅ 全部 $PASS 项 PASS"
else
  red "❌ $FAIL 项 FAIL / $((PASS+FAIL)) 项总计"
  echo ""
  red "失败明细："
  for f in "${FAILURES[@]}"; do red "  • $f"; done
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
