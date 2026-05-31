#!/usr/bin/env bash
# ============================================================
# 取回生产真实 schema → scripts/.prod-schema.sql（gitignored）
#
# 原理：触发轻量 workflow dump-prod-schema.yml（仅 SSH+pg_dump --schema-only，
#   不构建不部署，几乎不耗 Actions 分钟），从其日志提取 base64 还原。
#
# 用途：让 local-migration-check.sh 的「生产副本」遍能预判
#   "生产 schema 漂移"类错误——本地脚本现建的库复现不了的那一类。
#
# 依赖：gh CLI（已登录）；本地 base64
# 用法：bash scripts/fetch-prod-schema.sh
# ============================================================
set -uo pipefail

OUT="scripts/.prod-schema.sql"

echo "▶ 触发 dump-prod-schema workflow ..."
gh workflow run dump-prod-schema.yml || { echo "触发失败"; exit 1; }

echo "▶ 等待 run 启动 ..."
sleep 10
RID=$(gh run list --workflow=dump-prod-schema.yml --limit 1 --json databaseId -q '.[0].databaseId')
echo "  run id = $RID"

echo "▶ 等待完成 ..."
for i in $(seq 1 24); do
  st=$(gh run view "$RID" --json status,conclusion -q '.status+"|"+(.conclusion//"running")' 2>/dev/null)
  [[ "$st" == completed* ]] && { echo "  $st"; break; }
  sleep 15
done

echo "▶ 提取并还原 schema ..."
gh run view "$RID" --log 2>/dev/null \
  | awk -F'\t' 'NF>=3{print $3}' \
  | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z //' \
  | grep -vE "SCHEMA_DUMP_START|SCHEMA_DUMP_END" \
  | grep -E "^[A-Za-z0-9+/]+=*$" \
  | tr -d '\n' | base64 -d > "$OUT" 2>/dev/null

LINES=$(wc -l < "$OUT" | tr -d ' ')
if [ "$LINES" -lt 100 ]; then
  echo "🛑 还原失败（仅 $LINES 行）。检查 run $RID 日志。"
  exit 1
fi
echo "✅ 生产 schema 已保存到 $OUT（$LINES 行）"
echo "   现在可运行：bash scripts/local-migration-check.sh"
