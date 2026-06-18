#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  g197-I CI 门禁:entity↔DB 漂移总行数不得超过 baseline
#
#  逻辑:
#    1. typeorm migration:generate 已生成 /tmp/*_p5_entity_diff.ts(P5 #3 step)
#    2. 抽 up() 段所有 `await queryRunner.query(...)` 行数 → 当前漂移
#    3. 与 .github/entity-drift-baseline.txt 比较
#    4. 当前 > baseline → 红灯
#
#  目的:防止新 PR 让 entity ↔ DB 漂移恶化。新增 entity 字段必须先确认 DB 实存。
#
#  人工降 baseline:每次 entity 治理(让 entity 反映 DB)真减少漂移时,手动改
#  baseline 文件下调。
#
#  调用方:.github/workflows/deploy.yml P5 #3 step 末尾。
# ════════════════════════════════════════════════════════════════════════════
set -u
BASELINE_FILE="${1:-.github/entity-drift-baseline.txt}"
DIFF_GLOB="${2:-/tmp/*_p5_entity_diff*.ts}"

if [ ! -f "$BASELINE_FILE" ]; then
  echo "::error::baseline 文件不存在: $BASELINE_FILE"
  exit 1
fi
baseline=$(cat "$BASELINE_FILE" | tr -d '[:space:]')

# 累计所有 diff 文件 up 段行数
total=0
for f in $DIFF_GLOB; do
  [ -f "$f" ] || continue
  n=$(awk '/public async up/,/public async down/' "$f" | grep -c 'await queryRunner' || true)
  total=$((total + n))
done

if [ "$total" = "0" ]; then
  echo "✅ entity ↔ DB schema 已同步(0 漂移)"
  exit 0
fi

echo "── entity 漂移 baseline 检查 ──"
echo "  当前总行数: $total"
echo "  baseline:   $baseline"

if [ "$total" -gt "$baseline" ]; then
  echo "::error::❌ entity 漂移 $total > baseline $baseline,本 PR 让漂移恶化"
  echo "  → 修复:让 entity 字段对齐 DB(用 \\d <table> 验证),或回滚增量"
  echo "  → 不允许新 PR 增加漂移"
  exit 1
fi

if [ "$total" -lt "$baseline" ]; then
  echo "🎯 entity 漂移 $total < baseline $baseline,治理有进展!"
  echo "  → 建议人工下调 baseline 锁定成果"
fi

echo "✅ 漂移未恶化"
