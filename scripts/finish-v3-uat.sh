#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  Phoenix ERP V3 — UAT 100% 一键收口
#
#  完整序列：
#    1) 应用 V3 完整 schema (含 33 张缺口表 + V2 列补齐)
#    2) 启动 API (后台, 等待 health=200)
#    3) 启动 Web (后台, 等待 Ready)
#    4) 种 UAT 用户 + fixture
#    5) 跑全量 UAT (76 用例 5 阶段)
#    6) 输出 UAT_REPORT.md & UAT_RESULT.csv，按 exit code 标 GO/NO-GO
#
#  用法：
#    bash scripts/finish-v3-uat.sh                # 跑全部
#    SKIP_DB=1 bash scripts/finish-v3-uat.sh      # 跳过 DDL（DB 已就绪）
#    KEEP_RUNNING=1 bash scripts/finish-v3-uat.sh # UAT 后保留 API/Web 运行
#
#  必备：psql, node, npm, curl 在 PATH
# ═══════════════════════════════════════════════════════════════════════════════

set -u

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

API_URL="${API_URL:-http://127.0.0.1:3100}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
DB_NAME="${DB_NAME:-phoenix_erp}"
LOG_DIR="$PROJECT_DIR/.logs"
mkdir -p "$LOG_DIR"

RED='\033[31m'; GREEN='\033[32m'; YELLOW='\033[33m'; CYAN='\033[36m'; BOLD='\033[1m'; NC='\033[0m'
log()   { printf "${CYAN}[$(date +%H:%M:%S)]${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}  ✓${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}  !${NC} %s\n" "$1"; }
err()   { printf "${RED}  ✗${NC} %s\n" "$1"; }
bold()  { printf "${BOLD}%s${NC}\n" "$1"; }

# psql 路径自适应（按可能性排序）
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
  # 支持 glob 与单文件
  for F in $CAND; do
    if [ -x "$F" ]; then PSQL_BIN="$F"; break 2; fi
  done
done
if [ -z "$PSQL_BIN" ]; then
  err "psql not found — tried Postgres.app, brew, /usr/local, /opt/homebrew"
  err "Manually: export PATH=/Applications/Postgres.app/Contents/Versions/18/bin:\$PATH"
  exit 1
fi
export PSQL="$PSQL_BIN"
# 把 psql 所在目录加进 PATH，让 pg_isready / pg_dump 同源可用
export PATH="$(dirname "$PSQL_BIN"):$PATH"

bold "═══════════════════════════════════════════════════════════════════"
bold "  Phoenix ERP V3 — UAT 100% 一键收口"
bold "═══════════════════════════════════════════════════════════════════"
log "API:  $API_URL"
log "Web:  $WEB_URL"
log "DB:   $DB_NAME (psql=$PSQL)"
log "Logs: $LOG_DIR/"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 阶段 1 — DB Schema
# ─────────────────────────────────────────────────────────────────────────────
if [ "${SKIP_DB:-0}" != "1" ]; then
  log "Stage 1/6  Apply V3 schema..."
  $PSQL "$DB_NAME" -q -v ON_ERROR_STOP=0 -f apps/api/migrations/v3_schema_complete.sql 2>&1 | tail -3
  if [ -f apps/api/migrations/v3_production_migration.sql ]; then
    $PSQL "$DB_NAME" -q -v ON_ERROR_STOP=0 -f apps/api/migrations/v3_production_migration.sql 2>&1 | tail -3
  fi
  (cd apps/api && node migrations/run_full_v3.js 2>&1 | tail -3)
  ok "schema applied"
else
  warn "SKIP_DB=1 — skip DDL"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 阶段 2 — 启动 API
# ─────────────────────────────────────────────────────────────────────────────
log "Stage 2/6  Start API..."

# 清端口 3100
PID=$(lsof -ti :3100 2>/dev/null || true)
[ -n "$PID" ] && kill -9 $PID 2>/dev/null && ok "killed old API pid=$PID"

(cd apps/api && nohup npm run start:dev > "$LOG_DIR/api.log" 2>&1 &
 echo $! > "$LOG_DIR/api.pid")

log "  waiting for API health (max 3min)..."
for i in $(seq 1 90); do
  if curl -sf -m 2 "$API_URL/api/health" >/dev/null 2>&1; then
    ok "API ready in $((i*2))s — $(curl -s "$API_URL/api/health")"
    break
  fi
  if grep -qE "EADDRINUSE|Cannot find module|UnhandledPromiseRejection" "$LOG_DIR/api.log" 2>/dev/null; then
    err "API startup error:"
    tail -30 "$LOG_DIR/api.log"
    exit 2
  fi
  sleep 2
done

if ! curl -sf -m 2 "$API_URL/api/health" >/dev/null 2>&1; then
  err "API not ready after 3min — check $LOG_DIR/api.log"
  tail -50 "$LOG_DIR/api.log"
  exit 2
fi

# ─────────────────────────────────────────────────────────────────────────────
# 阶段 3 — 启动 Web (可选)
# ─────────────────────────────────────────────────────────────────────────────
if [ "${SKIP_WEB:-0}" != "1" ]; then
  log "Stage 3/6  Start Web..."
  PID=$(lsof -ti :3000 2>/dev/null || true)
  [ -n "$PID" ] && kill -9 $PID 2>/dev/null && ok "killed old Web pid=$PID"

  (cd apps/web && nohup npm run dev -- --hostname 127.0.0.1 > "$LOG_DIR/web.log" 2>&1 &
   echo $! > "$LOG_DIR/web.pid")

  log "  waiting for Web ready (max 60s)..."
  for i in $(seq 1 30); do
    if grep -qE "Ready in|✓ Ready" "$LOG_DIR/web.log" 2>/dev/null; then
      ok "Web ready in $((i*2))s — $WEB_URL"
      break
    fi
    sleep 2
  done
else
  warn "SKIP_WEB=1 — skip web"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 阶段 4 — 种 UAT users + fixture
# ─────────────────────────────────────────────────────────────────────────────
log "Stage 4/6  Seed UAT users + fixture..."
[ -f scripts/seed-uat-users.sh ]   && bash scripts/seed-uat-users.sh   2>&1 | tail -5
[ -f scripts/seed-uat-fixture.sh ] && bash scripts/seed-uat-fixture.sh 2>&1 | tail -5

# ─────────────────────────────────────────────────────────────────────────────
# 阶段 5 — 跑 UAT
# ─────────────────────────────────────────────────────────────────────────────
log "Stage 5/6  Run UAT (5 phases, 76 cases)..."
bash scripts/uat-runner.sh
UAT_EXIT=$?

# ─────────────────────────────────────────────────────────────────────────────
# 阶段 6 — 结论
# ─────────────────────────────────────────────────────────────────────────────
echo ""
bold "═══════════════════════════════════════════════════════════════════"
if [ -f UAT_REPORT.md ]; then
  head -25 UAT_REPORT.md
fi
bold "═══════════════════════════════════════════════════════════════════"

# 清理 API/Web (除非 KEEP_RUNNING=1)
if [ "${KEEP_RUNNING:-0}" != "1" ]; then
  log "Cleanup: stopping API/Web..."
  [ -f "$LOG_DIR/api.pid" ] && kill $(cat "$LOG_DIR/api.pid") 2>/dev/null || true
  [ -f "$LOG_DIR/web.pid" ] && kill $(cat "$LOG_DIR/web.pid") 2>/dev/null || true
else
  warn "KEEP_RUNNING=1 — API/Web 继续运行"
fi

if [ $UAT_EXIT -eq 0 ]; then
  printf "${GREEN}${BOLD}\n🟢 GO — UAT 100%% PASS — V3 迁移完成！${NC}\n\n"
else
  printf "${YELLOW}${BOLD}\n🟡 $UAT_EXIT FAIL — 查看 UAT_REPORT.md / UAT_RESULT.csv${NC}\n\n"
fi
exit $UAT_EXIT
