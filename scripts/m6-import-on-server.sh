#!/usr/bin/env bash
# ============================================================
# M6-2 Production COMMIT Import — 在【服务器】上受控执行（真实落库）
#
# 与 m6-dryrun-on-server.sh 的根本区别：
#   · 本脚本【真 COMMIT】——各 golden-phoenix 脚本自带 BEGIN/COMMIT，按原样执行即落库
#   · 【不 ROLLBACK】、【不剥 COMMIT】、【不调用 dry-run 脚本】
#   · 失败即停：set -euo pipefail + psql -v ON_ERROR_STOP=1，绝不用 || true、不吞错
#   · 必须显式确认：bash scripts/m6-import-on-server.sh --yes-commit-to-production
#
# 用法（SSH 进服务器，在 /opt/phoenix-erp 下）：
#   git pull --ff-only origin main
#   bash scripts/m6-import-on-server.sh --yes-commit-to-production
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
GP="apps/api/scripts/init-data/golden-phoenix"
M61_COMMIT="8e3238e"                      # M6-1 readiness gate 通过提交（HEAD 必须 >= 此）
TS="$(date +%Y%m%d-%H%M%S)"
LOG="logs/m6-import-${TS}.log"
mkdir -p logs
exec > >(tee -a "$LOG") 2>&1               # 全程同时输出到日志文件

abort(){ echo "::ABORT:: $*" >&2; exit 1; }

# 连接生产 db 容器（与 deploy.yml 一致；密码不出现在命令行）
run_psql(){ docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
run_psql_raw(){ docker compose exec -T db sh -c 'psql -tA -F"|" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }

echo "============================================================"
echo " M6-2 Production COMMIT Import"
echo " 执行人:    $(whoami)@$(hostname)"
echo " 执行时间:  $(date '+%F %T %Z')"
echo " 生产 HEAD: $(git rev-parse HEAD)"
echo "            $(git log -1 --oneline)"
echo " 日志:      $LOG"
echo "============================================================"

# ── 安全门（任一不过即中止，未写库）─────────────────────────────────────
echo "── 安全门检查 ──"
[ "${1:-}" = "--yes-commit-to-production" ] || abort "缺少确认参数。真导入须显式: bash scripts/m6-import-on-server.sh --yes-commit-to-production"
[ -d "$GP" ] || abort "找不到初始化包目录 $GP"
[ -f "$GP/90-check-init-data.sql" ] || abort "找不到 90-check-init-data.sql（禁止跳过校验）"
git merge-base --is-ancestor "$M61_COMMIT" HEAD 2>/dev/null || abort "当前 HEAD 未包含 M6-1 通过提交 $M61_COMMIT，请先 git pull"
docker compose ps db 2>/dev/null | grep -qiE "up|running" || abort "db 服务未运行（非预期生产环境）"
DBNAME="$(docker compose exec -T db sh -c 'printf %s "$POSTGRES_DB"' | tr -d '\r\n' || true)"
[ -n "$DBNAME" ] || abort "DB 连接未配置（POSTGRES_DB 为空），禁止执行"
echo "SELECT 1;" | run_psql >/dev/null || abort "无法连接生产 db 容器"
echo "✅ 安全门通过 — 目标库: ${DBNAME}（via docker compose db / 密码隐藏）"

# ── 基线快照（导入前）──────────────────────────────────────────────────
COUNTS_SQL="SELECT 'sys_organizations',count(*) FROM sys_organizations
UNION ALL SELECT 'sys_user',count(*) FROM sys_user
UNION ALL SELECT 'sys_user_role',count(*) FROM sys_user_role
UNION ALL SELECT 'sys_user_orgs',count(*) FROM sys_user_orgs
UNION ALL SELECT 'sal_drivers',count(*) FROM sal_drivers
UNION ALL SELECT 'mst_stores',count(*) FROM mst_stores
UNION ALL SELECT 'sal_customers',count(*) FROM sal_customers
UNION ALL SELECT 'prc2_suppliers',count(*) FROM prc2_suppliers
UNION ALL SELECT 'sal_vehicles',count(*) FROM sal_vehicles
UNION ALL SELECT 'sys_role',count(*) FROM sys_role;"
BEFORE="$(mktemp)"; AFTER="$(mktemp)"
echo "── 导入前基线行数 ──"
echo "$COUNTS_SQL" | run_psql_raw | tee "$BEFORE"

# ── 正式导入（按 README 顺序，真 COMMIT，失败即停）──────────────────────
# 注：99-reconcile 文件名为 99-reconcile-zhuzhaoan.sql（README 推荐 99 先行）
ORDER="99-reconcile-zhuzhaoan.sql 01-organizations.sql 02-users.sql 03-user-roles.sql \
04-user-orgs.sql 05-drivers.sql 06-stores.sql 07-customers.sql 08-suppliers.sql 09-vehicles.sql"
echo "── 开始正式导入（真 COMMIT）──"
for f in $ORDER; do
  [ -f "$GP/$f" ] || abort "缺文件 $GP/$f"
  echo "──[$(date '+%T')] ▶ START $f"
  run_psql < "$GP/$f"        # set -e + ON_ERROR_STOP=1：任一报错立即中止整个脚本
  echo "──[$(date '+%T')] ✓ DONE  $f"
done
echo "✅ 全部初始化脚本执行完毕（已 COMMIT 落库）"

# ── 导入后行数 + 增量对照 ───────────────────────────────────────────────
echo "── 导入后行数 ──"
echo "$COUNTS_SQL" | run_psql_raw | tee "$AFTER"

echo ""
echo "── 增量对照（实际 vs M6-1 预估）──"
declare -A EXP=( [sys_role]=1 [sys_organizations]=0 [sys_user]=0 [sys_user_role]=11 \
                 [sys_user_orgs]=11 [sal_drivers]=5 [mst_stores]=8 [sal_customers]=35 \
                 [prc2_suppliers]=25 [sal_vehicles]=0 )
printf "%-20s %8s %8s %8s %8s %6s\n" "对象" "导入前" "导入后" "实际新增" "预估新增" "一致"
while IFS='|' read -r t before; do
  after="$(grep "^${t}|" "$AFTER" | cut -d'|' -f2)"
  delta=$(( after - before ))
  exp="${EXP[$t]:-?}"
  mark="—"; [ "$exp" != "?" ] && { [ "$delta" -eq "$exp" ] && mark="✅" || mark="⚠"; }
  printf "%-20s %8s %8s %8s %8s %6s\n" "$t" "$before" "$after" "$delta" "$exp" "$mark"
done < "$BEFORE"
rm -f "$BEFORE" "$AFTER"

# ── 数据订正确认（§5）──────────────────────────────────────────────────
echo ""
echo "── 数据订正确认 ──"
echo "SELECT '朱召安 zhuzhaoan 已存在', (count(*)>0)::text FROM sys_user WHERE username='zhuzhaoan';
SELECT '旧名 zhuzhao_an 残留(应f)', (count(*)>0)::text FROM sys_user WHERE username='zhuzhao_an';
SELECT 'fuqiang 已为 符强', (count(*)>0)::text FROM sys_user WHERE username='fuqiang' AND real_name='符强';
SELECT 'BU-TRADING 已为 商贸', (count(*)>0)::text FROM sys_organizations WHERE org_code='BU-TRADING' AND org_name LIKE '%商贸%';" | run_psql

# ── 自动执行 90-check（禁止跳过；FAIL 则告警退出）────────────────────────
echo ""
echo "── 执行 90-check-init-data.sql（导入后校验）──"
CHECK_OUT="$(run_psql < "$GP/90-check-init-data.sql")"
echo "$CHECK_OUT"
if echo "$CHECK_OUT" | grep -q "FAIL"; then
  abort "90-check 存在 FAIL！数据已 COMMIT，请立即人工排查并按 README 回滚原则处理"
fi

echo ""
echo "============================================================"
echo " ✅ M6-2 IMPORT COMPLETE — 数据已 COMMIT，90-check 全 PASS"
echo " 完成时间: $(date '+%F %T %Z')"
echo " 日志: $LOG"
echo "============================================================"
