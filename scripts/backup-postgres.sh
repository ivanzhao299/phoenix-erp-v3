#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# Phoenix ERP V3 — PostgreSQL 生产备份脚本
# Production Stabilization Phase 1
#
# 用途：每日全量备份生产数据库，按保留策略自动清理旧备份
# 执行：由 cron 每日 02:00 UTC 调用（避开业务高峰）
# cron:  0 2 * * * /opt/phoenix/scripts/backup-postgres.sh >> /var/log/phoenix-backup.log 2>&1
#
# 保留策略（3 层）：
#   - 最近 7 天：每日备份全部保留
#   - 最近 30 天：仅保留每周一
#   - 最近 90 天：仅保留每月 1 日
#   - 90 天以前：自动删除
#
# 安全约束：
#   - 备份目录不进 Git（.gitignore 已排除 *.dump / *.gz）
#   - 备份文件权限 600（仅 owner 可读）
#   - 连接凭据从环境变量读取，不硬编码
# ════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── 配置（生产环境通过环境变量覆盖）────────────────────────────────
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-phoenix_erp}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/phoenix-erp}"
PGPASSWORD="${DB_PASSWORD:-}"
export PGPASSWORD

# ── 日志工具 ─────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
error() { log "ERROR: $*" >&2; exit 1; }

# ── 前置检查 ─────────────────────────────────────────────────────────
command -v pg_dump >/dev/null 2>&1 || error "pg_dump 未安装或不在 PATH 中"
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# ── 1. 执行备份 ────────────────────────────────────────────────────────
DATE_TAG=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/phoenix_erp_${DATE_TAG}.dump"
BACKUP_META="${BACKUP_DIR}/phoenix_erp_${DATE_TAG}.meta.json"

log "开始备份：${DB_NAME}@${DB_HOST}:${DB_PORT} → ${BACKUP_FILE}"

pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --format=custom \
  --compress=9 \
  --no-password \
  --dbname="${DB_NAME}" \
  --file="${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"
BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
log "备份完成：${BACKUP_FILE}（${BACKUP_SIZE}）"

# ── 2. 写备份元数据 ──────────────────────────────────────────────────
cat > "${BACKUP_META}" <<EOF
{
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "db_host":   "${DB_HOST}",
  "db_name":   "${DB_NAME}",
  "file":      "${BACKUP_FILE}",
  "size":      "${BACKUP_SIZE}",
  "pg_version": "$(pg_dump --version | head -1)"
}
EOF
chmod 600 "${BACKUP_META}"

# ── 3. 清理旧备份（3 层保留策略）────────────────────────────────────
log "执行备份清理..."

TODAY=$(date '+%Y%m%d')
DAY_OF_WEEK=$(date '+%u')   # 1=周一 ... 7=周日
DAY_OF_MONTH=$(date '+%d')

deleted=0
for file in "${BACKUP_DIR}"/phoenix_erp_*.dump; do
  [ -f "$file" ] || continue

  # 从文件名提取日期（格式：phoenix_erp_YYYYMMDD_HHMMSS.dump）
  fname=$(basename "$file")
  file_date="${fname:11:8}"   # 提取 YYYYMMDD

  # 计算文件距今天数
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    file_ts=$(date -j -f '%Y%m%d' "${file_date}" '+%s' 2>/dev/null || echo 0)
    today_ts=$(date -j -f '%Y%m%d' "${TODAY}" '+%s')
  else
    # Linux
    file_ts=$(date -d "${file_date}" '+%s' 2>/dev/null || echo 0)
    today_ts=$(date -d "${TODAY}" '+%s')
  fi

  [ "$file_ts" -eq 0 ] && continue
  age_days=$(( (today_ts - file_ts) / 86400 ))
  file_dow=$(date -d "${file_date}" '+%u' 2>/dev/null || date -j -f '%Y%m%d' "${file_date}" '+%u' 2>/dev/null || echo 1)
  file_dom=$(echo "${file_date}" | cut -c7-8)

  should_delete=false

  if   [ "${age_days}" -le 7 ]; then
    # 最近 7 天：全部保留
    should_delete=false
  elif [ "${age_days}" -le 30 ]; then
    # 7~30 天：仅保留周一（dow=1）
    [ "${file_dow}" != "1" ] && should_delete=true
  elif [ "${age_days}" -le 90 ]; then
    # 30~90 天：仅保留每月 1 日
    [ "${file_dom}" != "01" ] && should_delete=true
  else
    # 90 天以上：全部删除
    should_delete=true
  fi

  if [ "${should_delete}" = "true" ]; then
    rm -f "${file}" "${file%.dump}.meta.json"
    deleted=$((deleted + 1))
    log "  已删除：${fname}（${age_days} 天前）"
  fi
done

log "清理完成：共删除 ${deleted} 个旧备份文件"

# ── 4. 输出汇总 ───────────────────────────────────────────────────────
total=$(ls -1 "${BACKUP_DIR}"/*.dump 2>/dev/null | wc -l)
log "备份目录当前文件数：${total}"
log "════════ 备份任务完成 ════════"
