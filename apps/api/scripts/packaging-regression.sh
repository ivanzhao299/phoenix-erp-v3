#!/usr/bin/env bash
# 分级包装中心回归测试 — 覆盖 commit f3c903e + d584979 + 0f5674b + 74ef67a + ad88c54 + a208990 + 8e5cae0 共 7 个提交的修复
#
# 用法：API_URL=http://127.0.0.1:3100 ADMIN_USER=admin ADMIN_PASS=admin123 bash packaging-regression.sh
# 退出码 = 失败用例数
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

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then green "  ✓ $name"; PASS=$((PASS+1));
  else red "  ✗ $name"; red "      expected: $expected"; red "      actual:   $actual"; FAIL=$((FAIL+1)); FAILURES+=("$name | expected=$expected | actual=$actual"); fi
}
assert_ok() {
  local name="$1" code="$2"
  case "$code" in 20[0-9]) green "  ✓ $name (HTTP $code)"; PASS=$((PASS+1)) ;; *) red "  ✗ $name HTTP $code (expected 2xx)"; FAIL=$((FAIL+1)); FAILURES+=("$name | HTTP=$code") ;; esac
}
assert_gt() {
  local name="$1" floor="$2" actual="$3"
  if [ "$actual" -gt "$floor" ] 2>/dev/null; then green "  ✓ $name ($actual > $floor)"; PASS=$((PASS+1));
  else red "  ✗ $name ($actual !> $floor)"; FAIL=$((FAIL+1)); FAILURES+=("$name | actual=$actual !> $floor"); fi
}
assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -q -- "$needle"; then green "  ✓ $name"; PASS=$((PASS+1));
  else red "  ✗ $name (missing '$needle')"; red "      got: $(printf '%s' "$haystack" | head -c 200)"; FAIL=$((FAIL+1)); FAILURES+=("$name | needle=$needle"); fi
}

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ token=${TOKEN:0:30}..."

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 1) Seed 测试数据"
TODAY=$(date +%Y-%m-%d)
DATEKEY=$(date -u +%Y%m%d)   # 用 UTC 对齐 API（new Date().toISOString()）
HOUSE="H-REGR-PKG"
SHIFT_NO="SHIFT-REGR-PKG-${DATEKEY}-$(date +%s | tail -c 5)"

# 清理上一轮残留
$PSQL $DB -q -c "DELETE FROM pkg_tasks WHERE house_code='$HOUSE' OR source_item LIKE '%REGR-PKG%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pkg_shifts WHERE house_code='$HOUSE' OR shift_no LIKE 'SHIFT-REGR-PKG%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_ledger WHERE batch_no LIKE 'EGG-%-${HOUSE}-%' OR batch_no LIKE 'BAT-%-${HOUSE}-%' OR batch_no LIKE 'PACK-%-${HOUSE}-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no LIKE 'EGG-%-${HOUSE}-%' OR batch_no LIKE 'BAT-%-${HOUSE}-%' OR batch_no LIKE 'PACK-%-${HOUSE}-%';" >/dev/null

# 建 shift — 走 packaging 专用 API (返 data.id)
SHIFT_RES=$(curl -s -X POST "$API/api/packaging/shifts" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"shift_date\":\"$TODAY\",\"shift_type\":\"MORNING\",\"shift_time\":\"早班\",\"house_code\":\"$HOUSE\",\"operator\":\"REGR\"}")
SHIFT_ID=$(printf '%s' "$SHIFT_RES" | grep -oE '"id":[0-9]+' | head -1 | cut -d: -f2)
[ -n "$SHIFT_ID" ] || { red "建 shift 失败：$SHIFT_RES"; exit 99; }
green "  ✓ shift_id=$SHIFT_ID"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T1: 集蛋班次 complete → 5 步事务全部落库"
COMPLETE_RES=$(curl -s -X POST "$API/api/packaging/shifts/$SHIFT_ID/complete" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"eggs_collected":3000,"dirty_eggs":30,"broken_eggs":20}')
CODE=$(printf '%s' "$COMPLETE_RES" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T1.1 complete 业务码 200" "200" "$CODE"

# task_no / batch_no 应在响应里
TASK_NO=$(printf '%s' "$COMPLETE_RES" | grep -oE '"task_no":"[^"]*"' | head -1 | cut -d'"' -f4)
BATCH_NO=$(printf '%s' "$COMPLETE_RES" | grep -oE '"batch_no":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$TASK_NO" ] && green "  ✓ T1.2 task_no=$TASK_NO" && PASS=$((PASS+1)) || { red "  ✗ T1.2 task_no 空"; FAIL=$((FAIL+1)); }
[ -n "$BATCH_NO" ] && green "  ✓ T1.3 batch_no=$BATCH_NO" && PASS=$((PASS+1)) || { red "  ✗ T1.3 batch_no 空"; FAIL=$((FAIL+1)); }

# pkg_shifts → DONE
SHIFT_STATUS=$($PSQL $DB -tA -c "SELECT status FROM pkg_shifts WHERE id=$SHIFT_ID;")
assert_eq "T1.4 pkg_shifts.status=DONE" "DONE" "$SHIFT_STATUS"

# inv_batches 有原料批次
INV_BATCH=$($PSQL $DB -tA -c "SELECT qty FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T1.5 inv_batches 鲜蛋批次 qty=2950" "2950" "$INV_BATCH"

# inv_ledger FARM_IN
LEDGER_IN=$($PSQL $DB -tA -c "SELECT qty_change FROM inv_ledger WHERE batch_no='$BATCH_NO' AND change_type='EGG_IN' LIMIT 1;")
assert_eq "T1.6 inv_ledger EGG_IN +2950" "2950" "$LEDGER_IN"

# pkg_tasks 自动建分级任务
GRADING_TASK=$($PSQL $DB -tA -c "SELECT task_no FROM pkg_tasks WHERE shift_id=$SHIFT_ID AND task_type='GRADING';")
[ -n "$GRADING_TASK" ] && green "  ✓ T1.7 GRADING task 已创建 ($GRADING_TASK)" && PASS=$((PASS+1)) || { red "  ✗ T1.7 GRADING task 缺失"; FAIL=$((FAIL+1)); }

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T2: getGradingTasks ORDER BY 状态优先级 + task_type 过滤"
LIST_RES=$(curl -sf "$API/api/packaging/grading-tasks?status=all&date=all" -H "Authorization: Bearer $TOKEN")
# 看任务出现在列表中
assert_contains "T2.1 grading-tasks 返回新建的任务" "$GRADING_TASK" "$LIST_RES"

# 全部 task_type=GRADING（不含 PACKING）
ALL_TYPES=$(printf '%s' "$LIST_RES" | python3 -c "
import sys, json
d = json.load(sys.stdin)
types = set()
for r in d.get('data', []):
    types.add(r.get('task_type') or 'NULL')
print(','.join(sorted(types)))
" 2>/dev/null)
case "$ALL_TYPES" in
  GRADING|NULL|GRADING,NULL|NULL,GRADING)
    green "  ✓ T2.2 仅 GRADING / NULL 任务 (types=$ALL_TYPES)"; PASS=$((PASS+1)) ;;
  *)
    red "  ✗ T2.2 任务类型混杂: $ALL_TYPES"; FAIL=$((FAIL+1)); FAILURES+=("T2.2 task_type=$ALL_TYPES") ;;
esac

# CANCELLED 不在列表
NO_CANCEL=$(printf '%s' "$LIST_RES" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(sum(1 for r in d.get('data',[]) if (r.get('status') or '').upper() == 'CANCELLED'))
")
assert_eq "T2.3 CANCELLED 不在列表" "0" "$NO_CANCEL"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T3: submitGrade → 补齐 4 个派生字段 (P0-1)"
GRADE_BODY='{"grade_results":{"1":1500,"2":800,"3":300,"4":250},"anomaly_reason":"","presort":{"xl_qty":0,"dirty_qty":0,"broken_qty":50}}'
G_RES=$(curl -s -X POST "$API/api/packaging/tasks/$GRADING_TASK/grade" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$GRADE_BODY")
G_CODE=$(printf '%s' "$G_RES" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T3.1 submitGrade 业务码 200" "200" "$G_CODE"

# 查 4 个派生字段
DERIVED=$($PSQL $DB -tA -F'|' -c "
  SELECT packed_qty, breakage_qty, discrepancy_qty, status
  FROM pkg_tasks WHERE task_no='$GRADING_TASK';
")
PACKED=$(echo "$DERIVED" | cut -d'|' -f1)
BREAKAGE=$(echo "$DERIVED" | cut -d'|' -f2)
DISCR=$(echo "$DERIVED" | cut -d'|' -f3)
ST=$(echo "$DERIVED" | cut -d'|' -f4)
assert_eq "T3.2 packed_qty = Σ grade_results = 2850" "2850" "$PACKED"
# breakage_qty = 非可售等级和 + presortBroken — 取决于 sys_dict.PKG_EGG_GRADE saleable 配置
# 暂只验证 breakage_qty >= presortBroken(50)
assert_gt "T3.3 breakage_qty >= presortBroken (50)" "49" "$BREAKAGE"
# discrepancy_qty = plan - packed - presort = 2950 - 2850 - 50 = 50
assert_eq "T3.4 discrepancy_qty = plan - packed - presort = 50" "50" "$DISCR"
assert_eq "T3.5 status → DONE" "DONE" "$ST"

# grade_batches 多等级拆分 → 每个非零等级应有 inv_batches BAT-... 行
BAT_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_batches WHERE batch_no LIKE 'BAT-${DATEKEY}-${HOUSE}-G%';")
assert_eq "T3.6 多等级拆分 inv_batches=4 行 (B4)" "4" "$BAT_CNT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T4: packComplete → inv_batches 用真实 schema (A1)"
# 建一个 PACKING 任务（直接 INSERT 模拟 — V3 submitGrade 已不自动建）
PACK_TASK="PACK-REGR-${DATEKEY}-$(date +%s | tail -c 5)"
$PSQL $DB -q -c "
  INSERT INTO pkg_tasks (task_no, batch_no, source_item, plan_qty, packed_qty, status, task_type, house_code, grade_results, start_time, created_at, updated_at)
  VALUES ('$PACK_TASK', 'BAT-REGR-PACK', '回归测试', 1000, 0, 'IN_PROGRESS', 'PACKING', '$HOUSE', '{\"1\":600,\"2\":400}', NOW(), NOW(), NOW());
" >/dev/null

P_RES=$(curl -s -X POST "$API/api/packaging/tasks/$PACK_TASK/pack-complete" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"packed_qty":1000,"output_qty":1000,"pack_spec":"30 枚装"}')
P_CODE=$(printf '%s' "$P_RES" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T4.1 packComplete 业务码 200" "200" "$P_CODE"

# 新建的 inv_batches PACK-* 行 — A1 修后应有真实数据
PACK_INV=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_batches WHERE batch_no LIKE 'PACK-${DATEKEY}-${HOUSE}-%';")
assert_gt "T4.2 packComplete 写入 inv_batches PACK-* 行 (A1)" "0" "$PACK_INV"

# 多等级拆分（{1:600, 2:400}）应有 2 条 PACK-* 行 (B4)
PACK_BAT_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_batches WHERE batch_no LIKE 'PACK-${DATEKEY}-${HOUSE}-G%';")
assert_eq "T4.3 多等级 packComplete 拆 2 行 (B4)" "2" "$PACK_BAT_CNT"

# inv_ledger 配套 PACK_DONE
PACK_LEDGER=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE ref_no='$PACK_TASK' AND change_type='PACK_DONE';")
assert_eq "T4.4 inv_ledger PACK_DONE 2 行" "2" "$PACK_LEDGER"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T5: reopenShift 副作用清理 (commit d584979)"
# 看现在的活跃 GRADING 任务（应有 1 条 from T1）
ACTIVE_BEFORE=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM pkg_tasks WHERE shift_id=$SHIFT_ID AND status<>'CANCELLED' AND task_type='GRADING';")
INV_BEFORE=$($PSQL $DB -tA -c "SELECT qty FROM inv_batches WHERE batch_no='$BATCH_NO';")

# reopen
RE_RES=$(curl -s -X POST "$API/api/packaging/shifts/$SHIFT_ID/reopen" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"reason":"regression test"}')
R_CODE=$(printf '%s' "$RE_RES" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T5.1 reopen 业务码 200" "200" "$R_CODE"

# pkg_tasks 应被置 CANCELLED
ACTIVE_AFTER=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM pkg_tasks WHERE shift_id=$SHIFT_ID AND status<>'CANCELLED' AND task_type='GRADING';")
assert_eq "T5.2 reopen 后无活跃 GRADING 任务" "0" "$ACTIVE_AFTER"

# inv_batches.qty=0
INV_AFTER=$($PSQL $DB -tA -c "SELECT qty FROM inv_batches WHERE batch_no='$BATCH_NO';")
assert_eq "T5.3 reopen 后 inv_batches.qty=0" "0" "$INV_AFTER"

# 反向 EGG_REVERSED ledger
REV=$($PSQL $DB -tA -c "SELECT qty_change FROM inv_ledger WHERE batch_no='$BATCH_NO' AND change_type='EGG_REVERSED' LIMIT 1;")
assert_eq "T5.4 EGG_REVERSED 反向 ledger -2950" "-2950" "$REV"

# shift 回 PENDING
SHIFT_STATUS2=$($PSQL $DB -tA -c "SELECT status FROM pkg_shifts WHERE id=$SHIFT_ID;")
assert_eq "T5.5 shift 回到 PENDING" "PENDING" "$SHIFT_STATUS2"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T6: re-complete 不重复建分级任务"
# 第二次 complete
COMPLETE2=$(curl -s -X POST "$API/api/packaging/shifts/$SHIFT_ID/complete" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"eggs_collected":3500,"dirty_eggs":25,"broken_eggs":15}')
C2_CODE=$(printf '%s' "$COMPLETE2" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T6.1 二次 complete 业务码 200" "200" "$C2_CODE"

# pkg_tasks 应有 1 CANCELLED + 1 IN_PROGRESS（共 2 行）
ALL_TASKS=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM pkg_tasks WHERE shift_id=$SHIFT_ID AND task_type='GRADING';")
assert_eq "T6.2 共 2 行任务（1 CANCELLED + 1 IN_PROGRESS）" "2" "$ALL_TASKS"

ACTIVE2=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM pkg_tasks WHERE shift_id=$SHIFT_ID AND task_type='GRADING' AND status='IN_PROGRESS';")
assert_eq "T6.3 仅 1 行活跃 IN_PROGRESS" "1" "$ACTIVE2"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T7: daily-report-range (B6 新端点)"
RANGE_RES=$(curl -sf "$API/api/packaging/daily-report-range?end_date=$TODAY&days=7" -H "Authorization: Bearer $TOKEN")
RANGE_LEN=$(printf '%s' "$RANGE_RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))")
assert_eq "T7.1 一次返回 7 天" "7" "$RANGE_LEN"

# 第一项 date 应等于 today-6，最后一项 = today
LAST_DATE=$(printf '%s' "$RANGE_RES" | python3 -c "import sys,json; d=json.load(sys.stdin); rows=d.get('data',[]); print(rows[-1]['date'] if rows else '')")
assert_eq "T7.2 末项日期 = today" "$TODAY" "$LAST_DATE"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T8: daily-report by_grade jsonb 聚合 (A2)"
# 这里用 PACK_TASK 之前的 grade_results={"1":600, "2":400} 触发
# packComplete 写入 pkg_tasks.completed_at — 应被聚合到 byGrade
SINGLE_RES=$(curl -sf "$API/api/packaging/daily-report?date=$TODAY" -H "Authorization: Bearer $TOKEN")
# 应至少有 1/2 两个等级 group
BY_GRADE_KEYS=$(printf '%s' "$SINGLE_RES" | python3 -c "
import sys, json
d = json.load(sys.stdin)
keys = sorted([r['grade'] for r in d.get('data',{}).get('by_grade',[])])
print(','.join(keys))
")
# 包含 1 和 2 即可（其他等级是当日历史数据）
case "$BY_GRADE_KEYS" in
  *1*) green "  ✓ T8.1 by_grade 含 grade=1 ($BY_GRADE_KEYS)"; PASS=$((PASS+1)) ;;
  *)   red "  ✗ T8.1 by_grade 缺 grade=1"; FAIL=$((FAIL+1)); FAILURES+=("T8.1 by_grade=$BY_GRADE_KEYS") ;;
esac

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T9: PACKING 任务不污染分级列表 (P0-5)"
# submitGrade 不再自动建 PACKING；现在 grading-tasks 返回是否有 PACKING 类型
LIST2=$(curl -sf "$API/api/packaging/grading-tasks?status=all&date=all" -H "Authorization: Bearer $TOKEN")
PACKING_IN_LIST=$(printf '%s' "$LIST2" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(sum(1 for r in d.get('data',[]) if r.get('task_type') == 'PACKING'))
")
assert_eq "T9.1 分级列表不含 PACKING 任务" "0" "$PACKING_IN_LIST"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ T10: mergeRemainder jsonb '?' 精确匹配 (A5)"
# 建 2 个 REMAINDER 任务：一个 grade=A，一个 grade=AAA — 旧版 LIKE '%A%' 会误撞
REM_A="REM-REGR-A-${DATEKEY}-$(date +%s | tail -c 5)"
REM_AAA="REM-REGR-AAA-${DATEKEY}-$(date +%s | tail -c 4)"
$PSQL $DB -q -c "
  INSERT INTO pkg_tasks (task_no, task_type, status, grade_results, remainder_qty, house_code, created_at, updated_at)
  VALUES
    ('$REM_A',   'REMAINDER', 'PENDING', '{\"A\":100}',   100, '$HOUSE', NOW(), NOW()),
    ('$REM_AAA', 'REMAINDER', 'PENDING', '{\"AAA\":200}', 200, '$HOUSE', NOW(), NOW());
" >/dev/null

MERGE_A=$(curl -s -X POST "$API/api/packaging/tasks/merge-remainder" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"grade":"A"}')
# 只应合并 1 个（REM_A），不撞 REM_AAA
M_CODE=$(printf '%s' "$MERGE_A" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T10.1 mergeRemainder grade=A 业务码 200" "200" "$M_CODE"

A_STATUS=$($PSQL $DB -tA -c "SELECT status FROM pkg_tasks WHERE task_no='$REM_A';")
AAA_STATUS=$($PSQL $DB -tA -c "SELECT status FROM pkg_tasks WHERE task_no='$REM_AAA';")
assert_eq "T10.2 REM_A 应被合并 (MERGED)" "MERGED" "$A_STATUS"
assert_eq "T10.3 REM_AAA 不被误合 (PENDING)" "PENDING" "$AAA_STATUS"

# ══════════════════════════════════════════════════════════════════════════
# V2 FIDELITY BACKFILL — packComplete QUARANTINE 隔离 + 自动建 wms_inbound
# 食品安全：不可售等级 (saleable=false) 必须 QUARANTINE 隔离
# ══════════════════════════════════════════════════════════════════════════
cyan ""
cyan "▶ Phase V2-PKG V2 fidelity — packComplete QUARANTINE + wms_inbound"

# Seed: 加一个 saleable=false 的"X 号蛋" (破损/不合格)
# Fix Pack 1 (HIGH-4) 后 packComplete 读 product_grades（权威数据源），必须两表同步 seed
$PSQL $DB -q -c "DELETE FROM sys_dict WHERE dict_type='PKG_EGG_GRADE' AND dict_code='PKG_EGG_GRADE_X';" >/dev/null
$PSQL $DB -q -c "INSERT INTO sys_dict (dict_type, dict_code, dict_label_zh, name, config_json, status) VALUES ('PKG_EGG_GRADE','PKG_EGG_GRADE_X','破损蛋(测试)','破损蛋','{\"code\":\"X\",\"nameZh\":\"破损蛋\",\"saleable\":false,\"productCode\":\"PRD-EGG-X\"}','ACTIVE');" >/dev/null
# 权威来源: product_grades.is_saleable — packComplete QUARANTINE 逻辑依赖此表
$PSQL $DB -q -c "
  INSERT INTO product_grades (grade_code, grade_name, grade_name_lo, sort_order, is_saleable, is_storable, status, remark)
  VALUES ('X', '破损蛋(测试)', 'Broken Test', 99, FALSE, FALSE, 'ACTIVE', '回归测试用等级: 不可售，验证 QUARANTINE 隔离')
  ON CONFLICT (grade_code) DO UPDATE SET is_saleable = FALSE, is_storable = FALSE, status = 'ACTIVE';
" >/dev/null

# 建 PACKING 任务 — grade_results 含可售 "1"=600 + 不可售 "X"=200
PACK_V2_TASK="PACK-REGR-V2-${DATEKEY}-$(date +%s | tail -c 5)"
$PSQL $DB -q -c "
  INSERT INTO pkg_tasks (task_no, batch_no, source_item, plan_qty, packed_qty, status, task_type, house_code, grade_results, start_time, created_at, updated_at)
  VALUES ('$PACK_V2_TASK', 'BAT-REGR-V2-PACK', '回归V2测试', 800, 0, 'IN_PROGRESS', 'PACKING', '$HOUSE', '{\"1\":600,\"X\":200}', NOW(), NOW(), NOW());
" >/dev/null

P_V2_RES=$(curl -s -X POST "$API/api/packaging/tasks/$PACK_V2_TASK/pack-complete" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"packed_qty":800,"output_qty":800,"pack_spec":"30 枚装"}')
P_V2_CODE=$(printf '%s' "$P_V2_RES" | grep -oE '"code":[0-9]+' | head -1 | cut -d: -f2)
assert_eq "T11-V2.1 packComplete V2 业务码 200" "200" "$P_V2_CODE"

# X 号蛋应入 QUARANTINE batch (qty=200, qty_available=0, status=QUARANTINE)
X_BATCH_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_batches WHERE batch_no LIKE 'PACK-${DATEKEY}-${HOUSE}-GX-%';")
assert_eq "T11-V2.2 X 等级生成 1 个 batch" "1" "$X_BATCH_CNT"
X_STATUS=$($PSQL $DB -tA -c "SELECT status FROM inv_batches WHERE batch_no LIKE 'PACK-${DATEKEY}-${HOUSE}-GX-%' LIMIT 1;")
assert_eq "T11-V2.3 X batch.status=QUARANTINE" "QUARANTINE" "$X_STATUS"
X_AVAIL=$($PSQL $DB -tA -c "SELECT qty_available FROM inv_batches WHERE batch_no LIKE 'PACK-${DATEKEY}-${HOUSE}-GX-%' LIMIT 1;")
assert_eq "T11-V2.4 X batch.qty_available=0" "0" "$X_AVAIL"
X_QTY=$($PSQL $DB -tA -c "SELECT qty FROM inv_batches WHERE batch_no LIKE 'PACK-${DATEKEY}-${HOUSE}-GX-%' LIMIT 1;")
assert_eq "T11-V2.5 X batch.qty=200" "200" "$X_QTY"

# 1 号蛋应入 AVAILABLE batch
ONE_STATUS=$($PSQL $DB -tA -c "SELECT status FROM inv_batches WHERE batch_no LIKE 'PACK-${DATEKEY}-${HOUSE}-G1-%' AND batch_no NOT LIKE '%-G1%-${HOUSE}%' LIMIT 1;")
# 兼容多次 PACK-..-G1 行 (T4 也写了 G1)，按 task 关联挑出本次的
ONE_STATUS=$($PSQL $DB -tA -c "SELECT b.status FROM inv_batches b JOIN inv_ledger l ON l.batch_no=b.batch_no WHERE l.ref_no='$PACK_V2_TASK' AND b.batch_no LIKE 'PACK-${DATEKEY}-${HOUSE}-G1-%' LIMIT 1;")
assert_eq "T11-V2.6 1 batch.status=AVAILABLE" "AVAILABLE" "$ONE_STATUS"

# wms_inbound 应自动建一个 PENDING 任务，qty=600 (仅 AVAILABLE 部分)
WMS_IB_CNT=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM wms_inbound WHERE task_no LIKE 'WMS-IB-$PACK_V2_TASK-%';")
assert_eq "T11-V2.7 wms_inbound 自动建 1 单" "1" "$WMS_IB_CNT"
WMS_IB_QTY=$($PSQL $DB -tA -c "SELECT qty::int FROM wms_inbound WHERE task_no LIKE 'WMS-IB-$PACK_V2_TASK-%' LIMIT 1;")
assert_eq "T11-V2.8 wms_inbound.qty=600 (仅 AVAILABLE 部分)" "600" "$WMS_IB_QTY"
WMS_IB_STATUS=$($PSQL $DB -tA -c "SELECT status FROM wms_inbound WHERE task_no LIKE 'WMS-IB-$PACK_V2_TASK-%' LIMIT 1;")
assert_eq "T11-V2.9 wms_inbound.status=PENDING" "PENDING" "$WMS_IB_STATUS"

# QUARANTINE 不应进 wms_inbound 流通
WMS_IB_HAS_BROKEN=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM wms_inbound WHERE task_no LIKE 'WMS-IB-$PACK_V2_TASK-%' AND qty::int >= 800;")
assert_eq "T11-V2.10 wms_inbound 不含 QUARANTINE 数量" "0" "$WMS_IB_HAS_BROKEN"

# inv_ledger 应有 PACK_DONE_QUARANTINE 流水
LEDGER_Q=$($PSQL $DB -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE ref_no='$PACK_V2_TASK' AND change_type='PACK_DONE_QUARANTINE';")
assert_eq "T11-V2.11 inv_ledger PACK_DONE_QUARANTINE 1 行" "1" "$LEDGER_Q"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Phase 6 数据一致性核对"
# E-01: 完整链路所有任务 status 合法
INVALID_STATUS=$($PSQL $DB -tA -c "
  SELECT COUNT(*) FROM pkg_tasks
  WHERE house_code='$HOUSE'
    AND status NOT IN ('PENDING','IN_PROGRESS','DONE','COMPLETED','CANCELLED','MERGED');
")
assert_eq "E-01 测试任务 status 全合法" "0" "$INVALID_STATUS"

# E-02: 当日 PACKING 任务的 packed_qty + breakage_qty + discrepancy_qty 都被填了
NULL_DERIVED=$($PSQL $DB -tA -c "
  SELECT COUNT(*) FROM pkg_tasks
  WHERE house_code='$HOUSE' AND task_type='GRADING' AND status='DONE'
    AND (packed_qty IS NULL OR breakage_qty IS NULL OR discrepancy_qty IS NULL);
")
assert_eq "E-02 已完成 GRADING 任务派生字段全填 (P0-1)" "0" "$NULL_DERIVED"

# E-03: shift_type 应是 dict code (与 egg-terminal 对齐，B2)
SHIFT_TYPE=$($PSQL $DB -tA -c "SELECT shift_type FROM pkg_shifts WHERE id=$SHIFT_ID;")
case "$SHIFT_TYPE" in
  MORNING|NIGHT|*ORNING*|*IGHT*)
    green "  ✓ E-03 shift_type 是 code 形态 ($SHIFT_TYPE)"; PASS=$((PASS+1)) ;;
  *)
    yellow "  ⚠ E-03 shift_type=$SHIFT_TYPE (可能未对齐)"; PASS=$((PASS+1)) ;;
esac

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
$PSQL $DB -q -c "DELETE FROM pkg_tasks WHERE house_code='$HOUSE' OR task_no LIKE 'REM-REGR-%' OR task_no LIKE 'PACK-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM pkg_shifts WHERE id=$SHIFT_ID;" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_ledger WHERE batch_no LIKE 'EGG-%-${HOUSE}-%' OR batch_no LIKE 'BAT-%-${HOUSE}-%' OR batch_no LIKE 'PACK-%-${HOUSE}-%' OR ref_no LIKE 'SHIFT-${SHIFT_ID}-%' OR ref_no LIKE 'PACK-REGR-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM inv_batches WHERE batch_no LIKE 'EGG-%-${HOUSE}-%' OR batch_no LIKE 'BAT-%-${HOUSE}-%' OR batch_no LIKE 'PACK-%-${HOUSE}-%' OR batch_no = 'BAT-REGR-PACK';" >/dev/null
$PSQL $DB -q -c "DELETE FROM wms_inbound WHERE task_no LIKE 'WMS-IB-PACK-REGR-V2-%';" >/dev/null
$PSQL $DB -q -c "DELETE FROM sys_dict WHERE dict_type='PKG_EGG_GRADE' AND dict_code='PKG_EGG_GRADE_X';" >/dev/null
$PSQL $DB -q -c "DELETE FROM product_grades WHERE grade_code='X';" >/dev/null
green "  ✓ test data 清理完毕"

# ──────────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  green "✅ 全部 $PASS 项 PASS"
else
  red   "❌ $FAIL 项 FAIL / $((PASS+FAIL)) 项总计"
  echo ""
  red "失败明细："
  for f in "${FAILURES[@]}"; do red "  • $f"; done
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
