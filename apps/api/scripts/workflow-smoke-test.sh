#!/usr/bin/env bash
# Phoenix ERP V3 — Workflow Smoke / Rehearsal Test
# 验证：登录、行业模板生成、数据源预览、发起流程、待办审批、实例归档
# 用法：
#   API_URL=http://127.0.0.1:3100 SMOKE_USER=admin SMOKE_PASS=along888 bash apps/api/scripts/workflow-smoke-test.sh
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3100}"
USERNAME="${SMOKE_USER:-admin}"
PASSWORD="${SMOKE_PASS:-along888}"

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
say()   { printf '\033[36m▶ %s\033[0m\n' "$1"; }
fail()  { red "✗ $1"; exit 1; }
ok()    { green "✓ $1"; }

json_get() {
  node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const d=JSON.parse(s);const path=process.argv[1].split('.');let v=d;for(const p of path){v=Array.isArray(v)?v[Number(p)]:v?.[p]}process.stdout.write(v==null?'':String(v));})" "$1"
}

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [ -n "$body" ]; then
    curl -sf -X "$method" "$API_URL$path" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "$body"
  else
    curl -sf -X "$method" "$API_URL$path" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

say "API: $API_URL"

say "1) 登录获取 token"
LOGIN=$(curl -sf -X POST "$API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}") || fail "登录接口不可用"
TOKEN=$(printf '%s' "$LOGIN" | json_get token)
[ -n "$TOKEN" ] || fail "登录失败：$LOGIN"
ok "登录成功"

say "2) 生成/补齐行业流程模板"
GEN=$(api POST /api/workflow/definitions/industry-templates/generate '{}') || fail "行业模板生成失败"
printf '%s' "$GEN" | grep -q '"code":200' || fail "行业模板响应异常：$GEN"
ok "行业模板接口通过"

say "3) 预览数据库数据源 MST_PRODUCTS"
DS=$(api POST /api/workflow/data-sources/preview '{"code":"MST_PRODUCTS"}') || fail "数据源预览失败"
printf '%s' "$DS" | grep -q '"code":200' || fail "数据源响应异常：$DS"
ok "数据源预览通过"

say "4) 预览系统角色数据源 SYS_ROLES"
ROLE_DS=$(api POST /api/workflow/data-sources/preview '{"code":"SYS_ROLES"}') || fail "系统角色数据源预览失败"
printf '%s' "$ROLE_DS" | grep -q '"code":200' || fail "系统角色数据源响应异常：$ROLE_DS"
ok "系统角色数据源预览通过"

say "5) 查找请假审批流程"
DEFS=$(api GET /api/workflow/definitions) || fail "流程定义列表失败"
DEF_ID=$(printf '%s' "$DEFS" | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const d=JSON.parse(s);const row=(d.data||[]).find(x=>x.code==='LEAVE_APPROVAL');process.stdout.write(row?String(row.id):'');})")
[ -n "$DEF_ID" ] || fail "未找到 LEAVE_APPROVAL，请检查模板生成"
ok "找到 LEAVE_APPROVAL id=$DEF_ID"

say "6) 发起请假申请"
START_BODY="{\"definition_id\":$DEF_ID,\"title\":\"Smoke 请假申请\",\"form_data\":{\"leave_type\":\"personal\",\"start_time\":\"2026-05-18T09:00\",\"end_time\":\"2026-05-18T18:00\",\"reason\":\"workflow smoke test\"}}"
START=$(api POST /api/workflow/start "$START_BODY") || fail "发起流程失败"
INSTANCE_ID=$(printf '%s' "$START" | json_get data.id)
[ -n "$INSTANCE_ID" ] || fail "发起响应缺少 instance id：$START"
ok "发起成功 instance=$INSTANCE_ID"

say "7) 查询待办并审批通过"
TODO=$(api GET /api/workflow/tasks/todo) || fail "待办查询失败"
TASK_ID=$(printf '%s' "$TODO" | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const d=JSON.parse(s);const row=(d.data||[]).find(x=>String(x.instance_id)===process.argv[1]);process.stdout.write(row?String(row.id):'');})" "$INSTANCE_ID")
[ -n "$TASK_ID" ] || fail "未找到新实例待办：$TODO"
api POST "/api/workflow/tasks/$TASK_ID/comment" '{"comment":"Smoke 补充意见"}' >/dev/null || fail "补充意见失败"
api POST "/api/workflow/tasks/$TASK_ID/approve" '{"comment":"Smoke 审批通过"}' >/dev/null || fail "审批通过失败"
ok "待办审批通过"

say "8) 查询实例状态"
INSTANCE=$(api GET "/api/workflow/instances/$INSTANCE_ID") || fail "实例查询失败"
STATUS=$(printf '%s' "$INSTANCE" | json_get data.status)
[ -n "$STATUS" ] || fail "实例响应缺少状态：$INSTANCE"
ok "实例当前状态：$STATUS"

green ""
green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
green "✓ Workflow smoke / rehearsal checks passed"
green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
