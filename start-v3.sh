#!/bin/bash
# ============================================================
#  Phoenix ERP V3 — 快速启动脚本
#  API  → http://127.0.0.1:3100
#  Web  → http://127.0.0.1:3000
# ============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ── 颜色 ─────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${CYAN}[Phoenix]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

# ── 清理旧进程 ────────────────────────────────────────────────
cleanup_port() {
  local port=$1
  local pid
  pid=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    warn "端口 $port 被占用 (PID: $pid)，正在清理..."
    kill -9 $pid 2>/dev/null || true
    sleep 1
    ok "端口 $port 已释放"
  fi
}

# ── 清理所有旧进程 ────────────────────────────────────────────
echo ""
echo -e "${BOLD}🚀 Phoenix ERP V3 启动中...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cleanup_port 3000
cleanup_port 3100

# ── 检查 pnpm ────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  err "未找到 pnpm，请先安装: npm install -g pnpm"
  exit 1
fi

# ── 日志目录 ─────────────────────────────────────────────────
LOG_DIR="$PROJECT_DIR/.logs"
mkdir -p "$LOG_DIR"
API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
> "$API_LOG"; > "$WEB_LOG"

# ── 启动 API (NestJS :3100) ──────────────────────────────────
log "启动后端 API (NestJS → :3100)..."
# 直接进入后端目录启动，避免 pnpm filter 名称不匹配
(cd "$PROJECT_DIR/apps/api" && npm run start:dev) > "$API_LOG" 2>&1 &
API_PID=$!
echo $API_PID > "$LOG_DIR/api.pid"

# 等待 API 就绪（最多 30 秒）
log "等待 API 就绪..."
API_READY=false
for i in $(seq 1 30); do
  sleep 1
  if grep -q "Nest application successfully started" "$API_LOG" 2>/dev/null; then
    API_READY=true
    break
  fi
  if grep -q "EADDRINUSE\|Error:" "$API_LOG" 2>/dev/null; then
    err "API 启动失败，查看日志: $API_LOG"
    tail -5 "$API_LOG"
    exit 1
  fi
  printf "."
done
echo ""

if $API_READY; then
  ok "后端 API 就绪 → http://127.0.0.1:3100"
else
  warn "API 启动超时，继续启动 Web（API 可能仍在初始化）"
fi

# ── 启动 Web (Next.js :3000) ─────────────────────────────────
log "启动前端 Web (Next.js → :3000)..."
# 绑定 127.0.0.1 规避 macOS Local Network EPERM
(cd "$PROJECT_DIR/apps/web" && npm run dev -- --hostname 127.0.0.1) > "$WEB_LOG" 2>&1 &
WEB_PID=$!
echo $WEB_PID > "$LOG_DIR/web.pid"

# 等待 Web 就绪（最多 30 秒）
log "等待 Web 就绪..."
WEB_READY=false
for i in $(seq 1 30); do
  sleep 1
  if grep -q "Ready in\|✓ Ready" "$WEB_LOG" 2>/dev/null; then
    WEB_READY=true
    break
  fi
  if grep -q "Error:" "$WEB_LOG" 2>/dev/null && ! grep -q "Ready" "$WEB_LOG" 2>/dev/null; then
    err "Web 启动失败，查看日志: $WEB_LOG"
    tail -5 "$WEB_LOG"
    exit 1
  fi
  printf "."
done
echo ""

if $WEB_READY; then
  ok "前端 Web 就绪 → http://127.0.0.1:3000"
fi

# ── 完成 ─────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}${BOLD}✅ Phoenix ERP V3 已启动${NC}"
echo ""
echo -e "  ${BOLD}前端${NC}   http://127.0.0.1:3000"
echo -e "  ${BOLD}后端${NC}   http://127.0.0.1:3100"
echo -e "  ${BOLD}API日志${NC} $API_LOG"
echo -e "  ${BOLD}Web日志${NC} $WEB_LOG"
echo ""
echo -e "  按 ${BOLD}Ctrl+C${NC} 停止所有服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 捕获 Ctrl+C，优雅退出 ────────────────────────────────────
trap 'echo ""; warn "正在停止服务..."; kill $API_PID $WEB_PID 2>/dev/null; ok "已停止。"; exit 0' INT TERM

# ── 保持前台运行，实时显示日志 ──────────────────────────────
tail -f "$API_LOG" "$WEB_LOG" &
wait $API_PID $WEB_PID
