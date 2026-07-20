#!/usr/bin/env node

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
const syncJsonPath = getArg('--sync-json', 'docs/ops/runs/chanjet-readonly-mirror-sync-latest.json');
const fieldJsonPath = getArg('--field-json', 'docs/ops/runs/chanjet-field-mapping-report-latest.json');
const generatedAt = new Date().toISOString();
const outputJson = join(outputDir, 'chanjet-master-data-alignment-latest.json');
const outputMd = join(outputDir, 'chanjet-master-data-alignment-latest.md');

const DOMAINS = [
  {
    key: 'COMPANY_BOOK',
    title: '公司 / 账套',
    priority: 'P0',
    endpoints: ['ACCOUNT_BOOKS'],
    erpTargets: ['sys_organizations.company_code', 'chanjet_book_company_map.bookid'],
    fieldDomains: ['company'],
    rule: '账套和 ERP 公司必须由审核态映射绑定，不能按名称自动覆盖公司档案。',
  },
  {
    key: 'COUNTERPARTY',
    title: '客户 / 供应商 / 往来单位',
    priority: 'P0',
    endpoints: ['CUSTOMER_SUPPLIER', 'RECEIVABLE_STATISTICS', 'PAYABLE_STATISTICS'],
    erpTargets: ['sal_customers.customer_code', 'prc2_suppliers.supplier_code', 'chanjet_master_mapping.CUSTOMER/SUPPLIER'],
    fieldDomains: ['counterparty'],
    rule: '必须区分客户、供应商和双重身份；好业财汇总数据不得写入 fin_ar_invoices。',
  },
  {
    key: 'SUBJECT',
    title: '会计科目',
    priority: 'P0',
    endpoints: ['SUBJECT', 'GL_BALANCE', 'BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'],
    erpTargets: ['chanjet_master_mapping.SUBJECT', 'finance-v2 reporting adapter'],
    fieldDomains: ['accounting', 'finance'],
    rule: '财务科目口径以好业财为准，ERP 做只读引用、映射和差异展示。',
  },
  {
    key: 'PROJECT',
    title: '项目',
    priority: 'P0',
    endpoints: ['PROJECT', 'PURCHASE_ORDER'],
    erpTargets: ['biz_projects.project_code', 'sys_user_projects'],
    fieldDomains: ['project'],
    rule: '项目映射影响采购付款和费用归属，未审核前只能用于对账提示。',
  },
  {
    key: 'CASH_ACCOUNT',
    title: '资金账户',
    priority: 'P0',
    endpoints: ['FIN_ACCOUNT', 'PAYMENT_AP', 'PAYMENT_AR'],
    erpTargets: ['fin_cash_accounts.account_code'],
    fieldDomains: ['finance', 'accounting'],
    rule: '现金/银行余额以好业财只读镜像优先，ERP 现金流水作为辅助明细。',
  },
  {
    key: 'DEPARTMENT_ORG',
    title: '部门 / 组织',
    priority: 'P1',
    endpoints: ['DEPARTMENT'],
    erpTargets: ['sys_organizations.organization_code', 'sys_user_orgs'],
    fieldDomains: ['organization'],
    rule: '部门映射影响 DataScope，只能在人工审核后进入权限和数据域使用。',
  },
  {
    key: 'CURRENCY',
    title: '币种',
    priority: 'P1',
    endpoints: ['FIN_ACCOUNT', 'PAYMENT_AP', 'PAYMENT_AR'],
    erpTargets: ['sys_dict.SYS_CURRENCY'],
    fieldDomains: ['currency', 'finance'],
    rule: '币种必须映射到 SYS_CURRENCY；本币、原币和汇率不能混用。',
  },
];

function readJson(path, fallback = null) {
  if (!existsSync(path)) {
    if (fallback !== null) return fallback;
    throw new Error(`Required input missing: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function pct(value) {
  return `${Math.round(Number(value || 0) * 1000) / 10}%`;
}

function endpointMap(syncReport) {
  const rows = syncReport.coverage?.endpointCoverage || [];
  return new Map(rows.map((row) => [row.key, row]));
}

function relevantFieldRows(fieldReport, domain) {
  const rows = [
    ...(fieldReport.topOpenFields || []),
    ...(fieldReport.domainRiskSummary || []),
  ];
  return rows.filter((row) => {
    if (row.erp_domain && domain.fieldDomains.includes(row.erp_domain)) return true;
    const endpoint = String(row.chanjet_endpoint || '');
    return domain.endpoints.some((key) => endpoint.toLowerCase().includes(key.toLowerCase()));
  });
}

function fieldSummary(fieldReport, domain) {
  const rows = relevantFieldRows(fieldReport, domain);
  const summary = {
    sampledOpenFields: rows.filter((row) => row.chanjet_field_path).length,
    highOpenFields: 0,
    transformRequired: 0,
    pendingFields: 0,
    matchedFields: 0,
    sampleFields: [],
  };
  for (const row of rows) {
    const count = Number(row.count || 1);
    if (['HIGH', 'CRITICAL'].includes(row.risk_level) && row.match_status !== 'MATCHED') summary.highOpenFields += count;
    if (row.match_status === 'TRANSFORM_REQUIRED') summary.transformRequired += count;
    if (row.match_status === 'PENDING') summary.pendingFields += count;
    if (row.match_status === 'MATCHED') summary.matchedFields += count;
    if (row.chanjet_field_path && summary.sampleFields.length < 8) {
      summary.sampleFields.push({
        endpoint: row.chanjet_endpoint,
        field: row.chanjet_field_path,
        chanjetType: row.chanjet_type,
        erpTarget: [row.erp_table, row.erp_field].filter(Boolean).join('.'),
        risk: row.risk_level,
        status: row.match_status,
      });
    }
  }
  return summary;
}

function domainStatus(mirrorReady, fields, priority) {
  if (!mirrorReady) return 'WAITING_MIRROR_SYNC';
  if (fields.highOpenFields > 0 && priority === 'P0') return 'NEED_REVIEW';
  if (fields.transformRequired > 0) return 'NEED_TRANSFORM_RULE';
  return 'READY_FOR_MAPPING_REVIEW';
}

function nextAction(status, domainKey) {
  if (status === 'WAITING_MIRROR_SYNC') return '先补齐只读同步，不得写好业财。';
  if (status === 'NEED_TRANSFORM_RULE') return '固化字段类型转换规则，尤其金额、期间、编码和状态。';
  if (domainKey === 'COUNTERPARTY') return '优先做客户/供应商/双重身份审核映射，解决往来余额对齐。';
  if (domainKey === 'SUBJECT') return '优先固化科目编码、层级、余额方向和三大报表字段口径。';
  if (domainKey === 'CASH_ACCOUNT') return '优先核对资金账户、币种、余额来源和启停状态。';
  return '进入人工映射复核，APPROVED 前不得用于写回或自动覆盖。';
}

function table(headers, rows) {
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
  const domainRows = report.domains.map((domain) => ({
    priority: domain.priority,
    domain: domain.title,
    status: domain.status,
    rows: domain.mirror.rowCount,
    entities: domain.mirror.entityCount,
    high: domain.fieldGaps.highOpenFields,
    action: domain.recommendedAction,
  }));
  const lines = [
    '# Chanjet P2 Master Data Alignment Audit',
    '',
    `Generated at: ${generatedAt}`,
    `Decision: ${report.decision}`,
    '',
    '## Boundaries',
    '',
    '- Chanjet write: no',
    '- Chanjet delete / modify: no',
    '- Voucher push: no',
    '- ERP business table overwrite: no',
    '- Migration: no',
    '',
    '## Summary',
    '',
    `- Mirror domain coverage: ${pct(report.summary.mirrorCoverageRate)}`,
    `- P0 domains needing review: ${report.summary.p0NeedReview}`,
    `- Total Chanjet mirror rows in scoped domains: ${report.summary.totalMirrorRows}`,
    `- Field mapping candidates: ${report.summary.fieldMappingTotal}`,
    `- Pending semantic mappings: ${report.summary.pendingSemanticMappings}`,
    '',
    '## Domain Status',
    '',
    table(['priority', 'domain', 'status', 'rows', 'entities', 'high', 'action'], domainRows),
    '',
    '## Next Gate',
    '',
    '1. `CHANJET_P2_MASTER_DATA_MAPPING_REVIEW`: review P0 domains in this order: counterparty, subject, cash account, project, company/book.',
    '2. `CHANJET_P3_RECONCILIATION_CENTER`: create visible OK/WARN/MISMATCH/HOLD/NEED_MAPPING rows for ERP vs Chanjet.',
    '3. Keep Chanjet write-back disabled until a later P4 approval gate.',
    '',
  ];
  writeFileSync(outputMd, lines.join('\n'));
}

function main() {
  const syncReport = readJson(syncJsonPath);
  const fieldReport = readJson(fieldJsonPath, { summary: {}, topOpenFields: [], domainRiskSummary: [] });
  const endpoints = endpointMap(syncReport);
  const domains = DOMAINS.map((domain) => {
    const endpointRows = domain.endpoints.map((key) => endpoints.get(key)).filter(Boolean);
    const rowCount = endpointRows.reduce((sum, row) => sum + Number(row.rowCount || 0), 0);
    const entityCount = endpointRows.reduce((sum, row) => sum + Number(row.entityCount || 0), 0);
    const mirrorReady = endpointRows.length > 0 && endpointRows.every((row) => row.covered);
    const latestPulledAt = endpointRows
      .map((row) => row.latestPulledAt)
      .filter(Boolean)
      .sort()
      .at(-1) || '';
    const gaps = fieldSummary(fieldReport, domain);
    const status = domainStatus(mirrorReady, gaps, domain.priority);
    return {
      ...domain,
      mirror: {
        ready: mirrorReady,
        rowCount,
        entityCount,
        latestPulledAt,
      },
      fieldGaps: gaps,
      status,
      recommendedAction: nextAction(status, domain.key),
    };
  });
  const p0NeedReview = domains.filter((domain) => domain.priority === 'P0' && domain.status !== 'READY_FOR_MAPPING_REVIEW').length;
  const totalMirrorRows = domains.reduce((sum, domain) => sum + domain.mirror.rowCount, 0);
  const mirrorCoverageRate = domains.length ? domains.filter((domain) => domain.mirror.ready).length / domains.length : 0;
  const pendingSemanticMappings = Number(fieldReport.summary?.pending_fields || 0);
  const decision = domains.some((domain) => domain.status === 'WAITING_MIRROR_SYNC')
    ? 'HOLD'
    : 'GO_WITH_CONDITIONS';
  const report = {
    generatedAt,
    decision,
    sourceArtifacts: {
      syncJsonPath,
      fieldJsonPath,
      syncDecision: syncReport.decision,
      fieldDecision: fieldReport.decision,
    },
    summary: {
      mirrorCoverageRate,
      totalMirrorRows,
      p0NeedReview,
      fieldMappingTotal: Number(fieldReport.summary?.total_fields || syncReport.coverage?.fieldCoverage?.totalFieldMappings || 0),
      matchedMappings: Number(fieldReport.summary?.matched_fields || syncReport.coverage?.fieldCoverage?.statusCounts?.MATCHED || 0),
      pendingSemanticMappings,
      nextGate: 'CHANJET_P2_MASTER_DATA_MAPPING_REVIEW',
    },
    domains,
    guardrails: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      voucherPush: false,
      erpBusinessTableOverwrite: false,
      migration: false,
    },
  };
  writeReports(report);
  console.log(JSON.stringify({
    decision: report.decision,
    mirrorCoverage: pct(report.summary.mirrorCoverageRate),
    p0NeedReview: report.summary.p0NeedReview,
    totalMirrorRows: report.summary.totalMirrorRows,
    pendingSemanticMappings: report.summary.pendingSemanticMappings,
    outputJson,
    outputMd,
  }, null, 2));
}

main();
