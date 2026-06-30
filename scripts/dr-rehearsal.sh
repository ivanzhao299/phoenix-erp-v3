#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Phoenix ERP V3 — 灾备端到端演练（DR Rehearsal）
#
# 目的：把"备份能恢复"从口头承诺变成可重复跑的护栏。串联四步：
#   1) 验证 DB 备份存在 / 可读（pg_restore --list 完整性自检）
#   2) 恢复到一次性 scratch 库（绝不碰生产）
#   3) 对 scratch 库跑迁移（裸 SQL via scripts/db-migrate.sh + TS via typeorm，若可用）
#   4) 冒烟查询 + 报告恢复表数 / 近似 RTO / RPO
#
# ── 安全边界（本脚本绝不碰生产）──────────────────────────────────────────────
#   - 默认 DRY-RUN：只打印将执行什么 + 做只读校验，不建库、不跑迁移。
#   - 加 --execute 才真正建 scratch 库并恢复；scratch 库名带时间戳，跑完即删。
#   - 拒绝把 scratch 库名设成生产库名（PROD_DB_NAMES 命中即退出）。
#   - 不在此脚本内执行 pg_dump 备份；备份产出归 scripts/ops/backup-runner.sh。
#   - 正式恢复到生产库不在本脚本职责内 —— 用 scripts/ops/restore-runner.sh + docs/ROLLBACK.md §4。
#
# ── 与既有运维脚本的关系 ─────────────────────────────────────────────────────
#   - 备份产出：     scripts/ops/backup-runner.sh（写 *.dump，sys_backup_records 回写）
#   - 恢复 runner：  scripts/ops/restore-runner.sh（演练校验 / 正式恢复，含生产护栏）
#   - 迁移执行器：   scripts/db-migrate.sh（schema_migrations + 裸 SQL + TS 迁移链）
#   - DR SOP：       docs/ops/DR_RESTORE_DRILL.md
#   - 本脚本 = 把上面几件串成一次"端到端可恢复性"演练，便于接月度 cron。
#
# ── 用法 ─────────────────────────────────────────────────────────────────────
#   # DRY-RUN（默认，零副作用，只校验备份可读 + 打印计划）：
#   RESTORE_FILE=/var/backups/phoenix-erp/phoenix_BK-最新.dump \
#   DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=postgres DB_PASSWORD=*** \
#     scripts/dr-rehearsal.sh
#
#   # 真演练（建 scratch 库、恢复、跑迁移、冒烟、删库）：
#   RESTORE_FILE=... DB_HOST=... DB_USER=... DB_PASSWORD=... \
#     scripts/dr-rehearsal.sh --execute
#
# ── 环境变量（凭据只从 env 读，不硬编码；对齐 backup/restore-runner 的 DB_* 约定）─
#   RESTORE_FILE   待演练的备份 dump（必填）
#   DB_HOST        默认 127.0.0.1
#   DB_PORT        默认 5432
#   DB_USER        默认 postgres
#   DB_PASSWORD    导出为 PGPASSWORD
#   PROD_DB_NAMES  逗号分隔生产库名（默认 phoenix_erp），scratch 库名命中即拒绝
#   MIG_DIR        迁移根目录（默认 apps/api，传给 scripts/db-migrate.sh）
#   RUN_MIGRATIONS 默认 yes；设 no 跳过第 3 步（只验证纯恢复）
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
umask 077

# ── 参数 ─────────────────────────────────────────────────────────────────────
EXECUTE="no"
for arg in "$@"; do
  case "$arg" in
    --execute) EXECUTE="yes" ;;
    -h|--help) sed -n '2,52p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg（用 --execute 真跑，--help 看用法）" >&2; exit 2 ;;
  esac
done

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
RESTORE_FILE="${RESTORE_FILE:-}"
PROD_DB_NAMES="${PROD_DB_NAMES:-phoenix_erp}"
MIG_DIR="${MIG_DIR:-apps/api}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-yes}"
export PGPASSWORD="${DB_PASSWORD:-}"

SCRATCH_DB="phoenix_dr_rehearsal_$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
START_TS=$(date +%s)

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
step() { echo; echo "════════════════════════════════════════════════════════════"; echo "  $*"; echo "════════════════════════════════════════════════════════════"; }
die()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ ERROR: $*" >&2; exit 1; }
plan() { echo "    [DRY-RUN 将执行] $*"; }

psqlc()  { psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$@"; }

# ── 横幅 ─────────────────────────────────────────────────────────────────────
step "Phoenix ERP V3 · 灾备演练（DR Rehearsal）"
if [ "$EXECUTE" = "yes" ]; then
  log "模式：🔴 EXECUTE — 将真建 scratch 库 [$SCRATCH_DB]、恢复、跑迁移、删库（不碰生产）"
else
  log "模式：🟢 DRY-RUN（默认）— 只做只读校验 + 打印计划。加 --execute 才真跑。"
fi
log "目标 PG：${DB_USER}@${DB_HOST}:${DB_PORT}"
log "备份文件：${RESTORE_FILE:-<未设置>}"
log "Scratch 库：$SCRATCH_DB（演练专用，跑完删除）"

# ── 工具 & 生产护栏 ──────────────────────────────────────────────────────────
command -v pg_restore >/dev/null 2>&1 || die "pg_restore 不在 PATH"
command -v psql       >/dev/null 2>&1 || die "psql 不在 PATH"
[ -n "$RESTORE_FILE" ] || die "未指定 RESTORE_FILE（备份 dump 路径）"

IFS=',' read -ra _PN <<< "$PROD_DB_NAMES"
for n in "${_PN[@]}"; do
  [ "$SCRATCH_DB" = "$n" ] && die "scratch 库名 '$SCRATCH_DB' 命中生产库名，拒绝（防误恢复到生产）"
done

# ════════════════════════════════════════════════════════════════════════════
# 步骤 1：验证备份存在 / 可读（只读，DRY-RUN 也真跑——零副作用）
# ════════════════════════════════════════════════════════════════════════════
step "步骤 1/4 · 验证备份存在且可恢复"
[ -f "$RESTORE_FILE" ] || die "备份文件不存在：$RESTORE_FILE"
SIZE=$(stat -c%s "$RESTORE_FILE" 2>/dev/null || stat -f%z "$RESTORE_FILE" 2>/dev/null || echo 0)
log "备份文件存在，大小 ${SIZE} bytes"
log "完整性自检：pg_restore --list（能列出归档对象才算可用）"
ENTRIES=$(pg_restore --list "$RESTORE_FILE" 2>/dev/null | grep -cvE '^;|^$' || true)
[ "${ENTRIES:-0}" -gt 0 ] || die "备份归档无法列出/为空，疑似损坏 → 演练判定 FAIL"
log "✅ 备份可读，含 ${ENTRIES} 个归档对象"

# RPO 提示：最近一次 SUCCESS 备份距今多久（只读查 sys_backup_records，库不可达则跳过）
log "RPO 探测：查 sys_backup_records 最近一次 SUCCESS（只读，失败不致命）"
RPO_INFO=$(psqlc -d postgres -tAc \
  "SELECT 'last_success=' || COALESCE(max(finished_at)::text,'<none>') ||
          ' age=' || COALESCE((now()-max(finished_at))::text,'n/a')
   FROM sys_backup_records WHERE status='SUCCESS'" 2>/dev/null || true)
[ -n "$RPO_INFO" ] && log "  $RPO_INFO" || log "  （查不到 sys_backup_records，可能连不到库或表不存在 — 跳过 RPO）"

# ════════════════════════════════════════════════════════════════════════════
# 步骤 2：恢复到 scratch 库
# ════════════════════════════════════════════════════════════════════════════
step "步骤 2/4 · 恢复到 scratch 库 [$SCRATCH_DB]"
RESTORED_TABLES="(未执行)"
if [ "$EXECUTE" != "yes" ]; then
  plan "psql -d postgres -c 'CREATE DATABASE \"$SCRATCH_DB\"'"
  plan "pg_restore -d $SCRATCH_DB --no-owner --no-privileges \"$RESTORE_FILE\""
  log "DRY-RUN：跳过建库/恢复。"
else
  log "建 scratch 库 $SCRATCH_DB …"
  psqlc -d postgres -c "CREATE DATABASE \"$SCRATCH_DB\"" >/dev/null
  # 跑完无论成败都删 scratch 库（trap 兜底）
  cleanup() {
    log "清理：DROP DATABASE $SCRATCH_DB"
    psqlc -d postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\"" >/dev/null 2>&1 || \
      log "⚠️ 删 scratch 库失败，请手动 DROP DATABASE \"$SCRATCH_DB\""
  }
  trap cleanup EXIT
  log "pg_restore → $SCRATCH_DB（--no-owner --no-privileges）…"
  if pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$SCRATCH_DB" \
       --no-owner --no-privileges "$RESTORE_FILE" 2>/tmp/_dr_restore.err; then
    RESTORED_TABLES=$(psqlc -d "$SCRATCH_DB" -tAc \
      "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
    log "✅ 恢复成功：scratch 库含 ${RESTORED_TABLES} 张表"
  else
    log "❌ pg_restore 报错（前 20 行）："; head -20 /tmp/_dr_restore.err >&2 || true
    die "恢复失败 → 演练判定 FAIL"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# 步骤 3：对 scratch 库跑迁移（验证迁移链能在恢复出的库上前滚）
# ════════════════════════════════════════════════════════════════════════════
step "步骤 3/4 · 对 scratch 库跑迁移"
if [ "$RUN_MIGRATIONS" != "yes" ]; then
  log "RUN_MIGRATIONS=no → 跳过迁移步骤。"
elif [ "$EXECUTE" != "yes" ]; then
  plan "PGDATABASE=$SCRATCH_DB MIG_MODE=ci MIG_DIR=$MIG_DIR bash $REPO_ROOT/scripts/db-migrate.sh"
  plan "（若 dist/database/data-source.js + typeorm CLI 就绪，db-migrate.sh 末尾会跑 TS 迁移）"
  log "DRY-RUN：跳过迁移执行。"
else
  log "用 scripts/db-migrate.sh（MIG_MODE=ci 直连 scratch 库）跑裸 SQL + TS 迁移链 …"
  if PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$DB_USER" \
     PGPASSWORD="${DB_PASSWORD:-}" PGDATABASE="$SCRATCH_DB" \
     MIG_MODE=ci MIG_DIR="$MIG_DIR" \
     bash "$REPO_ROOT/scripts/db-migrate.sh"; then
    log "✅ 迁移链在 scratch 库上跑通（恢复出的库可被前滚到最新 schema）"
  else
    # 迁移失败在演练里是有价值的信号（说明备份 schema 与当前迁移链不兼容），如实报但不当致命崩
    log "⚠️ 迁移在 scratch 库上失败 — 记为演练发现项（备份 schema 可能落后于迁移链，需人工核查）"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# 步骤 4：冒烟查询 + 报告
# ════════════════════════════════════════════════════════════════════════════
step "步骤 4/4 · 冒烟查询 + 报告"
SMOKE="(未执行)"
if [ "$EXECUTE" != "yes" ]; then
  plan "psql -d $SCRATCH_DB -c 'SELECT count(*) FROM sys_user'（核心表存在性冒烟）"
  log "DRY-RUN：跳过冒烟查询。"
else
  log "冒烟：核心表 sys_user 可查？"
  if SMOKE=$(psqlc -d "$SCRATCH_DB" -tAc "SELECT count(*) FROM sys_user" 2>/dev/null); then
    log "✅ 冒烟通过：sys_user 行数 = ${SMOKE}"
  else
    SMOKE="FAIL(sys_user 不可查)"
    log "⚠️ 冒烟：sys_user 不可查（备份可能为 SCHEMA-only，或表名变更）"
  fi
fi

ELAPSED=$(( $(date +%s) - START_TS ))
step "演练报告（DR Rehearsal Report）"
echo "  模式          : $([ "$EXECUTE" = yes ] && echo EXECUTE || echo DRY-RUN)"
echo "  备份文件      : $RESTORE_FILE"
echo "  归档对象数    : $ENTRIES"
echo "  恢复出表数    : $RESTORED_TABLES"
echo "  迁移          : $([ "$RUN_MIGRATIONS" = yes ] && echo "已尝试（见上日志）" || echo "跳过")"
echo "  冒烟(sys_user): $SMOKE"
echo "  耗时(近似 RTO): ${ELAPSED}s"
echo "  RPO 线索      : ${RPO_INFO:-n/a}"
echo
if [ "$EXECUTE" = "yes" ]; then
  log "✅ 演练完成（scratch 库已清理）。把结果填入 docs/ops/DR_RESTORE_DRILL.md 第 4 节表格。"
else
  log "✅ DRY-RUN 完成：备份完整性已校验，无任何写副作用。加 --execute 跑完整演练。"
fi
