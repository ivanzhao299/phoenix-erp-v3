#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};

const outputDir = getArg('--output-dir', 'docs/ops/runs');
const servicePath = getArg('--service', 'apps/api/src/modules/chanjet/chanjet-integration.service.ts');
const controllerPath = getArg('--controller', 'apps/api/src/modules/chanjet/chanjet-callback.controller.ts');
const expansionJsonPath = getArg('--expansion-json', 'docs/ops/runs/chanjet-finance-card-semantic-expansion-latest.json');
const outputJson = join(outputDir, 'chanjet-finance-card-semantic-review-latest.json');
const outputMd = join(outputDir, 'chanjet-finance-card-semantic-review-latest.md');

const REQUIRED_REVIEW_KEYS = [
  'AR_OPEN',
  'AP_OPEN',
  'CASH_BALANCE',
  'TODAY_RECEIPT',
  'TODAY_PAYMENT',
  'SUBJECT_BALANCE',
  'BALANCE_SHEET',
  'INCOME_STATEMENT',
];

const QUESTION_MAP = {
  AR_OPEN: [
    '确认好业财应收统计是否作为集团应收待收卡片权威汇总。',
    '确认负数余额展示规则。',
    '确认 ERP 发票级 fin_ar_invoices 仅作为辅助差异。',
  ],
  AP_OPEN: [
    '确认好业财应付统计是否作为集团应付待付卡片权威汇总。',
    '确认负数余额展示规则。',
    '确认 ERP 付款/采购明细仅作为辅助差异。',
  ],
  CASH_BALANCE: [
    '确认现金/银行余额字段路径和币种字段路径。',
    '确认余额时点。',
    '确认多币种汇总是否折本位币。',
  ],
  TODAY_RECEIPT: [
    '确认今日口径使用业务日期、入账日期还是审核日期。',
    '确认只统计已审核/已生效单据。',
    '确认收款方向、退款/冲销方向和金额正负号规则。',
  ],
  TODAY_PAYMENT: [
    '确认今日口径使用业务日期、入账日期还是审核日期。',
    '确认只统计已审核/已生效单据。',
    '确认付款方向、退款/冲销方向和金额正负号规则。',
  ],
  SUBJECT_BALANCE: [
    '确认科目余额表字段：科目编码、期间、期初、本期借方、本期贷方、期末。',
    '确认借贷方向和正负号展示规则。',
    '确认按账套/公司分别展示还是集团汇总。',
  ],
  BALANCE_SHEET: [
    '确认资产负债表字段：报表项目、行次、年初金额、期末金额、期间。',
    '确认资产/负债/权益项目映射关系。',
    '确认集团汇总是否可直接使用好业财报表行。',
  ],
  INCOME_STATEMENT: [
    '确认利润表字段：报表项目、本期金额、累计金额、期间。',
    '确认收入/成本/费用/利润项目映射关系。',
    '确认集团汇总是否可直接使用好业财报表行。',
  ],
};

function readText(path) {
  if (!existsSync(path)) throw new Error(`Missing required file: ${path}`);
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Missing required JSON: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function reviewStatus(card) {
  if (card.currentStatus === 'HOLD') return 'HOLD';
  if (card.currentAuthorityEnabled) return 'APPROVED_FOR_AUTHORITY';
  if (card.requiresFinanceConfirmation) return 'READY_FOR_FINANCE_CONFIRMATION';
  return 'BLOCKED';
}

function check(name, passed, severity, evidence) {
  return { name, passed: Boolean(passed), severity, evidence };
}

function main() {
  mkdirSync(outputDir, { recursive: true });
  const service = readText(servicePath);
  const controller = readText(controllerPath);
  const expansion = readJson(expansionJsonPath);
  const cards = expansion.cardEndpointEvidence?.length
    ? expansion.cardEndpointEvidence.map((item) => ({
      cardKey: item.cardKey,
      label: item.label,
      readModelKey: item.readModelKey,
      currentStatus: item.covered ? 'READONLY_READY' : 'WAITING_SAMPLE',
      sampleRows: item.rows,
      latestPulledAt: item.latestPulledAt,
      currentAuthorityEnabled: ['AR_OPEN', 'AP_OPEN'].includes(item.readModelKey),
      candidateForReadonlyDetail: item.covered,
      candidateForAuthorityPromotion: ['AR_OPEN', 'AP_OPEN'].includes(item.readModelKey),
      requiresFinanceConfirmation: !['AR_OPEN', 'AP_OPEN'].includes(item.readModelKey),
      lockedFields: [],
      missingFields: ['CASH_BALANCE', 'SUBJECT_BALANCE', 'BALANCE_SHEET', 'INCOME_STATEMENT'].includes(item.readModelKey) && Number(item.amountSum || 0) === 0
        ? ['finance_semantic_value_field_confirmation']
        : [],
      blockers: !['AR_OPEN', 'AP_OPEN'].includes(item.readModelKey)
        ? ['finance_confirmation_required']
        : [],
      recommendedAction: ['AR_OPEN', 'AP_OPEN'].includes(item.readModelKey)
        ? '可作为权威候选，保留 ERP 辅助差异。'
        : '进入财务字段语义确认，确认前不得升权。',
    }))
    : [];

  const reviewItems = cards.map((card) => {
    const status = reviewStatus(card);
    return {
      reviewId: `CHANJET-FIN-CARD-${card.readModelKey}`,
      cardKey: card.cardKey,
      label: card.label,
      readModelKey: card.readModelKey,
      reviewStatus: status,
      currentStatus: card.currentStatus,
      sampleRows: Number(card.sampleRows || 0),
      latestPulledAt: card.latestPulledAt || null,
      currentAuthorityEnabled: Boolean(card.currentAuthorityEnabled),
      candidateForReadonlyDetail: Boolean(card.candidateForReadonlyDetail),
      candidateForAuthorityPromotion: Boolean(card.candidateForAuthorityPromotion),
      requiresFinanceConfirmation: Boolean(card.requiresFinanceConfirmation),
      financeConfirmationQuestions: QUESTION_MAP[card.readModelKey] || ['确认该卡片是否可作为财务权威口径。'],
      lockedFields: card.lockedFields || [],
      missingFields: card.missingFields || [],
      blockers: card.blockers || [],
      approvalInstruction: status === 'APPROVED_FOR_AUTHORITY'
        ? '可保留权威接线；继续展示 ERP 辅助差异。'
        : status === 'READY_FOR_FINANCE_CONFIRMATION'
          ? '进入财务字段口径确认；确认前不得升权为主卡片。'
          : status === 'HOLD'
            ? 'HOLD；先处理 read model 或样本异常。'
            : '仅可作为只读证据，不得升权。',
      recommendedAction: card.recommendedAction,
    };
  });

  const checks = [
    check(
      'Semantic review runtime method exists',
      service.includes('financeCardSemanticReviewOverview') && service.includes('FinanceCardSemanticReviewItem'),
      'P0',
      'Service exposes structured finance card semantic review matrix.',
    ),
    check(
      'Semantic review endpoint exists',
      controller.includes("@Get('integration/finance-card-semantic-review')") && controller.includes('integrationFinanceCardSemanticReview'),
      'P0',
      'GET /api/chanjet/integration/finance-card-semantic-review is available behind MENU_FIN2_AR_LEDGER V.',
    ),
    check(
      'All required cards have review items',
      REQUIRED_REVIEW_KEYS.every((key) => reviewItems.some((item) => item.readModelKey === key)),
      'P0',
      `${reviewItems.length}/${REQUIRED_REVIEW_KEYS.length} cards generated.`,
    ),
    check(
      'Unsafe promotions remain blocked',
      reviewItems.filter((item) => !item.currentAuthorityEnabled).every((item) => item.reviewStatus !== 'APPROVED_FOR_AUTHORITY'),
      'P0',
      'Non-authority cards remain blocked or finance-confirmation-only.',
    ),
    check(
      'Finance confirmation questions are present',
      reviewItems.every((item) => item.financeConfirmationQuestions.length > 0),
      'P1',
      'Every card has explicit questions for finance/business confirmation.',
    ),
    check(
      'Write boundaries remain explicit',
      service.includes('chanjetWrite: false') && service.includes('voucherPush: false') && service.includes('erpBusinessOverwrite: false'),
      'P0',
      'Review does not write Chanjet, push vouchers, or overwrite ERP business facts.',
    ),
  ];
  const failed = checks.filter((item) => !item.passed);
  const result = {
    generatedAt: new Date().toISOString(),
    decision: failed.some((item) => item.severity === 'P0') ? 'HOLD' : 'GO_WITH_CONDITIONS',
    summary: {
      totalChecks: checks.length,
      passedChecks: checks.filter((item) => item.passed).length,
      failedChecks: failed.length,
      totalCards: reviewItems.length,
      approvedForAuthority: reviewItems.filter((item) => item.reviewStatus === 'APPROVED_FOR_AUTHORITY').length,
      readyForFinanceConfirmation: reviewItems.filter((item) => item.reviewStatus === 'READY_FOR_FINANCE_CONFIRMATION').length,
      blocked: reviewItems.filter((item) => item.reviewStatus === 'BLOCKED').length,
      hold: reviewItems.filter((item) => item.reviewStatus === 'HOLD').length,
      nextGate: 'CHANJET_P3_FINANCE_CARD_SEMANTIC_CONFIRMATION',
    },
    checks,
    reviewItems,
    boundaries: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      voucherPush: false,
      erpBusinessOverwrite: false,
      migration: false,
      dbWrite: false,
      deploy: false,
      push: false,
    },
  };

  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`);
  const md = [
    '# Chanjet Finance Card Semantic Review Audit',
    '',
    `Generated at: ${result.generatedAt}`,
    `Decision: ${result.decision}`,
    '',
    '## Summary',
    '',
    `- Checks: ${result.summary.passedChecks}/${result.summary.totalChecks}`,
    `- Cards: ${result.summary.totalCards}`,
    `- Approved for authority: ${result.summary.approvedForAuthority}`,
    `- Ready for finance confirmation: ${result.summary.readyForFinanceConfirmation}`,
    `- Blocked: ${result.summary.blocked}`,
    `- Next gate: ${result.summary.nextGate}`,
    '',
    '## Checks',
    '',
    '|Check|Result|Severity|Evidence|',
    '|---|---|---|---|',
    ...checks.map((item) => `|${item.name}|${item.passed ? 'PASS' : 'FAIL'}|${item.severity}|${item.evidence.replace(/\|/g, '\\|')}|`),
    '',
    '## Review Matrix',
    '',
    '|Card|Read Model|Status|Samples|Instruction|',
    '|---|---|---|---:|---|',
    ...reviewItems.map((item) => `|${item.label}|${item.readModelKey}|${item.reviewStatus}|${item.sampleRows}|${item.approvalInstruction.replace(/\|/g, '\\|')}|`),
    '',
    '## Boundaries',
    '',
    '- Chanjet write/delete/modify: false',
    '- Voucher push: false',
    '- ERP business overwrite: false',
    '- Migration / DB write / deploy / push from this audit: false',
    '',
  ].join('\n');
  writeFileSync(outputMd, md);
  console.log(`Decision: ${result.decision}`);
  console.log(`Checks: ${result.summary.passedChecks}/${result.summary.totalChecks}`);
  console.log(`Approved for authority: ${result.summary.approvedForAuthority}`);
  console.log(`Ready for finance confirmation: ${result.summary.readyForFinanceConfirmation}`);
  console.log(`Wrote ${outputJson}`);
  console.log(`Wrote ${outputMd}`);
}

main();
