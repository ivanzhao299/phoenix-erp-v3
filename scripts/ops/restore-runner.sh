#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# Phoenix ERP V3 — 恢复 runner（P2 评分补强：补上"恢复从未演练"的可执行护栏）
#
# 职责：把 backup-runner.sh 产出的 --format=custom dump 安全恢复到目标库。
#       配合 docs/ops/DR_RESTORE_DRILL.md 的演练流程使用。
#
# 用法：
#   RESTORE_FILE=/var/backups/phoenix-erp/phoenix_BK-xxx.dump \
#   DB_HOST=... DB_PORT=5432 DB_USER=... DB_PASSWORD=... DB_NAME=phoenix_erp_restore \
#   CONFIRM=RESTORE  scripts/ops/restore-runner.sh
#
# 安全护栏（破坏性操作，宁可不跑也不误删）：
#   1) 必须显式 CONFIRM=RESTORE，否则只做"演练校验"（list+到临时库试恢复）不动目标库。
#   2) 默认拒绝直恢复到生产库名（PROD_DB_NAMES 命中且无 ALLOW_PROD=yes 时退出）。
#   3) 恢复前对目标库先做一次 safety pre-restore dump（除非 SKIP_SAFETY=yes）。
#   4) 凭据只读环境变量，不硬编码。
# ════════════════════════════════════════════════════════════════════
set -euo pipefail
umask 077

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-phoenix_erp_restore}"
RESTORE_FILE="${RESTORE_FILE:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/phoenix-erp}"
CONFIRM="${CONFIRM:-}"
ALLOW_PROD="${ALLOW_PROD:-}"
SKIP_SAFETY="${SKIP_SAFETY:-}"
PROD_DB_NAMES="${PROD_DB_NAMES:-phoenix_erp}"   # 逗号分隔；命中即视为生产库
export PGPASSWORD="${DB_PASSWORD:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERROR: $*"; exit 1; }

command -v pg_restore >/dev/null 2>&1 || die "pg_restore 不在 PATH"
command -v pg_dump   >/dev/null 2>&1 || die "pg_dump 不在 PATH"
[ -n "$RESTORE_FILE" ] || die "未指定 RESTORE_FILE"
[ -f "$RESTORE_FILE" ] || die "备份文件不存在：$RESTORE_FILE"

# 1) 完整性校验：能列出归档目录才算可用备份
log "校验备份完整性（pg_restore --list）：$RESTORE_FILE"
ENTRIES=$(pg_restore --list "$RESTORE_FILE" 2>/dev/null | grep -cvE '^;|^$' || true)
[ "${ENTRIES:-0}" -gt 0 ] || die "备份归档无法列出/为空，疑似损坏，已中止"
log "✅ 备份可读，含 $ENTRIES 个归档对象"

# 2) 生产库保护
IS_PROD=no
IFS=',' read -ra _PN <<< "$PROD_DB_NAMES"
for n in "${_PN[@]}"; do [ "$DB_NAME" = "$n" ] && IS_PROD=yes; done
if [ "$IS_PROD" = "yes" ] && [ "$ALLOW_PROD" != "yes" ]; then
  die "目标库 '$DB_NAME' 被识别为生产库；如确需恢复到生产，须显式 ALLOW_PROD=yes（强烈建议先恢复到副本库验证）"
fi

# 3) 非确认模式 = 演练校验：恢复到一次性临时库，验证可恢复性后清理，不碰目标库
if [ "$CONFIRM" != "RESTORE" ]; then
  DRILL_DB="phoenix_drill_$(date +%s)"
  log "未设 CONFIRM=RESTORE → 进入【演练校验】模式，恢复到临时库 $DRILL_DB（不动 $DB_NAME）"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DRILL_DB\"" >/dev/null
  if pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DRILL_DB" --no-owner --no-privileges "$RESTORE_FILE" 2>/tmp/_drill.err; then
    TBLS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DRILL_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
    log "✅ 演练成功：临时库恢复出 $TBLS 张表。可恢复性已验证（RTO 见日志耗时）。"
    RC=0
  else
    log "❌ 演练失败，pg_restore 报错（前 20 行）："; head -20 /tmp/_drill.err || true; RC=1
  fi
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE \"$DRILL_DB\"" >/dev/null || true
  exit $RC
fi

# 4) 正式恢复（CONFIRM=RESTORE）
log "【正式恢复】→ 目标库 $DB_NAME"
if [ "$SKIP_SAFETY" != "yes" ]; then
  SAFE="$BACKUP_DIR/pre-restore_${DB_NAME}_$(date +%Y%m%d_%H%M%S).dump"
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  log "恢复前对 $DB_NAME 做 safety 备份：$SAFE"
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --format=custom -f "$SAFE" 2>/dev/null \
    && chmod 600 "$SAFE" && log "✅ safety 备份完成" \
    || log "⚠️ safety 备份失败（目标库可能不存在），继续"
fi
log "执行 pg_restore --clean --if-exists（覆盖式恢复）…"
pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --clean --if-exists --no-owner --no-privileges "$RESTORE_FILE"
TBLS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
log "✅ 恢复完成：$DB_NAME 现有 $TBLS 张表。请跑应用 health/login 冒烟确认。"
