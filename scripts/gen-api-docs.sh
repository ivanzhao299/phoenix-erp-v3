#!/usr/bin/env bash
# 从 NestJS controller decorator 扫描出全部端点 → API.md
# 用法：bash scripts/gen-api-docs.sh > API.md
set -eu

cd "$(dirname "$0")/.."

DATE=$(date -u +%Y-%m-%d)
TOTAL=0

cat <<HEADER
# Phoenix ERP V3 — API 端点清单

> 自动生成于 $DATE — 通过扫描 \`apps/api/src/**/*.controller.ts\` 的 NestJS 装饰器。
> **不要手动编辑此文件**；改后跑 \`bash scripts/gen-api-docs.sh > API.md\`。

## 认证

除非端点显式标注"公开"，所有请求必须带：

\`\`\`
Authorization: Bearer <JWT_TOKEN>
\`\`\`

获取 token：

\`\`\`bash
curl -X POST http://localhost:3100/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"admin","password":"admin123"}'
\`\`\`

## 端点列表（按模块）

HEADER

# 找所有 .controller.ts（兼容 macOS bash 3）
FILES=()
while IFS= read -r line; do FILES+=("$line"); done < <(find apps/api/src -name '*.controller.ts' -not -path '*/node_modules/*' | sort)

LAST_MODULE=""
for F in "${FILES[@]}"; do
  # 模块名 = 路径里 modules/<name>/；不含 modules/ 的归类为 root
  if [[ "$F" == */modules/* ]]; then
    MODULE=$(echo "$F" | awk -F'/modules/' '{print $2}' | awk -F'/' '{print $1}')
  else
    MODULE="root"
  fi
  CONTROLLER=$(basename "$F" .controller.ts)

  # 解析 @Controller('xxx')  (BSD-sed 兼容)
  PREFIX=$(grep -E "^@Controller" "$F" | head -1 | awk -F"['\"]" '{print $2}')
  [ -z "$PREFIX" ] && PREFIX=""

  # 解析 @Get/@Post/@Put/@Delete + path
  # 输出: VERB | path | method-name
  ROUTES=$(awk '
    /^[[:space:]]*@(Get|Post|Put|Delete|Patch)\(/ {
      method = $0
      sub(/^[[:space:]]*@/, "", method)
      sub(/\(.*/, "", method)

      # 提取参数（支持 () / ("xxx") / ('xxx') / ([':a',':b']) 等）
      path = $0
      sub(/^[^(]*\(/, "", path)
      sub(/\).*/, "", path)
      gsub(/[\047"]/, "", path)
      if (path == "") path = "(root)"
      getline next_line
      # next handler name
      name = next_line
      sub(/^[[:space:]]*(async[[:space:]]+)?/, "", name)
      sub(/\(.*/, "", name)
      print method "|" path "|" name
    }
  ' "$F")

  [ -z "$ROUTES" ] && continue

  if [ "$MODULE" != "$LAST_MODULE" ]; then
    echo ""
    echo "### \`$MODULE\`"
    LAST_MODULE="$MODULE"
  fi

  echo ""
  echo "**Controller**: \`$CONTROLLER.ts\` — 前缀 \`/$PREFIX\`"
  echo ""
  echo "| 方法 | 路径 | Handler |"
  echo "|------|------|---------|"
  while IFS='|' read -r VERB PATH_PART NAME; do
    [ -z "$VERB" ] && continue
    FULL_PATH="/$PREFIX"
    [ "$PATH_PART" != "(root)" ] && FULL_PATH="$FULL_PATH/$PATH_PART"
    FULL_PATH=$(echo "$FULL_PATH" | sed 's|//*|/|g')
    echo "| \`$VERB\` | \`$FULL_PATH\` | \`$NAME\` |"
    TOTAL=$((TOTAL+1))
  done <<< "$ROUTES"
done

cat <<FOOTER

---

**总端点数**：约 $TOTAL

## 关键业务流端点速查

| 用途 | 方法 + 路径 |
|------|-----------|
| 登录获取 token | \`POST /api/auth/login\` |
| 健康检查 | \`GET /api/health\` |
| Prometheus 指标 | \`GET /api/metrics\` |
| 提交订单 | \`POST /api/orders/submit\` |
| 订单状态推进 | \`POST /api/orders/:order_no/transition\` |
| 出库单推进 | \`POST /api/outbound/orders/:order_no/advance\` |
| POS 销售 | \`POST /api/v3/pos/sales\` |
| AP 凭证 | \`POST /api/finance/ap-invoice\` |
| 收入登记 (AR 核销) | \`POST /api/finance/income\` |
| 门店日结 (V2 fidelity) | \`POST /api/v3/store/daily-close-v2/submit\` |
| 正向追溯 | \`GET /api/quality/trace/forward?batch_no=...\` |
| 创建 NCR | \`POST /api/quality/non-conformances\` |
| 主仪表盘 | \`GET /api/dashboard/kpi\` |
| 单店分析 | \`GET /api/dashboard/store-analysis?store_code=...\` |
| 数据完整性 | \`GET /api/dashboard/integrity\` |
| PDA 终端注册 | \`POST /api/pda/register\` (公开) |

## CRUD 通用端点

V3 通过 \`generic-crud\` 模块为白名单内的表自动暴露 RESTful CRUD：

- \`GET /api/crud/:table\` — 列表（支持 ?limit=, ?offset=, ?where=...）
- \`GET /api/crud/:table/:idCol/:idVal\` — 单条
- \`POST /api/crud/:table\` — 新建
- \`PUT /api/crud/:table/:idCol/:idVal\` — 更新
- \`DELETE /api/crud/:table/:idCol/:idVal\` — 删除

白名单与角色权限：\`apps/api/src/modules/generic-crud/crud.constants.ts\`

## 错误码

| HTTP | 业务码 | 含义 | subcode |
|------|------|------|---------|
| 200/201 | 0 / 200 | 成功 | — |
| 400 | 400 | 请求参数错误 | — |
| 401 | 401 | 未登录 / 过期 | NO_TOKEN / TOKEN_EXPIRED / INVALID_TOKEN / PERMS_CHANGED |
| 403 | 403 | 权限不足 | — |
| 404 | 404 | 资源不存在 | — |
| 409 | 409 | 冲突 (库存不足 / 重复键 / 状态机非法) | — |
| 500 | 500 | 服务器异常 | — |
FOOTER
