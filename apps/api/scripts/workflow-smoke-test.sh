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

say "3) 同步标准数据源"
SYNC_DS=$(api POST /api/workflow/data-sources/sync-defaults '{}') || fail "同步标准数据源失败"
printf '%s' "$SYNC_DS" | grep -q '"code":200' || fail "同步标准数据源响应异常：$SYNC_DS"
ok "标准数据源同步通过"

say "4) 刷新字段元数据"
META_DS=$(api POST /api/workflow/data-sources/refresh-metadata '{}') || fail "刷新字段元数据失败"
printf '%s' "$META_DS" | grep -q '"code":200' || fail "刷新字段元数据响应异常：$META_DS"
ok "字段元数据刷新通过"

say "5) 生成系统角色字段建议"
ROLE_FIELDS=$(api GET /api/workflow/data-sources/SYS_ROLES/field-suggestions) || fail "系统角色字段建议失败"
printf '%s' "$ROLE_FIELDS" | grep -q '"code":200' || fail "系统角色字段建议响应异常：$ROLE_FIELDS"
printf '%s' "$ROLE_FIELDS" | grep -q '"fields"' || fail "系统角色字段建议缺少 fields：$ROLE_FIELDS"
ok "系统角色字段建议通过"

say "6) 从系统角色数据源生成表单"
ROLE_FORM=$(api POST /api/workflow/forms/from-data-source '{"sourceCode":"SYS_ROLES","name":"Smoke 角色数据源表单","code":"SYS_ROLES_SMOKE_FORM","category":"通用"}') || fail "系统角色数据源生成表单失败"
printf '%s' "$ROLE_FORM" | grep -q '"code":200' || fail "系统角色数据源生成表单响应异常：$ROLE_FORM"
printf '%s' "$ROLE_FORM" | grep -q '"current_version_id"' || fail "系统角色数据源生成表单缺少版本：$ROLE_FORM"
printf '%s' "$ROLE_FORM" | grep -q 'workflow/form-designer' || fail "系统角色数据源生成表单缺少设计入口：$ROLE_FORM"
ok "系统角色数据源生成表单通过"

say "7) 从系统角色数据源生成流程"
ROLE_FLOW=$(api POST /api/workflow/definitions/from-data-source '{"sourceCode":"SYS_ROLES","name":"Smoke 角色数据源审批","code":"SYS_ROLES_SMOKE_WORKFLOW","formCode":"SYS_ROLES_SMOKE_WORKFLOW_FORM","category":"通用","approvalRole":"ROLE_ADMIN"}') || fail "系统角色数据源生成流程失败"
printf '%s' "$ROLE_FLOW" | grep -q '"code":200' || fail "系统角色数据源生成流程响应异常：$ROLE_FLOW"
printf '%s' "$ROLE_FLOW" | grep -q '"current_version_id"' || fail "系统角色数据源生成流程缺少版本：$ROLE_FLOW"
printf '%s' "$ROLE_FLOW" | grep -q 'workflow/start?code=SYS_ROLES_SMOKE_WORKFLOW' || fail "系统角色数据源生成流程缺少发起入口：$ROLE_FLOW"
ok "系统角色数据源生成流程通过"

say "8) 预览数据库数据源 MST_PRODUCTS"
DS=$(api POST /api/workflow/data-sources/preview '{"code":"MST_PRODUCTS"}') || fail "数据源预览失败"
printf '%s' "$DS" | grep -q '"code":200' || fail "数据源响应异常：$DS"
ok "数据源预览通过"

say "9) 预览系统角色数据源 SYS_ROLES"
ROLE_DS=$(api POST /api/workflow/data-sources/preview '{"code":"SYS_ROLES"}') || fail "系统角色数据源预览失败"
printf '%s' "$ROLE_DS" | grep -q '"code":200' || fail "系统角色数据源响应异常：$ROLE_DS"
ok "系统角色数据源预览通过"

say "10) 查找请假审批流程"
DEFS=$(api GET /api/workflow/definitions) || fail "流程定义列表失败"
DEF_ID=$(printf '%s' "$DEFS" | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const d=JSON.parse(s);const row=(d.data||[]).find(x=>x.code==='LEAVE_APPROVAL');process.stdout.write(row?String(row.id):'');})")
[ -n "$DEF_ID" ] || fail "未找到 LEAVE_APPROVAL，请检查模板生成"
ok "找到 LEAVE_APPROVAL id=$DEF_ID"

say "11) 查询流程驾驶舱"
ANALYTICS=$(api GET /api/workflow/analytics?days=30) || fail "流程驾驶舱查询失败"
TOTAL_ANALYTICS=$(printf '%s' "$ANALYTICS" | json_get data.summary.total)
[ -n "$TOTAL_ANALYTICS" ] || fail "流程驾驶舱缺少 summary.total：$ANALYTICS"
ok "流程驾驶舱通过"

say "12) 发起请假申请"
START_BODY="{\"definition_id\":$DEF_ID,\"title\":\"Smoke 请假申请\",\"form_data\":{\"leave_type\":\"personal\",\"start_time\":\"2026-05-18T09:00\",\"end_time\":\"2026-05-18T18:00\",\"reason\":\"workflow smoke test\"}}"
START=$(api POST /api/workflow/start "$START_BODY") || fail "发起流程失败"
INSTANCE_ID=$(printf '%s' "$START" | json_get data.id)
[ -n "$INSTANCE_ID" ] || fail "发起响应缺少 instance id：$START"
ok "发起成功 instance=$INSTANCE_ID"

say "13) 查询督办列表并发送催办"
MONITOR=$(api GET /api/workflow/tasks/monitor) || fail "督办列表查询失败"
printf '%s' "$MONITOR" | grep -q '"code":200' || fail "督办列表响应异常：$MONITOR"
api POST "/api/workflow/instances/$INSTANCE_ID/urge" '{"comment":"Smoke 催办：请尽快处理"}' >/dev/null || fail "实例催办失败"
ok "督办和催办通过"

say "14) 查询待办并审批通过"
TODO=$(api GET /api/workflow/tasks/todo) || fail "待办查询失败"
TASK_ID=$(printf '%s' "$TODO" | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const d=JSON.parse(s);const row=(d.data||[]).find(x=>String(x.instance_id)===process.argv[1]);process.stdout.write(row?String(row.id):'');})" "$INSTANCE_ID")
[ -n "$TASK_ID" ] || fail "未找到新实例待办：$TODO"
api POST "/api/workflow/tasks/$TASK_ID/comment" '{"comment":"Smoke 补充意见"}' >/dev/null || fail "补充意见失败"
api POST "/api/workflow/tasks/$TASK_ID/approve" '{"comment":"Smoke 审批通过"}' >/dev/null || fail "审批通过失败"
ok "待办审批通过"

say "15) 查询工作台摘要和抄送箱"
SUMMARY=$(api GET /api/workflow/tasks/summary) || fail "工作台摘要查询失败"
TODO_COUNT=$(printf '%s' "$SUMMARY" | json_get data.todo)
[ -n "$TODO_COUNT" ] || fail "工作台摘要缺少 todo：$SUMMARY"
CC=$(api GET /api/workflow/tasks/cc) || fail "抄送箱查询失败"
CC_CODE=$(printf '%s' "$CC" | json_get code)
[ "$CC_CODE" = "200" ] || fail "抄送箱响应异常：$CC"
ok "工作台摘要和抄送箱通过"

say "16) 查询实例状态"
INSTANCE=$(api GET "/api/workflow/instances/$INSTANCE_ID") || fail "实例查询失败"
STATUS=$(printf '%s' "$INSTANCE" | json_get data.status)
[ -n "$STATUS" ] || fail "实例响应缺少状态：$INSTANCE"
ok "实例当前状态：$STATUS"

green ""
green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
green "✓ Workflow smoke / rehearsal checks passed"
green "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
