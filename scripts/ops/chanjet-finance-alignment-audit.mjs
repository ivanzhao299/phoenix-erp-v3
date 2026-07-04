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
const generatedAt = new Date().toISOString();
const outputJson = join(outputDir, 'chanjet-finance-alignment-audit-latest.json');
const outputMd = join(outputDir, 'chanjet-finance-alignment-audit-latest.md');

const EXPECTED_ENDPOINTS = [
  ['ACCOUNT_BOOKS', '账套列表', 'ACCOUNT_BOOK'],
  ['DEPARTMENT', '部门列表', 'DEPARTMENT'],
  ['CUSTOMER_SUPPLIER', '往来单位', 'CUSTOMER_SUPPLIER'],
  ['SUBJECT', '科目列表', 'SUBJECT'],
  ['PROJECT', '项目列表', 'PROJECT'],
  ['FIN_ACCOUNT', '资金账户', 'CASH_ACCOUNT'],
  ['PAYABLE_STATISTICS', '应付统计', 'AP_STATISTICS'],
  ['RECEIVABLE_STATISTICS', '应收统计', 'AR_STATISTICS'],
  ['PAYMENT_AP', '付款单', 'AP_PAYMENT'],
  ['PAYMENT_AR', '收款单', 'AR_RECEIPT'],
  ['PURCHASE_ORDER', '采购订单', 'PURCHASE_ORDER'],
  ['VOUCHER_SEARCH', '凭证列表', 'VOUCHER'],
  ['GL_BALANCE', '科目余额表', 'GL_BALANCE'],
  ['BALANCE_SHEET', '资产负债表', 'BALANCE_SHEET'],
  ['INCOME_STATEMENT', '利润表', 'INCOME_STATEMENT'],
  ['CASH_FLOW', '现金流量表', 'CASH_FLOW'],
];

const CARD_DEFINITIONS = [
  ['arOpen', '应收待收', ['RECEIVABLE_STATISTICS']],
  ['apOpen', '应付待付', ['PAYABLE_STATISTICS']],
  ['cashBalance', '现金 / 银行余额', ['FIN_ACCOUNT', 'GL_BALANCE']],
  ['todayReceipt', '今日收款', ['PAYMENT_AR']],
  ['todayPayment', '今日付款', ['PAYMENT_AP']],
  ['subjectBalance', '科目余额', ['GL_BALANCE']],
  ['balanceSheet', '资产负债表关键项', ['BALANCE_SHEET']],
  ['incomeStatement', '利润表关键项', ['INCOME_STATEMENT']],
  ['counterpartyBalance', '客户 / 供应商往来余额', ['CUSTOMER_SUPPLIER', 'RECEIVABLE_STATISTICS', 'PAYABLE_STATISTICS']],
];

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

function runPsqlJson(sql, fallback = []) {
  const env = { ...process.env };
  const password = envValue('DB_PASSWORD', '');
  if (password) env.PGPASSWORD = password;
  const cmd = spawnSync('psql', psqlArgs(sql), { cwd: process.cwd(), encoding: 'utf8', env });
  if (cmd.status !== 0) {
    throw new Error((cmd.stderr || cmd.stdout || 'psql failed').trim());
  }
  const text = (cmd.stdout || '').trim();
  if (!text) return fallback;
  return JSON.parse(text);
}

function sqlJson(query) {
  return `select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)::text from (${query}) t`;
}

function tableExists(tableName) {
  const rows = runPsqlJson(`select jsonb_build_array(coalesce(to_regclass('public.${tableName}')::text, ''))::text`);
  return Boolean(rows[0]);
}

function pct(value) {
  return `${Math.round(Number(value || 0) * 1000) / 10}%`;
}

function markdownTable(headers, rows) {
  if (!rows.length) return '_none_';
  return [
    `|${headers.join('|')}|`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `|${headers.map((header) => String(row[header] ?? '').replace(/\|/g, '\\|')).join('|')}|`),
  ].join('\n');
}

function latestRowsByKey(rows, keyField) {
  const map = new Map();
  for (const row of rows) {
    const key = row[keyField];
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

function buildReport() {
  const coreTables = [
    'chanjet_read_snapshots',
    'chanjet_entity_snapshots',
    'chanjet_erp_field_mapping',
  ];
  const optionalTables = ['chanjet_sync_jobs'];
  const tableStatus = Object.fromEntries([...coreTables, ...optionalTables].map((table) => [table, tableExists(table)]));
  const missingCoreTables = coreTables.filter((table) => !tableStatus[table]);
  if (missingCoreTables.length) {
    return {
      generatedAt,
      decision: 'HOLD',
      blockers: [`Missing core middle-layer table(s): ${missingCoreTables.join(', ')}`],
      tableStatus,
      boundaries: boundaries(),
    };
  }
  const conditions = [];
  if (!tableStatus.chanjet_sync_jobs) {
    conditions.push(
      'chanjet_sync_jobs is unavailable in this database; endpoint job status is marked UNAVAILABLE and coverage is computed from readonly mirror tables.',
    );
  }

  const rawCoverageRows = runPsqlJson(sqlJson(`
    select endpoint_key,
           count(*)::int as snapshot_count,
           coalesce(sum(row_count), 0)::int as row_count,
           max(pulled_at)::text as latest_pulled_at
      from chanjet_read_snapshots
     group by endpoint_key
     order by endpoint_key
  `));
  const entityCoverageRows = runPsqlJson(sqlJson(`
    select entity_type,
           count(*)::int as entity_count,
           coalesce(sum(amount), 0)::numeric(18,2)::text as amount_sum,
           max(updated_at)::text as latest_updated_at
      from chanjet_entity_snapshots
     group by entity_type
     order by entity_type
  `));
  const jobRows = tableStatus.chanjet_sync_jobs
    ? runPsqlJson(sqlJson(`
        select coalesce(request_scope->>'key', '') as endpoint_key,
               status,
               error_message,
               created_at::text as created_at
          from chanjet_sync_jobs
         where job_type = 'SNAPSHOT'
         order by created_at desc
         limit 500
      `))
    : [];
  const rawByEndpoint = latestRowsByKey(rawCoverageRows, 'endpoint_key');
  const entityByType = latestRowsByKey(entityCoverageRows, 'entity_type');
  const jobByEndpoint = latestRowsByKey(jobRows.filter((row) => row.endpoint_key), 'endpoint_key');

  const endpointCoverage = EXPECTED_ENDPOINTS.map(([key, label, entityType]) => {
    const raw = rawByEndpoint.get(key) || {};
    const entity = entityByType.get(entityType) || {};
    const job = jobByEndpoint.get(key) || {};
    const covered = Number(raw.snapshot_count || 0) > 0 || Number(entity.entity_count || 0) > 0;
    return {
      key,
      label,
      entityType,
      covered,
      snapshotCount: Number(raw.snapshot_count || 0),
      rowCount: Number(raw.row_count || 0),
      entityCount: Number(entity.entity_count || 0),
      amountSum: Number(entity.amount_sum || 0),
      latestPulledAt: raw.latest_pulled_at || entity.latest_updated_at || '',
      latestJobStatus: tableStatus.chanjet_sync_jobs ? job.status || 'NOT_RUN' : 'UNAVAILABLE',
      latestJobError: job.error_message || '',
    };
  });

  const coveredEndpointKeys = new Set(endpointCoverage.filter((item) => item.covered).map((item) => item.key));
  const cardCoverage = CARD_DEFINITIONS.map(([cardKey, label, endpoints]) => {
    const covered = endpoints.every((key) => coveredEndpointKeys.has(key));
    return {
      cardKey,
      label,
      endpoints,
      covered,
      status: covered ? 'COVERED' : 'NEED_SYNC_OR_MAPPING',
      sourceRule: covered
        ? '好业财只读镜像优先；ERP 明细作为辅助差异。'
        : '暂缺好业财镜像，ERP 显示必须标注 ERP fallback / 待同步。',
    };
  });

  const fieldRows = runPsqlJson(sqlJson(`
    select match_status,
           risk_level,
           erp_domain,
           count(*)::int as count
      from chanjet_erp_field_mapping
     group by match_status, risk_level, erp_domain
     order by risk_level desc, count desc
  `));
  const fieldSummaryRows = runPsqlJson(sqlJson(`
    select count(*)::int as total,
           count(*) filter (where match_status = 'MATCHED')::int as matched,
           count(*) filter (where match_status = 'TRANSFORM_REQUIRED')::int as transform_required,
           count(*) filter (where match_status = 'MISSING_IN_ERP')::int as missing_in_erp,
           count(*) filter (where risk_level in ('HIGH','CRITICAL') and match_status <> 'MATCHED')::int as high_open,
           count(*) filter (where erp_domain = 'api_metadata')::int as api_metadata
      from chanjet_erp_field_mapping
  `));
  const fieldSummary = fieldSummaryRows[0] || {};
  const topGaps = runPsqlJson(sqlJson(`
    select chanjet_endpoint,
           chanjet_field_path,
           chanjet_type,
           erp_domain,
           erp_table,
           erp_field,
           erp_type,
           match_status,
           risk_level,
           left(coalesce(analysis_note, ''), 160) as analysis_note
      from chanjet_erp_field_mapping
     where match_status <> 'MATCHED'
       and erp_domain <> 'api_metadata'
     order by case risk_level when 'CRITICAL' then 4 when 'HIGH' then 3 when 'MEDIUM' then 2 else 1 end desc,
              chanjet_endpoint asc,
              chanjet_field_path asc
     limit 80
  `));
  const entitySummary = runPsqlJson(sqlJson(`
    select entity_type,
           count(*)::int as rows,
           count(distinct book_id)::int as books,
           coalesce(sum(amount), 0)::numeric(18,2)::text as amount_sum,
           max(updated_at)::text as latest_updated_at
      from chanjet_entity_snapshots
     group by entity_type
     order by entity_type asc
  `));

  const endpointCoverageRate = endpointCoverage.length
    ? endpointCoverage.filter((item) => item.covered).length / endpointCoverage.length
    : 0;
  const cardCoverageRate = cardCoverage.length
    ? cardCoverage.filter((item) => item.covered).length / cardCoverage.length
    : 0;
  const totalFields = Number(fieldSummary.total || 0);
  const coveredFields = Number(fieldSummary.matched || 0) + Number(fieldSummary.transform_required || 0);
  const fieldCoverageRate = totalFields ? coveredFields / totalFields : 0;

  const failedLatestJobs = endpointCoverage.filter((item) => item.latestJobStatus === 'FAIL');
  const missingEndpointKeys = endpointCoverage.filter((item) => !item.covered).map((item) => item.key);
  const highOpen = Number(fieldSummary.high_open || 0);
  const decision = endpointCoverageRate >= 0.9 && cardCoverageRate >= 0.9 && highOpen === 0
    ? 'GO'
    : 'GO_WITH_CONDITIONS';

  const nextTasks = [];
  if (missingEndpointKeys.length) {
    nextTasks.push({
      taskId: 'CHANJET-P0-READONLY-SYNC-GAPS',
      priority: 'P0',
      title: '补齐未覆盖的好业财只读端点',
      evidence: missingEndpointKeys.join(', '),
      owner: 'A3-Backend-Critical-Path + A5-Data-Readiness',
      allowedPaths: ['apps/api/src/modules/chanjet/**', 'docs/ops/**', 'scripts/ops/**'],
      forbiddenActions: ['write Chanjet', 'delete Chanjet data', 'modify Chanjet data', 'voucher push'],
    });
  }
  if (!tableStatus.chanjet_sync_jobs) {
    nextTasks.push({
      taskId: 'CHANJET-P1-SYNC-JOB-AUDIT-EVIDENCE',
      priority: 'P1',
      title: '补齐好业财同步任务审计证据或接入生产 job evidence',
      evidence: 'chanjet_sync_jobs unavailable in current local database',
      owner: 'A1-CI-Runtime-Gate + A3-Backend-Critical-Path',
      allowedPaths: ['docs/ops/**', 'scripts/ops/**', 'apps/api/src/modules/chanjet/**'],
      forbiddenActions: ['write Chanjet', 'run migration without a separate approved Gate'],
    });
  }
  if (highOpen > 0) {
    nextTasks.push({
      taskId: 'CHANJET-P0-HIGH-RISK-FIELD-MAPPING-REVIEW',
      priority: 'P0',
      title: '复核 HIGH/CRITICAL 字段映射并拆出 ERP 适配 Gate',
      evidence: `${highOpen} high/critical open field(s)`,
      owner: 'A2-Security-Regression-Gate + A5-Data-Readiness',
      allowedPaths: ['docs/ops/**', 'apps/api/src/modules/chanjet/**'],
      forbiddenActions: ['schema change without separate Gate', 'write Chanjet'],
    });
  }
  if (cardCoverageRate < 1) {
    nextTasks.push({
      taskId: 'CHANJET-P1-FINANCE-CARD-SOURCE-BADGES',
      priority: 'P1',
      title: '财务卡片继续补来源、差异与待同步状态',
      evidence: `cardCoverageRate=${pct(cardCoverageRate)}`,
      owner: 'A4-Frontend-UIUX-UAT + A1-CI-Runtime-Gate',
      allowedPaths: ['apps/web/src/app/(admin)/finance2/**', 'docs/ops/**'],
      forbiddenActions: ['hide mismatches', 'overwrite ERP detail'],
    });
  }

  return {
    generatedAt,
    decision,
    tableStatus,
    boundaries: boundaries(),
    coverage: {
      endpointCoverageRate,
      cardCoverageRate,
      fieldCoverageRate,
      missingEndpointKeys,
      failedLatestJobs: failedLatestJobs.map((item) => ({
        key: item.key,
        label: item.label,
        error: item.latestJobError,
      })),
    },
    fieldSummary: {
      totalFields,
      matched: Number(fieldSummary.matched || 0),
      transformRequired: Number(fieldSummary.transform_required || 0),
      missingInErp: Number(fieldSummary.missing_in_erp || 0),
      highOpen,
      apiMetadata: Number(fieldSummary.api_metadata || 0),
    },
    endpointCoverage,
    cardCoverage,
    entitySummary,
    fieldRiskSummary: fieldRows,
    topGaps,
    conditions,
    nextTasks,
    blockers: failedLatestJobs.map((item) => `${item.key}: ${item.latestJobError}`).filter(Boolean),
  };
}

function boundaries() {
  return {
    chanjetWrite: false,
    chanjetDelete: false,
    chanjetModify: false,
    voucherPush: false,
    erpBusinessTableWrite: false,
    migration: false,
    deploy: false,
    push: false,
  };
}

function writeReports(report) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, JSON.stringify(report, null, 2));

  const endpointRows = (report.endpointCoverage || []).map((row) => ({
    key: row.key,
    label: row.label,
    covered: row.covered ? 'yes' : 'no',
    snapshots: row.snapshotCount,
    rows: row.rowCount,
    entities: row.entityCount,
    job: row.latestJobStatus,
  }));
  const cardRows = (report.cardCoverage || []).map((row) => ({
    card: row.label,
    covered: row.covered ? 'yes' : 'no',
    status: row.status,
    endpoints: row.endpoints.join(', '),
  }));
  const gapRows = (report.topGaps || []).slice(0, 30).map((row) => ({
    endpoint: row.chanjet_endpoint,
    field: row.chanjet_field_path,
    type: row.chanjet_type,
    erp: [row.erp_domain, row.erp_table, row.erp_field].filter(Boolean).join('/'),
    risk: row.risk_level,
    status: row.match_status,
  }));
  const taskRows = (report.nextTasks || []).map((row) => ({
    priority: row.priority,
    task: row.taskId,
    title: row.title,
    owner: row.owner,
  }));

  const lines = [
    '# Chanjet Finance Alignment Audit',
    '',
    `Generated at: ${generatedAt}`,
    `Decision: ${report.decision}`,
    '',
    '## Boundaries',
    '',
    '- Chanjet write: no',
    '- Chanjet delete/modify: no',
    '- Voucher push: no',
    '- ERP business table write: no',
    '- Migration: no',
    '- Deploy / push: no',
    '',
    '## Conditions',
    '',
    ...((report.conditions || []).length ? report.conditions.map((condition) => `- ${condition}`) : ['- none']),
    '',
    '## Coverage Summary',
    '',
    `- Endpoint coverage: ${pct(report.coverage?.endpointCoverageRate)}`,
    `- Finance card coverage: ${pct(report.coverage?.cardCoverageRate)}`,
    `- Field coverage: ${pct(report.coverage?.fieldCoverageRate)}`,
    `- Missing endpoints: ${(report.coverage?.missingEndpointKeys || []).join(', ') || 'none'}`,
    `- High/Critical open fields: ${report.fieldSummary?.highOpen ?? 0}`,
    '',
    '## Endpoint Coverage',
    '',
    markdownTable(['key', 'label', 'covered', 'snapshots', 'rows', 'entities', 'job'], endpointRows),
    '',
    '## Finance Card Coverage',
    '',
    markdownTable(['card', 'covered', 'status', 'endpoints'], cardRows),
    '',
    '## Top Field Gaps',
    '',
    markdownTable(['endpoint', 'field', 'type', 'erp', 'risk', 'status'], gapRows),
    '',
    '## Next Improvement Tasks',
    '',
    markdownTable(['priority', 'task', 'title', 'owner'], taskRows),
    '',
  ];
  writeFileSync(outputMd, lines.join('\n'));
}

try {
  const report = buildReport();
  writeReports(report);
  console.log(JSON.stringify({
    decision: report.decision,
    endpointCoverage: pct(report.coverage?.endpointCoverageRate),
    cardCoverage: pct(report.coverage?.cardCoverageRate),
    fieldCoverage: pct(report.coverage?.fieldCoverageRate),
    highOpen: report.fieldSummary?.highOpen ?? 0,
    nextTasks: (report.nextTasks || []).map((task) => task.taskId),
    outputJson,
    outputMd,
  }, null, 2));
  if (report.decision === 'HOLD' || report.decision === 'FAIL') process.exitCode = 2;
} catch (error) {
  const report = {
    generatedAt,
    decision: 'FAIL',
    error: error?.stack || String(error),
    boundaries: boundaries(),
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, JSON.stringify(report, null, 2));
  writeFileSync(outputMd, `# Chanjet Finance Alignment Audit\n\nDecision: FAIL\n\n\`\`\`\n${report.error}\n\`\`\`\n`);
  console.error(report.error);
  process.exit(1);
}
