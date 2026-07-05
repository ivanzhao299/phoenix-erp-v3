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
  const uiPath = 'apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx';

  const [service, controller, ui] = await Promise.all([
    read(servicePath),
    read(controllerPath),
    read(uiPath),
  ]);

  const checks = [
    check(
      'receipt-payment-lock-api',
      'Controller exposes protected readonly receipt/payment lock endpoint.',
      controller.includes("@Get('integration/receipt-payment-locks')")
        && controller.includes('integrationReceiptPaymentLocks')
        && controller.includes("@RequireMenu(CHANJET_PROXY_MENU, 'V')"),
      controllerPath,
    ),
    check(
      'system-confirmation-status',
      'Receipt/payment lock includes system-side confirmation status.',
      service.includes('ReceiptPaymentSystemConfirmationStatus')
        && service.includes('SYSTEM_CONFIRMED_LOCK_CANDIDATE')
        && service.includes('systemConfirmationStatus'),
      servicePath,
    ),
    check(
      'safe-query-filter',
      'Receipt/payment lock exposes safe query filter dimensions.',
      service.includes('safeQueryFilter')
        && service.includes('approved_or_audited_only')
        && service.includes('exclude_void_cancel_reversal'),
      servicePath,
    ),
    check(
      'today-card-amount-guard',
      'Receipt/payment amountSum cannot feed today finance cards in this gate.',
      service.includes('amountSumSafeForTodayCard: false')
        && service.includes('readyForCardAuthority: false')
        && service.includes('blockedFromPrimaryReason'),
      servicePath,
    ),
    check(
      'readonly-ui-tab',
      'Chanjet integration UI keeps receipt/payment locks visible as readonly evidence.',
      ui.includes("receiptPaymentLocks")
        && ui.includes('今日收款 / 今日付款语义锁')
        && ui.includes('禁止切权威'),
      uiPath,
    ),
  ];

  const passed = checks.filter((item) => item.passed).length;
  const failed = checks.filter((item) => !item.passed);
  const decision = failed.length === 0 ? 'GO_WITH_CONDITIONS' : 'HOLD';
  const generatedAt = new Date().toISOString();
  const summary = {
    generatedAt,
    decision,
    scope: 'CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_CONTINUE',
    passed,
    total: checks.length,
    failed: failed.map((item) => item.id),
    checks,
    lockedMetrics: ['TODAY_RECEIPT', 'TODAY_PAYMENT'],
    cardAuthority: {
      readyForCardAuthority: false,
      reason: 'This gate locks fields and safe filters only; it does not switch today receipt/payment cards to Chanjet authority.',
    },
    guardrails: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      erpBusinessOverwrite: false,
      dbWrite: false,
      migration: false,
      deploy: false,
      push: false,
    },
  };

  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'chanjet-receipt-payment-lock-latest.json');
  const mdPath = path.join(outputDir, 'chanjet-receipt-payment-lock-latest.md');
  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(mdPath, [
    '# Chanjet Receipt / Payment Lock Audit',
    '',
    `Generated at: ${generatedAt}`,
    `Decision: ${decision}`,
    `Checks: ${passed}/${checks.length}`,
    '',
    '## Checks',
    '',
    ...checks.map((item) => `- ${item.passed ? 'PASS' : 'FAIL'} ${item.id}: ${item.description}`),
    '',
    '## Authority Boundary',
    '',
    '- TODAY_RECEIPT/TODAY_PAYMENT remain blocked from finance card primary authority.',
    '- This gate only locks field candidates and safe query filters.',
    '- Chanjet write/delete/modify/voucher push remain forbidden.',
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
