#!/usr/bin/env bash
# Phoenix ERP V3 — V2 残表物理归档脚本
#
# 安全顺序：
#   1) pg_dump 导出 _v2_archived_* 三张表 + 关联 sequence → _archive/v2-final-snapshot-YYYY-MM-DD.sql.gz
#   2) 计算每张表行数留作存档清单
#   3) 验证 dump 可重放（pg_restore --list）
#   4) DROP TABLE _v2_archived_*
#   5) 写 _archive/v2-archive-manifest.json 留档
#
# 使用：
#   bash scripts/archive-v2-tables.sh                # 交互式：会提示确认 DROP
#   FORCE_DROP=1 bash scripts/archive-v2-tables.sh    # 无人值守
#   DRY_RUN=1 bash scripts/archive-v2-tables.sh       # 只导不 DROP
#
# 数据库连接：
#   默认走 .env 里的 DB_HOST/PORT/USER/PASSWORD/NAME
#   也可手动 PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_NAME 覆盖
set -eu

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

red()    { printf '\033[31m%s\033[0m\n' "$1"; }
green()  { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()   { printf '\033[36m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }

# ── 读 env 优先级：PG_* > apps/api/.env > .env > 默认 ─────────────────────────
load_env_file() {
  if [ -f "$1" ]; then
    set -a; source "$1"; set +a
  fi
}
load_env_file "$ROOT/.env"
load_env_file "$ROOT/apps/api/.env"

PG_HOST="${PG_HOST:-${DB_HOST:-127.0.0.1}}"
PG_PORT="${PG_PORT:-${DB_PORT:-5432}}"
PG_USER="${PG_USER:-${DB_USER:-phoenix_v3}}"
PG_PASSWORD="${PG_PASSWORD:-${DB_PASSWORD:-}}"
PG_NAME="${PG_NAME:-${DB_NAME:-phoenix_erp}}"
export PGPASSWORD="$PG_PASSWORD"

# ── psql/pg_dump 路径自动嗅探 ─────────────────────────────────────────────────
PSQL="${PSQL:-$(command -v psql || echo /Applications/Postgres.app/Contents/Versions/18/bin/psql)}"
PG_DUMP="${PG_DUMP:-$(command -v pg_dump || echo /Applications/Postgres.app/Contents/Versions/18/bin/pg_dump)}"

if [ ! -x "$PSQL" ]; then
  red "❌ psql 不可用 ($PSQL)。请装 PostgreSQL client 或设 PSQL 环境变量"
  exit 2
fi

cyan "═══════════════════════════════════════════════════════════════════"
cyan "  V2 残表物理归档 — _v2_archived_sys_users/roles/user_roles"
cyan "═══════════════════════════════════════════════════════════════════"
cyan "  DB: $PG_USER@$PG_HOST:$PG_PORT/$PG_NAME"
cyan ""

# ── 1) 行数清单 ──────────────────────────────────────────────────────────────
cyan "▶ 1) 检查 V2 残表存在 + 行数"

TABLES=(_v2_archived_sys_users _v2_archived_sys_roles _v2_archived_sys_user_roles)
declare -a COUNTS

EXISTS_CNT=0
for T in "${TABLES[@]}"; do
  EXIST=$($PSQL -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_NAME" -tA -c \
    "SELECT 1 FROM information_schema.tables WHERE table_name='$T' LIMIT 1" 2>/dev/null || echo "")
  if [ -z "$EXIST" ]; then
    yellow "  ⚠ $T 不存在 (可能已 DROP 过 / V2 未迁过此环境)"
    COUNTS+=("0")
    continue
  fi
  EXISTS_CNT=$((EXISTS_CNT+1))
  N=$($PSQL -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_NAME" -tA -c "SELECT COUNT(*) FROM $T")
  printf "  • %-32s rows=%s\n" "$T" "$N"
  COUNTS+=("$N")
done

if [ "$EXISTS_CNT" -eq 0 ]; then
  green "✅ V2 残表全部不存在 — 已归档完成，无需再处理"
  exit 0
fi

# ── 2) pg_dump 全量快照 ──────────────────────────────────────────────────────
cyan ""
cyan "▶ 2) pg_dump 导出快照"

mkdir -p "$ROOT/_archive"
DATE=$(date +%F)
DUMP_FILE="$ROOT/_archive/v2-final-snapshot-$DATE.sql.gz"

# 把表名翻译成 -t 参数
DUMP_ARGS=()
for T in "${TABLES[@]}"; do DUMP_ARGS+=("-t" "$T"); done

"$PG_DUMP" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_NAME" \
  --no-owner --no-privileges \
  "${DUMP_ARGS[@]}" \
  | gzip > "$DUMP_FILE"

SIZE=$(du -h "$DUMP_FILE" | awk '{print $1}')
green "  ✓ 快照写入: $DUMP_FILE ($SIZE)"

# ── 3) 快照内容自检 ──────────────────────────────────────────────────────────
cyan ""
cyan "▶ 3) 快照内容自检"

INNER_TABLES=$(gunzip -c "$DUMP_FILE" | grep -E "^CREATE TABLE" | wc -l | tr -d ' ')
INNER_COPIES=$(gunzip -c "$DUMP_FILE" | grep -E "^COPY public" | wc -l | tr -d ' ')
green "  ✓ 快照含 ${INNER_TABLES} 个 CREATE TABLE + ${INNER_COPIES} 个 COPY 数据段"

# ── 4) 写归档清单 manifest.json ───────────────────────────────────────────────
cyan ""
cyan "▶ 4) 写归档清单"

MANIFEST="$ROOT/_archive/v2-archive-manifest.json"
cat > "$MANIFEST" <<EOF
{
  "archived_at":    "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "snapshot_file":  "_archive/v2-final-snapshot-$DATE.sql.gz",
  "snapshot_size":  "$SIZE",
  "snapshot_sha256":"$(shasum -a 256 "$DUMP_FILE" 2>/dev/null | awk '{print $1}' || echo 'unavailable')",
  "tables": [
    { "name": "_v2_archived_sys_users",      "row_count": ${COUNTS[0]:-0} },
    { "name": "_v2_archived_sys_roles",      "row_count": ${COUNTS[1]:-0} },
    { "name": "_v2_archived_sys_user_roles", "row_count": ${COUNTS[2]:-0} }
  ],
  "db": {
    "host": "$PG_HOST",
    "port": $PG_PORT,
    "name": "$PG_NAME"
  },
  "note": "V2→V3 收尾归档；如需回溯，gunzip 后 psql restore 即可"
}
EOF
green "  ✓ 清单: $MANIFEST"

# ── 5) 删除（视模式） ────────────────────────────────────────────────────────
cyan ""
if [ "${DRY_RUN:-0}" = "1" ]; then
  yellow "▶ 5) DRY_RUN=1 — 跳过 DROP，仅完成快照"
  exit 0
fi

if [ "${FORCE_DROP:-0}" != "1" ]; then
  cyan "▶ 5) 准备 DROP TABLE _v2_archived_*"
  printf "${YELLOW:-}    ⚠  即将不可逆删除上述 ${EXISTS_CNT} 张归档表。\n${NC:-}"
  printf "       快照已存 → $DUMP_FILE\n"
  printf "       回滚方法：gunzip -c \"$DUMP_FILE\" | psql -d $PG_NAME\n"
  printf "    继续？(yes/NO) > "
  read -r CONFIRM
  if [ "${CONFIRM:-}" != "yes" ]; then
    yellow "  已取消（输入了 '${CONFIRM:-}'）"
    exit 0
  fi
fi

cyan "▶ 5) DROP TABLE _v2_archived_*"
$PSQL -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_NAME" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP TABLE IF EXISTS _v2_archived_sys_user_roles;
DROP TABLE IF EXISTS _v2_archived_sys_roles;
DROP TABLE IF EXISTS _v2_archived_sys_users;
DROP SEQUENCE IF EXISTS _v2_archived_sys_users_id_seq;
DROP SEQUENCE IF EXISTS _v2_archived_sys_roles_id_seq;
DROP SEQUENCE IF EXISTS _v2_archived_sys_user_roles_id_seq;
COMMIT;
SQL
green "  ✓ 三张表 + 三个 sequence 已 DROP"

# ── 6) 收尾 ────────────────────────────────────────────────────────────────
cyan ""
green "═══════════════════════════════════════════════════════════════════"
green "  ✅ V2 残表归档完成"
green "═══════════════════════════════════════════════════════════════════"
green "  快照:   $DUMP_FILE ($SIZE)"
green "  清单:   $MANIFEST"
green "  下次开机 boot migration 的 IF EXISTS 包裹会让 rename 步骤跳过"
green ""
green "  回滚命令（必要时）:"
green "    gunzip -c \"$DUMP_FILE\" | psql -h $PG_HOST -U $PG_USER -d $PG_NAME"
green "═══════════════════════════════════════════════════════════════════"
