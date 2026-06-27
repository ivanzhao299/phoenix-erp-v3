#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  g195-P5 门禁 #2:apps/api/src/database/migrations/ 下每条 TS 迁移都必须
#  实现真实的 down() 函数(不能空体,不能 throw not-implemented)。
#
#  判定启发(实用而非严谨):
#    - 必须有 async down( 函数
#    - 从 "async down(" 起 30 行内必须出现至少一个业务关键词:
#      await / queryRunner\. / .query( / dropTable / dropColumn / dropIndex /
#      addColumn / renameColumn / changeColumn / createIndex / 显式 SQL DML
#
#  调用方:GitHub Actions(.github/workflows/deploy.yml),失败 exit 1 触发红灯。
#  本地预检:bash scripts/check-ts-migration-down.sh
# ════════════════════════════════════════════════════════════════════════════
set -u  # 不开 -e:grep 无匹配返 1 会误中断

DIR="${1:-apps/api/src/database/migrations}"

shopt -s nullglob
fail=0
checked=0

BUSINESS_RE='await[[:space:]]|queryRunner\.|\.query\(|drop(Table|Column|Index|ForeignKey)|add(Column|Index|ForeignKey)|renameColumn|changeColumn|createIndex|createForeignKey|(INSERT|UPDATE|DELETE)[[:space:]]+INTO|FROM[[:space:]]'

for f in "$DIR"/*.ts; do
  checked=$((checked + 1))

  # 必须有 async down( 函数
  if ! grep -qE 'async[[:space:]]+down[[:space:]]*\(' "$f"; then
    echo "::error file=$f::TS 迁移缺 async down() 函数"
    fail=1
    continue
  fi

  # 从 down 行起取 30 行
  chunk=$(awk '
    /async[[:space:]]+down[[:space:]]*\(/ { flag = 1; n = 0 }
    flag { print; n++; if (n >= 30) exit }
  ' "$f")

  if ! printf '%s\n' "$chunk" | grep -qE "$BUSINESS_RE"; then
    echo "::error file=$f::down() 函数体未见业务调用(await/queryRunner/query/drop*/add*/...)。P5 要求真实可回滚,不接受空体或 throw not-implemented。"
    fail=1
  fi
done

if [ "$checked" = "0" ]; then
  echo "✅ TS 迁移目录尚空 — 无检查项(目录: $DIR)"
elif [ "$fail" = "0" ]; then
  echo "✅ 所有 $checked 条 TS 迁移的 down() 已落实"
fi
exit $fail
