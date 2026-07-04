#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};

const outputDir = getArg('--output-dir', 'docs/ops/runs');
const syncJsonPath = getArg('--sync-json', 'docs/ops/runs/chanjet-readonly-mirror-sync-latest.json');
const masterJsonPath = getArg('--master-json', 'docs/ops/runs/chanjet-master-data-alignment-latest.json');
const outputJson = join(outputDir, 'chanjet-reconciliation-center-latest.json');
const outputMd = join(outputDir, 'chanjet-reconciliation-center-latest.md');

function readJson(path, required = true) {
  if (!existsSync(path)) {
    if (required) throw new Error(`Missing required input: ${path}`);
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function endpoint(coverage, key) {
  return (coverage?.coverage?.endpointCoverage || []).find((item) => item.key === key) || null;
}

function amount(coverage, key) {
  const item = endpoint(coverage, key);
  return item ? Number(item.amountSum || 0) : null;
}

function rows(coverage, key) {
  const item = endpoint(coverage, key);
  return item ? Number(item.entityCount || item.rowCount || 0) : 0;
}

function latest(coverage, key) {
  return endpoint(coverage, key)?.latestPulledAt || null;
}

function item({
  key,
  label,
  priority,
  endpointKeys,
  entityTypes,
  chanjetValue,
  erpValue,
  status,
  reason,
  action,
  chanjetRows,
  latestPulledAt,
}) {
  const diff = chanjetValue !== null && erpValue !== null ? chanjetValue - erpValue : null;
  const base = Math.max(Math.abs(chanjetValue ?? 0), Math.abs(erpValue ?? 0), 1);
  return {
    key,
    label,
    priority,
    chanjetEndpointKeys: endpointKeys,
    chanjetEntityTypes: entityTypes,
    chanjetValue,
    erpValue,
    diff,
    diffRate: diff === null ? null : Math.abs(diff) / base,
    status,
    evidence: {
      chanjetRows,
      latestPulledAt,
      erpRows: null,
      erpEvidence: 'not queried by artifact-only audit',
    },
    reason,
    recommendedAction: action,
  };
}

function main() {
  mkdirSync(outputDir, { recursive: true });
  const sync = readJson(syncJsonPath);
  const master = readJson(masterJsonPath, false);
  const coverage = sync.coverage || {};

  const items = [
    item({
      key: 'AR_OPEN',
      label: '应收待收',
      priority: 'P0',
      endpointKeys: ['RECEIVABLE_STATISTICS'],
      entityTypes: ['AR_STATISTICS'],
      chanjetValue: amount(sync, 'RECEIVABLE_STATISTICS'),
      erpValue: null,
      status: 'NEED_MAPPING',
      reason: '好业财应收统计已同步，但 artifact-only 审计不查询 ERP 业务表；进入运行时对账接口后再拆 ERP 差异。',
      action: '用运行时 API /api/chanjet/integration/finance-reconciliation 拆解 ERP vs 好业财差异。',
      chanjetRows: rows(sync, 'RECEIVABLE_STATISTICS'),
      latestPulledAt: latest(sync, 'RECEIVABLE_STATISTICS'),
    }),
    item({
      key: 'AP_OPEN',
      label: '应付待付',
      priority: 'P0',
      endpointKeys: ['PAYABLE_STATISTICS'],
      entityTypes: ['AP_STATISTICS'],
      chanjetValue: amount(sync, 'PAYABLE_STATISTICS'),
      erpValue: null,
      status: 'NEED_MAPPING',
      reason: '好业财应付统计已同步，但 artifact-only 审计不查询 ERP 业务表；进入运行时对账接口后再拆 ERP 差异。',
      action: '用运行时 API /api/chanjet/integration/finance-reconciliation 拆解 ERP vs 好业财差异。',
      chanjetRows: rows(sync, 'PAYABLE_STATISTICS'),
      latestPulledAt: latest(sync, 'PAYABLE_STATISTICS'),
    }),
    item({
      key: 'CASH_BALANCE',
      label: '现金 / 银行余额',
      priority: 'P0',
      endpointKeys: ['FIN_ACCOUNT', 'GL_BALANCE'],
      entityTypes: ['CASH_ACCOUNT', 'GL_BALANCE'],
      chanjetValue: amount(sync, 'FIN_ACCOUNT'),
      erpValue: null,
      status: 'NEED_MAPPING',
      reason: '资金账号镜像已同步，但余额字段尚未证明已被抽取为标准 amount；不得把 0 当真实余额。',
      action: '优先解析资金账号 rawData 中余额字段，并对齐 ERP fin_cash_accounts。',
      chanjetRows: rows(sync, 'FIN_ACCOUNT'),
      latestPulledAt: latest(sync, 'FIN_ACCOUNT'),
    }),
    item({
      key: 'TODAY_RECEIPT',
      label: '今日收款',
      priority: 'P0',
      endpointKeys: ['PAYMENT_AR'],
      entityTypes: ['AR_RECEIPT'],
      chanjetValue: amount(sync, 'PAYMENT_AR'),
      erpValue: null,
      status: 'NEED_MANUAL_REVIEW',
      reason: '收款单 amountSum 是列表累计金额，不等同今日收款。',
      action: '锁定业务日/入账日/审核状态过滤规则后，再允许影响今日收款卡片。',
      chanjetRows: rows(sync, 'PAYMENT_AR'),
      latestPulledAt: latest(sync, 'PAYMENT_AR'),
    }),
    item({
      key: 'TODAY_PAYMENT',
      label: '今日付款',
      priority: 'P0',
      endpointKeys: ['PAYMENT_AP'],
      entityTypes: ['AP_PAYMENT'],
      chanjetValue: amount(sync, 'PAYMENT_AP'),
      erpValue: null,
      status: 'NEED_MANUAL_REVIEW',
      reason: '付款单 amountSum 是列表累计金额，不等同今日付款。',
      action: '锁定业务日/入账日/审核状态过滤规则后，再允许影响今日付款卡片。',
      chanjetRows: rows(sync, 'PAYMENT_AP'),
      latestPulledAt: latest(sync, 'PAYMENT_AP'),
    }),
    item({
      key: 'SUBJECT_BALANCE',
      label: '科目余额',
      priority: 'P0',
      endpointKeys: ['GL_BALANCE'],
      entityTypes: ['GL_BALANCE'],
      chanjetValue: amount(sync, 'GL_BALANCE'),
      erpValue: null,
      status: 'NEED_MAPPING',
      reason: '科目余额表已同步，但期初、本期借贷、期末余额字段尚未拆成可比口径。',
      action: '建立科目余额字段映射，按科目编码、期间、借贷方向出对账行。',
      chanjetRows: rows(sync, 'GL_BALANCE'),
      latestPulledAt: latest(sync, 'GL_BALANCE'),
    }),
    item({
      key: 'BALANCE_SHEET',
      label: '资产负债表关键项',
      priority: 'P0',
      endpointKeys: ['BALANCE_SHEET'],
      entityTypes: ['BALANCE_SHEET'],
      chanjetValue: amount(sync, 'BALANCE_SHEET'),
      erpValue: null,
      status: 'NEED_MAPPING',
      reason: '资产负债表已同步，但项目行、行次、年初/期末金额尚未语义映射。',
      action: '建立报表项目字段映射，禁止把 amountSum=0 当成报表为 0。',
      chanjetRows: rows(sync, 'BALANCE_SHEET'),
      latestPulledAt: latest(sync, 'BALANCE_SHEET'),
    }),
    item({
      key: 'INCOME_STATEMENT',
      label: '利润表关键项',
      priority: 'P0',
      endpointKeys: ['INCOME_STATEMENT'],
      entityTypes: ['INCOME_STATEMENT'],
      chanjetValue: amount(sync, 'INCOME_STATEMENT'),
      erpValue: null,
      status: 'NEED_MAPPING',
      reason: '利润表已同步，但收入、成本、费用、利润行项目尚未语义映射。',
      action: '建立利润表字段映射后，才能让 ERP 经营驾驶舱显示好业财利润口径。',
      chanjetRows: rows(sync, 'INCOME_STATEMENT'),
      latestPulledAt: latest(sync, 'INCOME_STATEMENT'),
    }),
  ];

  const statusCounts = items.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const p0Open = items.filter((row) => row.priority === 'P0' && !['OK', 'WARN'].includes(row.status)).length;
  const result = {
    generatedAt: new Date().toISOString(),
    decision: p0Open > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
    sourceArtifacts: {
      syncJsonPath,
      masterJsonPath: existsSync(masterJsonPath) ? masterJsonPath : null,
      syncDecision: sync.decision || '',
      masterDecision: master?.decision || '',
    },
    summary: {
      endpointCoverageRate: coverage.summary?.endpointCoverageRate ?? null,
      cardCoverageRate: coverage.summary?.cardCoverageRate ?? null,
      fieldCoverageRate: coverage.summary?.fieldCoverageRate ?? null,
      totalItems: items.length,
      p0Open,
      ok: statusCounts.OK || 0,
      warn: statusCounts.WARN || 0,
      mismatch: statusCounts.MISMATCH || 0,
      needMapping: statusCounts.NEED_MAPPING || 0,
      needManualReview: statusCounts.NEED_MANUAL_REVIEW || 0,
      hold: statusCounts.HOLD || 0,
      nextGate: 'CHANJET_P3_RECONCILIATION_CENTER_UI',
    },
    items,
    guardrails: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      voucherPush: false,
      erpBusinessOverwrite: false,
      migration: false,
      deploy: false,
    },
  };

  const md = [
    '# Chanjet P3 Reconciliation Center Audit',
    '',
    `- Generated at: ${result.generatedAt}`,
    `- Decision: ${result.decision}`,
    `- Endpoint coverage: ${Math.round((result.summary.endpointCoverageRate || 0) * 100)}%`,
    `- Card coverage: ${Math.round((result.summary.cardCoverageRate || 0) * 100)}%`,
    `- P0 open items: ${result.summary.p0Open}`,
    `- Chanjet write: false`,
    '',
    '| Item | Status | Chanjet value | Rows | Action |',
    '| --- | --- | ---: | ---: | --- |',
    ...items.map((row) => `| ${row.label} | ${row.status} | ${row.chanjetValue ?? 'N/A'} | ${row.evidence.chanjetRows} | ${row.recommendedAction} |`),
    '',
    '## Notes',
    '',
    '- This audit is artifact-first and does not query production databases.',
    '- Runtime ERP-vs-Chanjet differences are exposed by `/api/chanjet/integration/finance-reconciliation`.',
    '- Payment list totals and statement zero amount sums are intentionally marked as review/mapping items, not as final card numbers.',
    '',
  ].join('\n');

  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(outputMd, md);
  console.log(JSON.stringify({
    decision: result.decision,
    p0Open: result.summary.p0Open,
    needMapping: result.summary.needMapping,
    needManualReview: result.summary.needManualReview,
    outputJson,
    outputMd,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error((error).stack || (error).message);
  process.exit(1);
}
