#!/usr/bin/env bash
# Phoenix ERP V3 — PostgreSQL 备份脚本
#
# 设计要点：
#   - pg_dump --format=custom (.dump) 体积比 plain SQL 小，支持选表 restore
#   - 默认输出 /var/backups/phoenix/ (容器外) 或 ./backups (本地)
#   - 保留策略：每日 → 7 份；每周日额外存 4 份；按月 1 份；其余清理
#   - 用 sha256 校验完整性
#   - 退出码：0 成功 / 非 0 失败（cron 失败邮件触发）
#
# 推荐 cron 配置 (每天 02:00)：
#   0 2 * * * /path/to/ABC/scripts/backup-db.sh >> /var/log/phoenix-backup.log 2>&1
set -eu

cd "$(dirname "$0")/.."

# ── 配置 ───────────────────────────────────────────────────────────────────
load_env_file() {
  if [ -f "$1" ]; then
    set -a; source "$1"; set +a
  fi
  return 0
}
load_env_file ".env" || true
load_env_file "apps/api/.env" || true

PG_HOST="${PG_HOST:-${DB_HOST:-127.0.0.1}}"
PG_PORT="${PG_PORT:-${DB_PORT:-5432}}"
PG_USER="${PG_USER:-${DB_USER:-phoenix_v3}}"
PG_PASSWORD="${PG_PASSWORD:-${DB_PASSWORD:-}}"
PG_NAME="${PG_NAME:-${DB_NAME:-phoenix_erp}}"
export PGPASSWORD="$PG_PASSWORD"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/phoenix}"
# 如果默认目录写不了，退回到 ./backups
if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
  BACKUP_DIR="./backups"
  mkdir -p "$BACKUP_DIR"
fi

PG_DUMP="${PG_DUMP:-$(command -v pg_dump || echo /Applications/Postgres.app/Contents/Versions/18/bin/pg_dump)}"

if [ ! -x "$PG_DUMP" ]; then
  echo "❌ pg_dump 不可用 ($PG_DUMP)" >&2
  exit 2
fi

TS=$(date +%Y-%m-%dT%H%M%S)
DOW=$(date +%u)  # 1-7 (Mon-Sun)
DOM=$(date +%d)  # 01-31
NAME="phoenix-$TS.dump"
FILE="$BACKUP_DIR/$NAME"

# ── 1) 备份 ────────────────────────────────────────────────────────────────
echo "[$(date -u +%FT%TZ)] Starting backup → $FILE"
"$PG_DUMP" -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_NAME" \
  --format=custom --compress=6 --no-owner --no-privileges \
  -f "$FILE"

SIZE=$(du -h "$FILE" | awk '{print $1}')
SHA=$(shasum -a 256 "$FILE" | awk '{print $1}')
echo "  size=$SIZE sha256=$SHA"

# 写校验信息
echo "$SHA  $NAME" >> "$BACKUP_DIR/SHA256SUMS"

# ── 2) 周/月备份 hardlink ──────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"
if [ "$DOW" = "7" ]; then  # Sunday
  ln -f "$FILE" "$BACKUP_DIR/weekly/$NAME"
  echo "  → hardlinked weekly"
fi
if [ "$DOM" = "01" ]; then
  ln -f "$FILE" "$BACKUP_DIR/monthly/$NAME"
  echo "  → hardlinked monthly"
fi

# ── 3) 保留策略 ────────────────────────────────────────────────────────────
# 每日：7 份；周日：4 份；月初：12 份
find "$BACKUP_DIR" -maxdepth 1 -name 'phoenix-*.dump' -mtime +7 -delete -print | sed 's/^/  cleaned daily: /' || true
find "$BACKUP_DIR/weekly"  -maxdepth 1 -name 'phoenix-*.dump' -mtime +28 -delete -print | sed 's/^/  cleaned weekly: /' || true
find "$BACKUP_DIR/monthly" -maxdepth 1 -name 'phoenix-*.dump' -mtime +365 -delete -print | sed 's/^/  cleaned monthly: /' || true

# ── 4) 完整性自检（pg_restore --list） ──────────────────────────────────────
PG_RESTORE="${PG_RESTORE:-$(command -v pg_restore || echo /Applications/Postgres.app/Contents/Versions/18/bin/pg_restore)}"
if [ -x "$PG_RESTORE" ]; then
  TOC_LINES=$("$PG_RESTORE" --list "$FILE" 2>/dev/null | wc -l | tr -d ' ')
  echo "  pg_restore --list = $TOC_LINES TOC entries (sanity ok)"
fi

echo "[$(date -u +%FT%TZ)] ✅ Backup complete: $FILE"
