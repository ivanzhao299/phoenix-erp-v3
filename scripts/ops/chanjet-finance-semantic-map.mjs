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

const inputJson = getArg('--input-json', 'docs/ops/runs/chanjet-field-mapping-report-latest.json');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const outputJson = join(outputDir, 'chanjet-finance-semantic-map-latest.json');
const outputMd = join(outputDir, 'chanjet-finance-semantic-map-latest.md');
const generatedAt = new Date().toISOString();

const BOUNDARIES = {
  chanjet_write: false,
  chanjet_delete: false,
  chanjet_modify: false,
  voucher_push: false,
  erp_business_table_write: false,
  migration: false,
  deploy: false,
};

const SEMANTIC_BUCKETS = [
  {
    semantic_id: 'CHANJET_VOUCHER_HEADER',
    title: '凭证头',
    endpoint_patterns: ['AcctgTrans/acctgTransFuzzySearch'],
    field_patterns: [
      'acctgTransCategoryId',
      'boName',
      'createdStamp',
      'createdUserId',
      'hasAdjusted',
      'hasEditAuth',
      'voucher',
      'trans',
      'period',
      'date',
      'state',
      'status',
    ],
    target_model: 'chanjet_voucher_read_model.header',
    target_type: 'readonly_adapter',
    priority: 'P0',
    owner_recommendation: 'A3-Backend-Critical-Path + A2-Security-Regression-Gate',
    proposed_solution: '建立 ERP 只读凭证头适配 DTO，保留好业财原始 payload，不直接写 ERP 凭证事实表，不推送好业财。',
    acceptance_criteria: [
      '凭证头字段可从 raw snapshot 稳定解析。',
      '凭证号、账套、期间、制单人、状态、来源单据等字段有明确中文业务名。',
      '字段缺失或类型不一致时 fail-closed，进入人工映射。',
    ],
  },
  {
    semantic_id: 'CHANJET_VOUCHER_LINE',
    title: '凭证明细',
    endpoint_patterns: ['AcctgTrans/acctgTransFuzzySearch'],
    field_patterns: [
      'details',
      'postedDr',
      'postedCr',
      'basePostedDr',
      'basePostedCr',
      'postedDrQty',
      'postedCrQty',
      'sequenceNum',
      'longText',
      'comments',
      'hasQtyAccounting',
    ],
    target_model: 'chanjet_voucher_read_model.lines[]',
    target_type: 'readonly_adapter',
    priority: 'P0',
    owner_recommendation: 'A3-Backend-Critical-Path + A2-Security-Regression-Gate',
    proposed_solution: '建立借贷方向、原币/本币金额、数量核算、摘要、行号的只读转换层；金额字段使用 Decimal 字符串，不用 JS 浮点做账。',
    acceptance_criteria: [
      '借方/贷方金额字段不会互相覆盖。',
      '本币与原币金额同时保留。',
      '摘要、数量、行号能支撑 ERP 端展示和后续对账。',
    ],
  },
  {
    semantic_id: 'CHANJET_COUNTERPARTY',
    title: '往来单位',
    endpoint_patterns: ['custvendor', 'statistics/pay', 'statistics/receive', 'payment/ap', 'payment/ar'],
    field_patterns: [
      'custvendor',
      'party',
      'customer',
      'supplier',
      'vendor',
      'assistant',
      'counterparty',
      'subjectName',
    ],
    target_model: 'chanjet_master_mapping.CUSTOMER_SUPPLIER',
    target_type: 'reviewed_mapping',
    priority: 'P0',
    owner_recommendation: 'A5-Data-Readiness + A2-Security-Regression-Gate',
    proposed_solution: '往来单位先进入中间层人工审核，确认客户/供应商/双重属性后再映射 ERP 主数据，禁止自动覆盖客户或供应商档案。',
    acceptance_criteria: [
      '同一好业财往来单位只对应一个审核态映射记录。',
      '客户/供应商属性缺失时保持 HOLD。',
      '不把 subjectName 误当会计科目名。',
    ],
  },
  {
    semantic_id: 'CHANJET_AP_AR_AGGREGATE',
    title: '应收/应付统计',
    endpoint_patterns: ['statistics/pay', 'statistics/receive'],
    field_patterns: [
      'amount',
      'balance',
      'money',
      'subject',
      'period',
      'begin',
      'end',
      'debit',
      'credit',
      'pay',
      'receive',
    ],
    target_model: 'chanjet_ap_ar_read_model',
    target_type: 'readonly_adapter',
    priority: 'P0',
    owner_recommendation: 'A3-Backend-Critical-Path + A5-Data-Readiness',
    proposed_solution: '应收/应付统计保持客户/供应商级只读汇总，不能写入发票级 fin_ar_invoices；只可进入总账/报表对账视图。',
    acceptance_criteria: [
      'AP/AR 统计行数与 raw 快照保真。',
      '期间、往来单位、期初、借贷、本期、期末字段可解释。',
      '不产生发票号、到期日、账龄等好业财未提供的伪字段。',
    ],
  },
  {
    semantic_id: 'CHANJET_PAYMENT_DOCUMENT',
    title: '收付款单',
    endpoint_patterns: ['payment/ap/list', 'payment/ar/list'],
    field_patterns: [
      'payment',
      'receipt',
      'bill',
      'amount',
      'bank',
      'cash',
      'settle',
      'account',
      'currency',
    ],
    target_model: 'chanjet_payment_read_model',
    target_type: 'readonly_adapter',
    priority: 'P1',
    owner_recommendation: 'A3-Backend-Critical-Path + A2-Security-Regression-Gate',
    proposed_solution: '建立收付款单只读查询模型，与 ERP 采购付款/收款模块做对照，不自动生成 ERP 单据。',
    acceptance_criteria: [
      '付款单与收款单方向明确。',
      '资金账户、币种、金额、状态字段有一致口径。',
      '权限收紧到财务菜单 V/E/X，不允许普通业务角色查看全量。',
    ],
  },
  {
    semantic_id: 'CHANJET_PURCHASE_LINKAGE',
    title: '采购订单关联',
    endpoint_patterns: ['purchaseorder/list'],
    field_patterns: [
      'purchase',
      'order',
      'supplier',
      'amount',
      'item',
      'inventory',
      'tax',
    ],
    target_model: 'chanjet_procurement_read_model',
    target_type: 'readonly_adapter',
    priority: 'P1',
    owner_recommendation: 'A3-Backend-Critical-Path + A5-Data-Readiness',
    proposed_solution: '只读展示好业财采购订单与 ERP 采购订单差异，先做字段对照和差异分析，不自动回写任一侧。',
    acceptance_criteria: [
      '供应商、项目、金额、税额、物料字段可对照。',
      'ERP 缺字段进入后续 schema Gate，不在本轮直接改业务表。',
      '差异只作为审计和人工核对，不自动调整库存或财务。',
    ],
  },
  {
    semantic_id: 'CHANJET_FINANCIAL_REPORT',
    title: '财务报表',
    endpoint_patterns: ['balance/rpt', 'getOldBalanceSheet', 'getOldIncomeStatement', 'CashFlow'],
    field_patterns: [
      'balance',
      'income',
      'cashflow',
      'asset',
      'liability',
      'profit',
      'subject',
      'period',
    ],
    target_model: 'chanjet_financial_report_read_model',
    target_type: 'readonly_report',
    priority: 'P1',
    owner_recommendation: 'A3-Backend-Critical-Path + A1-CI-Runtime-Gate',
    proposed_solution: '三大报表保留好业财口径，只做 ERP 端只读报表与经营数据交叉分析，不替代 ERP 业务事实表。',
    acceptance_criteria: [
      '资产负债表、利润表、现金流量表各自独立口径。',
      '报表字段不混入主数据映射表。',
      '报表展示标注来源账套、期间和拉取时间。',
    ],
  },
];

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Input report not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalized(text) {
  return String(text || '').toLowerCase();
}

function matchesAny(text, patterns) {
  const value = normalized(text);
  return patterns.some((pattern) => value.includes(normalized(pattern)));
}

function classifyEndpoint(endpoint) {
  const matched = SEMANTIC_BUCKETS.filter((bucket) => matchesAny(endpoint, bucket.endpoint_patterns));
  if (matched.length) return matched;
  return [];
}

function classifyField(row) {
  const endpoint = normalized(row.chanjet_endpoint);
  const fieldPath = normalized(row.chanjet_field_path);
  const erpField = normalized(row.erp_field);
  const fieldText = `${fieldPath} ${erpField}`;
  const matched = SEMANTIC_BUCKETS.filter((bucket) => {
    if (bucket.semantic_id === 'CHANJET_VOUCHER_HEADER') {
      return endpoint.includes('acctgtrans/acctgtransfuzzysearch')
        && !fieldPath.includes('.details[')
        && matchesAny(fieldText, bucket.field_patterns);
    }
    if (bucket.semantic_id === 'CHANJET_VOUCHER_LINE') {
      return endpoint.includes('acctgtrans/acctgtransfuzzysearch')
        && fieldPath.includes('.details[')
        && matchesAny(fieldText, bucket.field_patterns);
    }
    if (bucket.semantic_id === 'CHANJET_PAYMENT_DOCUMENT') {
      return matchesAny(endpoint, bucket.endpoint_patterns)
        && matchesAny(fieldText, bucket.field_patterns);
    }
    return (
      matchesAny(endpoint, bucket.endpoint_patterns)
      && matchesAny(fieldText, bucket.field_patterns)
    ) || matchesAny(fieldText, bucket.field_patterns);
  });
  return matched.length ? matched : [{
    semantic_id: 'CHANJET_UNCLASSIFIED_FINANCE_FIELD',
    title: '未分类财务字段',
    target_model: 'chanjet_unclassified_review_queue',
    target_type: 'manual_review',
    priority: 'P2',
    owner_recommendation: 'Codex-Orchestrator + A2-Security-Regression-Gate',
    proposed_solution: '进入人工分类队列，确认忽略、元数据、只读报表或后续 ERP schema Gate。',
    acceptance_criteria: ['未分类字段不得自动进入业务表。'],
  }];
}

function addHit(map, bucket, source) {
  if (!map.has(bucket.semantic_id)) {
    map.set(bucket.semantic_id, {
      semantic_id: bucket.semantic_id,
      title: bucket.title,
      priority: bucket.priority,
      target_model: bucket.target_model,
      target_type: bucket.target_type,
      owner_recommendation: bucket.owner_recommendation,
      proposed_solution: bucket.proposed_solution,
      acceptance_criteria: bucket.acceptance_criteria || [],
      endpoint_count: 0,
      field_count: 0,
      high_or_critical_count: 0,
      endpoints: new Set(),
      sample_fields: [],
    });
  }
  const item = map.get(bucket.semantic_id);
  if (source.endpoint) item.endpoints.add(source.endpoint);
  if (source.kind === 'endpoint') item.endpoint_count += source.count || 1;
  if (source.kind === 'field') {
    item.field_count += 1;
    if (['HIGH', 'CRITICAL'].includes(source.risk_level)) item.high_or_critical_count += 1;
    if (item.sample_fields.length < 16) {
      item.sample_fields.push({
        endpoint: source.endpoint,
        field: source.field,
        type: source.type,
        risk: source.risk_level,
        current_target: source.current_target,
      });
    }
  }
}

function buildSemanticMap(report) {
  const groups = new Map();
  for (const row of report.endpointSummary || []) {
    for (const bucket of classifyEndpoint(row.chanjet_endpoint)) {
      addHit(groups, bucket, {
        kind: 'endpoint',
        endpoint: row.chanjet_endpoint,
        count: Number(row.field_count || 0),
      });
    }
  }
  for (const row of report.topOpenFields || []) {
    for (const bucket of classifyField(row)) {
      addHit(groups, bucket, {
        kind: 'field',
        endpoint: row.chanjet_endpoint,
        field: row.chanjet_field_path,
        type: row.chanjet_type,
        risk_level: row.risk_level,
        current_target: [row.erp_domain, row.erp_table, row.erp_field].filter(Boolean).join(' / '),
      });
    }
  }
  return [...groups.values()].map((item) => ({
    ...item,
    endpoints: [...item.endpoints].sort(),
  })).sort((a, b) => {
    const priority = { P0: 0, P1: 1, P2: 2 };
    return (priority[a.priority] ?? 9) - (priority[b.priority] ?? 9)
      || b.field_count - a.field_count
      || a.semantic_id.localeCompare(b.semantic_id);
  });
}

function table(headers, rows) {
  if (!rows.length) return '_none_';
  return [
    `|${headers.join('|')}|`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `|${headers.map((header) => String(row[header] ?? '').replace(/\|/g, '\\|')).join('|')}|`),
  ].join('\n');
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, JSON.stringify(result, null, 2));

  const semanticRows = result.semantic_map.map((item) => ({
    priority: item.priority,
    semantic: item.semantic_id,
    title: item.title,
    fields: item.field_count,
    high: item.high_or_critical_count,
    target: item.target_model,
  }));
  const endpointRows = result.semantic_map.flatMap((item) => item.endpoints.slice(0, 8).map((endpoint) => ({
    semantic: item.semantic_id,
    endpoint,
  }))).slice(0, 40);
  const sampleRows = result.semantic_map.flatMap((item) => item.sample_fields.slice(0, 8).map((field) => ({
    semantic: item.semantic_id,
    field: field.field,
    type: field.type,
    risk: field.risk,
    target: field.current_target,
  }))).slice(0, 60);

  const lines = [
    '# Chanjet Finance Semantic Map',
    '',
    `Generated at: ${result.generated_at}`,
    `Decision: ${result.decision}`,
    '',
    '## Boundaries',
    '',
    '- Chanjet write/delete/modify: no',
    '- Voucher push: no',
    '- ERP business table write: no',
    '- Migration/deploy: no',
    '- Scope: ERP readonly middle-layer semantic mapping only',
    '',
    '## Source Summary',
    '',
    `- Source report: ${result.source_report}`,
    `- Total field candidates: ${result.source_summary.total_fields}`,
    `- Pending fields: ${result.source_summary.pending_fields}`,
    `- High/Critical open fields: ${result.source_summary.high_or_critical_open_fields}`,
    `- Envelope noise: ${result.source_summary.envelope_noise}`,
    '',
    '## Semantic Buckets',
    '',
    table(['priority', 'semantic', 'title', 'fields', 'high', 'target'], semanticRows),
    '',
    '## Endpoint Coverage',
    '',
    table(['semantic', 'endpoint'], endpointRows),
    '',
    '## Sample Open Fields',
    '',
    table(['semantic', 'field', 'type', 'risk', 'target'], sampleRows),
    '',
    '## P0 Implementation Gates',
    '',
    '1. `CHANJET_VOUCHER_HEADER` / `CHANJET_VOUCHER_LINE`: 建立只读凭证适配 DTO 和页面，不推送好业财。',
    '2. `CHANJET_COUNTERPARTY`: 往来单位进入人工审核映射，不自动覆盖客户/供应商主数据。',
    '3. `CHANJET_AP_AR_AGGREGATE`: 应收/应付统计只进入总账/报表对账视图，禁止写入 `fin_ar_invoices`。',
    '4. 所有 P0 项进入 A2 安全复核，确认 RBAC/DataScope/审计和敏感字段脱敏。',
    '',
    '## Current Conclusion',
    '',
    result.decision,
    '',
  ];
  writeFileSync(outputMd, lines.join('\n'));
}

const report = readJson(inputJson);
const semanticMap = buildSemanticMap(report);
const p0Count = semanticMap.filter((item) => item.priority === 'P0').length;
const holdReasons = [];
if (!semanticMap.length) holdReasons.push('No semantic buckets generated.');
if ((report.summary?.fake_counterparty_targets || 0) > 0) holdReasons.push('Fake counterparty targets still exist.');
if ((report.envelopeNoise?.count || 0) > 0) holdReasons.push('Envelope business-target noise still exists.');

const result = {
  generated_at: generatedAt,
  decision: holdReasons.length ? 'HOLD' : p0Count ? 'GO_WITH_CONDITIONS' : 'HOLD',
  source_report: inputJson,
  boundaries: BOUNDARIES,
  source_summary: {
    total_fields: report.summary?.total_fields || 0,
    pending_fields: report.summary?.pending_fields || 0,
    high_or_critical_open_fields: report.summary?.high_or_critical_open_fields || 0,
    envelope_noise: report.envelopeNoise?.count || 0,
    fake_counterparty_targets: report.summary?.fake_counterparty_targets || 0,
  },
  hold_reasons: holdReasons,
  semantic_map: semanticMap,
  next_gate_recommendation: [
    'P0-1: Implement readonly voucher adapter DTO/API report from raw snapshots.',
    'P0-2: Implement counterparty review queue and customer/supplier split decision report.',
    'P0-3: Implement AP/AR aggregate read model, explicitly excluding fin_ar_invoices.',
  ],
  outputs: { outputJson, outputMd },
};

writeReports(result);
console.log(JSON.stringify({
  decision: result.decision,
  semanticBuckets: semanticMap.length,
  p0Buckets: p0Count,
  outputJson,
  outputMd,
}, null, 2));
