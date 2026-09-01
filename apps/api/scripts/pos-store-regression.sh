#!/usr/bin/env bash
# POS + 门店运营 回归测试 — 覆盖 commit 0b50075 + 591ea59 + (commit 3) 共 3 个提交
# 验证 A1-A5 心脏修复：销售 / 退款 / 作废 / 损耗 / 收货 / 补货
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

assert_eq()  { local n="$1" e="$2" a="$3"; if [ "$e" = "$a" ]; then green "  ✓ $n"; PASS=$((PASS+1)); else red "  ✗ $n"; red "      expected: $e"; red "      actual:   $a"; FAIL=$((FAIL+1)); FAILURES+=("$n | exp=$e act=$a"); fi; }
assert_ok()  { local n="$1" c="$2"; case "$c" in 20[0-9]) green "  ✓ $n (HTTP $c)"; PASS=$((PASS+1));; *) red "  ✗ $n HTTP $c"; FAIL=$((FAIL+1)); FAILURES+=("$n | HTTP=$c");; esac; }
assert_fail(){ local n="$1" c="$2"; case "$c" in 20[0-9]) red "  ✗ $n 应失败但 HTTP $c"; FAIL=$((FAIL+1)); FAILURES+=("$n | HTTP=$c");; *) green "  ✓ $n (HTTP $c)"; PASS=$((PASS+1));; esac; }

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ token=${TOKEN:0:30}..."

# ──────────────────────────────────────────────────────────────────────────
# R4.1 治理隔离：本套件 T1-T6 全部打 api/v3/pos 旧旁路（PosController/PosService
#   已于 R4.1「删除旧 POS 旁路」从模块注销，见 store.module.ts:8-11）。端点现 404，
#   store_losses/store_receiving 等表列名也已与现架构漂移。销售/退款现归
#   StorePosController(api/v2/store-sales)，损耗/收货现归 WMS(inventory.controller)。
#   → 探测旧端点；若 404 则整套 SKIP（非伪绿：CI 日志显式标 SKIP + 跟踪重写任务），
#     避免对已删功能的死测试长期红灯掩盖真实回归信号。
PROBE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')
if [ "$PROBE" = "410" ] || [ "$PROBE" = "404" ]; then
  yellow "⏭️  SKIP pos-store 回归：api/v3/pos 旁路已退役（探测 POST /api/v3/pos/sales → $PROBE）。"
  yellow "    本套件整体针对该旧旁路，待按现架构重写："
  yellow "      · 销售/退款/作废 → api/v2/store-sales (StorePosController)"
  yellow "      · 损耗/收货审批 → WMS inventory.controller (approveLoss / confirmReceivingOrder)"
  yellow "    跟踪：follow-up「重写 pos-store 回归对齐现架构（api/v2/store-sales + WMS）」。"
  exit 0
fi
yellow "  ⚠ api/v3/pos 探测返回 $PROBE（非 404）→ 旧旁路疑似仍在，继续跑历史断言。"

cyan ""
cyan "▶ 1) Seed"
BATCH_NO="POS-REGR-BAT-$(date +%s | tail -c 6)"
STORE="STORE-REGR"
PRODUCT="REGR-EGG-AAA"

# 清理
$PSQL $DB -q -c "DELETE FROM inv_ledger WHERE batch_no='$BATCH_NO' OR ref_no LIKE 'POS-REGR-%' OR ref_no LIKE 'S-%REGR%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH_NO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sale_items WHERE sale_no LIKE 'POS-REGR-%' OR sale_no LIKE 'S-%REGR%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sales WHERE sale_no LIKE 'POS-REGR-%' OR cashier='REGR_TEST';" >/dev/null
$PSQL $DB -q -c "DELETE FROM store_losses WHERE loss_no LIKE 'POS-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM store_receiving WHERE order_no LIKE 'POS-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM store_inventory WHERE store_code='$STORE';" >/dev/null
$PSQL $DB -q -c "DELETE FROM store_replenish_req WHERE req_no LIKE 'POS-REGR-%';" >/dev/null

# 库存批次：1000 枚
$PSQL $DB -q -c "INSERT INTO inv_batches (batch_no, product_code, qty, warehouse_code, location_code, store_code) VALUES ('$BATCH_NO','$PRODUCT',1000,'WMS-VTE-MAIN','LOC-01','ALL');" >/dev/null
green "  ✓ seed batch=$BATCH_NO qty=1000"

LEDGER_BASE=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger;")

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: A1 创建销售单 — 扣库 + ledger SALE_OUT"
SALE_PAYLOAD=$(cat <<EOF
{"store_code":"$STORE","cashier":"REGR_TEST","pay_method":"CASH",
 "items":[{"product_code":"$PRODUCT","product_name_zh":"AAA鲜蛋","batch_no":"$BATCH_NO","qty":10,"unit_price":5.5}]}
EOF
)
R1=$(curl -s -o /tmp/t1.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$SALE_PAYLOAD")
assert_ok "T1.1 createSale 200" "$R1"

SALE_NO=$(cat /tmp/t1.json | grep -oE '"sale_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$SALE_NO" ] && green "  ✓ T1.2 sale_no=$SALE_NO" && PASS=$((PASS+1)) || { red "  ✗ T1.2 sale_no 空"; FAIL=$((FAIL+1)); }

# batch 减 10
B_AFTER=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T1.3 batch 1000-10=990" "990" "$B_AFTER"

# pos_sale_items 应有 1 行
ITEM_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM pos_sale_items WHERE sale_no='$SALE_NO';")
assert_eq "T1.4 pos_sale_items +1" "1" "$ITEM_CNT"

# inv_ledger SALE_OUT 流水
LEDGER_SALE=$($PSQL $DB -tA -c "SELECT qty_change::integer FROM inv_ledger WHERE ref_no='$SALE_NO' AND change_type='SALE_OUT';")
assert_eq "T1.5 SALE_OUT ledger -10" "-10" "$LEDGER_SALE"

# pos_sales.net_amount = 10*5.5 = 55.00
NET=$($PSQL $DB -tA -c "SELECT net_amount FROM pos_sales WHERE sale_no='$SALE_NO';")
assert_eq "T1.6 net_amount=55.00" "55.00" "$NET"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: A1 余量不足整笔回滚"
HUGE_PAYLOAD=$(cat <<EOF
{"store_code":"$STORE","cashier":"REGR_TEST","pay_method":"CASH",
 "items":[{"product_code":"$PRODUCT","batch_no":"$BATCH_NO","qty":99999,"unit_price":5.5}]}
EOF
)
R2=$(curl -s -o /tmp/t2.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$HUGE_PAYLOAD")
assert_fail "T2.1 余量不足返非 2xx" "$R2"

B_AFTER2=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T2.2 batch 未变 (仍 990)" "990" "$B_AFTER2"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: A2 退款 — 反向加库 + SALE_REFUND ledger"
R3=$(curl -s -o /tmp/t3.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales/$SALE_NO/refund" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reason":"regression test"}')
assert_ok "T3.1 refund 200" "$R3"

B_REFUND=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T3.2 batch 990+10=1000 (库存还原)" "1000" "$B_REFUND"

LEDGER_REFUND=$($PSQL $DB -tA -c "SELECT qty_change::integer FROM inv_ledger WHERE ref_no='$SALE_NO' AND change_type='SALE_REFUND';")
assert_eq "T3.3 SALE_REFUND ledger +10" "10" "$LEDGER_REFUND"

POS_STATUS=$($PSQL $DB -tA -c "SELECT status FROM pos_sales WHERE sale_no='$SALE_NO';")
assert_eq "T3.4 pos_sales.status=REFUNDED" "REFUNDED" "$POS_STATUS"

# 二次退款应被拒
R3B=$(curl -s -o /tmp/t3b.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales/$SALE_NO/refund" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reason":"dup"}')
# 业务码 400 但 HTTP 仍可能 201；用 body code 判断
DUP_CODE=$(cat /tmp/t3b.json | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T3.5 二次退款拒绝 (code 400)" "400" "$DUP_CODE"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: A3 门店损耗审批"
LOSS_NO="POS-REGR-LR-$(date +%s | tail -c 5)"
# 表 store_losses.id 是 NOT NULL 无 SEQUENCE 默认 → 测试侧手工 MAX+1
NEXT_ID=$($PSQL $DB -tA -c "SELECT COALESCE(MAX(id),0)+1 FROM store_losses;")
$PSQL $DB -q -c "INSERT INTO store_losses (id, loss_no, store_code, item, qty, reason, status) VALUES ($NEXT_ID,'$LOSS_NO','$STORE','$PRODUCT','5','过期','DRAFT');" >/dev/null

R4=$(curl -s -o /tmp/t4.json -w '%{http_code}' -X POST "$API/api/v3/pos/losses/$LOSS_NO/approve" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"batch_no\":\"$BATCH_NO\",\"item\":\"$PRODUCT\",\"qty\":5,\"store_code\":\"$STORE\",\"reason\":\"过期\"}")
assert_ok "T4.1 approveStoreLoss 200" "$R4"

LOSS_BATCH=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T4.2 batch 1000-5=995" "995" "$LOSS_BATCH"

LEDGER_LOSS=$($PSQL $DB -tA -c "SELECT qty_change::integer FROM inv_ledger WHERE ref_no='$LOSS_NO' AND change_type='STORE_LOSS';")
assert_eq "T4.3 STORE_LOSS ledger -5" "-5" "$LEDGER_LOSS"

LOSS_STATUS=$($PSQL $DB -tA -c "SELECT status FROM store_losses WHERE loss_no='$LOSS_NO';")
assert_eq "T4.4 store_losses.status=APPROVED" "APPROVED" "$LOSS_STATUS"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: A4 门店收货确认"
RECV_NO="POS-REGR-SR-$(date +%s | tail -c 5)"
$PSQL $DB -q -c "INSERT INTO store_receiving (order_no, store_code, status) VALUES ('$RECV_NO','$STORE','PENDING');" >/dev/null

R5=$(curl -s -o /tmp/t5.json -w '%{http_code}' -X POST "$API/api/v3/pos/receiving/$RECV_NO/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"batch_no\":\"$BATCH_NO\",\"product_code\":\"$PRODUCT\",\"qty\":20}]}")
assert_ok "T5.1 confirmReceiving 200" "$R5"

RECV_STATUS=$($PSQL $DB -tA -c "SELECT status FROM store_receiving WHERE order_no='$RECV_NO';")
assert_eq "T5.2 store_receiving.status=ACCEPTED" "ACCEPTED" "$RECV_STATUS"

LEDGER_RECV=$($PSQL $DB -tA -c "SELECT qty_change::integer FROM inv_ledger WHERE ref_no='$RECV_NO' AND change_type='STORE_RECV';")
assert_eq "T5.3 STORE_RECV ledger +20" "20" "$LEDGER_RECV"

# 二次确认应拒绝
R5B=$(curl -s -o /tmp/t5b.json -w '%{http_code}' -X POST "$API/api/v3/pos/receiving/$RECV_NO/confirm" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')
DUP_RECV=$(cat /tmp/t5b.json | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T5.4 二次确认拒绝 (code 400)" "400" "$DUP_RECV"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: A5 补货申请审批"
REQ_NO="POS-REGR-RP-$(date +%s | tail -c 5)"
NEXT_RP_ID=$($PSQL $DB -tA -c "SELECT COALESCE(MAX(id),0)+1 FROM store_replenish_req;")
$PSQL $DB -q -c "INSERT INTO store_replenish_req (id, req_no, store_code, item, qty, urgency, status) VALUES ($NEXT_RP_ID,'$REQ_NO','$STORE','$PRODUCT','50','HIGH','PENDING');" >/dev/null

R6=$(curl -s -o /tmp/t6.json -w '%{http_code}' -X POST "$API/api/v3/pos/replenish/$REQ_NO/approve" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"decision":"APPROVED"}')
assert_ok "T6.1 approveReplenishReq 200" "$R6"

REQ_STATUS=$($PSQL $DB -tA -c "SELECT status FROM store_replenish_req WHERE req_no='$REQ_NO';")
assert_eq "T6.2 store_replenish_req.status=APPROVED" "APPROVED" "$REQ_STATUS"

# ══════════════════════════════════════════════════════════════════════════
# V2 FIDELITY BACKFILL — POS sessions / 幂等 / Token 防跨店 / 价格保护
# 来源：_archive/phoenix-backend-v2-sqlite/src/routes/pos.js
# ══════════════════════════════════════════════════════════════════════════
cyan ""
cyan "▶ Phase V2-POS V2 fidelity — sessions/幂等/Token/价格保护"

# 准备一个二号批次给 V2 fidelity 测试用
BATCH2="POS-REGR-V2BAT-$(date +%s | tail -c 6)"
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH2';" >/dev/null
$PSQL $DB -q -c "INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code) VALUES ('$BATCH2','$PRODUCT',500,500,'AVAILABLE','WMS-VTE-MAIN','LOC-01','ALL');" >/dev/null

# 价格簿 + price item: retail_lower=8.0 用于触发价格保护
PB_REGR="PB-REGR-$(date +%s | tail -c 6)"
$PSQL $DB -q -c "INSERT INTO prc_price_items (item_id, price_book_id, sku_code, retail_lower, retail_upper) VALUES ('PI-REGR-1','$PB_REGR','$PRODUCT',8.0,15.0) ON CONFLICT DO NOTHING;" >/dev/null

# T7-V2.1 openSession — Token 中没有 storeCode（admin/ALL），需 body 给 store_code
SES_R=$(curl -s -o /tmp/v2_ses_open.json -w '%{http_code}' -X POST "$API/api/v3/pos/sessions" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"store_code\":\"$STORE\",\"opening_cash\":500}")
assert_ok "T7-V2.1 openSession 200" "$SES_R"
SESSION_NO=$(cat /tmp/v2_ses_open.json | grep -oE '"session_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$SESSION_NO" ] && green "  ✓ T7-V2.1.1 session_no=$SESSION_NO" && PASS=$((PASS+1)) || { red "  ✗ T7-V2.1.1 session_no 缺失"; FAIL=$((FAIL+1)); FAILURES+=("T7-V2.1.1 no session_no"); }

# T7-V2.2 getCurrentSession 应返回当前 OPEN 班次
CUR_R=$(curl -s -o /tmp/v2_ses_get.json -w '%{http_code}' \
  "$API/api/v3/pos/sessions?store_code=$STORE" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T7-V2.2 getCurrentSession 200" "$CUR_R"
CUR_SES_NO=$(cat /tmp/v2_ses_get.json | grep -oE '"session_no":"[^"]*"' | head -1 | cut -d'"' -f4)
assert_eq "T7-V2.2.1 currentSession.session_no=$SESSION_NO" "$SESSION_NO" "$CUR_SES_NO"

# T7-V2.3 重复 openSession 幂等 — 应返回已有班次（idempotent:true）
SES_DUP=$(curl -s -o /tmp/v2_ses_dup.json -w '%{http_code}' -X POST "$API/api/v3/pos/sessions" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"store_code\":\"$STORE\",\"opening_cash\":999}")
assert_ok "T7-V2.3 openSession 重复幂等 200" "$SES_DUP"
DUP_FLAG=$(cat /tmp/v2_ses_dup.json | grep -oE '"idempotent":true')
[ -n "$DUP_FLAG" ] && green "  ✓ T7-V2.3.1 idempotent=true" && PASS=$((PASS+1)) || { red "  ✗ T7-V2.3.1 idempotent flag 缺失"; FAIL=$((FAIL+1)); FAILURES+=("T7-V2.3.1"); }

# T7-V2.4 价格保护 — 没有 auth_override，unit_price=5.0 < retail_lower=8.0 → 400
PB_FAIL=$(curl -s -o /tmp/v2_pb_fail.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"sale_no\":\"POS-REGR-V2-PB-1\",\"store_code\":\"$STORE\",\"price_book_id\":\"$PB_REGR\",\"items\":[{\"product_code\":\"$PRODUCT\",\"batch_no\":\"$BATCH2\",\"qty\":1,\"unit_price\":5.0}]}")
assert_fail "T7-V2.4 价格低于 retail_lower 被拦截 (BIZ-02)" "$PB_FAIL"
PB_ERR=$(cat /tmp/v2_pb_fail.json | grep -oE '"error_type":"[^"]*"' | head -1 | cut -d'"' -f4)
assert_eq "T7-V2.4.1 error_type=PRICE_LIMIT_ERROR" "PRICE_LIMIT_ERROR" "$PB_ERR"

# T7-V2.5 sale_no 幂等 — 同 sale_no 重发返回 idempotent:true 不重复扣库存
PB_OK=$(curl -s -o /tmp/v2_pb_ok.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"sale_no\":\"POS-REGR-V2-IDEM-1\",\"store_code\":\"$STORE\",\"session_no\":\"$SESSION_NO\",\"items\":[{\"product_code\":\"$PRODUCT\",\"batch_no\":\"$BATCH2\",\"qty\":3,\"unit_price\":10.0}]}")
assert_ok "T7-V2.5 首次销售 200" "$PB_OK"
QTY_AFTER1=$($PSQL $DB -tA -c "SELECT qty_available::integer FROM inv_batches WHERE batch_no='$BATCH2';")
assert_eq "T7-V2.5.1 首次后 qty_available=497" "497" "$QTY_AFTER1"

# 重发同 sale_no
PB_IDEM=$(curl -s -o /tmp/v2_pb_idem.json -w '%{http_code}' -X POST "$API/api/v3/pos/sales" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"sale_no\":\"POS-REGR-V2-IDEM-1\",\"store_code\":\"$STORE\",\"session_no\":\"$SESSION_NO\",\"items\":[{\"product_code\":\"$PRODUCT\",\"batch_no\":\"$BATCH2\",\"qty\":3,\"unit_price\":10.0}]}")
assert_ok "T7-V2.5.2 重发幂等 200" "$PB_IDEM"
IDEM_FLAG=$(cat /tmp/v2_pb_idem.json | grep -oE '"idempotent":true')
[ -n "$IDEM_FLAG" ] && green "  ✓ T7-V2.5.3 idempotent=true" && PASS=$((PASS+1)) || { red "  ✗ T7-V2.5.3 missing idempotent"; FAIL=$((FAIL+1)); FAILURES+=("T7-V2.5.3"); }
QTY_AFTER2=$($PSQL $DB -tA -c "SELECT qty_available::integer FROM inv_batches WHERE batch_no='$BATCH2';")
assert_eq "T7-V2.5.4 重发后 qty_available 不变 (仍 497)" "497" "$QTY_AFTER2"

# T7-V2.6 closeSession — 汇总 net_amount 并归档
CLOSE_R=$(curl -s -o /tmp/v2_ses_close.json -w '%{http_code}' -X POST "$API/api/v3/pos/sessions/close" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"session_no\":\"$SESSION_NO\",\"closing_cash\":530,\"remark\":\"regression close\"}")
assert_ok "T7-V2.6 closeSession 200" "$CLOSE_R"
SES_STATUS=$($PSQL $DB -tA -c "SELECT status FROM pos_sessions WHERE session_no='$SESSION_NO';")
assert_eq "T7-V2.6.1 session status=CLOSED" "CLOSED" "$SES_STATUS"
SES_TOTAL=$($PSQL $DB -tA -c "SELECT total_sales::int FROM pos_sessions WHERE session_no='$SESSION_NO';")
assert_eq "T7-V2.6.2 total_sales=30 (3×10.0)" "30" "$SES_TOTAL"

# T7-V2.7 getTodaySummary — 包含上面销售 30 元
TODAY_R=$(curl -s -o /tmp/v2_today.json -w '%{http_code}' \
  "$API/api/v3/pos/today?store_code=$STORE" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T7-V2.7 getTodaySummary 200" "$TODAY_R"
TODAY_HAS_PRODUCT=$(cat /tmp/v2_today.json | grep -oE "\"product_code\":\"$PRODUCT\"" | head -1)
[ -n "$TODAY_HAS_PRODUCT" ] && green "  ✓ T7-V2.7.1 top_items 含 $PRODUCT" && PASS=$((PASS+1)) || { red "  ✗ T7-V2.7.1 top_items 缺 $PRODUCT"; FAIL=$((FAIL+1)); FAILURES+=("T7-V2.7.1"); }

# ══════════════════════════════════════════════════════════════════════════
# V2 FIDELITY BACKFILL — 门店日结双账联动 (acc_ledger + fin_transactions)
# 来源：_archive/phoenix-backend-v2-sqlite/src/routes/dailyClose.js
# ══════════════════════════════════════════════════════════════════════════
cyan ""
cyan "▶ Phase V2-DC V2 fidelity — 门店日结预览/提交/双账"

# 准备测试销售数据
BATCH3="POS-REGR-DC-$(date +%s | tail -c 6)"
DC_DATE=$(date +%Y-%m-%d)
DC_STORE="ST-DC-REGR"
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no='$BATCH3';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sale_items WHERE sale_no LIKE 'POS-DC-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sales WHERE sale_no LIKE 'POS-DC-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM daily_close WHERE close_no LIKE 'DCL-%-$DC_STORE';" >/dev/null
$PSQL $DB -q -c "DELETE FROM acc_ledger WHERE ref_no LIKE 'DCL-%-$DC_STORE';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_transactions WHERE ref_no LIKE 'DCL-%-$DC_STORE';" >/dev/null
$PSQL $DB -q -c "INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code) VALUES ('$BATCH3','$PRODUCT',1000,1000,'AVAILABLE','WMS-VTE-MAIN','LOC-01','ALL');" >/dev/null

# 当日造 2 单销售：CASH 100 + QR 60 = 160 元
curl -s -o /dev/null -X POST "$API/api/v3/pos/sales" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"sale_no\":\"POS-DC-REGR-1\",\"store_code\":\"$DC_STORE\",\"pay_method\":\"CASH\",\"items\":[{\"product_code\":\"$PRODUCT\",\"batch_no\":\"$BATCH3\",\"qty\":10,\"unit_price\":10.0}]}"
curl -s -o /dev/null -X POST "$API/api/v3/pos/sales" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"sale_no\":\"POS-DC-REGR-2\",\"store_code\":\"$DC_STORE\",\"pay_method\":\"QR_CODE\",\"items\":[{\"product_code\":\"$PRODUCT\",\"batch_no\":\"$BATCH3\",\"qty\":6,\"unit_price\":10.0}]}"

# T8-V2.1 preview — 应聚合 total_sales=160 / cash=100 / qr=60
PV_R=$(curl -s -o /tmp/v2_dc_pv.json -w '%{http_code}' \
  "$API/api/v3/store/daily-close-v2/preview?store_code=$DC_STORE&close_date=$DC_DATE" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T8-V2.1 daily-close preview 200" "$PV_R"
PV_TOTAL=$(cat /tmp/v2_dc_pv.json | grep -oE '"total_sales":[0-9.]*' | head -1 | cut -d: -f2 | cut -d. -f1)
PV_CASH=$(cat /tmp/v2_dc_pv.json | grep -oE '"cash_sales":[0-9.]*' | head -1 | cut -d: -f2 | cut -d. -f1)
PV_QR=$(cat /tmp/v2_dc_pv.json | grep -oE '"qr_sales":[0-9.]*' | head -1 | cut -d: -f2 | cut -d. -f1)
assert_eq "T8-V2.1.1 total_sales=160" "160" "$PV_TOTAL"
assert_eq "T8-V2.1.2 cash_sales=100" "100" "$PV_CASH"
assert_eq "T8-V2.1.3 qr_sales=60" "60" "$PV_QR"

# T8-V2.2 submit — cash_actual=105 (盘盈 5) → 双账：1 SALES_REVENUE + 1 CASH_OVERAGE + 1 fin_transactions
SUB_R=$(curl -s -o /tmp/v2_dc_sub.json -w '%{http_code}' -X POST "$API/api/v3/store/daily-close-v2/submit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"store_code\":\"$DC_STORE\",\"close_date\":\"$DC_DATE\",\"cash_actual\":105,\"note\":\"regression test\"}")
assert_ok "T8-V2.2 daily-close submit 200" "$SUB_R"
SUB_CLOSE_NO=$(cat /tmp/v2_dc_sub.json | grep -oE '"close_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$SUB_CLOSE_NO" ] && green "  ✓ T8-V2.2.1 close_no=$SUB_CLOSE_NO" && PASS=$((PASS+1)) || { red "  ✗ T8-V2.2.1 close_no missing"; FAIL=$((FAIL+1)); FAILURES+=("T8-V2.2.1"); }

# T8-V2.3 daily_close 落库 + status=SUBMITTED
DC_STATUS=$($PSQL $DB -tA -c "SELECT status FROM daily_close WHERE close_no='$SUB_CLOSE_NO';")
assert_eq "T8-V2.3.1 daily_close.status=SUBMITTED" "SUBMITTED" "$DC_STATUS"
DC_TOTAL=$($PSQL $DB -tA -c "SELECT total_sales::int FROM daily_close WHERE close_no='$SUB_CLOSE_NO';")
assert_eq "T8-V2.3.2 total_sales=160" "160" "$DC_TOTAL"
DC_CASH_DIFF=$($PSQL $DB -tA -c "SELECT cash_diff::int FROM daily_close WHERE close_no='$SUB_CLOSE_NO';")
assert_eq "T8-V2.3.3 cash_diff=5 (105-100)" "5" "$DC_CASH_DIFF"

# T8-V2.4 acc_ledger 双账 (SALES_REVENUE + CASH_OVERAGE)
LD_REV=$($PSQL $DB -tA -c "SELECT amount::int FROM acc_ledger WHERE ref_no='$SUB_CLOSE_NO' AND ledger_type='SALES_REVENUE';")
assert_eq "T8-V2.4.1 acc_ledger SALES_REVENUE=160" "160" "$LD_REV"
LD_OVER=$($PSQL $DB -tA -c "SELECT amount::int FROM acc_ledger WHERE ref_no='$SUB_CLOSE_NO' AND ledger_type='CASH_OVERAGE';")
assert_eq "T8-V2.4.2 acc_ledger CASH_OVERAGE=5" "5" "$LD_OVER"

# T8-V2.5 fin_transactions REV-STORE CREDIT 入账
FT_AMT=$($PSQL $DB -tA -c "SELECT amount::int FROM fin_transactions WHERE ref_no='$SUB_CLOSE_NO' AND account_code='REV-STORE' AND type='CREDIT';")
assert_eq "T8-V2.5.1 fin_transactions REV-STORE=160" "160" "$FT_AMT"

# T8-V2.6 重复提交拒绝
DUP_R=$(curl -s -o /tmp/v2_dc_dup.json -w '%{http_code}' -X POST "$API/api/v3/store/daily-close-v2/submit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"store_code\":\"$DC_STORE\",\"close_date\":\"$DC_DATE\",\"cash_actual\":105}")
assert_fail "T8-V2.6 重复日结被拒绝 (HTTP 400)" "$DUP_R"

# T8-V2.7 list (history)
LIST_R=$(curl -s -o /tmp/v2_dc_lst.json -w '%{http_code}' \
  "$API/api/v3/store/daily-close-v2?store_code=$DC_STORE" \
  -H "Authorization: Bearer $TOKEN")
assert_ok "T8-V2.7 list dailyClose 200" "$LIST_R"
LIST_HAS=$(cat /tmp/v2_dc_lst.json | grep -oE "\"close_no\":\"$SUB_CLOSE_NO\"")
[ -n "$LIST_HAS" ] && green "  ✓ T8-V2.7.1 list 含本次 close_no" && PASS=$((PASS+1)) || { red "  ✗ T8-V2.7.1 list 缺 close_no"; FAIL=$((FAIL+1)); FAILURES+=("T8-V2.7.1"); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Phase 6 数据一致性"
# E-01: 测试期间至少 4 条新 ledger (SALE_OUT + SALE_REFUND + STORE_LOSS + STORE_RECV)
LEDGER_END=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger;")
DELTA=$((LEDGER_END - LEDGER_BASE))
if [ "$DELTA" -ge 4 ]; then green "  ✓ E-01 ledger 新增 $DELTA 条 (≥4 条预期)"; PASS=$((PASS+1)); else red "  ✗ E-01 ledger 新增 $DELTA<4"; FAIL=$((FAIL+1)); FAILURES+=("E-01 delta=$DELTA"); fi

# E-02: batch 库存守恒 (排除 STORE_RECV — 它影响 store_inventory 而非 inv_batches.qty)
# Seed=1000 +SaleOut(-10) +Refund(+10) +Loss(-5) = 995
FINAL=$($PSQL $DB -tA -c "SELECT qty::integer FROM inv_batches WHERE batch_no='$BATCH_NO';")
LEDGER_SUM=$($PSQL $DB -tA -c "SELECT COALESCE(SUM(qty_change),0)::integer FROM inv_ledger WHERE batch_no='$BATCH_NO' AND change_type NOT IN ('STORE_RECV','STORE_TRANSFER');")
EXPECTED=$((1000 + LEDGER_SUM))
assert_eq "E-02 守恒 (1000+Σledger除STORE_RECV=qty)" "$EXPECTED" "$FINAL"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM inv_ledger WHERE batch_no IN ('$BATCH_NO','$BATCH2','$BATCH3') OR ref_no LIKE 'POS-REGR-%' OR ref_no LIKE 'POS-DC-REGR-%' OR ref_no LIKE 'S-%REGR%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no IN ('$BATCH_NO','$BATCH2','$BATCH3');" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sale_items WHERE sale_no LIKE 'POS-REGR-%' OR sale_no LIKE 'POS-DC-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sales WHERE sale_no LIKE 'POS-REGR-%' OR sale_no LIKE 'POS-DC-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pos_sessions WHERE session_no='$SESSION_NO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM prc_price_items WHERE price_book_id='$PB_REGR';" >/dev/null
$PSQL $DB -q -c "DELETE FROM store_losses WHERE loss_no='$LOSS_NO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM store_receiving WHERE order_no='$RECV_NO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM store_replenish_req WHERE req_no='$REQ_NO';" >/dev/null
$PSQL $DB -q -c "DELETE FROM wms_outbound WHERE task_no LIKE 'WO-REPL-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM daily_close WHERE close_no LIKE 'DCL-%-$DC_STORE';" >/dev/null
$PSQL $DB -q -c "DELETE FROM acc_ledger WHERE ref_no LIKE 'DCL-%-$DC_STORE';" >/dev/null
$PSQL $DB -q -c "DELETE FROM fin_transactions WHERE ref_no LIKE 'DCL-%-$DC_STORE';" >/dev/null
green "  ✓ test data 清理完毕"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then green "✅ 全部 $PASS 项 PASS"; else red "❌ $FAIL 项 FAIL / $((PASS+FAIL))"; for f in "${FAILURES[@]}"; do red "  • $f"; done; fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
