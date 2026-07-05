#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const outputDir = argValue('--output-dir', 'docs/ops/runs');

async function read(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function check(id, description, passed, evidence) {
  return { id, description, passed, evidence };
}

async function main() {
  const servicePath = 'apps/api/src/modules/chanjet/chanjet-integration.service.ts';
  const controllerPath = 'apps/api/src/modules/chanjet/chanjet-callback.controller.ts';
  const reportsPath = 'apps/web/src/app/(admin)/finance2/reports/page.tsx';

  const [service, controller, reports] = await Promise.all([
    read(servicePath),
    read(controllerPath),
    read(reportsPath),
  ]);

  const checks = [
    check(
      'cash-balance-lock-service',
      'Service exposes financeCashBalanceFieldLockOverview.',
      service.includes('financeCashBalanceFieldLockOverview'),
      servicePath,
    ),
    check(
      'cash-balance-lock-endpoint',
      'Controller exposes protected readonly cash balance field lock endpoint.',
      controller.includes("@Get('integration/cash-balance-field-lock')")
        && controller.includes('integrationCashBalanceFieldLock')
        && controller.includes("@RequireMenu(CHANJET_PROXY_MENU, 'V')"),
      controllerPath,
    ),
    check(
      'amount-sum-zero-guard',
      'amountSum=0 is explicitly forbidden as business cash balance.',
      service.includes('amountSumZeroAsBusinessZero: false')
        && service.includes('amountSum_zero_is_not_authoritative_cash_balance'),
      servicePath,
    ),
    check(
      'read-model-block-source',
      'Finance read model blocks CASH_BALANCE amountSum=0 as non-business balance.',
      service.includes('cashAmountSumZeroPlaceholder')
        && service.includes('blocked_cash_balance_amountSum_zero_not_business_balance'),
      servicePath,
    ),
    check(
      'cash-balance-card-covered',
      'Finance report page still covers the cash balance card in the Chanjet alignment panel.',
      reports.includes('cashBalance') && reports.includes('FinanceAlignmentPanel'),
      reportsPath,
    ),
  ];

  const passed = checks.filter((item) => item.passed).length;
  const failed = checks.filter((item) => !item.passed);
  const decision = failed.length === 0 ? 'GO_WITH_CONDITIONS' : 'HOLD';
  const generatedAt = new Date().toISOString();
  const summary = {
    generatedAt,
    decision,
    scope: 'CHANJET_CASH_BALANCE_FIELD_LOCK',
    passed,
    total: checks.length,
    failed: failed.map((item) => item.id),
    checks,
    guardrails: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      dbWrite: false,
      migration: false,
      deploy: false,
      push: false,
    },
  };

  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'chanjet-cash-balance-field-lock-latest.json');
  const mdPath = path.join(outputDir, 'chanjet-cash-balance-field-lock-latest.md');
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(mdPath, [
    '# Chanjet Cash Balance Field Lock Audit',
    '',
    `Generated at: ${generatedAt}`,
    `Decision: ${decision}`,
    `Checks: ${passed}/${checks.length}`,
    '',
    '## Checks',
    '',
    ...checks.map((item) => `- ${item.passed ? 'PASS' : 'FAIL'} ${item.id}: ${item.description}`),
    '',
    '## Guardrails',
    '',
    '- Chanjet write: false',
    '- DB write: false',
    '- Migration: false',
    '- Deploy: false',
    '- Push: false',
    '',
  ].join('\n'));

  console.log(`Decision: ${decision}`);
  console.log(`Checks: ${passed}/${checks.length}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
