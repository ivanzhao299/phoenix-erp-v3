#!/usr/bin/env bash
# ============================================================
# M6-0 Production Dry Run — 在【服务器】上运行（不在本机）
# 安全保证：事务内执行 golden-phoenix 全部初始化 SQL + 90-check，末尾强制 ROLLBACK。
#   · 绝不 COMMIT，绝不真实写入生产库
#   · 剥掉各脚本内层 BEGIN/COMMIT，外层统一 BEGIN … ROLLBACK 包裹
#     （否则各脚本自带的 COMMIT 会真实落库！）
#   · psql -v ON_ERROR_STOP=1，任一报错立即停止，不吞错、不用 || true
#
# 用法（SSH 进服务器后，在仓库根目录执行）：
#   bash scripts/m6-dryrun-on-server.sh 2>&1 | tee /root/m6-dryrun-$(date +%Y%m%d-%H%M%S).log
# ============================================================
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"   # 仓库根目录
GP="apps/api/scripts/init-data/golden-phoenix"

# 通过 db 容器执行 psql（与 deploy.yml 完全一致的连接方式）
run_psql() { docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }

COUNTS_SQL="SELECT 'sys_organizations' AS t, count(*) FROM sys_organizations
UNION ALL SELECT 'sys_user', count(*) FROM sys_user
UNION ALL SELECT 'sys_user_role', count(*) FROM sys_user_role
UNION ALL SELECT 'sys_user_orgs', count(*) FROM sys_user_orgs
UNION ALL SELECT 'sal_drivers', count(*) FROM sal_drivers
UNION ALL SELECT 'mst_stores', count(*) FROM mst_stores
UNION ALL SELECT 'sal_customers', count(*) FROM sal_customers
UNION ALL SELECT 'prc2_suppliers', count(*) FROM prc2_suppliers
ORDER BY t;"

echo "════════ 1. 生产 HEAD ════════"
git rev-parse HEAD
git log -1 --oneline

echo "════════ 2. 导入前行数（基线快照）════════"
echo "$COUNTS_SQL" | run_psql

echo "════════ 3. 组装 Dry Run SQL（剥内层 BEGIN/COMMIT，外层 BEGIN…ROLLBACK）════════"
TMP="$(mktemp)"
{
  echo "BEGIN;"
  echo "SET LOCAL phx.skip_perms_bump='on';"
  for f in 99-reconcile-zhuzhaoan.sql 01-organizations.sql 02-users.sql 03-user-roles.sql \
           04-user-orgs.sql 05-drivers.sql 06-stores.sql 07-customers.sql \
           08-suppliers.sql 09-vehicles.sql; do
    [ -f "$GP/$f" ] || { echo "::error:: 缺文件 $GP/$f"; exit 1; }
    echo "-- ===== $f ====="
    grep -vE '^(BEGIN|COMMIT);' "$GP/$f"
  done
  echo "-- ===== 90-check-init-data.sql ====="
  cat "$GP/90-check-init-data.sql"
  echo "ROLLBACK;"
} > "$TMP"
echo "已组装：$(wc -l < "$TMP") 行"

echo "════════ 4. 执行 Dry Run（ON_ERROR_STOP=1，末尾 ROLLBACK）════════"
# 不加 || true：psql 任一报错 → set -e 立即终止脚本（红灯）
run_psql < "$TMP"
rm -f "$TMP"
echo "✅ Dry Run 执行完毕（事务已 ROLLBACK）"

echo "════════ 5. 导入后行数（应与基线完全一致 → 证明 ROLLBACK 成功）════════"
echo "$COUNTS_SQL" | run_psql

echo "════════ 完成。请核对：90-check 全 PASS、步骤4末尾出现 ROLLBACK、步骤2与步骤5行数一致 ════════"
