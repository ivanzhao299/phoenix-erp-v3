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

const inputJson = getArg('--input-json', 'docs/ops/runs/chanjet-remote-readonly-coverage-audit-latest.json');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const outputJson = join(outputDir, 'chanjet-field-gap-review-gate-latest.json');
const outputMd = join(outputDir, 'chanjet-field-gap-review-gate-latest.md');
const generatedAt = new Date().toISOString();

const BUCKETS = [
  {
    bucketKey: 'CHANJET_VOUCHER_HEADER',
    title: '凭证头只读重现',
    priority: 'P0',
    entityTypes: ['VOUCHER'],
    endpointHints: ['acctgtrans'],
    fieldHints: ['voucher', 'trans', 'period', 'date', 'status', 'state', 'created', 'boname'],
    erpTarget: 'chanjet_voucher_read_model.header',
    action: 'implement_readonly_voucher_header_adapter',
  },
  {
    bucketKey: 'CHANJET_VOUCHER_LINE',
    title: '凭证明细只读重现',
    priority: 'P0',
    entityTypes: ['VOUCHER'],
    endpointHints: ['acctgtrans'],
    fieldHints: ['details[', 'posteddr', 'postedcr', 'sequence', 'longtext', 'comments', 'qty'],
    erpTarget: 'chanjet_voucher_read_model.lines[]',
    action: 'implement_readonly_voucher_line_adapter',
  },
  {
    bucketKey: 'CHANJET_COUNTERPARTY',
    title: '往来单位映射',
    priority: 'P0',
    entityTypes: ['CUSTOMER_SUPPLIER'],
    endpointHints: ['custvendor', 'statistics/pay', 'statistics/receive', 'payment/ap', 'payment/ar'],
    fieldHints: ['customer', 'supplier', 'vendor', 'party', 'subjectname', 'counterparty', 'assistant'],
    erpTarget: 'chanjet_master_mapping.CUSTOMER_SUPPLIER',
    action: 'complete_counterparty_mapping_review',
  },
  {
    bucketKey: 'CHANJET_AP_AR_AGGREGATE',
    title: '应收/应付汇总口径',
    priority: 'P0',
    entityTypes: ['AR_STATISTICS', 'AP_STATISTICS'],
    endpointHints: ['statistics/pay', 'statistics/receive'],
    fieldHints: ['amount', 'balance', 'debit', 'credit', 'period', 'subject'],
    erpTarget: 'chanjet_ap_ar_read_model',
    action: 'lock_ar_ap_aggregate_read_model',
  },
  {
    bucketKey: 'CHANJET_PAYMENT_DOCUMENT',
    title: '收付款单只读口径',
    priority: 'P0',
    entityTypes: ['AR_RECEIPT', 'AP_PAYMENT'],
    endpointHints: ['payment/ap', 'payment/ar'],
    fieldHints: ['payment', 'receipt', 'bill', 'account', 'currency', 'settle', 'status', 'date'],
    erpTarget: 'chanjet_payment_read_model',
    action: 'lock_receipt_payment_date_status_fields',
  },
  {
    bucketKey: 'CHANJET_REPORTING',
    title: '科目余额与财务报表',
    priority: 'P1',
    entityTypes: ['GL_BALANCE', 'BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW'],
    endpointHints: ['balance', 'cashflow', 'incomestatement'],
    fieldHints: ['subject', 'asset', 'liability', 'profit', 'line', 'begin', 'end', 'period'],
    erpTarget: 'chanjet_financial_report_read_model',
    action: 'implement_readonly_financial_statement_rows',
  },
  {
    bucketKey: 'CHANJET_PURCHASE_LINKAGE',
    title: '采购链路差异对照',
    priority: 'P1',
    entityTypes: ['PURCHASE_ORDER'],
    endpointHints: ['purchaseorder'],
    fieldHints: ['purchase', 'order', 'supplier', 'inventory', 'tax', 'item'],
    erpTarget: 'chanjet_procurement_read_model',
    action: 'implement_purchase_readonly_reconciliation',
  },
];

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Input report not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function includesAny(text, hints) {
  const value = String(text || '').toLowerCase();
  return hints.some((hint) => value.includes(String(hint).toLowerCase()));
}

function matchBucket(field) {
  const endpoint = field.chanjet_endpoint || '';
  const path = field.chanjet_field_path || '';
  if (String(path).toLowerCase().includes('.details[')) {
    return BUCKETS.find((bucket) => bucket.bucketKey === 'CHANJET_VOUCHER_LINE');
  }
  return BUCKETS.find((bucket) => (
    includesAny(endpoint, bucket.endpointHints)
    || includesAny(path, bucket.fieldHints)
  )) || {
    bucketKey: 'CHANJET_UNCLASSIFIED_REVIEW',
    title: '未归类字段复核',
    priority: 'P2',
    entityTypes: [],
    erpTarget: 'chanjet_unclassified_review_queue',
    action: 'classify_before_implementation',
  };
}

function table(headers, rows) {
  if (!rows.length) return '_none_';
  return [
    `|${headers.join('|')}|`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `|${headers.map((header) => String(row[header] ?? '').replace(/\|/g, '\\|')).join('|')}|`),
  ].join('\n');
}

function buildReview(report) {
  const topGaps = report.topGaps || [];
  const entitySummary = report.entitySummary || [];
  const entityRows = new Map(entitySummary.map((row) => [row.entity_type || row.entityType, Number(row.rows || 0)]));
  const bucketMap = new Map();
  for (const bucket of BUCKETS) {
    bucketMap.set(bucket.bucketKey, {
      reviewId: `FIELD-GAP-${bucket.bucketKey}`,
      bucketKey: bucket.bucketKey,
      title: bucket.title,
      priority: bucket.priority,
      entityTypes: bucket.entityTypes,
      erpTarget: bucket.erpTarget,
      recommendedAction: bucket.action,
      mirrorRows: bucket.entityTypes.reduce((sum, type) => sum + (entityRows.get(type) || 0), 0),
      openFieldCount: 0,
      highOrCriticalOpenFieldCount: 0,
      sampleFields: [],
      blockers: [],
      allowedPaths: [
        'apps/api/src/modules/chanjet/**',
        'apps/api/src/modules/finance-v2/**',
        'apps/web/src/app/(admin)/**',
        'docs/ops/**',
      ],
      forbiddenActions: [
        'write_chanjet',
        'delete_chanjet',
        'modify_chanjet',
        'voucher_push',
        'silent_overwrite_erp_business_facts',
        'link_chanjet_aggregate_to_fin_ar_invoices',
      ],
      validationCommands: [
        'cd apps/api && ./node_modules/.bin/tsc --noEmit',
        'cd apps/web && ./node_modules/.bin/tsc --noEmit',
        'node scripts/ci/check-w5-closeout-gate.mjs',
      ],
    });
  }
  bucketMap.set('CHANJET_UNCLASSIFIED_REVIEW', {
    reviewId: 'FIELD-GAP-CHANJET_UNCLASSIFIED_REVIEW',
    bucketKey: 'CHANJET_UNCLASSIFIED_REVIEW',
    title: '未归类字段复核',
    priority: 'P2',
    entityTypes: [],
    erpTarget: 'chanjet_unclassified_review_queue',
    recommendedAction: 'classify_before_implementation',
    mirrorRows: 0,
    openFieldCount: 0,
    highOrCriticalOpenFieldCount: 0,
    sampleFields: [],
    blockers: ['manual_classification_required'],
    allowedPaths: ['docs/ops/**', 'scripts/ops/**'],
    forbiddenActions: ['write_chanjet', 'modify_chanjet', 'voucher_push'],
    validationCommands: ['node --check scripts/ops/chanjet-field-gap-review-gate.mjs'],
  });

  for (const field of topGaps) {
    const bucket = matchBucket(field);
    const item = bucketMap.get(bucket.bucketKey);
    item.openFieldCount += 1;
    if (['HIGH', 'CRITICAL'].includes(field.risk_level)) item.highOrCriticalOpenFieldCount += 1;
    if (item.sampleFields.length < 20) {
      item.sampleFields.push({
        endpoint: field.chanjet_endpoint,
        fieldPath: field.chanjet_field_path,
        chanjetType: field.chanjet_type,
        erpDomain: field.erp_domain,
        erpTarget: [field.erp_table, field.erp_field].filter(Boolean).join('.'),
        riskLevel: field.risk_level,
        matchStatus: field.match_status,
        analysisNote: field.analysis_note,
      });
    }
  }

  const bucketReviews = [...bucketMap.values()].map((item) => ({
    ...item,
    status: item.mirrorRows > 0
      ? (item.highOrCriticalOpenFieldCount > 0 ? 'GO_WITH_CONDITIONS' : 'READY')
      : item.priority === 'P2'
        ? 'NEED_CLASSIFICATION'
        : 'WAITING_MIRROR',
    blockers: [
      ...item.blockers,
      ...(item.mirrorRows === 0 && item.priority !== 'P2' ? ['mirror_rows_missing'] : []),
      ...(item.highOrCriticalOpenFieldCount > 0 ? [`high_or_critical_fields:${item.highOrCriticalOpenFieldCount}`] : []),
      ...(item.bucketKey === 'CHANJET_COUNTERPARTY' ? ['mapping_review_required_before_business_use'] : []),
      ...(item.bucketKey === 'CHANJET_VOUCHER_LINE' ? ['voucher_writeback_disabled'] : []),
    ],
  })).filter((item) => item.openFieldCount > 0 || item.mirrorRows > 0);

  const recommendedExecutionOrder = bucketReviews
    .filter((item) => ['P0', 'P1'].includes(item.priority))
    .sort((a, b) => {
      const p = { P0: 0, P1: 1, P2: 2 };
      return p[a.priority] - p[b.priority] || b.highOrCriticalOpenFieldCount - a.highOrCriticalOpenFieldCount;
    })
    .map((item) => ({
      gateId: item.reviewId,
      title: item.title,
      action: item.recommendedAction,
      canStartNow: item.mirrorRows > 0,
      approvalRequired: true,
      owner: item.bucketKey === 'CHANJET_COUNTERPARTY'
        ? 'A5-Data-Readiness + A2-Security-Regression-Gate'
        : 'A3-Backend-Critical-Path + A2-Security-Regression-Gate',
    }));

  const highOpen = bucketReviews.reduce((sum, item) => sum + item.highOrCriticalOpenFieldCount, 0);
  return {
    generatedAt,
    decision: highOpen > 0 ? 'GO_WITH_CONDITIONS' : 'GO',
    sourceReport: inputJson,
    summary: {
      sourceDecision: report.decision,
      endpointCoverageRate: report.coverage?.endpointCoverageRate ?? null,
      cardCoverageRate: report.coverage?.cardCoverageRate ?? null,
      fieldClassificationRate: report.coverage?.fieldClassificationRate ?? null,
      sourceHighOpenFields: report.conditions?.highOrCriticalOpenFields ?? highOpen,
      reviewedHighOpenFields: highOpen,
      bucketCount: bucketReviews.length,
      p0BucketCount: bucketReviews.filter((item) => item.priority === 'P0').length,
      nextGate: 'CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION',
    },
    bucketReviews,
    recommendedExecutionOrder,
    guardrails: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      voucherPush: false,
      erpBusinessOverwrite: false,
      migration: false,
      deploy: false,
    },
    outputs: { outputJson, outputMd },
  };
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, JSON.stringify(result, null, 2));
  const bucketRows = result.bucketReviews.map((item) => ({
    priority: item.priority,
    bucket: item.bucketKey,
    title: item.title,
    status: item.status,
    mirrorRows: item.mirrorRows,
    high: item.highOrCriticalOpenFieldCount,
    target: item.erpTarget,
  }));
  const orderRows = result.recommendedExecutionOrder.map((item) => ({
    gate: item.gateId,
    title: item.title,
    action: item.action,
    canStart: item.canStartNow,
    owner: item.owner,
  }));
  const sampleRows = result.bucketReviews.flatMap((item) => item.sampleFields.slice(0, 8).map((field) => ({
    bucket: item.bucketKey,
    endpoint: field.endpoint,
    field: field.fieldPath,
    type: field.chanjetType,
    risk: field.riskLevel,
    erp: field.erpTarget,
  }))).slice(0, 80);

  const md = [
    '# Chanjet Field Gap Review Gate',
    '',
    `Generated at: ${result.generatedAt}`,
    `Decision: ${result.decision}`,
    '',
    '## Boundaries',
    '',
    '- Chanjet write/delete/modify: no',
    '- Voucher push: no',
    '- ERP business fact overwrite: no',
    '- Migration/deploy: no',
    '',
    '## Summary',
    '',
    `- Source report: ${result.sourceReport}`,
    `- Endpoint coverage: ${Math.round(Number(result.summary.endpointCoverageRate || 0) * 1000) / 10}%`,
    `- Finance card coverage: ${Math.round(Number(result.summary.cardCoverageRate || 0) * 1000) / 10}%`,
    `- Field classification coverage: ${Math.round(Number(result.summary.fieldClassificationRate || 0) * 1000) / 10}%`,
    `- High/Critical open fields reviewed: ${result.summary.reviewedHighOpenFields}`,
    `- Next gate: ${result.summary.nextGate}`,
    '',
    '## Review Buckets',
    '',
    table(['priority', 'bucket', 'title', 'status', 'mirrorRows', 'high', 'target'], bucketRows),
    '',
    '## Recommended Execution Order',
    '',
    table(['gate', 'title', 'action', 'canStart', 'owner'], orderRows),
    '',
    '## Sample High-Risk Fields',
    '',
    table(['bucket', 'endpoint', 'field', 'type', 'risk', 'erp'], sampleRows),
    '',
    '## Next',
    '',
    '1. 先实现 P0 只读适配，不写好业财。',
    '2. 往来单位映射先由中间层审核，不自动覆盖 ERP 主数据。',
    '3. 凭证写回保持关闭，先做只读重现和人工审核。',
    '4. 收付款与资金余额必须锁定日期、状态、余额字段后才可影响主卡片。',
    '',
  ].join('\n');
  writeFileSync(outputMd, md);
}

try {
  const report = readJson(inputJson);
  const result = buildReview(report);
  writeReports(result);
  console.log(JSON.stringify({
    decision: result.decision,
    reviewedHighOpenFields: result.summary.reviewedHighOpenFields,
    bucketCount: result.summary.bucketCount,
    nextGate: result.summary.nextGate,
    outputJson,
    outputMd,
  }, null, 2));
} catch (error) {
  mkdirSync(outputDir, { recursive: true });
  const result = {
    generatedAt,
    decision: 'FAIL',
    error: error?.stack || String(error),
    guardrails: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      voucherPush: false,
    },
  };
  writeFileSync(outputJson, JSON.stringify(result, null, 2));
  writeFileSync(outputMd, `# Chanjet Field Gap Review Gate\n\nDecision: FAIL\n\n\`\`\`\n${result.error}\n\`\`\`\n`);
  console.error(result.error);
  process.exit(1);
}
