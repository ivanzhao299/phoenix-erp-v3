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
const syncJsonPath = getArg('--sync-json', 'docs/ops/runs/chanjet-readonly-mirror-sync-latest.json');
const qaJsonPath = getArg('--qa-json', 'docs/ops/runs/chanjet-finance-card-authority-qa-latest.json');
const outputJson = join(outputDir, 'chanjet-finance-card-semantic-expansion-latest.json');
const outputMd = join(outputDir, 'chanjet-finance-card-semantic-expansion-latest.md');

const REQUIRED_CARDS = [
  ['arOpen', 'AR_OPEN', '应收待收款'],
  ['apOpen', 'AP_OPEN', '应付待付款'],
  ['cashBalance', 'CASH_BALANCE', '现金账户余额'],
  ['todayInflow', 'TODAY_RECEIPT', '今日收款'],
  ['todayOutflow', 'TODAY_PAYMENT', '今日付款'],
  ['subjectBalance', 'SUBJECT_BALANCE', '科目余额'],
  ['balanceSheet', 'BALANCE_SHEET', '资产负债表关键项'],
  ['incomeStatement', 'INCOME_STATEMENT', '利润表关键项'],
];

const ENDPOINT_TO_CARD = {
  RECEIVABLE_STATISTICS: 'AR_OPEN',
  PAYABLE_STATISTICS: 'AP_OPEN',
  FIN_ACCOUNT: 'CASH_BALANCE',
  GL_BALANCE: 'SUBJECT_BALANCE',
  PAYMENT_AR: 'TODAY_RECEIPT',
  PAYMENT_AP: 'TODAY_PAYMENT',
  BALANCE_SHEET: 'BALANCE_SHEET',
  INCOME_STATEMENT: 'INCOME_STATEMENT',
};

function readText(path) {
  if (!existsSync(path)) throw new Error(`Missing required file: ${path}`);
  return readFileSync(path, 'utf8');
}

function readJson(path, required = false) {
  if (!existsSync(path)) {
    if (required) throw new Error(`Missing required JSON: ${path}`);
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function endpointCoverage(sync) {
  const rows = sync?.coverage?.endpointCoverage || [];
  return REQUIRED_CARDS.map(([cardKey, readModelKey, label]) => {
    const endpointKeys = Object.entries(ENDPOINT_TO_CARD)
      .filter(([, key]) => key === readModelKey)
      .map(([endpoint]) => endpoint);
    const matched = rows.filter((row) => endpointKeys.includes(row.key));
    const covered = matched.some((row) => row.covered || Number(row.entityCount || row.rowCount || 0) > 0);
    return {
      cardKey,
      readModelKey,
      label,
      endpointKeys,
      covered,
      rows: matched.reduce((sum, row) => sum + Number(row.entityCount || row.rowCount || 0), 0),
      amountSum: matched.reduce((sum, row) => sum + Number(row.amountSum || 0), 0),
      latestPulledAt: matched.map((row) => row.latestPulledAt || '').filter(Boolean).sort().at(-1) || null,
    };
  });
}

function check(name, passed, severity, evidence) {
  return { name, passed: Boolean(passed), severity, evidence };
}

function main() {
  mkdirSync(outputDir, { recursive: true });
  const service = readText(servicePath);
  const controller = readText(controllerPath);
  const sync = readJson(syncJsonPath);
  const qa = readJson(qaJsonPath);

  const cards = endpointCoverage(sync);
  const checks = [
    check(
      'Semantic expansion runtime method exists',
      service.includes('financeCardSemanticLockExpansionOverview') && service.includes('FinanceCardSemanticExpansionItem'),
      'P0',
      'ChanjetIntegrationService exposes financeCardSemanticLockExpansionOverview with structured card expansion items.',
    ),
    check(
      'Semantic expansion endpoint exists',
      controller.includes("@Get('integration/finance-card-semantic-expansion')") && controller.includes('integrationFinanceCardSemanticExpansion'),
      'P0',
      'GET /api/chanjet/integration/finance-card-semantic-expansion is available behind MENU_FIN2_AR_LEDGER V.',
    ),
    check(
      'All eight finance cards are covered by expansion definitions',
      REQUIRED_CARDS.every(([cardKey, readModelKey]) => service.includes(`cardKey: '${cardKey}'`) && service.includes(`readModelKey: '${readModelKey}'`)),
      'P0',
      REQUIRED_CARDS.map(([cardKey, readModelKey]) => `${cardKey}/${readModelKey}`).join(', '),
    ),
    check(
      'Promotion remains guarded',
      service.includes('currentAuthorityEnabled') && service.includes('candidateForAuthorityPromotion') && service.includes('requiresFinanceConfirmation'),
      'P0',
      'Expansion distinguishes current authority, readonly candidates, promotion candidates, and finance confirmation requirements.',
    ),
    check(
      'Chanjet write boundaries remain explicit',
      service.includes('chanjetWrite: false') && service.includes('voucherPush: false') && service.includes('erpBusinessOverwrite: false'),
      'P0',
      'The new expansion endpoint is read-only and keeps Chanjet write/voucher push disabled.',
    ),
    check(
      'Latest readonly sync artifact covers finance card endpoints',
      cards.filter((card) => card.covered).length >= 8,
      'P1',
      `${cards.filter((card) => card.covered).length}/8 card endpoints have readonly mirror evidence.`,
    ),
    check(
      'Previous authority QA passed',
      qa?.summary?.passedChecks === qa?.summary?.totalChecks && qa?.decision === 'GO_WITH_CONDITIONS',
      'P1',
      qa ? `${qa.summary?.passedChecks || 0}/${qa.summary?.totalChecks || 0} checks, decision=${qa.decision}` : 'No previous authority QA artifact found.',
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  const result = {
    generatedAt: new Date().toISOString(),
    decision: failed.some((item) => item.severity === 'P0') ? 'HOLD' : failed.length ? 'GO_WITH_CONDITIONS' : 'GO_WITH_CONDITIONS',
    summary: {
      totalChecks: checks.length,
      passedChecks: checks.filter((item) => item.passed).length,
      failedChecks: failed.length,
      cardEndpointCoverage: cards.filter((card) => card.covered).length,
      totalCards: REQUIRED_CARDS.length,
      nextGate: 'CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW',
    },
    checks,
    cardEndpointEvidence: cards,
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
      'Call GET /api/chanjet/integration/finance-card-semantic-expansion after deploy to review actual card promotion blockers.',
      'Promote only cards with AUTHORITY_READY and no finance confirmation blockers.',
      'Keep TODAY_RECEIPT/TODAY_PAYMENT blocked until business date/status/direction are confirmed.',
      'Keep Chanjet write-back HOLD until a separate voucher draft/writeback Gate is approved.',
    ],
  };

  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`);
  const md = [
    '# Chanjet Finance Card Semantic Expansion Audit',
    '',
    `Generated at: ${result.generatedAt}`,
    `Decision: ${result.decision}`,
    '',
    '## Summary',
    '',
    `- Checks: ${result.summary.passedChecks}/${result.summary.totalChecks}`,
    `- Card endpoint coverage: ${result.summary.cardEndpointCoverage}/${result.summary.totalCards}`,
    `- Next gate: ${result.summary.nextGate}`,
    '',
    '## Checks',
    '',
    '|Check|Result|Severity|Evidence|',
    '|---|---|---|---|',
    ...checks.map((item) => `|${item.name}|${item.passed ? 'PASS' : 'FAIL'}|${item.severity}|${item.evidence.replace(/\|/g, '\\|')}|`),
    '',
    '## Card Endpoint Evidence',
    '',
    '|Card|Read Model|Covered|Rows|Amount Sum|Latest Pulled At|',
    '|---|---|---|---:|---:|---|',
    ...cards.map((card) => `|${card.label}|${card.readModelKey}|${card.covered ? 'yes' : 'no'}|${card.rows}|${card.amountSum}|${card.latestPulledAt || '-'}|`),
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
  console.log(`Wrote ${outputJson}`);
  console.log(`Wrote ${outputMd}`);
}

main();
