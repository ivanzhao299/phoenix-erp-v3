#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# 统一 DB 迁移执行器 + 迁移记录(schema_migrations)
#   CI 测试库 与 生产库 共用这一份(消除 deploy.yml 里两份重复脚本，杜绝"改一处漏一处")。
#
# 环境变量：
#   MIG_MODE = ci   → psql 直连(读 PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD 标准变量)
#            = prod → docker compose exec db psql(容器内，读 POSTGRES_USER/POSTGRES_DB)  [默认]
#   MIG_DIR  = 迁移根目录(含 ddl/ 与 migrations/)，默认 apps/api
#
# 机制(G194 部署架构根治)：
#   - 建 schema_migrations 记录表；增量迁移(2026*)跑过即跳过、只跑新增并记录。
#   - 首次在【已初始化库】(sys_user 有数据但记录表空)baseline：把现有 2026 迁移标记为
#     已执行、不重跑(护现状，数据 seed 不重插)；【空库】不 baseline、全跑以初始化。
#   - 基础 DDL(ddl/* + v3_schema_complete) track=0：幂等每次跑(数量固定，IF NOT EXISTS)。
#   - 任一迁移 SQL 失败 → 退出码 1，调用方据此红灯(配合 psql ON_ERROR_STOP=1)。
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

MODE="${MIG_MODE:-prod}"
DIR="${MIG_DIR:-apps/api}"

# ── SQL 执行抽象：DBQ 跑单条取结果；DBFILE 跑整个 .sql 文件 ──
if [ "$MODE" = "ci" ]; then
  DBQ()    { echo "$1" | psql -tAq -v ON_ERROR_STOP=1; }
  DBFILE() { psql -v ON_ERROR_STOP=1 -f "$1" 2>&1; }
else
  DBQ()    { echo "$1" | docker compose exec -T db sh -c 'psql -tAq -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
  DBFILE() { docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$1" 2>&1; }
fi

# ── 记录表 + 首次 baseline ──
DBQ "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());" >/dev/null || true
if [ "$(DBQ 'SELECT count(*) FROM schema_migrations;' | tr -d '[:space:]')" = "0" ]; then
  # 判断"已初始化库(有 sys_user 且有数据)" vs "空库"。分两步——PG 的 AND 不短路，
  # 直接 EXISTS(SELECT 1 FROM sys_user) 在表不存在时(空库)会在解析阶段就报 relation does not exist。
  has_data=0
  if [ "$(DBQ "SELECT to_regclass('public.sys_user') IS NOT NULL;" | tr -d '[:space:]')" = "t" ]; then
    [ "$(DBQ "SELECT EXISTS(SELECT 1 FROM sys_user);" | tr -d '[:space:]')" = "t" ] && has_data=1
  fi
  if [ "$has_data" = "1" ]; then
    echo "🔖 已初始化库首次引入迁移记录 → baseline 现有 2026 迁移为'已执行'(不重跑,护现状)"
    for f in $(ls "$DIR"/migrations/2026*.sql 2>/dev/null | LC_ALL=C sort); do
      DBQ "INSERT INTO schema_migrations(filename) VALUES('$(basename "$f")') ON CONFLICT DO NOTHING;" >/dev/null
    done
    echo "🔖 baseline 完成：以后只跑新增迁移"
  else
    echo "🆕 空库：不 baseline，迁移将全跑以初始化"
  fi
fi

# ── 迁移执行：track=1 走记录(增量,跑过即跳过)；track=0 每次跑(基础DDL,幂等) ──
# set +e 包裹命令替换：dash 下 set -e 会在替换失败时吞掉错误详情(只剩 status)。
run_migration() {
  f="$1"; track="${2:-1}"; fn=$(basename "$f")
  if [ "$track" = "1" ] && [ "$(DBQ "SELECT 1 FROM schema_migrations WHERE filename='$fn';" | tr -d '[:space:]')" = "1" ]; then
    echo "⏭️  已执行，跳过 $fn"; return 0
  fi
  echo "Applying $fn..."
  set +e
  output=$(DBFILE "$f"); status=$?
  set -e
  echo "$output" | grep -v "already exists\|NOTICE\|will create\|^$" || true
  if [ "$status" -ne 0 ]; then
    echo "::error::❌ Migration FAILED: $f"
    echo "$output"
    exit 1
  fi
  [ "$track" = "1" ] && DBQ "INSERT INTO schema_migrations(filename) VALUES('$fn') ON CONFLICT DO NOTHING;" >/dev/null || true
}

# 基础 DDL（幂等每次跑；G51 LC_ALL=C 字节序排序避免 seed 先于建表）
for f in $(ls "$DIR"/ddl/*.sql | LC_ALL=C sort); do run_migration "$f" 0; done
# 基础业务 Schema（v3_schema_complete，幂等）
[ -f "$DIR/migrations/v3_schema_complete.sql" ] && run_migration "$DIR/migrations/v3_schema_complete.sql" 0
# 增量迁移（2026*，走记录：跑过跳过、只跑新增 → 部署提速 + 数据 seed 永不重插）
for f in $(ls "$DIR"/migrations/2026*.sql 2>/dev/null | LC_ALL=C sort); do run_migration "$f" 1; done

echo "✅ Migrations applied (schema_migrations 记录：只跑新增；基础 DDL 幂等每次跑；任一失败已红灯)"
