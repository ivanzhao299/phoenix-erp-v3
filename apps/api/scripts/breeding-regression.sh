#!/usr/bin/env bash
# 养殖中心回归测试 — 16 项 P0/P1/P2 修复全量验证
#
# 用法：API_URL=http://127.0.0.1:3100 ADMIN_USER=admin ADMIN_PASS=admin123 bash breeding-regression.sh
# 退出码 = 失败用例数
#
# 测试模型：未激活历史群兼容性；新群入栏由 flock lifecycle HTTP/PG 专项验证。
# 本脚本仅允许显式 CI loopback 隔离数据库，禁止在业务/生产数据库运行。
# 测试模型：
#   - 在 brd_farms / brd_houses / brd_flocks 上 seed 一组 UAT-REGR-* 数据
#   - 每个 fix 至少 1 个断言用例
#   - 末尾 cleanup（DELETE 测试数据 + ROLLBACK seed）
set -euo pipefail

API="${API_URL:-http://127.0.0.1:3100}"
ADMIN_U="${ADMIN_USER:-admin}"
ADMIN_P="${ADMIN_PASS:-admin123}"
PSQL=${PSQL:-$(command -v psql)}
DB=${DB_NAME:-${PGDATABASE:-phoenix_erp}}

if [[ ! "$API" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$ || "${CI:-}" != true || "${PGHOST:-}" != 127.0.0.1 || ! "$DB" =~ ^(phoenix_erp|phoenix_flock_compat)$ ]]; then
  printf 'BREEDING_DISPOSABLE_CI_FIXTURE_REQUIRED: CI=true, PGHOST=127.0.0.1 and isolated fixture database required\n' >&2
  exit 99
fi

# Ignore local psqlrc and fail on SQL errors; never continue with a partial seed.
db_query() { "$PSQL" -X -v ON_ERROR_STOP=1 "$DB" "$@"; }

FIXTURE_OWNER=$(db_query -tA -c "SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database();")
if [ "$FIXTURE_OWNER" != 'phoenix-ci-breeding-regression' ]; then
  printf 'BREEDING_DISPOSABLE_DATABASE_OWNER_REQUIRED\n' >&2; exit 99
fi

RESTORE_BATCHES=''
restore_batches() {
  if [ -n "$RESTORE_BATCHES" ]; then
    db_query -q -c "UPDATE inv_batches b SET qty_available=v.qty FROM (VALUES $RESTORE_BATCHES) v(id,qty) WHERE b.id=v.id;" >/dev/null
    RESTORE_BATCHES=''
  fi
}
trap restore_batches EXIT

PASS=0
FAIL=0
LOG=/tmp/breeding-regression-$$.log
declare -a FAILURES

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$1"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$1"; }

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    green "  ✓ $name"
    PASS=$((PASS+1))
  else
    red "  ✗ $name"
    red "      expected: $expected"
    red "      actual:   $actual"
    FAIL=$((FAIL+1))
    FAILURES+=("$name | expected=$expected | actual=$actual")
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -q -- "$needle"; then
    green "  ✓ $name"
    PASS=$((PASS+1))
  else
    red "  ✗ $name"
    red "      expected to contain: $needle"
    red "      actual: $(printf '%s' "$haystack" | head -c 200)"
    FAIL=$((FAIL+1))
    FAILURES+=("$name | needle=$needle")
  fi
}

# NestJS POST 默认返回 HTTP 201；GET/PUT 返回 200。统一接受 2xx 即成功
assert_ok() {
  local name="$1" code="$2"
  case "$code" in
    20[0-9])
      green "  ✓ $name (HTTP $code)"
      PASS=$((PASS+1)) ;;
    *)
      red "  ✗ $name HTTP $code (expected 2xx)"
      FAIL=$((FAIL+1))
      FAILURES+=("$name | got HTTP $code") ;;
  esac
}

cyan "▶ 0) 登录"
TOKEN=$(curl -sf -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_U\",\"password\":\"$ADMIN_P\"}" \
  | grep -oE '"token":"[^"]*"' | cut -d'"' -f4) || { red "登录失败"; exit 99; }
[ -n "$TOKEN" ] || { red "Token 空"; exit 99; }
green "  ✓ 登录成功（令牌不输出）"

H="-H \"Authorization: Bearer $TOKEN\" -H 'Content-Type: application/json'"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ 1) Seed 测试数据"
TODAY=$(TZ=Asia/Singapore date +%Y-%m-%d)
FARM=F-REGR-UAT
HOUSE_A=H-REGR-A01
HOUSE_B=H-REGR-B01
FLOCK=FK-REGR-001
FLOCK_B=FK-REGR-002

# 清理上一轮残留
db_query -q -c "DELETE FROM brd_daily_logs WHERE house_code IN ('$HOUSE_A','$HOUSE_B');"  >/dev/null
db_query -q -c "DELETE FROM brd_flocks WHERE flock_no IN ('$FLOCK','$FLOCK_B');"                          >/dev/null
db_query -q -c "DELETE FROM brd_houses WHERE house_code IN ('$HOUSE_A','$HOUSE_B');"      >/dev/null
db_query -q -c "DELETE FROM brd_farms WHERE farm_code='$FARM';"                           >/dev/null
db_query -q -c "DELETE FROM inv_ledger WHERE ref_no='$FLOCK' OR ref_no LIKE 'SHIFT-REGR%';" >/dev/null

# Resolve real ACTIVE master-data context instead of inventing organization/breed codes.
# The frozen 20260531_org_runtime_phase1 baseline seeds ACTIVE layer-farm
# SITE rows with parent_id -> COMPANY, but leaves their company_code NULL.
# Resolve that authoritative parent; reject a conflicting nonempty company_code.
# Keep all identity fields stable from creation; never relabel a flock after production.
ORG_CONTEXT=$(db_query -tA -c "
  SELECT c.org_code || '|' || s.org_code
    FROM sys_organizations s JOIN sys_organizations c ON c.id=s.parent_id
   WHERE s.org_type='SITE' AND s.status='ACTIVE'
     AND c.org_type='COMPANY' AND c.status='ACTIVE'
     AND (s.company_code IS NULL OR s.company_code='' OR s.company_code=c.org_code)
   ORDER BY c.org_code, s.org_code LIMIT 1;")
IFS='|' read -r COMPANY SITE <<< "$ORG_CONTEXT"
[[ "$COMPANY" =~ ^[A-Za-z0-9_-]+$ && "$SITE" =~ ^[A-Za-z0-9_-]+$ ]] || {
  red "Seed 失败：找不到 ACTIVE 公司/场站组织上下文"; exit 99;
}
BREED=$(db_query -tA -c "SELECT dict_code FROM sys_dict
  WHERE dict_type='BRD_BREED' AND dict_code='HY_LINE_BROWN' AND status='ACTIVE';")
[ "$BREED" = HY_LINE_BROWN ] || { red "Seed 失败：HY_LINE_BROWN 不是唯一 ACTIVE BRD_BREED"; exit 99; }

# Synthetic pre-lifecycle legacy fixtures are inserted only in this guarded disposable DB.
# The runtime must continue rejecting new-flock CRUD and hand-entered house codes.
db_query -q -c "
  INSERT INTO brd_farms(farm_code,farm_name,location,company_code,mapped_site_code,status)
    VALUES('$FARM','回归测试场','万象','$COMPANY','$SITE','ACTIVE');
  INSERT INTO brd_houses(house_code,house_name,farm_code,capacity,max_capacity,status)
    VALUES('$HOUSE_A','A01','$FARM',5000,5000,'ACTIVE'),('$HOUSE_B','B01','$FARM',5000,5000,'ACTIVE');
  INSERT INTO brd_flocks(flock_no,farm_code,house_code,company_code,site_code,breed_code,placement_date,start_date,initial_qty,current_qty,status)
    VALUES('$FLOCK','$FARM','$HOUSE_A','$COMPANY','$SITE','$BREED','$TODAY','$TODAY',4800,4800,'GROWING'),
          ('$FLOCK_B','$FARM','$HOUSE_B','$COMPANY','$SITE','$BREED','$TODAY','$TODAY',1000,1000,'GROWING');
" >/dev/null

green "  ✓ seed 完成 (farm=$FARM, house=$HOUSE_A/$HOUSE_B, flock=$FLOCK)"

# 孤儿表基线（用于 B2 增长检测）
ORPH1_BASE=$(db_query -tA -c "SELECT COUNT(*) FROM brd_immune_plans;")
ORPH2_BASE=$(db_query -tA -c "SELECT COUNT(*) FROM brd_medication_records;")
ORPH3_BASE=$(db_query -tA -c "SELECT COUNT(*) FROM brd_withdrawal_alerts;")
yellow "  孤儿表基线: immune_plans=$ORPH1_BASE  med_records=$ORPH2_BASE  withdrawal_alerts=$ORPH3_BASE"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ A1: brd_daily_logs UNIQUE 含 shift — 早+晚同 house+date 都成功"
R1=$(curl -s -o /tmp/r1.json -w '%{http_code}' -X POST "$API/api/v3/farm/daily-logs" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"company_code\":\"$COMPANY\",\"site_code\":\"$SITE\",\"house_code\":\"$HOUSE_A\",\"flock_no\":\"$FLOCK\",\"farm_code\":\"$FARM\",\"log_date\":\"$TODAY\",\"shift\":\"早班\",\"eggs_produced\":2000,\"mortality_qty\":5,\"operator\":\"REGR\"}")
assert_ok "A1.1 早班 POST 成功" "$R1"

R2=$(curl -s -o /tmp/r2.json -w '%{http_code}' -X POST "$API/api/v3/farm/daily-logs" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"company_code\":\"$COMPANY\",\"site_code\":\"$SITE\",\"house_code\":\"$HOUSE_A\",\"flock_no\":\"$FLOCK\",\"farm_code\":\"$FARM\",\"log_date\":\"$TODAY\",\"shift\":\"晚班\",\"eggs_produced\":1800,\"mortality_qty\":3,\"operator\":\"REGR\"}")
assert_ok "A1.2 晚班 POST 成功" "$R2"

CNT=$(db_query -tA -c "SELECT COUNT(*) FROM brd_daily_logs WHERE log_date='$TODAY' AND house_code='$HOUSE_A';")
assert_eq "A1.3 当日 2 班次 = 2 行" "2" "$CNT"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ A2: current_qty 按当日 SUM 重算，不再 diff 双扣"
CUR=$(db_query -tA -c "SELECT current_qty FROM brd_flocks WHERE flock_no='$FLOCK';")
assert_eq "A2.1 4800-(5+3)=4792" "4792" "$CUR"

# 改早班 5→3
ID_MORN=$(db_query -tA -c "SELECT id FROM brd_daily_logs WHERE log_date='$TODAY' AND house_code='$HOUSE_A' AND shift='早班' LIMIT 1;")
[ -n "$ID_MORN" ] || { red "A2 找不到早班 id"; FAIL=$((FAIL+1)); }

R3=$(curl -s -o /tmp/r3.json -w '%{http_code}' -X PUT "$API/api/v3/farm/daily-logs/$ID_MORN" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"company_code\":\"$COMPANY\",\"site_code\":\"$SITE\",\"house_code\":\"$HOUSE_A\",\"flock_no\":\"$FLOCK\",\"log_date\":\"$TODAY\",\"shift\":\"早班\",\"eggs_produced\":2000,\"mortality_qty\":3}")
assert_ok "A2.2 PUT 修改 morning mortality" "$R3"

CUR2=$(db_query -tA -c "SELECT current_qty FROM brd_flocks WHERE flock_no='$FLOCK';")
# 期望 4800-(3+3)=4794，绝不是 4800-(5+3)-(5-3)=4790（diff 双扣）
assert_eq "A2.3 修后 4800-(3+3)=4794" "4794" "$CUR2"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ A1.4: 同 (house, date, shift) 二次提交 → ON CONFLICT DO UPDATE"
R4=$(curl -s -o /tmp/r4.json -w '%{http_code}' -X POST "$API/api/v3/farm/daily-logs" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"company_code\":\"$COMPANY\",\"site_code\":\"$SITE\",\"house_code\":\"$HOUSE_A\",\"flock_no\":\"$FLOCK\",\"farm_code\":\"$FARM\",\"log_date\":\"$TODAY\",\"shift\":\"早班\",\"eggs_produced\":2222,\"mortality_qty\":3,\"operator\":\"REGR\"}")
assert_ok "A1.4 同键二次 POST (无 23505)" "$R4"

EGG_AFTER=$(db_query -tA -c "SELECT eggs_produced FROM brd_daily_logs WHERE log_date='$TODAY' AND house_code='$HOUSE_A' AND shift='早班';")
assert_eq "A1.5 二次提交后 eggs 被 UPSERT 为 2222" "2222" "$EGG_AFTER"

CNT2=$(db_query -tA -c "SELECT COUNT(*) FROM brd_daily_logs WHERE log_date='$TODAY' AND house_code='$HOUSE_A';")
assert_eq "A1.6 行数仍是 2 (不重复插入)" "2" "$CNT2"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ A3: brd_vaccinations.status 已全大写"
LOWER=$(db_query -tA -c "SELECT COUNT(*) FROM brd_vaccinations WHERE status IS NOT NULL AND status <> UPPER(status);")
assert_eq "A3.1 无小写 status 残留" "0" "$LOWER"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ A4: 无 PRD-EGG 批次时日报不阻塞 (真测：临时隐藏 PRD-EGG)"
# Temporarily zero availability; preserve product identity and every FK.
# The EXIT trap restores the exact original values even when a later check fails.
RESTORE_BATCHES=$(db_query -tA -c "SELECT COALESCE(string_agg(format('(%L::bigint,%L::numeric)',id,qty_available),','),'') FROM inv_batches WHERE product_code LIKE 'PRD-EGG%';")
db_query -q -c "UPDATE inv_batches SET qty_available=0 WHERE product_code LIKE 'PRD-EGG%';" >/dev/null

LEDGER_BEFORE=$(db_query -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE change_type='FARM_IN' AND ref_no='$FLOCK_B';")

R5=$(curl -s -o /tmp/r5.json -w '%{http_code}' -X POST "$API/api/v3/farm/daily-logs" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"company_code\":\"$COMPANY\",\"site_code\":\"$SITE\",\"house_code\":\"$HOUSE_B\",\"flock_no\":\"$FLOCK_B\",\"farm_code\":\"$FARM\",\"log_date\":\"$TODAY\",\"shift\":\"早班\",\"eggs_produced\":500,\"mortality_qty\":0,\"operator\":\"REGR\"}")
assert_ok "A4.1 PRD-EGG 不可用时 POST 仍成功" "$R5"

MSG=$(cat /tmp/r5.json)
if printf '%s' "$MSG" | grep -q "无可用鸡蛋库存批次"; then
  red "  ✗ A4.2 仍弹旧错"; FAIL=$((FAIL+1)); FAILURES+=("A4.2 旧错文案残留")
else
  green "  ✓ A4.2 旧错文案不再出现"; PASS=$((PASS+1))
fi

LEDGER_AFTER=$(db_query -tA -c "SELECT COUNT(*) FROM inv_ledger WHERE change_type='FARM_IN' AND ref_no='$FLOCK_B';")
assert_eq "A4.3 ledger 应跳过（无新 FARM_IN 行）" "$LEDGER_BEFORE" "$LEDGER_AFTER"

restore_batches
green "  ✓ PRD-EGG 批次可用量已还原"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ A6: 旧 /api/v3/farm/daily 死路由已删除"
DEAD_POST=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/v3/farm/daily" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')
# 期望 404 (路由不存在)；不应 200 或 500
case "$DEAD_POST" in
  404) green "  ✓ A6.1 POST /daily → 404"; PASS=$((PASS+1)) ;;
  *)   red "  ✗ A6.1 POST /daily 不是 404 而是 $DEAD_POST"; FAIL=$((FAIL+1)); FAILURES+=("A6.1 dead route status=$DEAD_POST") ;;
esac
DEAD_GET=$(curl -s -o /dev/null -w '%{http_code}' -X GET "$API/api/v3/farm/daily" \
  -H "Authorization: Bearer $TOKEN")
case "$DEAD_GET" in
  404) green "  ✓ A6.2 GET /daily → 404"; PASS=$((PASS+1)) ;;
  *)   red "  ✗ A6.2 GET /daily 不是 404 而是 $DEAD_GET"; FAIL=$((FAIL+1)); FAILURES+=("A6.2 dead route status=$DEAD_GET") ;;
esac

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ B4: SQL 注入面白名单 — 异常字段名被丢弃"
# 提交一个混入恶意字段名的 payload，看后端是否照样落库 + 不落非法字段
R6=$(curl -s -o /tmp/r6.json -w '%{http_code}' -X POST "$API/api/v3/farm/daily-logs" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"company_code\":\"$COMPANY\",\"site_code\":\"$SITE\",\"house_code\":\"$HOUSE_A\",\"flock_no\":\"$FLOCK\",\"log_date\":\"$TODAY\",\"shift\":\"中班\",\"eggs_produced\":100,\"hacker_col\":\"DROP TABLE\",\"__proto__\":\"x\",\"';\":\"y\"}")
assert_ok "B4.1 含恶意字段 POST 成功" "$R6"
# 验证 brd_daily_logs 没新增非法列（schema 不会被改）
BAD_COL=$(db_query -tA -c "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='brd_daily_logs' AND column_name IN ('hacker_col','__proto__');")
assert_eq "B4.2 非法列未被创建" "0" "$BAD_COL"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ B2: 孤儿表测试期间不增长"
# 严格断言：测试结束时与 SEED 阶段开始时的行数差应为 0 — V2 历史存量保留，但不应新增
ORPH1_END=$(db_query -tA -c "SELECT COUNT(*) FROM brd_immune_plans;")
ORPH2_END=$(db_query -tA -c "SELECT COUNT(*) FROM brd_medication_records;")
ORPH3_END=$(db_query -tA -c "SELECT COUNT(*) FROM brd_withdrawal_alerts;")
yellow "  brd_immune_plans=$ORPH1_END (baseline=$ORPH1_BASE)"
yellow "  brd_medication_records=$ORPH2_END (baseline=$ORPH2_BASE)"
yellow "  brd_withdrawal_alerts=$ORPH3_END (baseline=$ORPH3_BASE)"
assert_eq "B2.1 brd_immune_plans 行数不增长"     "$ORPH1_BASE" "$ORPH1_END"
assert_eq "B2.2 brd_medication_records 行数不增长" "$ORPH2_BASE" "$ORPH2_END"
assert_eq "B2.3 brd_withdrawal_alerts 行数不增长"  "$ORPH3_BASE" "$ORPH3_END"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Phase 6 数据一致性核对"
# D-01: current_qty 应等于 initial - SUM(mortality_qty)
EXPECTED=$(db_query -tA -c "
  SELECT f.initial_qty - COALESCE(SUM(l.mortality_qty),0)
  FROM brd_flocks f LEFT JOIN brd_daily_logs l ON l.flock_no = f.flock_no
  WHERE f.flock_no='$FLOCK' GROUP BY f.initial_qty;
")
ACTUAL=$(db_query -tA -c "SELECT current_qty FROM brd_flocks WHERE flock_no='$FLOCK';")
assert_eq "D-01 current_qty 守恒 (initial - SUM mortality)" "$EXPECTED" "$ACTUAL"

# D-02: 任意 (date, house, shift) 唯一
DUP=$(db_query -tA -c "
  SELECT COUNT(*) FROM (
    SELECT log_date, house_code, shift FROM brd_daily_logs
    WHERE house_code IN ('$HOUSE_A','$HOUSE_B')
    GROUP BY log_date, house_code, shift HAVING COUNT(*)>1
  ) d;
")
assert_eq "D-02 (date,house,shift) 唯一" "0" "$DUP"

# D-03: 免疫状态全大写
LOWER2=$(db_query -tA -c "SELECT COUNT(*) FROM brd_vaccinations WHERE status IS NOT NULL AND status <> UPPER(status);")
assert_eq "D-03 vaccination status 全 UPPER" "0" "$LOWER2"

# D-04: HOUSE_A 共 3 班次 (早班 / 晚班 / 中班 由 B4 注入) — 每个班次唯一一行
CNT_FINAL=$(db_query -tA -c "SELECT COUNT(*) FROM brd_daily_logs WHERE log_date='$TODAY' AND house_code='$HOUSE_A';")
assert_eq "D-04 三班次各一行" "3" "$CNT_FINAL"

# ──────────────────────────────────────────────────────────────────────────
cyan ""
cyan "▶ Cleanup"
db_query -q -c "DELETE FROM brd_daily_logs WHERE house_code IN ('$HOUSE_A','$HOUSE_B');" >/dev/null
db_query -q -c "DELETE FROM brd_flocks WHERE flock_no IN ('$FLOCK','$FLOCK_B');"                          >/dev/null
db_query -q -c "DELETE FROM brd_houses WHERE house_code IN ('$HOUSE_A','$HOUSE_B');"      >/dev/null
db_query -q -c "DELETE FROM brd_farms WHERE farm_code='$FARM';"                           >/dev/null
db_query -q -c "DELETE FROM inv_ledger WHERE ref_no='$FLOCK' OR ref_no LIKE 'SHIFT-REGR%';" >/dev/null
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
  for f in "${FAILURES[@]}"; do
    red "  • $f"
  done
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $FAIL
