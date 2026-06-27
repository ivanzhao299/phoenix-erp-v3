#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  g197-H 门禁:apps/api/src/database/migrations/*.ts 不得含业务数据 DML
#
#  背景:g195-P3/P3+ 起 typeorm migration:run 在 CI/生产自动跑。万一某人
#  在 TS 迁移里写 INSERT INTO sal_customers / UPDATE sys_user 等业务数据
#  DML,生产数据会被静默污染(g193 已经把裸 SQL 数据 seed 冻结,TS 迁移现在
#  也要同等保护)。
#
#  拦截规则:up() 段中不得出现以下 SQL 模式
#    - INSERT INTO  / UPDATE  / DELETE FROM
#    - TRUNCATE / MERGE
#  例外白名单(允许):
#    - sys_dict / sys_dict_entries(字典 seed)
#    - sys_migrations_log / typeorm_metadata(工具表)
#
#  文件级豁免(g198,2026-06-19 起):
#    在文件前 30 行内含 /* @allow-data-dml: <reason> */ 或 // @allow-data-dml: <reason>
#    则整文件跳过 DML 检查。
#    适用场景:schema 改造前的"清 NULL 占位 + 去重"等数据修复迁移
#    (这类 DML 是 DDL 的必要前置,不能拆,但又是合法的数据治理)。
#
#  违规模式判定:awk 抓 up() 函数体,grep 拦危险 DML;白名单豁免。
#
#  调用方:GitHub Actions(.github/workflows/deploy.yml),失败 exit 1。
#  本地预检:bash scripts/check-ts-migration-no-data-dml.sh
# ════════════════════════════════════════════════════════════════════════════
set -u
DIR="${1:-apps/api/src/database/migrations}"

shopt -s nullglob
fail=0
checked=0
exempted=0

# 拦截:这些表的 DML 一律禁(除非在白名单)
DANGEROUS_DML='(INSERT[[:space:]]+INTO|UPDATE[[:space:]]+[a-zA-Z_]|DELETE[[:space:]]+FROM|TRUNCATE|MERGE[[:space:]]+INTO)'

# 白名单:这些表允许 DML(工具表 + 字典)
WHITELIST_TABLES='(typeorm_metadata|schema_migrations|sys_dict|sys_dict_entries|sys_migrations_log)'

# 文件级豁免标记:头 30 行内出现 @allow-data-dml: 即整文件豁免
EXEMPT_MARK='@allow-data-dml:'

for f in "$DIR"/*.ts; do
  checked=$((checked + 1))

  # g198: 文件头部豁免检查(在做任何 DML 扫描之前)
  if head -30 "$f" | grep -q "$EXEMPT_MARK"; then
    reason=$(head -30 "$f" | grep "$EXEMPT_MARK" | head -1 | sed -E "s/.*${EXEMPT_MARK}[[:space:]]*//; s/[[:space:]]*\*\/.*//" | head -c 120)
    echo "🟡 $(basename "$f"): 豁免 DML 检查 — $reason"
    exempted=$((exempted + 1))
    continue
  fi

  # 抽 up() 函数体(从 async up( 到 async down( 之前)
  up_segment=$(awk '
    /async[[:space:]]+up[[:space:]]*\(/ { flag=1 }
    /async[[:space:]]+down[[:space:]]*\(/ { flag=0 }
    flag { print }
  ' "$f")

  if [ -z "$up_segment" ]; then
    continue  # 无 up() 函数(可能不是迁移,跳过)
  fi

  # 查危险 DML
  violations=$(printf '%s\n' "$up_segment" | grep -niE "$DANGEROUS_DML" || true)

  if [ -z "$violations" ]; then
    continue  # 干净
  fi

  # 检查违规行是否全部命中白名单
  bad_lines=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # 如果这一行涉及白名单表 → 豁免
    if echo "$line" | grep -qiE "${WHITELIST_TABLES}"; then
      continue
    fi
    bad_lines+="$line"$'\n'
  done <<< "$violations"

  if [ -n "$bad_lines" ]; then
    echo "::error file=$f::TS 迁移不得含业务数据 DML(INSERT/UPDATE/DELETE/TRUNCATE/MERGE)"
    echo "$bad_lines" | head -5
    echo "  → 白名单:typeorm_metadata / schema_migrations / sys_dict* / sys_migrations_log"
    echo "  → 业务数据 seed 请走运维脚本(scripts/),不进 typeorm 自动迁移链"
    fail=1
  fi
done

if [ "$checked" = "0" ]; then
  echo "✅ TS 迁移目录尚空 — 无检查项(目录: $DIR)"
elif [ "$fail" = "0" ]; then
  if [ "$exempted" -gt 0 ]; then
    echo "✅ $checked 条 TS 迁移检查通过($exempted 条文件级豁免)"
  else
    echo "✅ 所有 $checked 条 TS 迁移 up() 无业务数据 DML"
  fi
fi
exit $fail
