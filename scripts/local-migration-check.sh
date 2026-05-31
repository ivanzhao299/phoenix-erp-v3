#!/usr/bin/env bash
# ============================================================
# 本地迁移预验证（成本控制 — 不依赖 CI 即可复现生产错误）
#
# 设计要点：
#   完整跑两遍同一套迁移到同一个本地库。
#     · 第 1 遍 = 模拟「全新数据库」（等同 CI test job 的 fresh DB）。
#     · 第 2 遍 = 模拟「存量生产库」（表/数据已存在）→ 暴露非幂等语句，
#                这正是 deploy job 在生产库才会现形的那一类错误
#                （如裸 CREATE TABLE / 冲突 INSERT / 重复约束）。
#   任一遍任一文件 psql 非零退出（ON_ERROR_STOP=1）即整体失败并打印错误。
#
# 用法：
#   bash scripts/local-migration-check.sh
# 依赖：本地 psql（brew install postgresql@16）
# 退出码：0 = 两遍全过；非 0 = 有迁移在某遍失败（详情见输出）
# ============================================================
set -uo pipefail

DB="phx_migration_check"
PSQL_BASE=(psql -v ON_ERROR_STOP=1 -X -q)

# 迁移执行顺序（与 .github/workflows/deploy.yml 保持一致）
collect_files() {
  ls apps/api/ddl/*.sql 2>/dev/null | sort
  [ -f apps/api/migrations/v3_schema_complete.sql ] && echo apps/api/migrations/v3_schema_complete.sql
  ls apps/api/migrations/2026*.sql 2>/dev/null | sort
}

run_pass() {
  local pass="$1" failed=0
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  第 ${pass} 遍（$( [ "$pass" = 1 ] && echo '全新库' || echo '存量库模拟' )）"
  echo "════════════════════════════════════════════════════════════"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    local out status
    out=$("${PSQL_BASE[@]}" -d "$DB" -f "$f" 2>&1)
    status=$?
    if [ $status -ne 0 ]; then
      echo "❌ FAIL [pass ${pass}] $f"
      echo "$out" | grep -iE "ERROR|FATAL" | head -5
      failed=1
    else
      echo "✅ ok   $f"
    fi
  done < <(collect_files)
  return $failed
}

# 生产副本遍：若已 fetch 生产真实 schema，则在其上跑一遍全套迁移，
# 预判"生产 schema 漂移"类错误（本地现建库复现不了的那一类，如 mst_products
# 缺 legacy category 列）。用 scripts/fetch-prod-schema.sh 取回。
PROD_SCHEMA="scripts/.prod-schema.sql"
run_prod_replica() {
  [ -f "$PROD_SCHEMA" ] || { echo ""; echo "ℹ️  未找到 $PROD_SCHEMA，跳过生产副本遍（运行 scripts/fetch-prod-schema.sh 启用）"; return 0; }
  local RDB="phx_prod_replica" failed=0
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  生产副本遍（加载真实生产 schema 后跑全套迁移 = 复刻 deploy）"
  echo "════════════════════════════════════════════════════════════"
  dropdb --if-exists "$RDB" 2>/dev/null; createdb "$RDB"
  psql -X -q -d "$RDB" -f "$PROD_SCHEMA" >/dev/null 2>&1
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    local out status
    out=$("${PSQL_BASE[@]}" -d "$RDB" -f "$f" 2>&1); status=$?
    if [ $status -ne 0 ]; then
      echo "❌ DRIFT FAIL $f"
      echo "$out" | grep -iE "ERROR|FATAL" | head -3
      failed=1
    fi
  done < <(collect_files)
  [ $failed -eq 0 ] && echo "✅ 生产副本遍：全套迁移 0 漂移错误"
  dropdb --if-exists "$RDB" 2>/dev/null
  return $failed
}

echo "▶ 重建测试库 $DB ..."
dropdb --if-exists "$DB" 2>/dev/null
createdb "$DB" || { echo "createdb 失败（postgres 是否已启动？）"; exit 2; }

rc=0
run_pass 1 || rc=1
run_pass 2 || rc=1
dropdb --if-exists "$DB" 2>/dev/null
run_prod_replica || rc=1

echo ""
if [ $rc -eq 0 ]; then
  echo "🎉 全部通过 — 全新库 + 存量库（非幂等）+ 生产副本（schema漂移）均无错误，可安全推送。"
else
  echo "🛑 存在失败迁移（见上方 ❌）。修复后重跑，避免浪费 CI 额度。"
fi
exit $rc
