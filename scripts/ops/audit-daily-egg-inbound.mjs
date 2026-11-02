#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outputDir = valueOf('--output-dir') || 'docs/ops/runs';
const reportPath = valueOf('--report') || path.join(outputDir, 'DAILY_EGG_INBOUND_AUDIT.md');
const database = process.env.PGDATABASE || process.env.DB_NAME || 'phoenix_erp';

function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
}

function runPsql(sql) {
  const command = process.env.DAILY_EGG_PSQL_CMD
    ? ['sh', ['-lc', process.env.DAILY_EGG_PSQL_CMD]]
    : ['psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-tA', '-d', database]];
  const result = spawnSync(command[0], command[1], {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`psql failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

// Read-only by construction: the SQL contains only SELECT/CTE statements.
const auditSql = `
WITH report_grade AS (
  SELECT dl.log_date::text AS log_date, dl.house_code,
         grade.key AS grade,
         SUM(GREATEST(0, ROUND((grade.value)::numeric)))::int AS qty
    FROM brd_daily_logs dl
    CROSS JOIN LATERAL jsonb_each_text(COALESCE(dl.eggs_by_grade, '{}'::jsonb)) grade
   GROUP BY dl.log_date, dl.house_code, grade.key
), inbound_grade AS (
  SELECT b.egg_date::text AS log_date,
         SUBSTRING(b.collection_batch_ref FROM 7) AS house_code,
         COALESCE(b.grade_code_std, b.quality_grade) AS grade,
         SUM(b.qty)::int AS qty
    FROM inv_batches b
   WHERE b.source_type = 'TEMP_PRODUCTION'
     AND b.collection_batch_ref LIKE 'HOUSE-%'
   GROUP BY b.egg_date, SUBSTRING(b.collection_batch_ref FROM 7), COALESCE(b.grade_code_std, b.quality_grade)
), overposted AS (
  SELECT COALESCE(r.log_date, i.log_date) AS log_date,
         COALESCE(r.house_code, i.house_code) AS house_code,
         COALESCE(r.grade, i.grade) AS grade,
         COALESCE(r.qty, 0) AS reported_qty,
         COALESCE(i.qty, 0) AS inbound_qty,
         COALESCE(i.qty, 0) - COALESCE(r.qty, 0) AS over_qty
    FROM report_grade r
    FULL JOIN inbound_grade i USING (log_date, house_code, grade)
   WHERE COALESCE(i.qty, 0) > COALESCE(r.qty, 0)
), duplicate_sources AS (
  SELECT company_code, source_no,
         COALESCE(sku_code, '') AS sku_code,
         COALESCE(grade_code_std, quality_grade, '') AS grade_code,
         COALESCE(spec_code, packaging_spec, '') AS spec_code,
         COUNT(*)::int AS batch_count,
         COALESCE(SUM(qty), 0)::int AS total_qty
    FROM inv_batches
   WHERE source_type = 'TEMP_PRODUCTION' AND source_no IS NOT NULL
   GROUP BY company_code, source_no, COALESCE(sku_code, ''), COALESCE(grade_code_std, quality_grade, ''), COALESCE(spec_code, packaging_spec, '')
  HAVING COUNT(*) > 1
), legacy_farm_in AS (
  SELECT COUNT(*)::int AS rows, COALESCE(SUM(qty_change), 0)::int AS total_qty
    FROM inv_ledger
   WHERE change_type = 'FARM_IN' AND note LIKE '日报产蛋入账%'
)
SELECT jsonb_build_object(
  'database', current_database(),
  'checked_at', NOW(),
  'duplicate_source_groups', COALESCE((SELECT COUNT(*) FROM duplicate_sources), 0),
  'duplicate_sources', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.batch_count DESC, x.source_no) FROM (SELECT * FROM duplicate_sources LIMIT 100) x), '[]'::jsonb),
  'overposted_grade_groups', COALESCE((SELECT COUNT(*) FROM overposted), 0),
  'overposted_grades', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.log_date, x.house_code, x.grade) FROM (SELECT * FROM overposted LIMIT 100) x), '[]'::jsonb),
  'legacy_daily_farm_in_rows', (SELECT rows FROM legacy_farm_in),
  'legacy_daily_farm_in_qty', (SELECT total_qty FROM legacy_farm_in),
  'conclusion', CASE WHEN (SELECT COUNT(*) FROM duplicate_sources) = 0 AND (SELECT COUNT(*) FROM overposted) = 0 THEN 'GO' ELSE 'HOLD' END
)::text;
`;

const result = JSON.parse(runPsql(auditSql));
fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'daily-egg-inbound-audit-latest.json');
fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(reportPath, renderMarkdown(result, jsonPath));

console.log(`daily egg inbound audit: ${result.conclusion}`);
console.log(`duplicate_source_groups=${result.duplicate_source_groups}`);
console.log(`overposted_grade_groups=${result.overposted_grade_groups}`);
console.log(`legacy_daily_farm_in_rows=${result.legacy_daily_farm_in_rows}`);
process.exitCode = result.conclusion === 'GO' ? 0 : 2;

function renderMarkdown(value, jsonPath) {
  return [
    '# 日产蛋日报与库存一致性审计',
    '',
    `- 结论：**${value.conclusion}**`,
    `- 数据库：\`${value.database}\``,
    `- 检查时间：${value.checked_at}`,
    `- 临时生产入库重复来源组：${value.duplicate_source_groups}`,
    `- 超过日报分级额度的组：${value.overposted_grade_groups}`,
    `- 历史日报 FARM_IN 行数：${value.legacy_daily_farm_in_rows}`,
    `- 历史日报 FARM_IN 数量：${value.legacy_daily_farm_in_qty}`,
    '',
    '审计只读，不会修改日报、库存批次或流水。若结论为 HOLD，先人工核对 JSON 明细，再处理历史数据；不要直接跳过唯一索引迁移。',
    '',
    `原始 JSON：\`${jsonPath}\``,
    '',
  ].join('\n');
}
