#!/usr/bin/env bash
# Phoenix ERP V3 — 服务器本地部署脚本
# 由 webhook.py 在后台调用，stdout/stderr 追加到部署日志
#
# 用法: bash deploy.sh <sha> [actor]
#
# 所需环境变量（写入 /etc/phoenix-webhook.env）：
#   DEPLOY_PATH           代码根目录（含 docker-compose.yml）
#   GHCR_USER             ghcr.io 登录用户名（通常是 github 用户名）
#   GHCR_TOKEN            ghcr.io Personal Access Token（read:packages）
#   ALERT_WEBHOOK_URL     可选，完成后通知（飞书/钉钉/Slack）
#   ALERT_WEBHOOK_TYPE    可选：feishu / dingtalk / slack（默认 slack）
#   DB_USER / DB_PASSWORD 可选，若与 compose 默认值不同需填

set -euo pipefail

SHA="${1:-unknown}"
ACTOR="${2:-ci}"
DEPLOY_PATH="${DEPLOY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
ALERT_URL="${ALERT_WEBHOOK_URL:-}"
ALERT_TYPE="${ALERT_WEBHOOK_TYPE:-slack}"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

notify() {
    local status="$1" extra="${2:-}"
    [ -z "$ALERT_URL" ] && return 0
    local emoji; emoji="$( [ "$status" = ok ] && echo "✅" || echo "🚨" )"
    local text
    text="${emoji} Phoenix ERP Deploy ${status^^} — sha=${SHA:0:8} by=${ACTOR}${extra:+
$extra}"
    case "$ALERT_TYPE" in
      feishu)
        curl -sS --max-time 5 -X POST "$ALERT_URL" \
          -H 'Content-Type: application/json' \
          -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"${text}\"}}" ;;
      dingtalk)
        curl -sS --max-time 5 -X POST "$ALERT_URL" \
          -H 'Content-Type: application/json' \
          -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"${text}\"}}" ;;
      slack|*)
        curl -sS --max-time 5 -X POST "$ALERT_URL" \
          -H 'Content-Type: application/json' \
          -d "{\"text\":\"${text}\"}" ;;
    esac
    return 0
}

# ── 工作目录 ──────────────────────────────────────────────────────────────────
cd "$DEPLOY_PATH" || fail "DEPLOY_PATH not found: $DEPLOY_PATH"
log "=== Phoenix ERP deploy start: sha=${SHA:0:8} actor=${ACTOR} ==="

# ── 1. 同步代码 ───────────────────────────────────────────────────────────────
log "Syncing code..."
git stash 2>/dev/null || true
git pull --ff-only origin main
log "Code synced ($(git log -1 --format='%h %s'))"

# ── 2. 拉取镜像 ───────────────────────────────────────────────────────────────
log "Logging in to ghcr.io..."
echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin

log "Pulling images..."
docker compose pull api web
log "Images pulled"

# ── 3. DB 健康 ────────────────────────────────────────────────────────────────
log "Starting DB..."
docker compose up -d --wait db
log "DB healthy"

# ── 4. DDL 迁移（幂等）───────────────────────────────────────────────────────
log "Applying DDL migrations..."
for f in $(ls apps/api/ddl/*.sql | sort); do
    docker compose exec -T db sh -c \
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
        < "$f" 2>&1 \
        | grep -v "already exists\|NOTICE\|will create\|^$" \
        || true
done
log "DDL applied"

# ── 5. 滚动重启容器 ───────────────────────────────────────────────────────────
log "Restarting API..."
docker compose up -d --no-deps --wait api
log "API up"

log "Restarting Web..."
docker compose up -d --no-deps --wait web \
    || { docker compose logs web --tail 60; notify error "web container failed"; exit 1; }
log "Web up"

# 清理旧镜像（不阻塞部署）
docker image prune -f > /dev/null &

# ── 6. Nginx 配置同步 + reload ────────────────────────────────────────────────
NGINX_CONF="$DEPLOY_PATH/deploy/nginx/erp.eggslao.com.conf"
[ -f "$NGINX_CONF" ] || NGINX_CONF="$DEPLOY_PATH/nginx/erp.eggslao.com.conf"
NGINX_DEST="/etc/nginx/conf.d/erp.eggslao.com.conf"
if [ -f "$NGINX_CONF" ]; then
    cp "$NGINX_CONF" "$NGINX_DEST"
    log "Nginx conf updated from repo"
fi
if nginx -t 2>/dev/null; then
    systemctl reload nginx 2>/dev/null && log "Nginx reloaded" || true
fi

# ── 7. Smoke test ─────────────────────────────────────────────────────────────
log "Running smoke test..."
sleep 3
if curl -fsSL --max-time 20 http://127.0.0.1:3000/ -o /dev/null; then
    log "Smoke test passed ✓"
else
    docker compose logs web --tail 30
    notify error "smoke test failed"
    exit 1
fi

log "=== Deploy complete $(date '+%Y-%m-%d %H:%M:%S') ==="
notify ok
