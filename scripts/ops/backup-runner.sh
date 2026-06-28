#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# Phoenix ERP V3 — 备份 runner（运维侧执行，应用不直接跑 pg_dump）
#
# 职责：拾取 sys_backup_records 中的 PENDING 请求 → pg_dump 执行 → 回写状态/文件/大小。
#       配合应用「手动备份」按钮(写 PENDING)与定时计划(sys_backup_config)使用。
#
# cron（建议每分钟扫一次请求；定时全量另由计划触发）：
#   * * * * * DB_HOST=... DB_USER=... DB_PASSWORD=... /opt/phoenix/scripts/ops/backup-runner.sh >> /var/log/phoenix-backup-runner.log 2>&1
#
# 安全：凭据从环境变量读取，不硬编码；备份文件权限 600。
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
umask 077   # L5:备份文件/目录默认仅 owner 可读(消除 pg_dump 后 chmod 前的可读窗口)

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-phoenix_erp}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/phoenix-erp}"
export PGPASSWORD="${DB_PASSWORD:-}"

psqlq() { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

command -v pg_dump >/dev/null 2>&1 || { log "ERROR: pg_dump 不在 PATH"; exit 1; }
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"

# 0) 回收僵死 RUNNING（>60 分钟视为超时失败）——防单次失败把 RUNNING 卡死、阻塞后续所有请求
psqlq "UPDATE sys_backup_records SET status='FAILED', finished_at=NOW(), note='runner 超时回收(>60min)' WHERE status='RUNNING' AND started_at < NOW() - INTERVAL '60 minutes'" >/dev/null || true

# 1) 原子认领一条 PENDING（FOR UPDATE SKIP LOCKED 防多 runner 并发抢同一行/重复 dump）
# CTE 包一层:外层 SELECT 只回值,避免 UPDATE 命令标签('UPDATE 1')混进结果污染 TYPE 解析
ROW=$(psqlq "WITH c AS (
               UPDATE sys_backup_records SET status='RUNNING', started_at=NOW()
               WHERE id = (SELECT id FROM sys_backup_records WHERE status='PENDING'
                           ORDER BY id ASC FOR UPDATE SKIP LOCKED LIMIT 1)
               RETURNING id, backup_no, backup_type)
             SELECT id||'|'||backup_no||'|'||backup_type FROM c" || true)
[ -z "$ROW" ] && { log "无待处理备份请求"; exit 0; }
ID="${ROW%%|*}"; REST="${ROW#*|}"; NO="${REST%%|*}"; TYPE="${REST##*|}"
log "已认领备份请求 #$ID $NO ($TYPE)"

# 2) 执行 pg_dump（stderr 用 mktemp，避免 /tmp 固定名碰撞/符号链接攻击）
FILE="$BACKUP_DIR/phoenix_${NO}.dump"
ERRF=$(mktemp "${TMPDIR:-/tmp}/phoenix-bk.XXXXXX")
trap 'rm -f "$ERRF"' EXIT
if [ "$TYPE" = "SCHEMA" ]; then DUMP_ARGS="--schema-only"; else DUMP_ARGS=""; fi
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --format=custom $DUMP_ARGS -f "$FILE" 2>"$ERRF"; then
  chmod 600 "$FILE"
  SIZE=$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE" 2>/dev/null || echo 0)
  psqlq "UPDATE sys_backup_records SET status='SUCCESS', file_path='$FILE', size_bytes=$SIZE, finished_at=NOW(), note='runner 执行成功' WHERE id=$ID" >/dev/null
  log "备份成功 $FILE ($SIZE bytes)"
else
  # 字符级截断(cut -c,不切碎多字节 UTF-8 → 不会让回写 SQL 因非法字节崩溃把行卡在 RUNNING)
  ERR=$(tr "'" ' ' < "$ERRF" | tr -d '\n' | cut -c1-480)
  # 回写失败状态即便自身再失败也不让 set -e 中断(|| true);超时回收兜底
  psqlq "UPDATE sys_backup_records SET status='FAILED', finished_at=NOW(), note='$ERR' WHERE id=$ID" >/dev/null || true
  log "备份失败 #$ID: $ERR"; exit 1
fi

# 3) 保留策略：删除超过 retention_days 的备份文件（RETAIN 必须为正整数，否则用默认 30）
RETAIN=$(psqlq "SELECT retention_days FROM sys_backup_config WHERE id=1" || true)
[[ "$RETAIN" =~ ^[0-9]+$ ]] || RETAIN=30
find "$BACKUP_DIR" -name 'phoenix_*.dump' -type f -mtime "+${RETAIN}" -delete 2>/dev/null || true
log "完成（保留 ${RETAIN} 天）"
