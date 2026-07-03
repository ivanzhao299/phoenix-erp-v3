#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};

const outputDir = getArg('--output-dir', 'docs/ops/runs');
const top = Math.max(1, Number(getArg('--top', '80')) || 80);
const generatedAt = new Date().toISOString();
const outputJson = join(outputDir, 'chanjet-field-mapping-report-latest.json');
const outputMd = join(outputDir, 'chanjet-field-mapping-report-latest.md');

function loadEnvFiles() {
  const result = {};
  for (const file of ['.env', 'apps/api/.env', '.env.local', 'apps/api/.env.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      if (result[match[1]] === undefined) {
        result[match[1]] = match[2].replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '').trim();
      }
    }
  }
  return result;
}

const fileEnv = loadEnvFiles();
const envValue = (name, fallback = '') => process.env[name] || fileEnv[name] || fallback;

function psqlArgs(sql) {
  return [
    '-v', 'ON_ERROR_STOP=1',
    '-U', envValue('DB_USER', 'mac'),
    '-d', envValue('DB_NAME', 'phoenix_erp'),
    '-h', envValue('DB_HOST', '127.0.0.1'),
    '-p', envValue('DB_PORT', '5432'),
    '-Atc',
    sql,
  ];
}

function runPsqlJson(sql) {
  const env = { ...process.env };
  const password = envValue('DB_PASSWORD', '');
  if (password) env.PGPASSWORD = password;
  const cmd = spawnSync('psql', psqlArgs(sql), {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });
  if (cmd.status !== 0) {
    throw new Error((cmd.stderr || cmd.stdout || 'psql failed').trim());
  }
  const text = (cmd.stdout || '').trim();
  if (!text) return [];
  return JSON.parse(text);
}

function sqlJson(query) {
  return `select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)::text from (${query}) t`;
}

function tableExists(tableName) {
  const rows = runPsqlJson(`select jsonb_build_array(coalesce(to_regclass('public.${tableName}')::text, ''))::text`);
  return Boolean(rows[0]);
}

function severityScore(row) {
  const risk = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[row.risk_level] || 0;
  const match = row.match_status === 'MATCHED' ? 0 : row.match_status === 'TRANSFORM_REQUIRED' ? 2 : 3;
  return risk * 10 + match;
}

function classifyBacklog(row) {
  const domain = row.erp_domain || 'unclassified';
  const endpoint = row.chanjet_endpoint || '';
  if (domain === 'api_metadata') return null;
  if (['finance', 'accounting', 'voucher', 'counterparty'].includes(domain)) {
    return 'P0-FINANCE-MAPPING';
  }
  if (['organization', 'project', 'currency'].includes(domain)) {
    return 'P1-MASTER-DATA-MAPPING';
  }
  if (/BALANCE_SHEET|INCOME_STATEMENT|CASH_FLOW|GL_BALANCE/.test(endpoint)) {
    return 'P1-REPORTING-MAPPING';
  }
  return 'P2-CLASSIFICATION';
}

function buildBacklog(rows) {
  const groups = new Map();
  for (const row of rows) {
    const bucket = classifyBacklog(row);
    if (!bucket) continue;
    if (!groups.has(bucket)) {
      groups.set(bucket, {
        backlog_id: bucket,
        title: '',
        priority: bucket.startsWith('P0') ? 'P0' : bucket.startsWith('P1') ? 'P1' : 'P2',
        field_count: 0,
        endpoints: new Set(),
        erp_domains: new Set(),
        sample_fields: [],
        recommended_action: '',
      });
    }
    const item = groups.get(bucket);
    item.field_count += 1;
    item.endpoints.add(row.chanjet_endpoint);
    item.erp_domains.add(row.erp_domain);
    if (item.sample_fields.length < 12) {
      item.sample_fields.push({
        endpoint: row.chanjet_endpoint,
        field: row.chanjet_field_path,
        chanjet_type: row.chanjet_type,
        erp_target: [row.erp_table, row.erp_field].filter(Boolean).join('.'),
        risk: row.risk_level,
        match_status: row.match_status,
      });
    }
  }

  const titles = {
    'P0-FINANCE-MAPPING': '财务核心字段语义映射：往来、金额、科目、凭证',
    'P1-MASTER-DATA-MAPPING': '主数据映射：部门、项目、币种与 ERP 主数据对齐',
    'P1-REPORTING-MAPPING': '报表镜像映射：三大报表与科目余额字段固化',
    'P2-CLASSIFICATION': '未归类字段人工分类与低风险收口',
  };
  const actions = {
    'P0-FINANCE-MAPPING': '先冻结字段字典和转换规则，不直接改业务表；确认后进入 ERP 适配层 DTO/API/UI Gate。',
    'P1-MASTER-DATA-MAPPING': '对账 ERP 主数据编码，补映射关系和人工审核状态，禁止自动覆盖主数据。',
    'P1-REPORTING-MAPPING': '保持只读快照，建立报表查询模型和口径说明，禁止直接替换 ERP 财务事实表。',
    'P2-CLASSIFICATION': '批量人工分类，确认是否可忽略、归入元数据或进入后续 schema 设计。',
  };

  return Array.from(groups.values()).map((item) => ({
    ...item,
    title: titles[item.backlog_id] || item.backlog_id,
    endpoints: Array.from(item.endpoints).sort(),
    erp_domains: Array.from(item.erp_domains).sort(),
    recommended_action: actions[item.backlog_id] || '',
  })).sort((a, b) => a.priority.localeCompare(b.priority) || b.field_count - a.field_count);
}

function markdownTable(headers, rows) {
  if (!rows.length) return '_none_';
  return [
    `|${headers.join('|')}|`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `|${headers.map((header) => String(row[header] ?? '').replace(/\|/g, '\\|')).join('|')}|`),
  ].join('\n');
}

function writeReports(report) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, JSON.stringify(report, null, 2));

  const domainRows = report.domainRiskSummary.map((row) => ({
    domain: row.erp_domain,
    risk: row.risk_level,
    match: row.match_status,
    count: row.count,
  }));
  const endpointRows = report.endpointSummary.slice(0, 30).map((row) => ({
    endpoint: row.chanjet_endpoint,
    fields: row.field_count,
    matched: row.matched_count,
    pending: row.pending_count,
    high: row.high_count,
  }));
  const backlogRows = report.improvementBacklog.map((row) => ({
    priority: row.priority,
    backlog: row.backlog_id,
    title: row.title,
    fields: row.field_count,
    domains: row.erp_domains.join(', '),
  }));
  const topRows = report.topOpenFields.slice(0, 40).map((row) => ({
    endpoint: row.chanjet_endpoint,
    field: row.chanjet_field_path,
    type: row.chanjet_type,
    erp: [row.erp_domain, row.erp_table, row.erp_field].filter(Boolean).join(' / '),
    risk: row.risk_level,
    status: row.match_status,
  }));

  const lines = [
    '# Chanjet ERP Field Mapping Report',
    '',
    `Generated at: ${generatedAt}`,
    `Decision: ${report.decision}`,
    '',
    '## Boundaries',
    '',
    '- Chanjet write: no',
    '- Chanjet delete/modify: no',
    '- ERP business table write: no',
    '- ERP middle-layer read/report only: yes',
    '',
    '## Summary',
    '',
    `- Total mapped field candidates: ${report.summary.total_fields}`,
    `- Matched metadata/business fields: ${report.summary.matched_fields}`,
    `- Pending fields: ${report.summary.pending_fields}`,
    `- High/Critical open fields: ${report.summary.high_or_critical_open_fields}`,
    `- API metadata fields safely classified: ${report.summary.api_metadata_fields}`,
    `- Fake counterparty targets: ${report.summary.fake_counterparty_targets}`,
    '',
    '## Improvement Backlog',
    '',
    markdownTable(['priority', 'backlog', 'title', 'fields', 'domains'], backlogRows),
    '',
    '## Endpoint Coverage',
    '',
    markdownTable(['endpoint', 'fields', 'matched', 'pending', 'high'], endpointRows),
    '',
    '## Domain / Risk Summary',
    '',
    markdownTable(['domain', 'risk', 'match', 'count'], domainRows),
    '',
    '## Top Open Fields',
    '',
    markdownTable(['endpoint', 'field', 'type', 'erp', 'risk', 'status'], topRows),
    '',
    '## Next Gate Recommendation',
    '',
    '1. P0: 先审定财务核心字段语义映射，不直接写好业财，不直接改 ERP 业务表。',
    '2. P1: 固化主数据映射关系，重点部门、项目、客户/供应商、科目、资金账号。',
    '3. P1: 建立报表只读查询模型，三大报表和科目余额先保留快照口径。',
    '4. P2: 未归类字段进入人工分类，确认忽略、元数据或后续 schema Gate。',
    '',
  ];
  writeFileSync(outputMd, lines.join('\n'));
}

async function main() {
  const hasEntitySnapshots = tableExists('chanjet_entity_snapshots');
  const hasMasterMapping = tableExists('chanjet_master_mapping');

  const summary = runPsqlJson(sqlJson(`
    select
      count(*)::int as total_fields,
      count(*) filter (where match_status = 'MATCHED')::int as matched_fields,
      count(*) filter (where match_status <> 'MATCHED')::int as pending_fields,
      count(*) filter (where risk_level in ('HIGH', 'CRITICAL') and match_status <> 'MATCHED')::int as high_or_critical_open_fields,
      count(*) filter (where erp_domain = 'api_metadata')::int as api_metadata_fields,
      count(*) filter (where erp_table = 'mst_customers/mst_suppliers')::int as fake_counterparty_targets
    from chanjet_erp_field_mapping
  `))[0] || {};

  const domainRiskSummary = runPsqlJson(sqlJson(`
    select erp_domain, risk_level, match_status, count(*)::int as count
    from chanjet_erp_field_mapping
    group by erp_domain, risk_level, match_status
    order by erp_domain, risk_level, match_status
  `));

  const endpointSummary = runPsqlJson(sqlJson(`
    select
      chanjet_endpoint,
      count(*)::int as field_count,
      count(*) filter (where match_status = 'MATCHED')::int as matched_count,
      count(*) filter (where match_status <> 'MATCHED')::int as pending_count,
      count(*) filter (where risk_level in ('HIGH', 'CRITICAL') and match_status <> 'MATCHED')::int as high_count
    from chanjet_erp_field_mapping
    group by chanjet_endpoint
    order by high_count desc, pending_count desc, field_count desc, chanjet_endpoint asc
  `));

  const topOpenFields = runPsqlJson(sqlJson(`
    select
      chanjet_endpoint,
      chanjet_field_path,
      chanjet_type,
      left(coalesce(chanjet_sample_masked, ''), 120) as chanjet_sample_masked,
      erp_domain,
      erp_table,
      erp_field,
      erp_type,
      transform_rule,
      match_status,
      risk_level,
      analysis_note
    from chanjet_erp_field_mapping
    where erp_domain <> 'api_metadata'
      and match_status <> 'MATCHED'
    order by
      case risk_level when 'CRITICAL' then 4 when 'HIGH' then 3 when 'MEDIUM' then 2 when 'LOW' then 1 else 0 end desc,
      chanjet_endpoint asc,
      chanjet_field_path asc
    limit ${top}
  `)).sort((a, b) => severityScore(b) - severityScore(a));

  const mirrorEntitySummary = hasEntitySnapshots ? runPsqlJson(sqlJson(`
    select
      entity_type,
      endpoint_key,
      count(*)::int as rows,
      count(*) filter (where coalesce(external_name, '') <> '')::int as named_rows,
      sum(coalesce(amount, 0))::text as amount_sum
    from chanjet_entity_snapshots
    group by entity_type, endpoint_key
    order by entity_type, endpoint_key
  `)) : [];

  const masterMappingSummary = hasMasterMapping ? runPsqlJson(sqlJson(`
    select
      mapping_type,
      match_status,
      review_status,
      count(*)::int as count
    from chanjet_master_mapping
    group by mapping_type, match_status, review_status
    order by mapping_type, match_status, review_status
  `)) : [];

  const report = {
    generatedAt,
    decision: Number(summary.fake_counterparty_targets || 0) > 0 ? 'HOLD' : 'GO_WITH_CONDITIONS',
    summary,
    domainRiskSummary,
    endpointSummary,
    topOpenFields,
    mirrorEntitySummary,
    masterMappingSummary,
    optionalTables: {
      chanjet_entity_snapshots: hasEntitySnapshots ? 'present' : 'missing',
      chanjet_master_mapping: hasMasterMapping ? 'present' : 'missing',
    },
    improvementBacklog: buildBacklog(topOpenFields),
    boundaries: {
      writeChanjet: false,
      deleteChanjet: false,
      modifyChanjet: false,
      erpBusinessTableWrite: false,
      deploy: false,
      push: false,
    },
    outputs: { outputJson, outputMd },
  };

  writeReports(report);
  console.log(JSON.stringify({
    decision: report.decision,
    summary: report.summary,
    backlog: report.improvementBacklog.map((item) => ({
      id: item.backlog_id,
      priority: item.priority,
      fields: item.field_count,
      title: item.title,
    })),
    outputs: report.outputs,
  }, null, 2));
}

main().catch((error) => {
  mkdirSync(outputDir, { recursive: true });
  const result = {
    generatedAt,
    decision: 'FAIL',
    error: error?.stack || String(error),
    boundaries: {
      writeChanjet: false,
      deleteChanjet: false,
      modifyChanjet: false,
      erpBusinessTableWrite: false,
      deploy: false,
      push: false,
    },
  };
  writeFileSync(outputJson, JSON.stringify(result, null, 2));
  writeFileSync(outputMd, `# Chanjet ERP Field Mapping Report\n\nDecision: FAIL\n\n\`\`\`\n${result.error}\n\`\`\`\n`);
  console.error(result.error);
  process.exit(1);
});
