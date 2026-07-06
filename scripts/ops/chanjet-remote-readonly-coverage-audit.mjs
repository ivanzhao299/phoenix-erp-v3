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

const host = getArg('--host', '47.236.122.224');
const user = getArg('--user', 'ops');
const deployPath = getArg('--deploy-path', '/opt/phoenix-erp');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const generatedAt = new Date().toISOString();
const outputJson = join(outputDir, 'chanjet-remote-readonly-coverage-audit-latest.json');
const outputMd = join(outputDir, 'chanjet-remote-readonly-coverage-audit-latest.md');
const localAuditJson = join(outputDir, 'chanjet-finance-alignment-audit-latest.json');

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

function loadLocalAuditCoverage() {
  if (!existsSync(localAuditJson)) return null;
  try {
    const audit = JSON.parse(readFileSync(localAuditJson, 'utf8'));
    return {
      decision: audit.decision,
      endpointCoverageRate: Number(audit.coverage?.endpointCoverageRate || 0),
      cardCoverageRate: Number(audit.coverage?.cardCoverageRate || 0),
      fieldCoverageRate: Number(audit.coverage?.fieldCoverageRate || 0),
    };
  } catch {
    return null;
  }
}

function remoteSqlScript() {
  return String.raw`
set -euo pipefail
DEPLOY_PATH="$1"
cd "$DEPLOY_PATH"
docker compose exec -T db sh -s <<'DBSH'
set -e
DB_USER_ARG="phoenix_v3"
DB_NAME_ARG="phoenix_erp"
psql -U "$DB_USER_ARG" -d "$DB_NAME_ARG" -At <<'SQL'
select 'IDENTITY	' || jsonb_build_object('database', current_database(), 'user', current_user, 'now', now())::text;
select 'TABLES	' || jsonb_build_object(
  'chanjet_read_snapshots', coalesce(to_regclass('public.chanjet_read_snapshots')::text, ''),
  'chanjet_entity_snapshots', coalesce(to_regclass('public.chanjet_entity_snapshots')::text, ''),
  'chanjet_erp_field_mapping', coalesce(to_regclass('public.chanjet_erp_field_mapping')::text, ''),
  'chanjet_sync_jobs', coalesce(to_regclass('public.chanjet_sync_jobs')::text, '')
)::text;
select 'COUNTS	' || jsonb_build_object(
  'read_snapshots', (select count(*) from chanjet_read_snapshots),
  'entity_snapshots', (select count(*) from chanjet_entity_snapshots),
  'field_mapping', (select count(*) from chanjet_erp_field_mapping)
)::text;
with expected(endpoint_key, label, entity_type) as (
  values
    ('ACCOUNT_BOOKS','账套列表','ACCOUNT_BOOK'),
    ('DEPARTMENT','部门列表','DEPARTMENT'),
    ('CUSTOMER_SUPPLIER','往来单位','CUSTOMER_SUPPLIER'),
    ('SUBJECT','科目列表','SUBJECT'),
    ('PROJECT','项目列表','PROJECT'),
    ('FIN_ACCOUNT','资金账户','CASH_ACCOUNT'),
    ('PAYABLE_STATISTICS','应付统计','AP_STATISTICS'),
    ('RECEIVABLE_STATISTICS','应收统计','AR_STATISTICS'),
    ('PAYMENT_AP','付款单','AP_PAYMENT'),
    ('PAYMENT_AR','收款单','AR_RECEIPT'),
    ('PURCHASE_ORDER','采购订单','PURCHASE_ORDER'),
    ('VOUCHER_SEARCH','凭证列表','VOUCHER'),
    ('GL_BALANCE','科目余额表','GL_BALANCE'),
    ('BALANCE_SHEET','资产负债表','BALANCE_SHEET'),
    ('INCOME_STATEMENT','利润表','INCOME_STATEMENT'),
    ('CASH_FLOW','现金流量表','CASH_FLOW')
),
raw as (
  select endpoint_key, count(*)::int snapshot_count, coalesce(sum(row_count),0)::int row_count, max(pulled_at)::text latest_pulled_at
  from chanjet_read_snapshots
  group by endpoint_key
),
entity as (
  select entity_type, count(*)::int entity_count, coalesce(sum(amount),0)::numeric(18,2)::text amount_sum, max(updated_at)::text latest_updated_at
  from chanjet_entity_snapshots
  group by entity_type
)
select 'ENDPOINTS	' || coalesce(jsonb_agg(jsonb_build_object(
  'key', e.endpoint_key,
  'label', e.label,
  'entityType', e.entity_type,
  'snapshotCount', coalesce(raw.snapshot_count, 0),
  'rowCount', coalesce(raw.row_count, 0),
  'entityCount', coalesce(entity.entity_count, 0),
  'amountSum', coalesce(entity.amount_sum, '0'),
  'latestPulledAt', coalesce(raw.latest_pulled_at, entity.latest_updated_at, ''),
  'covered', coalesce(raw.snapshot_count, 0) > 0 or coalesce(entity.entity_count, 0) > 0
) order by e.endpoint_key), '[]'::jsonb)::text
from expected e
left join raw on raw.endpoint_key = e.endpoint_key
left join entity on entity.entity_type = e.entity_type;
select 'FIELDS	' || coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)::text
from (
  select match_status, risk_level, count(*)::int as count
  from chanjet_erp_field_mapping
  group by match_status, risk_level
  order by risk_level desc, count desc
) t;
select 'ENTITY_SUMMARY	' || coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)::text
from (
  select entity_type,
         count(*)::int as rows,
         count(distinct book_id)::int as books,
         coalesce(sum(amount),0)::numeric(18,2)::text as amount_sum,
         max(updated_at)::text as latest_updated_at
  from chanjet_entity_snapshots
  group by entity_type
  order by entity_type
) t;
select 'TOP_GAPS	' || coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)::text
from (
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
) t;
SQL
DBSH
`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function runRemoteReadOnly() {
  const result = spawnSync('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=20',
    `${user}@${host}`,
    `bash -s -- ${shellQuote(deployPath)}`,
  ], {
    input: remoteSqlScript(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 90_000,
  });
  if (result.status !== 0) {
    const timeoutHint = result.error?.code === 'ETIMEDOUT' ? 'remote readonly audit timed out after 90s' : '';
    throw new Error([timeoutHint, result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'remote readonly audit failed');
  }
  const sections = {};
  for (const line of (result.stdout || '').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const key = line.slice(0, tab);
    const value = line.slice(tab + 1);
    sections[key] = JSON.parse(value);
  }
  return sections;
}

function buildReport(remote) {
  const endpointCoverage = (remote.ENDPOINTS || []).map((item) => ({
    ...item,
    snapshotCount: Number(item.snapshotCount || 0),
    rowCount: Number(item.rowCount || 0),
    entityCount: Number(item.entityCount || 0),
    amountSum: Number(item.amountSum || 0),
    covered: Boolean(item.covered),
  }));
  const coveredEndpointKeys = new Set(endpointCoverage.filter((item) => item.covered).map((item) => item.key));
  const cardCoverage = CARD_DEFINITIONS.map(([cardKey, label, endpoints]) => ({
    cardKey,
    label,
    endpoints,
    covered: endpoints.every((key) => coveredEndpointKeys.has(key)),
  }));
  const endpointCoverageRate = endpointCoverage.length
    ? endpointCoverage.filter((item) => item.covered).length / endpointCoverage.length
    : 0;
  const cardCoverageRate = cardCoverage.length
    ? cardCoverage.filter((item) => item.covered).length / cardCoverage.length
    : 0;
  const fieldRows = remote.FIELDS || [];
  const totalFields = fieldRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const matchedFields = fieldRows
    .filter((row) => row.match_status === 'MATCHED' || row.match_status === 'TRANSFORM_REQUIRED')
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  const highOpen = fieldRows
    .filter((row) => ['HIGH', 'CRITICAL'].includes(String(row.risk_level)) && row.match_status !== 'MATCHED')
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
  const fieldClassificationRate = totalFields ? matchedFields / totalFields : 0;
  const localAuditCoverage = loadLocalAuditCoverage();
  const localRemoteMismatch = localAuditCoverage
    ? localAuditCoverage.endpointCoverageRate < 0.5 && endpointCoverageRate >= 0.9
    : false;
  const nextTasks = [];
  if (highOpen > 0) {
    nextTasks.push({
      taskId: 'CHANJET-FIELD-GAP-REVIEW-GATE',
      priority: 'P0',
      title: '把 HIGH/CRITICAL 字段映射从 PENDING 拆成 ERP 字段适配或人工确认清单',
    });
  }
  if (localRemoteMismatch) {
    nextTasks.push({
      taskId: 'CHANJET-LOCAL-PROD-MIRROR-STATE-RECONCILE',
      priority: 'P0',
      title: '把本地/生产好业财镜像审计口径拆开，避免本地 0 覆盖误判生产已同步状态',
    });
  }
  if (cardCoverageRate >= 0.9) {
    nextTasks.push({
      taskId: 'CHANJET-FINANCE-CARD-AUTHORITY-VERIFY',
      priority: 'P1',
      title: '逐卡复核 AUTHORITY_READY 语义锁，允许好业财权威口径的卡片升权',
    });
  }
  return {
    generatedAt,
    decision: endpointCoverageRate >= 0.9 ? 'GO_WITH_CONDITIONS' : 'HOLD',
    remote: { host, user, deployPath },
    boundaries: {
      remoteReadOnly: true,
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      voucherPush: false,
      erpDbWrite: false,
      deploy: false,
      push: false,
    },
    identity: remote.IDENTITY,
    tableStatus: remote.TABLES,
    counts: remote.COUNTS,
    coverage: {
      endpointCoverageRate,
      cardCoverageRate,
      fieldClassificationRate,
      highOpen,
      localAuditCoverage,
      localRemoteMismatch,
    },
    endpointCoverage,
    cardCoverage,
    fieldRiskSummary: fieldRows,
    entitySummary: remote.ENTITY_SUMMARY || [],
    topGaps: remote.TOP_GAPS || [],
    conditions: [
      '生产端好业财只读镜像已覆盖 P0 端点，但 HIGH/CRITICAL 字段映射仍有大量 PENDING，不能直接静默升权所有 ERP 财务卡片。',
      '本脚本只读生产中间层镜像表，不写好业财、不写 ERP DB、不部署、不推送。',
      localRemoteMismatch
        ? '本地数据库镜像覆盖率为 0，生产端覆盖率已达标；后续审计必须区分 local runtime 与 production mirror evidence。'
        : '本地与生产镜像覆盖未发现明显冲突。',
    ],
    nextTasks,
  };
}

function writeReports(report) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, JSON.stringify(report, null, 2));

  const endpointRows = report.endpointCoverage.map((row) => ({
    key: row.key,
    label: row.label,
    covered: row.covered ? 'yes' : 'no',
    snapshots: row.snapshotCount,
    rows: row.rowCount,
    entities: row.entityCount,
  }));
  const entityRows = report.entitySummary.map((row) => ({
    entity: row.entity_type,
    rows: row.rows,
    books: row.books,
    amount: row.amount_sum,
    latest: row.latest_updated_at,
  }));
  const fieldRows = report.fieldRiskSummary.map((row) => ({
    status: row.match_status,
    risk: row.risk_level,
    count: row.count,
  }));
  const gapRows = report.topGaps.slice(0, 30).map((row) => ({
    endpoint: row.chanjet_endpoint,
    field: row.chanjet_field_path,
    erp: [row.erp_domain, row.erp_table, row.erp_field].filter(Boolean).join('/'),
    risk: row.risk_level,
    status: row.match_status,
  }));
  const taskRows = report.nextTasks.map((row) => ({
    priority: row.priority,
    task: row.taskId,
    title: row.title,
  }));

  const lines = [
    '# Chanjet Remote Readonly Coverage Audit',
    '',
    `Generated at: ${generatedAt}`,
    `Decision: ${report.decision}`,
    '',
    '## Scope',
    '',
    `- Remote: ${user}@${host}:${deployPath}`,
    '- Mode: production middle-layer read-only audit',
    '- Chanjet write/delete/modify: no',
    '- ERP DB write: no',
    '- Deploy / push: no',
    '',
    '## Coverage',
    '',
    `- Endpoint coverage: ${pct(report.coverage.endpointCoverageRate)}`,
    `- Finance card dependency coverage: ${pct(report.coverage.cardCoverageRate)}`,
    `- Field classification coverage: ${pct(report.coverage.fieldClassificationRate)}`,
    `- High/Critical open fields: ${report.coverage.highOpen}`,
    `- Local/remote mismatch: ${report.coverage.localRemoteMismatch ? 'yes' : 'no'}`,
    '',
    '## Endpoint Coverage',
    '',
    markdownTable(['key', 'label', 'covered', 'snapshots', 'rows', 'entities'], endpointRows),
    '',
    '## Entity Summary',
    '',
    markdownTable(['entity', 'rows', 'books', 'amount', 'latest'], entityRows),
    '',
    '## Field Risk Summary',
    '',
    markdownTable(['status', 'risk', 'count'], fieldRows),
    '',
    '## Top Gaps',
    '',
    markdownTable(['endpoint', 'field', 'erp', 'risk', 'status'], gapRows),
    '',
    '## Next Tasks',
    '',
    markdownTable(['priority', 'task', 'title'], taskRows),
    '',
  ];
  writeFileSync(outputMd, lines.join('\n'));
}

try {
  const remote = runRemoteReadOnly();
  const report = buildReport(remote);
  writeReports(report);
  console.log(JSON.stringify({
    decision: report.decision,
    endpointCoverage: pct(report.coverage.endpointCoverageRate),
    cardCoverage: pct(report.coverage.cardCoverageRate),
    fieldClassification: pct(report.coverage.fieldClassificationRate),
    highOpen: report.coverage.highOpen,
    nextTasks: report.nextTasks.map((task) => task.taskId),
    outputJson,
    outputMd,
  }, null, 2));
  if (report.decision === 'HOLD' || report.decision === 'FAIL') process.exitCode = 2;
} catch (error) {
  const previous = existsSync(outputJson)
    ? (() => {
      try {
        const parsed = JSON.parse(readFileSync(outputJson, 'utf8'));
        return parsed?.decision !== 'FAIL' ? parsed : null;
      } catch {
        return null;
      }
    })()
    : null;
  const report = {
    generatedAt,
    decision: previous ? 'HOLD_WITH_PREVIOUS_EVIDENCE' : 'FAIL',
    error: error?.stack || String(error),
    previousEvidence: previous
      ? {
        generatedAt: previous.generatedAt,
        decision: previous.decision,
        endpointCoverageRate: previous.coverage?.endpointCoverageRate,
        cardCoverageRate: previous.coverage?.cardCoverageRate,
        highOpen: previous.coverage?.highOpen,
      }
      : null,
    boundaries: {
      remoteReadOnly: true,
      chanjetWrite: false,
      erpDbWrite: false,
      deploy: false,
      push: false,
    },
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, JSON.stringify(report, null, 2));
  writeFileSync(outputMd, `# Chanjet Remote Readonly Coverage Audit\n\nDecision: ${report.decision}\n\n${previous ? `Previous evidence: ${previous.generatedAt}, endpoint coverage ${pct(previous.coverage?.endpointCoverageRate)}, card coverage ${pct(previous.coverage?.cardCoverageRate)}, high open ${previous.coverage?.highOpen}\n\n` : ''}\`\`\`\n${report.error}\n\`\`\`\n`);
  console.error(report.error);
  process.exit(1);
}
