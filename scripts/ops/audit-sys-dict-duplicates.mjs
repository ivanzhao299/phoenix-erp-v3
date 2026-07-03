#!/usr/bin/env node
/**
 * sys_dict duplicate audit.
 *
 * Read-only by default. It can run against any PostgreSQL URL exposed through
 * DATABASE_URL, or just print the SQL with --print-sql.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const outputJson = valueOf('--output-json');
const outputMd = valueOf('--output-md');
const printSql = args.includes('--print-sql');

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : '';
}

const auditSql = `
WITH active AS (
  SELECT id, dict_type, dict_code, dict_label_zh, sort_no, status, created_at, updated_at
    FROM sys_dict
   WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
),
duplicate_codes AS (
  SELECT dict_type, dict_code, COUNT(*)::int AS duplicate_count,
         MIN(id)::int AS suggested_keep_id,
         ARRAY_AGG(id ORDER BY id)::text AS all_ids
    FROM active
   GROUP BY dict_type, dict_code
  HAVING COUNT(*) > 1
),
duplicate_labels AS (
  SELECT dict_type, lower(trim(COALESCE(dict_label_zh, ''))) AS normalized_label,
         COUNT(*)::int AS duplicate_count,
         MIN(id)::int AS suggested_keep_id,
         ARRAY_AGG(id ORDER BY id)::text AS all_ids
    FROM active
   WHERE trim(COALESCE(dict_label_zh, '')) <> ''
   GROUP BY dict_type, lower(trim(COALESCE(dict_label_zh, '')))
  HAVING COUNT(*) > 1
),
type_counts AS (
  SELECT dict_type,
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE')::int AS active_count
    FROM sys_dict
   GROUP BY dict_type
)
SELECT json_build_object(
  'as_of', now(),
  'summary', json_build_object(
    'duplicate_code_groups', (SELECT COUNT(*) FROM duplicate_codes),
    'duplicate_label_groups', (SELECT COUNT(*) FROM duplicate_labels),
    'active_entries', (SELECT COUNT(*) FROM active),
    'dict_types', (SELECT COUNT(*) FROM type_counts)
  ),
  'duplicate_codes', COALESCE((SELECT json_agg(duplicate_codes ORDER BY duplicate_count DESC, dict_type, dict_code) FROM duplicate_codes), '[]'::json),
  'duplicate_labels', COALESCE((SELECT json_agg(duplicate_labels ORDER BY duplicate_count DESC, dict_type, normalized_label) FROM duplicate_labels), '[]'::json),
  'high_risk_types', COALESCE((
    SELECT json_agg(type_counts ORDER BY active_count DESC, dict_type)
      FROM type_counts
     WHERE dict_type ILIKE '%SKU%'
        OR dict_type ILIKE '%GRADE%'
        OR dict_type IN ('PKG_EGG_GRADE', 'PKG_PACK_SPEC')
  ), '[]'::json)
)::text AS audit_json;
`.trim();

if (printSql || !process.env.DATABASE_URL) {
  console.log(auditSql);
  if (!process.env.DATABASE_URL) {
    console.error('\n[INFO] DATABASE_URL is not set; printed SQL only. No database connection was opened.');
  }
  process.exit(printSql ? 0 : 2);
}

const result = spawnSync('psql', [process.env.DATABASE_URL, '-At', '-c', auditSql], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const raw = result.stdout.trim();
const report = JSON.parse(raw);

if (outputJson) {
  mkdirSync(dirname(outputJson), { recursive: true });
  writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
}

const md = [
  '# sys_dict Duplicate Audit',
  '',
  `- As of: ${report.as_of}`,
  `- Active entries: ${report.summary.active_entries}`,
  `- Dict types: ${report.summary.dict_types}`,
  `- Duplicate code groups: ${report.summary.duplicate_code_groups}`,
  `- Duplicate label groups: ${report.summary.duplicate_label_groups}`,
  '',
  '## High Risk Types',
  '',
  '| dict_type | total | active |',
  '|---|---:|---:|',
  ...report.high_risk_types.map((r) => `| ${r.dict_type} | ${r.total_count} | ${r.active_count} |`),
  '',
  '## Top Duplicate Codes',
  '',
  '| dict_type | dict_code | count | keep_id | all_ids |',
  '|---|---|---:|---:|---|',
  ...report.duplicate_codes.slice(0, 50).map((r) => `| ${r.dict_type} | ${r.dict_code} | ${r.duplicate_count} | ${r.suggested_keep_id} | ${r.all_ids} |`),
  '',
  '## Top Duplicate Labels',
  '',
  '| dict_type | label | count | keep_id | all_ids |',
  '|---|---|---:|---:|---|',
  ...report.duplicate_labels.slice(0, 50).map((r) => `| ${r.dict_type} | ${r.normalized_label} | ${r.duplicate_count} | ${r.suggested_keep_id} | ${r.all_ids} |`),
  '',
  '## Recommended Cleanup Rule',
  '',
  'Keep the canonical ACTIVE row per `(dict_type, dict_code)` after business review; mark non-canonical rows as `ARCHIVED` instead of deleting them. Add a partial unique index on ACTIVE `(dict_type, dict_code)` only after cleanup reaches zero duplicate groups.',
  '',
].join('\n');

if (outputMd) {
  mkdirSync(dirname(outputMd), { recursive: true });
  writeFileSync(outputMd, md);
}

console.log(md);
