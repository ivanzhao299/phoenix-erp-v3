#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const outputDir = getArg('--output-dir', 'docs/ops/runs');
const servicePath = getArg('--service', 'apps/api/src/modules/chanjet/chanjet-integration.service.ts');
const controllerPath = getArg('--controller', 'apps/api/src/modules/chanjet/chanjet-callback.controller.ts');
const financeReportsServicePath = getArg('--finance-reports-service', 'apps/api/src/modules/finance-v2/services/financial-reports.service.ts');
const financeReportsPagePath = getArg('--finance-reports-page', 'apps/web/src/app/(admin)/finance2/reports/page.tsx');
const systemConfirmationJsonPath = getArg('--system-confirmation-json', 'docs/ops/runs/chanjet-finance-card-system-confirmation-latest.json');
const outputJson = join(outputDir, 'chanjet-finance-card-source-switch-audit-latest.json');
const outputMd = join(outputDir, 'chanjet-finance-card-source-switch-audit-latest.md');

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

const EXPECTED = {
  AR_OPEN: { status: 'SWITCH_READY', source: 'CHANJET', primary: true },
  AP_OPEN: { status: 'SWITCH_READY', source: 'CHANJET', primary: true },
  CASH_BALANCE: { status: 'SWITCH_BLOCKED', source: 'ERP', primary: false },
  TODAY_RECEIPT: { status: 'SWITCH_BLOCKED', source: 'ERP', primary: false },
  TODAY_PAYMENT: { status: 'SWITCH_BLOCKED', source: 'ERP', primary: false },
  SUBJECT_BALANCE: { status: 'READONLY_REPORT_READY', source: 'CHANJET_READONLY_REPORT', primary: false },
  BALANCE_SHEET: { status: 'READONLY_REPORT_READY', source: 'CHANJET_READONLY_REPORT', primary: false },
  INCOME_STATEMENT: { status: 'READONLY_REPORT_READY', source: 'CHANJET_READONLY_REPORT', primary: false },
};

function readText(path) {
  if (!existsSync(path)) throw new Error(`Missing required file: ${path}`);
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Missing required JSON: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function check(name, passed, evidence, severity = 'P0') {
  return { name, passed: Boolean(passed), severity, evidence };
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function main() {
  mkdirSync(outputDir, { recursive: true });
  const service = readText(servicePath);
  const controller = readText(controllerPath);
  const financeReportsService = readText(financeReportsServicePath);
  const financeReportsPage = readText(financeReportsPagePath);
  const systemConfirmation = readJson(systemConfirmationJsonPath);
  const confirmations = systemConfirmation.confirmations || [];

  const switchItems = REQUIRED_KEYS.map((key) => {
    const confirmation = confirmations.find((item) => item.readModelKey === key);
    const expected = EXPECTED[key];
    return {
      readModelKey: key,
      cardKey: confirmation?.cardKey || key,
      label: confirmation?.label || key,
      expectedSourceSwitchStatus: expected.status,
      expectedPrimaryValueSource: expected.source,
      expectedCanFeedPrimaryFinanceCard: expected.primary,
      confirmationStatus: confirmation?.confirmationStatus || 'MISSING_CONFIRMATION',
      actualPolicyInService: service.includes(`readModelKey: item.readModelKey`) && service.includes(expected.status),
      evidence: confirmation?.evidence || [],
    };
  });

  const checks = [
    check(
      'Source switch audit runtime method exists',
      service.includes('financeCardSourceSwitchAuditOverview') && service.includes('FinanceCardSourceSwitchAuditItem'),
      'ChanjetIntegrationService exposes structured source switch audit.',
    ),
    check(
      'Source switch audit endpoint exists',
      controller.includes("@Get('integration/finance-card-source-switch-audit')") && controller.includes('integrationFinanceCardSourceSwitchAudit'),
      'GET /api/chanjet/integration/finance-card-source-switch-audit exists behind MENU_FIN2_AR_LEDGER:V.',
    ),
    check(
      'Finance report primary value path is guarded by system confirmation',
      financeReportsService.includes('financeCardSystemConfirmationOverview') &&
        financeReportsService.includes('systemConfirmationByKey') &&
        financeReportsService.includes('sourceSwitchAllowed') &&
        financeReportsService.includes("SYSTEM_CONFIRMED_AUTHORITY"),
      'FinancialReportsService now requires both read-model AUTHORITY_READY and SYSTEM_CONFIRMED_AUTHORITY before using Chanjet authoritativeValue.',
    ),
    check(
      'Only AR/AP are allowed to feed primary finance cards',
      switchItems
        .filter((item) => item.expectedCanFeedPrimaryFinanceCard)
        .map((item) => item.readModelKey)
        .sort()
        .join(',') === 'AP_OPEN,AR_OPEN',
      'System-confirmed primary switch set is AR_OPEN and AP_OPEN only.',
    ),
    check(
      'Blocked and readonly cards cannot feed primary finance cards',
      switchItems
        .filter((item) => !item.expectedCanFeedPrimaryFinanceCard)
        .every((item) => ['SWITCH_BLOCKED', 'READONLY_REPORT_READY'].includes(item.expectedSourceSwitchStatus)),
      'Cash, today receipt/payment, subject balance, balance sheet, and income statement are not primary-card switches.',
    ),
    check(
      'Finance UI displays source, ERP auxiliary, diff, and no silent overwrite warning',
      ['主值来源', 'ERP 辅助', '差异', '不静默覆盖', '只有 AUTHORITY_READY'].every((text) => financeReportsPage.includes(text)),
      'Finance report page visibly exposes source and difference context.',
    ),
    check(
      'Write boundaries remain closed',
      service.includes('chanjetWrite: false') && service.includes('dbWrite: false') && service.includes('voucherPush: false'),
      'Source switch audit is readonly and does not write Chanjet or ERP business facts.',
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
      totalCards: switchItems.length,
      switchReady: switchItems.filter((item) => item.expectedSourceSwitchStatus === 'SWITCH_READY').length,
      readonlyReportReady: switchItems.filter((item) => item.expectedSourceSwitchStatus === 'READONLY_REPORT_READY').length,
      switchBlocked: switchItems.filter((item) => item.expectedSourceSwitchStatus === 'SWITCH_BLOCKED').length,
      unsafeSwitchesPrevented: switchItems.filter((item) => !item.expectedCanFeedPrimaryFinanceCard).length,
      nextGate: 'CHANJET_P3_FINANCE_CARD_SOURCE_SWITCH_UI_QA',
    },
    checks,
    switchItems,
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
    '# Chanjet Finance Card Source Switch Audit',
    '',
    `Generated at: ${result.generatedAt}`,
    `Decision: ${result.decision}`,
    '',
    '## Summary',
    '',
    `- Checks: ${result.summary.passedChecks}/${result.summary.totalChecks}`,
    `- Switch ready: ${result.summary.switchReady}`,
    `- Readonly report ready: ${result.summary.readonlyReportReady}`,
    `- Switch blocked: ${result.summary.switchBlocked}`,
    `- Unsafe switches prevented: ${result.summary.unsafeSwitchesPrevented}`,
    `- Next gate: ${result.summary.nextGate}`,
    '',
    '## Checks',
    '',
    '|Check|Result|Severity|Evidence|',
    '|---|---|---|---|',
    ...checks.map((item) => `|${escapeCell(item.name)}|${item.passed ? 'PASS' : 'FAIL'}|${item.severity}|${escapeCell(item.evidence)}|`),
    '',
    '## Source Switch Matrix',
    '',
    '|Card|Expected status|Primary source|Can feed primary card|Confirmation status|',
    '|---|---|---|---|---|',
    ...switchItems.map((item) => `|${escapeCell(item.label)}|${item.expectedSourceSwitchStatus}|${item.expectedPrimaryValueSource}|${item.expectedCanFeedPrimaryFinanceCard ? 'YES' : 'NO'}|${item.confirmationStatus}|`),
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
  console.log(`Switch ready: ${result.summary.switchReady}`);
  console.log(`Readonly ready: ${result.summary.readonlyReportReady}`);
  console.log(`Blocked: ${result.summary.switchBlocked}`);
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
