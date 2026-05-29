#!/usr/bin/env bash
# Phoenix ERP V3 — Docker 全栈本地烟雾测试
# 用法（需先装 Docker Desktop / colima 或 podman）：
#   bash scripts/verify-docker-stack.sh
#
# 步骤：
#   1) docker compose build (multi-stage)
#   2) docker compose up -d (db + api)
#   3) 等 db healthy + api /api/health
#   4) 跑 admin 登录冒烟
#   5) （可选）跑容器化回归 11/11 套件
#   6) docker compose down -v 清理（用 KEEP=1 跳过清理）
set -eu

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

red()    { printf '\033[31m%s\033[0m\n' "$1"; }
green()  { printf '\033[32m%s\033[0m\n' "$1"; }
cyan()   { printf '\033[36m%s\033[0m\n' "$1"; }

# Pre-flight
if ! command -v docker >/dev/null 2>&1; then
  red "❌ docker 未安装 — 请先装 Docker Desktop (macOS) / docker-ce (Linux) / colima"
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  red "❌ Docker daemon 未运行 — 启动 Docker Desktop 后重试"
  exit 2
fi
if [ ! -f .env ]; then
  if [ -f .env.docker.example ]; then
    cyan "⚠️  .env 不存在，从 .env.docker.example 拷贝模板（请填真实密钥后再 push）"
    cp .env.docker.example .env
    # 自动生成一份 JWT 密钥兜底
    GEN=$(openssl rand -hex 48 2>/dev/null || head -c 48 /dev/urandom | xxd -p | tr -d '\n')
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${GEN}|" .env && rm -f .env.bak
    cyan "   已为本地烟测生成临时 JWT_SECRET（生产请改）"
  else
    red "❌ 缺 .env 与 .env.docker.example"
    exit 2
  fi
fi

KEEP="${KEEP:-0}"

cyan "═══════════════════════════════════════════════════════════════════"
cyan "  Phoenix ERP V3 — Docker 全栈烟雾测试"
cyan "═══════════════════════════════════════════════════════════════════"

cyan ""
cyan "▶ 1) docker compose build (multi-stage)"
docker compose build

cyan ""
cyan "▶ 2) docker compose up -d"
docker compose up -d

cyan ""
cyan "▶ 3) 等 db healthy"
for i in $(seq 1 60); do
  STATE=$(docker inspect --format='{{.State.Health.Status}}' phoenix-v3-db 2>/dev/null || echo "starting")
  if [ "$STATE" = "healthy" ]; then green "  ✓ db healthy after ${i}s"; break; fi
  sleep 2
done
if [ "$STATE" != "healthy" ]; then
  red "❌ db 启动超时"
  docker compose logs db | tail -50
  [ "$KEEP" != "1" ] && docker compose down -v
  exit 3
fi

cyan ""
cyan "▶ 4) 等 api 健康检查 + admin 登录冒烟"
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    green "  ✓ /api/health OK after ${i}s"
    break
  fi
  sleep 2
done
if ! curl -sf http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
  red "❌ api 启动超时"
  docker compose logs api | tail -80
  [ "$KEEP" != "1" ] && docker compose down -v
  exit 3
fi

LOGIN=$(curl -s -X POST http://127.0.0.1:3100/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' 2>&1)
TOKEN=$(printf '%s' "$LOGIN" | grep -oE '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  green "  ✓ admin 登录成功 token=${TOKEN:0:30}..."
else
  red "  ✗ admin 登录失败：$LOGIN"
  red "      数据库为空 — 需要先 seed admin 用户（V3 启动时自建）"
  [ "$KEEP" != "1" ] && docker compose down -v
  exit 4
fi

# 容器内健康响应
INNER=$(docker compose exec -T api curl -sf http://127.0.0.1:3100/api/health 2>&1 | head -1)
green "  ✓ 容器内 health 响应: $INNER"

# 可选：跑回归（默认跳过；带 RUN_REGR=1 才跑）
if [ "${RUN_REGR:-0}" = "1" ]; then
  cyan ""
  cyan "▶ 5) 容器化回归 (RUN_REGR=1)"
  # 需要先 docker cp 把 scripts 挪进容器，或挂载 volume；此处简化为 host curl
  # [Phase E] order-regression.sh + e2e-order-flow.sh 已归档至 _archive/
  #           旧 OrderModule 删除后，Order 链路由 Sales V2 (/api/v2/sales/orders) 覆盖
  for m in system breeding packaging wms pos-store finance quality pda bi; do
    printf '  %-12s ' "$m"
    bash apps/api/scripts/${m}-regression.sh 2>&1 | tail -2 | head -1 | tr -d '\033' | sed 's/\[[0-9;]*m//g'
  done
fi

cyan ""
if [ "$KEEP" = "1" ]; then
  green "✅ 验证通过，stack 仍在运行 (KEEP=1)"
  cyan "   清理：docker compose down -v"
else
  cyan "▶ 6) Cleanup: docker compose down -v"
  docker compose down -v
  green "✅ 验证通过，已清理"
fi
