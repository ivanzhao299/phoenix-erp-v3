#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Phoenix ERP V3 — 数据库一键初始化
#
#  1) 创建数据库（若不存在）
#  2) 应用 RBAC 基础表 + 初始数据 (ddl/01, 02, 03, 04, 06)
#  3) 应用 V3 完整 schema 补齐 (migrations/v3_schema_complete.sql) — 33 张缺口表
#  4) 应用 V3 生产 schema 补丁 (migrations/v3_production_migration.sql)
#  5) 执行 V3 全量 schema 补全 runner (migrations/run_full_v3.js) — 索引/数据迁移
#
#  执行后启动 API（npm run start:dev），onModuleInit 将自动补齐剩余列与 sequence。
# ═══════════════════════════════════════════════════════════════════════════════
set -e

cd "$(dirname "$0")/.."

# ── 兼容多种 psql 路径 ─────────────────────────────────────────────
PSQL_BIN=""
for CAND in \
  "$(command -v psql 2>/dev/null)" \
  /Applications/Postgres.app/Contents/Versions/latest/bin/psql \
  /Applications/Postgres.app/Contents/Versions/18/bin/psql \
  /Applications/Postgres.app/Contents/Versions/17/bin/psql \
  /Applications/Postgres.app/Contents/Versions/16/bin/psql \
  /usr/local/Homebrew/Cellar/postgresql@16/*/bin/psql \
  /usr/local/Homebrew/Cellar/postgresql@17/*/bin/psql \
  /opt/homebrew/opt/postgresql@16/bin/psql \
  /opt/homebrew/opt/postgresql@17/bin/psql \
  /opt/homebrew/bin/psql \
  /usr/local/bin/psql; do
  for F in $CAND; do
    if [ -x "$F" ]; then PSQL_BIN="$F"; break 2; fi
  done
done
if [ -z "$PSQL_BIN" ]; then
  echo "❌ psql not found — tried Postgres.app, brew, /usr/local, /opt/homebrew"
  exit 1
fi
export PSQL="$PSQL_BIN"
export PATH="$(dirname "$PSQL_BIN"):$PATH"
DB_USER="${DB_USER:-$USER}"
DB_NAME="${DB_NAME:-phoenix_erp}"

echo "🚀 [1/5] Ensure database '$DB_NAME' exists..."
$PSQL -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || \
  echo "    (database already exists)"

echo "🚀 [2/5] Apply RBAC + base DDL..."
$PSQL -U "$DB_USER" -d "$DB_NAME" -q -f ddl/01_create_rbac_tables.sql 2>&1 | tail -3
$PSQL -U "$DB_USER" -d "$DB_NAME" -q -f ddl/02_init_data.sql           2>&1 | tail -3
[ -f ddl/03_create_p2_tables.sql ] && $PSQL -U "$DB_USER" -d "$DB_NAME" -q -f ddl/03_create_p2_tables.sql 2>&1 | tail -3
[ -f ddl/04_create_p3_tables.sql ] && $PSQL -U "$DB_USER" -d "$DB_NAME" -q -f ddl/04_create_p3_tables.sql 2>&1 | tail -3
[ -f ddl/06_sys_role_conflict.sql ] && $PSQL -U "$DB_USER" -d "$DB_NAME" -q -f ddl/06_sys_role_conflict.sql 2>&1 | tail -3
[ -f ddl/09_rbac_advanced.sql ] && $PSQL -U "$DB_USER" -d "$DB_NAME" -q -f ddl/09_rbac_advanced.sql 2>&1 | tail -3

echo "🚀 [3/5] Apply V3 complete schema (33 critical tables)..."
$PSQL -U "$DB_USER" -d "$DB_NAME" -q -f migrations/v3_schema_complete.sql 2>&1 | tail -5

echo "🚀 [4/5] Apply V3 production migration patches..."
[ -f migrations/v3_production_migration.sql ] && \
  $PSQL -U "$DB_USER" -d "$DB_NAME" -q -f migrations/v3_production_migration.sql 2>&1 | tail -3

echo "🚀 [5/5] Run V3 full schema runner (run_full_v3.js)..."
node migrations/run_full_v3.js 2>&1 | tail -5

echo ""
echo "✅ DB ready. Start API: npm run start:dev"
echo "   Then seed UAT users + fixture:"
echo "     bash ../../scripts/seed-uat-users.sh"
echo "     bash ../../scripts/seed-uat-fixture.sh"
