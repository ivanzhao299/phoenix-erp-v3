#!/usr/bin/env bash
# G22-1 · dump 当前 DB schema → docs/schema-snapshot.sql
#
# 用途：
#   1. 写 mig 之前对照真实列名（防 G15/G20 类"列不存在"翻车）
#   2. CI 每次 mig 跑完后对比 baseline 检测意外 schema 漂移
#
# 用法：
#   ./scripts/dump-schema.sh                   # dump 本地 phoenix_erp → docs/schema-snapshot.sql
#   ./scripts/dump-schema.sh prod              # SSH 远端 prod DB（需要预配 erp ssh + docker exec）
#   ./scripts/dump-schema.sh /tmp/x.sql        # 自定义路径
#
# 输出：仅 schema（无数据），按表名字典序排序，便于 git diff
set -euo pipefail

ARG="${1:-}"
OUT="${ARG:-docs/schema-snapshot.sql}"
case "$ARG" in
  prod)
    OUT="docs/schema-snapshot.sql"
    echo "→ Dumping prod schema via SSH erp..."
    ssh -o ConnectTimeout=30 erp "docker exec phoenix-v3-db pg_dump -U phoenix_v3 -d phoenix_erp --schema-only --no-owner --no-privileges" > "$OUT"
    ;;
  *)
    echo "→ Dumping local phoenix_erp → $OUT"
    PG_DUMP="${PG_DUMP:-/Applications/Postgres.app/Contents/Versions/18/bin/pg_dump}"
    [ ! -x "$PG_DUMP" ] && PG_DUMP=pg_dump
    PGUSER="${PGUSER:-mac}" "$PG_DUMP" -d phoenix_erp --schema-only --no-owner --no-privileges > "$OUT"
    ;;
esac

# 行计数 + 头部摘要
LINES=$(wc -l < "$OUT" | tr -d ' ')
TABLES=$(grep -c "^CREATE TABLE" "$OUT" || true)
INDEXES=$(grep -c "^CREATE.*INDEX" "$OUT" || true)
echo "✓ Schema dumped: $OUT ($LINES lines, $TABLES tables, $INDEXES indexes)"
echo "  Use: git diff $OUT  ← see schema drift since last commit"
