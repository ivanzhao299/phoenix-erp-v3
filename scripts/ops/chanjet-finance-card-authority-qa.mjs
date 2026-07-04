#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);

function getArg(name, fallback = '') {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
}

const outputDir = getArg('--output-dir', 'docs/ops/runs');
const servicePath = getArg('--service', 'apps/api/src/modules/chanjet/chanjet-integration.service.ts');
const controllerPath = getArg('--controller', 'apps/api/src/modules/chanjet/chanjet-callback.controller.ts');
const financeReportsServicePath = getArg('--finance-reports-service', 'apps/api/src/modules/finance-v2/services/financial-reports.service.ts');
const financeReportsPagePath = getArg('--finance-reports-page', 'apps/web/src/app/(admin)/finance2/reports/page.tsx');
const syncJsonPath = getArg('--sync-json', 'docs/ops/runs/chanjet-readonly-mirror-sync-latest.json');
const reconciliationJsonPath = getArg('--reconciliation-json', 'docs/ops/runs/chanjet-reconciliation-center-latest.json');
const outputJson = join(outputDir, 'chanjet-finance-card-authority-qa-latest.json');
const outputMd = join(outputDir, 'chanjet-finance-card-authority-qa-latest.md');

const CARD_KEYS = [
  'arOpen',
  'apOpen',
  'cashBalance',
  'todayInflow',
  'todayOutflow',
  'subjectBalance',
  'balanceSheet',
  'incomeStatement',
];

const UI_REQUIRED_TEXT = [
  '好业财财务卡片权威接线',
  '主值来源',
  '权威接线',
  'Read Model',
  '好业财',
  'ERP 辅助',
  '差异',
  '只有 AUTHORITY_READY',
  '不静默覆盖',
];

function readText(path) {
  if (!existsSync(path)) throw new Error(`Missing required file: ${path}`);
  return readFileSync(path, 'utf8');
}

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function includesAll(text, patterns) {
  return patterns.map((pattern) => ({
    pattern,
    present: text.includes(pattern),
  }));
}

function check(name, passed, evidence, severity = 'P0') {
  return {
    name,
    passed: Boolean(passed),
    severity,
    evidence,
  };
}

function markdownTable(headers, rows) {
  if (!rows.length) return '_none_';
  return [
    `|${headers.join('|')}|`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `|${headers.map((header) => String(row[header] ?? '').replace(/\|/g, '\\|')).join('|')}|`),
  ].join('\n');
}

function main() {
  mkdirSync(outputDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const service = readText(servicePath);
  const controller = readText(controllerPath);
  const financeReportsService = readText(financeReportsServicePath);
  const financeReportsPage = readText(financeReportsPagePath);
  const sync = readJson(syncJsonPath);
  const reconciliation = readJson(reconciliationJsonPath);

  const backendCardChecks = CARD_KEYS.map((key) => ({
    cardKey: key,
    presentInAuthorityService: service.includes(`cardKey: '${key}'`),
    presentInFinancePage: financeReportsPage.includes(`key: '${key}'`),
  }));
  const uiTextChecks = includesAll(financeReportsPage, UI_REQUIRED_TEXT);

  const checks = [
    check(
      'Finance card authority endpoint exists',
      controller.includes("@Get('integration/finance-card-authority')") && controller.includes('@RequireMenu(CHANJET_PROXY_MENU, \'V\')'),
      'GET /api/chanjet/integration/finance-card-authority is protected by MENU_FIN2_AR V.',
    ),
    check(
      'Only AUTHORITY_READY can feed primary cards',
      service.includes("metric?.status === 'AUTHORITY_READY'") && service.includes('lock.readyForCardAuthority'),
      'Authority is enabled only when read model is AUTHORITY_READY and receipt/payment lock permits card authority.',
    ),
    check(
      'Chanjet write boundaries are explicit',
      service.includes('chanjetWrite: false') && service.includes('chanjetDelete: false') && service.includes('voucherPush: false'),
      'Finance authority/read-model guardrails keep Chanjet write/delete/modify/voucher push disabled.',
    ),
    check(
      'All eight finance cards are covered by authority service',
      backendCardChecks.every((item) => item.presentInAuthorityService),
      backendCardChecks.map((item) => `${item.cardKey}:${item.presentInAuthorityService ? 'yes' : 'missing'}`).join(', '),
    ),
    check(
      'All eight finance cards are rendered in finance report panel',
      backendCardChecks.every((item) => item.presentInFinancePage),
      backendCardChecks.map((item) => `${item.cardKey}:${item.presentInFinancePage ? 'yes' : 'missing'}`).join(', '),
    ),
    check(
      'UI shows source, Chanjet value, ERP auxiliary value, diff, and lock reason',
      uiTextChecks.every((item) => item.present),
      uiTextChecks.map((item) => `${item.pattern}:${item.present ? 'yes' : 'missing'}`).join(', '),
    ),
    check(
      'Finance overview consumes Chanjet authority as guarded evidence',
      financeReportsService.includes('getChanjetFinanceAuthority') &&
        financeReportsService.includes('financeReadModelOverview') &&
        financeReportsService.includes('financeReceiptPaymentDateStatusLockOverview'),
      'FinancialReportsService pulls read model and receipt/payment locks before exposing card source authority.',
    ),
    check(
      'Today receipt/payment remain blocked unless date/status/direction lock is approved',
      service.includes('readyForCardAuthority') && financeReportsPage.includes('收付款日期/状态/方向未允许进入主卡片'),
      'Receipt/payment cards expose lock blockers instead of silently using list amountSum.',
    ),
  ];

  const failedChecks = checks.filter((item) => !item.passed);
  const staticDecision = failedChecks.some((item) => item.severity === 'P0') ? 'HOLD' : 'GO_WITH_CONDITIONS';

  const syncSummary = sync?.coverage?.summary || sync?.summary || {};
  const reconciliationSummary = reconciliation?.summary || {};
  const statusCounts = reconciliationSummary.statusCounts || {};
  const conditions = [];
  if (!sync) conditions.push(`Missing optional sync artifact: ${syncJsonPath}`);
  if (!reconciliation) conditions.push(`Missing optional reconciliation artifact: ${reconciliationJsonPath}`);
  if ((statusCounts.NEED_MAPPING || 0) > 0 || (statusCounts.NEED_MANUAL_REVIEW || 0) > 0) {
    conditions.push('Some finance metrics still require mapping or manual review; they must stay comparison-only.');
  }
  if (failedChecks.length) {
    conditions.push('Static authority QA has failed checks; fix before claiming production-grade Chanjet card alignment.');
  }

  const result = {
    generatedAt,
    decision: staticDecision,
    summary: {
      totalChecks: checks.length,
      passedChecks: checks.filter((item) => item.passed).length,
      failedChecks: failedChecks.length,
      totalCards: CARD_KEYS.length,
      cardServiceCoverage: backendCardChecks.filter((item) => item.presentInAuthorityService).length,
      cardUiCoverage: backendCardChecks.filter((item) => item.presentInFinancePage).length,
      endpointCoverageRate: syncSummary.endpointCoverageRate ?? null,
      cardCoverageRate: syncSummary.cardCoverageRate ?? null,
      fieldCoverageRate: syncSummary.fieldCoverageRate ?? null,
      reconciliationStatusCounts: statusCounts,
    },
    checks,
    cardChecks: backendCardChecks,
    uiTextChecks,
    conditions,
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
    nextActions: [
      'Keep AUTHORITY_READY as the only primary-card switch.',
      'Use /finance2/reports to review card source, Chanjet value, ERP auxiliary value, diff, and blockers.',
      'Lock cash balance, subject balance, statement rows, and receipt/payment date/status semantics before promoting more cards.',
      'Continue Chanjet write-back HOLD until voucher draft review, approval, idempotency, and rollback Gates are complete.',
    ],
  };

  const md = [
    '# Chanjet Finance Card Authority QA',
    '',
    `Generated: ${generatedAt}`,
    '',
    `Decision: ${result.decision}`,
    '',
    '## Summary',
    '',
    `- Checks: ${result.summary.passedChecks}/${result.summary.totalChecks} passed.`,
    `- Card service coverage: ${result.summary.cardServiceCoverage}/${result.summary.totalCards}.`,
    `- Card UI coverage: ${result.summary.cardUiCoverage}/${result.summary.totalCards}.`,
    `- Endpoint coverage: ${result.summary.endpointCoverageRate == null ? 'unknown' : `${Math.round(result.summary.endpointCoverageRate * 100)}%`}.`,
    `- Card mirror coverage: ${result.summary.cardCoverageRate == null ? 'unknown' : `${Math.round(result.summary.cardCoverageRate * 100)}%`}.`,
    `- Field coverage: ${result.summary.fieldCoverageRate == null ? 'unknown' : `${Math.round(result.summary.fieldCoverageRate * 100)}%`}.`,
    '',
    '## Checks',
    '',
    markdownTable(
      ['Check', 'Result', 'Evidence'],
      checks.map((item) => ({
        Check: item.name,
        Result: item.passed ? 'PASS' : 'FAIL',
        Evidence: item.evidence,
      })),
    ),
    '',
    '## Card Coverage',
    '',
    markdownTable(
      ['Card', 'Service', 'UI'],
      backendCardChecks.map((item) => ({
        Card: item.cardKey,
        Service: item.presentInAuthorityService ? 'PASS' : 'FAIL',
        UI: item.presentInFinancePage ? 'PASS' : 'FAIL',
      })),
    ),
    '',
    '## Conditions',
    '',
    conditions.length ? conditions.map((item) => `- ${item}`).join('\n') : '- none',
    '',
    '## Boundaries',
    '',
    '- Chanjet write/delete/modify/voucher push: NO.',
    '- ERP business overwrite: NO.',
    '- Migration / DB write / deploy / push in this QA: NO.',
    '',
    '## Next Actions',
    '',
    result.nextActions.map((item) => `- ${item}`).join('\n'),
    '',
  ].join('\n');

  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(outputMd, md);
  console.log(`Decision: ${result.decision}`);
  console.log(`Checks: ${result.summary.passedChecks}/${result.summary.totalChecks}`);
  console.log(`Wrote: ${outputJson}`);
  console.log(`Wrote: ${outputMd}`);
  if (failedChecks.length) {
    process.exitCode = 1;
  }
}

main();
