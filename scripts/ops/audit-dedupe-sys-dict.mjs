#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = args.includes('--dry-run') || !apply;
const outputDir = valueOf('--output-dir') || 'docs/ops/runs';
const reportPath = valueOf('--report') || 'docs/ops/SYS_DICT_DUPLICATE_AUDIT_AND_DEDUP_REPORT.md';
const database = process.env.PGDATABASE || process.env.DB_NAME || 'phoenix_erp';
const backupTable = `sys_dict_dedupe_backup_${stamp()}`;

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : '';
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function runPsql(sql) {
  const cmd = process.env.SYS_DICT_PSQL_CMD
    ? ['sh', ['-lc', process.env.SYS_DICT_PSQL_CMD]]
    : ['psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-tA', '-d', database]];
  const res = spawnSync(cmd[0], cmd[1], {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`psql failed\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`);
  }
  return res.stdout.trim();
}

const auditSql = `
WITH exact_dup_groups AS (
  SELECT dict_type, dict_code, COUNT(*) AS cnt, MIN(id) AS keep_id, ARRAY_AGG(id ORDER BY id) AS ids
  FROM sys_dict
  GROUP BY dict_type, dict_code
  HAVING COUNT(*) > 1
),
exact_dup_rows AS (
  SELECT d.*
  FROM sys_dict d
  JOIN exact_dup_groups g ON g.dict_type = d.dict_type AND g.dict_code = d.dict_code
  WHERE d.id <> g.keep_id
),
active_label_dup AS (
  SELECT dict_type,
         COALESCE(NULLIF(TRIM(dict_label_zh), ''), NULLIF(TRIM(name), ''), NULLIF(TRIM(dict_value), ''), dict_code) AS label,
         COUNT(*) AS cnt,
         ARRAY_AGG(id ORDER BY id) AS ids,
         ARRAY_AGG(dict_code ORDER BY id) AS codes
  FROM sys_dict
  WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
  GROUP BY dict_type, COALESCE(NULLIF(TRIM(dict_label_zh), ''), NULLIF(TRIM(name), ''), NULLIF(TRIM(dict_value), ''), dict_code)
  HAVING COUNT(*) > 1
),
active_value_dup AS (
  SELECT dict_type,
         COALESCE(NULLIF(TRIM(dict_value), ''), dict_code) AS dict_value,
         COUNT(*) AS cnt,
         ARRAY_AGG(id ORDER BY id) AS ids,
         ARRAY_AGG(dict_code ORDER BY id) AS codes
  FROM sys_dict
  WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
  GROUP BY dict_type, COALESCE(NULLIF(TRIM(dict_value), ''), dict_code)
  HAVING COUNT(*) > 1
),
type_summary AS (
  SELECT dict_type,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE COALESCE(status,'ACTIVE')='ACTIVE') AS active,
         COUNT(DISTINCT dict_code) AS distinct_codes,
         COUNT(DISTINCT COALESCE(NULLIF(TRIM(dict_label_zh), ''), NULLIF(TRIM(name), ''), NULLIF(TRIM(dict_value), ''), dict_code)) AS distinct_labels
  FROM sys_dict
  GROUP BY dict_type
),
unique_index AS (
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'sys_dict'
    AND indexdef ILIKE '%UNIQUE%'
    AND indexdef ILIKE '%dict_type%'
    AND indexdef ILIKE '%dict_code%'
  ORDER BY indexname
  LIMIT 1
)
SELECT jsonb_build_object(
  'database', current_database(),
  'db_user', current_user,
  'checked_at', NOW(),
  'mode', ${apply ? "'apply'" : "'dry-run'"},
  'total_rows', (SELECT COUNT(*) FROM sys_dict),
  'dict_types', (SELECT COUNT(DISTINCT dict_type) FROM sys_dict),
  'exact_duplicate_groups', COALESCE((SELECT COUNT(*) FROM exact_dup_groups), 0),
  'exact_duplicate_rows_to_remove', COALESCE((SELECT COUNT(*) FROM exact_dup_rows), 0),
  'active_label_duplicate_groups', COALESCE((SELECT COUNT(*) FROM active_label_dup), 0),
  'active_value_duplicate_groups', COALESCE((SELECT COUNT(*) FROM active_value_dup), 0),
  'exact_duplicates', COALESCE((SELECT jsonb_agg(jsonb_build_object('dict_type', dict_type, 'dict_code', dict_code, 'cnt', cnt, 'keep_id', keep_id, 'ids', ids) ORDER BY cnt DESC, dict_type, dict_code) FROM exact_dup_groups), '[]'::jsonb),
  'active_label_duplicates', COALESCE((SELECT jsonb_agg(jsonb_build_object('dict_type', dict_type, 'label', label, 'cnt', cnt, 'ids', ids, 'codes', codes) ORDER BY cnt DESC, dict_type, label) FROM active_label_dup), '[]'::jsonb),
  'active_value_duplicates', COALESCE((SELECT jsonb_agg(jsonb_build_object('dict_type', dict_type, 'dict_value', dict_value, 'cnt', cnt, 'ids', ids, 'codes', codes) ORDER BY cnt DESC, dict_type, dict_value) FROM active_value_dup), '[]'::jsonb),
  'unique_index_present', EXISTS(SELECT 1 FROM unique_index),
  'unique_index', COALESCE((SELECT jsonb_build_object('indexname', indexname, 'indexdef', indexdef) FROM unique_index), 'null'::jsonb),
  'type_summary', COALESCE((SELECT jsonb_agg(jsonb_build_object('dict_type', dict_type, 'total', total, 'active', active, 'distinct_codes', distinct_codes, 'distinct_labels', distinct_labels) ORDER BY dict_type) FROM type_summary), '[]'::jsonb)
)::text;
`;

const before = JSON.parse(runPsql(auditSql));
let deletedRows = 0;
let appliedBackupTable = null;

if (apply && before.exact_duplicate_rows_to_remove > 0) {
  const applySql = `
BEGIN;
CREATE TABLE IF NOT EXISTS ${backupTable} AS
WITH exact_dup_groups AS (
  SELECT dict_type, dict_code, COUNT(*) AS cnt, MIN(id) AS keep_id
  FROM sys_dict
  GROUP BY dict_type, dict_code
  HAVING COUNT(*) > 1
)
SELECT d.*, NOW() AS backed_up_at
FROM sys_dict d
JOIN exact_dup_groups g ON g.dict_type = d.dict_type AND g.dict_code = d.dict_code
WHERE d.id <> g.keep_id;

WITH exact_dup_groups AS (
  SELECT dict_type, dict_code, COUNT(*) AS cnt, MIN(id) AS keep_id
  FROM sys_dict
  GROUP BY dict_type, dict_code
  HAVING COUNT(*) > 1
),
deleted AS (
  DELETE FROM sys_dict d
  USING exact_dup_groups g
  WHERE g.dict_type = d.dict_type
    AND g.dict_code = d.dict_code
    AND d.id <> g.keep_id
  RETURNING d.id
)
SELECT COUNT(*) FROM deleted;
COMMIT;
`;
  const out = runPsql(applySql);
  const counts = out.split(/\r?\n/).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  deletedRows = counts.at(-1) || 0;
  appliedBackupTable = backupTable;
}

const after = JSON.parse(runPsql(auditSql));
const result = {
  mode: apply ? 'apply' : 'dry-run',
  dry_run: dryRun,
  before,
  after,
  deleted_rows: deletedRows,
  backup_table: appliedBackupTable,
  conclusion: after.exact_duplicate_groups === 0 && after.unique_index_present ? 'GO' : 'HOLD',
  notes: [
    'Only exact duplicate (dict_type, dict_code) rows are auto-deduped.',
    'Same label/value under different dict_code is reported for manual review and not auto-deleted.',
    'A unique index on (dict_type, dict_code) is required to prevent future duplicate seed drift.',
  ],
};

fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, 'sys-dict-dedupe-latest.json');
fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(reportPath, renderMarkdown(result, jsonPath));

console.log(`sys_dict audit complete: ${result.conclusion}`);
console.log(`mode=${result.mode}`);
console.log(`before exact duplicate groups=${before.exact_duplicate_groups}, rows_to_remove=${before.exact_duplicate_rows_to_remove}`);
console.log(`deleted_rows=${deletedRows}`);
console.log(`after exact duplicate groups=${after.exact_duplicate_groups}`);
console.log(`json=${jsonPath}`);
console.log(`report=${reportPath}`);

function renderMarkdown(r, jsonPath) {
  const labelRows = (r.after.active_label_duplicates || []).slice(0, 40);
  const valueRows = (r.after.active_value_duplicates || []).slice(0, 40);
  const exactRows = (r.before.exact_duplicates || []).slice(0, 40);
  return `# Sys Dict Duplicate Audit and Dedup Report

Generated at: ${new Date().toISOString()}

## Scope

- Target table: \`sys_dict\`
- Database: \`${r.after.database}\`
- DB user: \`${r.after.db_user}\`
- Mode: \`${r.mode}\`
- JSON evidence: \`${jsonPath}\`

## Policy

1. Exact duplicates are defined as rows sharing the same \`dict_type + dict_code\`.
2. Exact duplicates are safe to dedupe because runtime selectors use \`dict_type\` and \`dict_code\`.
3. Display duplicates are defined as active rows sharing the same display label or value under one \`dict_type\`.
4. Display duplicates are reported but not deleted automatically, because different codes may intentionally share a label in legacy flows.

## Before

| Metric | Value |
| --- | ---: |
| total rows | ${r.before.total_rows} |
| dict types | ${r.before.dict_types} |
| exact duplicate groups | ${r.before.exact_duplicate_groups} |
| exact duplicate rows to remove | ${r.before.exact_duplicate_rows_to_remove} |
| active label duplicate groups | ${r.before.active_label_duplicate_groups} |
| active value duplicate groups | ${r.before.active_value_duplicate_groups} |

## Dedup Execution

| Item | Result |
| --- | --- |
| deleted rows | ${r.deleted_rows} |
| backup table | ${r.backup_table || 'not needed'} |
| destructive operation | no table drop, no truncate |
| business data changed | no, only sys_dict exact duplicate rows when present |

## After

| Metric | Value |
| --- | ---: |
| total rows | ${r.after.total_rows} |
| dict types | ${r.after.dict_types} |
| exact duplicate groups | ${r.after.exact_duplicate_groups} |
| exact duplicate rows remaining | ${r.after.exact_duplicate_rows_to_remove} |
| active label duplicate groups | ${r.after.active_label_duplicate_groups} |
| active value duplicate groups | ${r.after.active_value_duplicate_groups} |
| unique index present | ${r.after.unique_index_present ? 'yes' : 'no'} |

## Preventive Unique Index

${r.after.unique_index_present
  ? `PASS. \`${r.after.unique_index.indexname}\` exists.\n\n\`\`\`sql\n${r.after.unique_index.indexdef}\n\`\`\``
  : 'HOLD. No unique index covering `sys_dict(dict_type, dict_code)` was found. Future seed reruns can recreate duplicates.'}

## Exact Duplicate Groups

${exactRows.length ? table(exactRows, ['dict_type', 'dict_code', 'cnt', 'keep_id', 'ids']) : 'No exact duplicate groups found.'}

## Active Label Duplicate Groups for Manual Review

${labelRows.length ? table(labelRows, ['dict_type', 'label', 'cnt', 'ids', 'codes']) : 'No active display-label duplicate groups found.'}

## Active Value Duplicate Groups for Manual Review

${valueRows.length ? table(valueRows, ['dict_type', 'dict_value', 'cnt', 'ids', 'codes']) : 'No active dict-value duplicate groups found.'}

## Conclusion

${r.conclusion === 'GO'
  ? 'GO. Exact sys_dict duplicate rows are cleared or were already absent, and the preventive unique index is present.'
  : 'HOLD. Exact sys_dict duplicates remain or the preventive unique index is missing.'}

## Next Controls

1. Keep verifying the DB unique index for \`sys_dict(dict_type, dict_code)\` in this audit before closing dictionary dedupe tasks.
2. Keep dictionary seed migrations idempotent with \`ON CONFLICT\` or \`WHERE NOT EXISTS\`.
3. Review label/value duplicates separately with business owners before changing codes.
`;
}

function table(rows, cols) {
  const head = `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${cols.map((c) => fmt(r[c])).join(' | ')} |`).join('\n');
  return `${head}\n${body}`;
}

function fmt(v) {
  if (Array.isArray(v)) return v.join(', ');
  if (v === null || v === undefined) return '';
  return String(v).replace(/\|/g, '\\|');
}
