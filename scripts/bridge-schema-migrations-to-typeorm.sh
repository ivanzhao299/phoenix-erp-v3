#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  Phoenix ERP g195-P2 — 桥接 schema_migrations → TypeORM migrations 表
#
#  目的：让 TypeORM CLI（migration:show / migration:run）认为现有 169 条
#        裸 SQL 迁移"全部已执行",自此只跑 migrations-ts/ 下新增的 TS 迁移。
#
#  安全：
#    - 一次性脚本。跑完一次后,重复执行是幂等 no-op(NOT EXISTS 守卫)。
#    - 不动 schema_migrations,不动旧裸 SQL,不动业务表。
#    - dry-run 模式默认开,需显式 --apply 才真写入。
#
#  用法：
#    # CI 测试库(psql 直连,读 PG* 环境变量)
#    MIG_MODE=ci  bash scripts/bridge-schema-migrations-to-typeorm.sh           # 预演
#    MIG_MODE=ci  bash scripts/bridge-schema-migrations-to-typeorm.sh --apply   # 真写
#
#    # 生产(docker compose,默认模式)
#    bash scripts/bridge-schema-migrations-to-typeorm.sh                        # 预演
#    bash scripts/bridge-schema-migrations-to-typeorm.sh --apply                # 真写
#
#  验证(--apply 后):
#    cd apps/api && pnpm build && pnpm migration:show
#    → 应显示"No migrations are pending"(migrations-ts/ 是空的,migrations 表
#      里 169 条已被认作历史记录)
#
#  回滚(若需要):
#    cd apps/api && pnpm typeorm:prod query "DELETE FROM migrations WHERE name LIKE '2026%'"
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

MODE="${MIG_MODE:-prod}"
APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg (支持 --apply / --dry-run)" >&2; exit 2 ;;
  esac
done

# ── SQL 执行抽象(与 scripts/db-migrate.sh 风格一致) ──────────────────────────
if [ "$MODE" = "ci" ]; then
  DBQ() { echo "$1" | psql -tAq -v ON_ERROR_STOP=1; }
else
  DBQ() { echo "$1" | docker compose exec -T db sh -c 'psql -tAq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
fi

echo "════════════════════════════════════════════════════════════════════════"
echo "  g195-P2 桥接 schema_migrations → TypeORM migrations"
echo "  模式: $MODE   |   $([ "$APPLY" = "1" ] && echo "🚨 APPLY 真写入" || echo "🔍 DRY-RUN 预演")"
echo "════════════════════════════════════════════════════════════════════════"

# ── 步骤 1: 探测 schema_migrations 是否存在,数 src 条数 ─────────────────────
sm_exists=$(DBQ "SELECT to_regclass('public.schema_migrations') IS NOT NULL;" | tr -d '[:space:]')
if [ "$sm_exists" != "t" ]; then
  echo "❌ schema_migrations 表不存在 — 先确认 g194 部署架构已上线(scripts/db-migrate.sh 跑过至少一次)"
  exit 1
fi
src_count=$(DBQ "SELECT count(*) FROM schema_migrations;" | tr -d '[:space:]')
echo "📊 schema_migrations: $src_count 条"

# ── 步骤 2: 建 TypeORM migrations 表(若不存在,结构按 TypeORM 0.3 默认) ────
# 注: TypeORM 第一次 migration:run 会自建此表,但我们要先灌数据所以提前建。
# 字段定义按 TypeORM PostgreSQL driver 默认 DDL,后续 migration:run 不会重建。
if [ "$APPLY" = "1" ]; then
  DBQ "CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    timestamp bigint NOT NULL,
    name character varying NOT NULL
  );" >/dev/null
  echo "✅ migrations 表已就位(IF NOT EXISTS)"
else
  echo "🔍 [DRY-RUN] 会执行: CREATE TABLE IF NOT EXISTS migrations(id serial pk, timestamp bigint, name varchar)"
fi

# ── 步骤 3: 探测 migrations 表当前状态 ─────────────────────────────────────
m_exists=$(DBQ "SELECT to_regclass('public.migrations') IS NOT NULL;" | tr -d '[:space:]')
if [ "$m_exists" = "t" ]; then
  dst_count=$(DBQ "SELECT count(*) FROM migrations;" | tr -d '[:space:]')
else
  dst_count=0
fi
echo "📊 migrations(目标表): $dst_count 条 (桥接前)"

# ── 步骤 4: 灌入桥接(幂等 NOT EXISTS;name 去 .sql,timestamp 取 applied_at ms 时戳) ──
# rationale:
#   - name = filename 去 .sql 后缀(eg 20260527_rbac_permission_fix)
#   - timestamp = applied_at 毫秒 epoch(对得上历史顺序;TypeORM 用于排序)
#   - 幂等用 NOT EXISTS,因 name 不是 PK(TypeORM 默认 schema 没加 unique)
BRIDGE_SQL_BODY=$(cat <<'EOF'
INSERT INTO migrations(timestamp, name)
SELECT
  CAST(EXTRACT(EPOCH FROM applied_at) * 1000 AS bigint) AS timestamp,
  regexp_replace(filename, '\.sql$', '') AS name
FROM schema_migrations sm
WHERE NOT EXISTS (
  SELECT 1 FROM migrations m WHERE m.name = regexp_replace(sm.filename, '\.sql$', '')
)
EOF
)

if [ "$APPLY" = "1" ]; then
  inserted=$(DBQ "WITH ins AS ($BRIDGE_SQL_BODY RETURNING 1) SELECT count(*) FROM ins;" | tr -d '[:space:]')
  echo "✅ 新增 $inserted 条到 migrations"
  new_dst_count=$(DBQ "SELECT count(*) FROM migrations;" | tr -d '[:space:]')
  echo "📊 migrations(目标表): $new_dst_count 条 (桥接后)"

  # ── 对账 ────
  diff=$(DBQ "SELECT count(*) FROM schema_migrations sm
              WHERE NOT EXISTS (SELECT 1 FROM migrations m WHERE m.name = regexp_replace(sm.filename, '\.sql$', ''));" | tr -d '[:space:]')
  if [ "$diff" = "0" ]; then
    echo "🎯 对账通过: schema_migrations 全部条目在 migrations 中有镜像"
  else
    echo "⚠️  对账异常: 仍有 $diff 条在 schema_migrations 里但不在 migrations 中"
    exit 1
  fi
else
  if [ "$m_exists" = "t" ]; then
    preview=$(DBQ "SELECT count(*) FROM schema_migrations sm
                   WHERE NOT EXISTS (SELECT 1 FROM migrations m WHERE m.name = regexp_replace(sm.filename, '\.sql$', ''));" | tr -d '[:space:]')
  else
    preview="$src_count"  # 目标表不存在,全部都是新增
  fi
  echo "🔍 [DRY-RUN] 将新增 $preview 条到 migrations"
fi

echo "════════════════════════════════════════════════════════════════════════"
if [ "$APPLY" = "1" ]; then
  echo "  ✅ 桥接完成。下一步验证:"
  echo "     cd apps/api && pnpm build && pnpm migration:show"
  echo "     → 期望: 没有 pending 迁移(migrations-ts/ 是空目录)"
else
  echo "  🔍 预演完成。确认数字无误后加 --apply 真写入。"
fi
echo "════════════════════════════════════════════════════════════════════════"
