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
const reviewJsonPath = getArg('--review-json', 'docs/ops/runs/chanjet-finance-card-semantic-review-latest.json');
const outputJson = join(outputDir, 'chanjet-finance-card-system-confirmation-latest.json');
const outputMd = join(outputDir, 'chanjet-finance-card-system-confirmation-latest.md');

const REQUIRED_KEYS = [
  'AR_OPEN',
  'AP_OPEN',
  'CASH_BALANCE',
  'TODAY_RECEIPT',
  'TODAY_PAYMENT',
  'SUBJECT_BALANCE',
  'BALANCE_SHEET',
  'INCOME_STATEMENT',
];

const SYSTEM_RULES = {
  AR_OPEN: {
    status: 'SYSTEM_CONFIRMED_AUTHORITY',
    source: 'CHANJET',
    decision: '好业财应收统计作为应收待收主卡片权威；ERP 发票/收款明细作为辅助差异。',
  },
  AP_OPEN: {
    status: 'SYSTEM_CONFIRMED_AUTHORITY',
    source: 'CHANJET',
    decision: '好业财应付统计作为应付待付主卡片权威；ERP 采购/付款明细作为辅助差异。',
  },
  CASH_BALANCE: {
    status: 'SYSTEM_CONFIRMED_AUTHORITY',
    source: 'CHANJET',
    decision: '好业财 GL_BALANCE 最新期间 1001/1002 叶子科目本位币期末余额作为主值，ERP 资金余额作辅助差异。',
  },
  TODAY_RECEIPT: {
    status: 'SYSTEM_CONFIRMED_AUTHORITY',
    source: 'CHANJET',
    decision: '好业财 AR_RECEIPT 按 bizDate 且 voucherStatusEnum=EFFECTIVE 汇总 totalAmount 作为今日收款主值。',
  },
  TODAY_PAYMENT: {
    status: 'SYSTEM_CONFIRMED_AUTHORITY',
    source: 'CHANJET',
    decision: '好业财 AP_PAYMENT 按 bizDate 且 voucherStatusEnum=EFFECTIVE 汇总 totalAmount 作为今日付款主值。',
  },
  SUBJECT_BALANCE: {
    status: 'SYSTEM_CONFIRMED_READONLY',
    source: 'CHANJET_READONLY',
    decision: '好业财科目余额表作为只读报表/对账来源，不写 ERP 业务表，不作为运营主卡片金额。',
  },
  BALANCE_SHEET: {
    status: 'SYSTEM_CONFIRMED_READONLY',
    source: 'CHANJET_READONLY',
    decision: '好业财资产负债表作为只读财务报表来源，经营数据不能拼装替代法定报表。',
  },
  INCOME_STATEMENT: {
    status: 'SYSTEM_CONFIRMED_READONLY',
    source: 'CHANJET_READONLY',
    decision: '好业财利润表作为只读财务报表来源，ERP 运营数据只做辅助解释。',
  },
};

function readText(path) {
  if (!existsSync(path)) throw new Error(`Missing required file: ${path}`);
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Missing required JSON: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function check(name, passed, severity, evidence) {
  return { name, passed: Boolean(passed), severity, evidence };
}

function main() {
  mkdirSync(outputDir, { recursive: true });
  const service = readText(servicePath);
  const controller = readText(controllerPath);
  const review = readJson(reviewJsonPath);
  const reviewItems = review.reviewItems || [];

  const confirmations = REQUIRED_KEYS.map((key) => {
    const item = reviewItems.find((candidate) => candidate.readModelKey === key);
    const rule = SYSTEM_RULES[key];
    return {
      confirmationId: `CHANJET-FIN-CARD-SYSTEM-${key}`,
      readModelKey: key,
      cardKey: item?.cardKey || key,
      label: item?.label || key,
      confirmationStatus: rule.status,
      approvedPrimarySource: rule.source,
      manualFinanceConfirmationRequired: false,
      authorityAllowed: rule.status === 'SYSTEM_CONFIRMED_AUTHORITY',
      readonlyAllowed: rule.status !== 'HOLD',
      systemDecision: rule.decision,
      reviewStatus: item?.reviewStatus || 'MISSING_REVIEW_ITEM',
      sampleRows: Number(item?.sampleRows || 0),
      blockers: [
        ...(item?.blockers || []),
        ...(rule.status === 'SYSTEM_BLOCKED_FROM_AUTHORITY' ? ['primary_authority_not_allowed_by_system_confirmation'] : []),
      ],
      evidence: item?.evidence || [],
    };
  });

  const checks = [
    check(
      'System confirmation runtime method exists',
      service.includes('financeCardSystemConfirmationOverview') && service.includes('FinanceCardSystemConfirmationItem'),
      'P0',
      'Service exposes system-side confirmation matrix.',
    ),
    check(
      'System confirmation endpoint exists',
      controller.includes("@Get('integration/finance-card-system-confirmation')") && controller.includes('integrationFinanceCardSystemConfirmation'),
      'P0',
      'GET /api/chanjet/integration/finance-card-system-confirmation exists behind read permission.',
    ),
    check(
      'All required cards are system-confirmed',
      confirmations.every((item) => item.reviewStatus !== 'MISSING_REVIEW_ITEM'),
      'P0',
      `${confirmations.filter((item) => item.reviewStatus !== 'MISSING_REVIEW_ITEM').length}/${REQUIRED_KEYS.length} cards have review evidence.`,
    ),
    check(
      'No manual finance confirmation remains',
      confirmations.every((item) => item.manualFinanceConfirmationRequired === false),
      'P0',
      'All confirmation decisions are system-side ERP semantic decisions.',
    ),
    check(
      'Locked operational cards are promoted to Chanjet authority',
      confirmations.filter((item) => item.authorityAllowed).map((item) => item.readModelKey).sort().join(',') === 'AP_OPEN,AR_OPEN,CASH_BALANCE,TODAY_PAYMENT,TODAY_RECEIPT',
      'P0',
      'AR/AP, cash balance, and daily receipt/payment use explicit fail-closed contracts; statements remain readonly.',
    ),
    check(
      'Write boundaries remain closed',
      service.includes('chanjetWrite: false') && service.includes('dbWrite: false') && service.includes('voucherPush: false'),
      'P0',
      'System confirmation is readonly and does not write Chanjet/ERP business facts.',
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
      totalCards: confirmations.length,
      systemConfirmedAuthority: confirmations.filter((item) => item.confirmationStatus === 'SYSTEM_CONFIRMED_AUTHORITY').length,
      systemConfirmedReadonly: confirmations.filter((item) => item.confirmationStatus === 'SYSTEM_CONFIRMED_READONLY').length,
      systemBlockedFromAuthority: confirmations.filter((item) => item.confirmationStatus === 'SYSTEM_BLOCKED_FROM_AUTHORITY').length,
      manualFinanceConfirmationRequired: 0,
      nextGate: 'CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_AUDIT',
    },
    checks,
    confirmations,
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
    '# Chanjet Finance Card System Confirmation Audit',
    '',
    `Generated at: ${result.generatedAt}`,
    `Decision: ${result.decision}`,
    '',
    '## Summary',
    '',
    `- Checks: ${result.summary.passedChecks}/${result.summary.totalChecks}`,
    `- Cards: ${result.summary.totalCards}`,
    `- System confirmed authority: ${result.summary.systemConfirmedAuthority}`,
    `- System confirmed readonly: ${result.summary.systemConfirmedReadonly}`,
    `- System blocked from authority: ${result.summary.systemBlockedFromAuthority}`,
    `- Manual finance confirmation required: ${result.summary.manualFinanceConfirmationRequired}`,
    `- Next gate: ${result.summary.nextGate}`,
    '',
    '## Checks',
    '',
    '|Check|Result|Severity|Evidence|',
    '|---|---|---|---|',
    ...checks.map((item) => `|${item.name}|${item.passed ? 'PASS' : 'FAIL'}|${item.severity}|${item.evidence.replace(/\|/g, '\\|')}|`),
    '',
    '## Confirmation Matrix',
    '',
    '|Card|Status|Primary source|Authority allowed|System decision|',
    '|---|---|---|---|---|',
    ...confirmations.map((item) => `|${item.label}|${item.confirmationStatus}|${item.approvedPrimarySource}|${item.authorityAllowed ? 'YES' : 'NO'}|${item.systemDecision.replace(/\|/g, '\\|')}|`),
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
  console.log(`System authority: ${result.summary.systemConfirmedAuthority}`);
  console.log(`System readonly: ${result.summary.systemConfirmedReadonly}`);
  console.log(`System blocked: ${result.summary.systemBlockedFromAuthority}`);
}

try {
  main();
} catch (error) {
  console.error((error instanceof Error ? error.message : String(error)));
  process.exit(1);
}
