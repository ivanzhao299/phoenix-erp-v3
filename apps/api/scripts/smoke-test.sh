#!/usr/bin/env bash
# Phoenix ERP V3 — API Smoke Test
# 验证：health + 登录 + token 校验 + 401 subcode 契约
# 用法：API_URL=http://127.0.0.1:3100 bash apps/api/scripts/smoke-test.sh
#
# CI 集成：在部署后 30s 内调用此脚本，非 0 退出则告警 / 回滚
set -e

API_URL="${API_URL:-http://127.0.0.1:3100}"
USERNAME="${SMOKE_USER:-admin}"
PASSWORD="${SMOKE_PASS:-admin123}"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
say()   { printf '\033[36m▶ %s\033[0m\n' "$1"; }

fail() { red "✗ $1"; exit 1; }
ok()   { green "✓ $1"; }

say "API: $API_URL"

# 1. Health
say "1) GET /api/health 返回 jwt.loaded=true & db.connected=true"
H=$(curl -sf "$API_URL/api/health") || fail "health unreachable"
echo "$H" | grep -q '"loaded":true'    || fail "JWT_SECRET 未加载 → 部署不完整"
echo "$H" | grep -q '"connected":true' || fail "DB 未就绪"
ok "health 检查通过"

# 2. 登录 → 拿 token
say "2) POST /api/auth/login 成功并返回 token"
LOGIN=$(curl -sf -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  "$API_URL/api/auth/login")
TOKEN=$(echo "$LOGIN" | grep -oE '"token":"[^"]+"' | cut -d'"' -f4)
[ -n "$TOKEN" ] || fail "登录失败：$LOGIN"
ok "登录成功 token=${TOKEN:0:30}..."

# 3. 带 token 拿数据
say "3) 带 token GET /api/crud/brd_houses 返回 200 + 数据"
RES=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API_URL/api/crud/brd_houses?limit=1")
echo "$RES" | grep -q '"code":200' || fail "授权访问失败：$RES"
ok "授权 GET 成功"

# 4. 401 contract — NO_TOKEN
say "4) 无 token 请求 → 401 subcode=NO_TOKEN"
ERR=$(curl -s "$API_URL/api/crud/brd_houses")
echo "$ERR" | grep -q '"subcode":"NO_TOKEN"' || fail "subcode 契约违反：$ERR"
ok "NO_TOKEN 契约 OK"

# 5. 401 contract — INVALID_TOKEN
say "5) 伪 token → 401 subcode=INVALID_TOKEN"
ERR=$(curl -s -H 'Authorization: Bearer faketoken' "$API_URL/api/crud/brd_houses")
echo "$ERR" | grep -q '"subcode":"INVALID_TOKEN"' || fail "subcode 契约违反：$ERR"
ok "INVALID_TOKEN 契约 OK"

# 6. Refresh round-trip
say "6) POST /api/auth/refresh 返回新 token"
NEW=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" "$API_URL/api/auth/refresh")
echo "$NEW" | grep -q '"code":200'   || fail "refresh 失败：$NEW"
echo "$NEW" | grep -qE '"token":"[^"]+"' || fail "refresh 未返回新 token"
ok "refresh 端点 OK"

green ""
green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
green "✓ 所有 smoke 检查通过 — 部署可用"
green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
