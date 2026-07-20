#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);

function getArg(name, fallback = '') {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
}

const dryRun = args.includes('--dry-run');
const apiBase = getArg('--api-base', process.env.PHOENIX_API_BASE || 'http://localhost:3100/api').replace(/\/$/, '');
const token = getArg('--token', process.env.PHOENIX_ACCESS_TOKEN || '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');

async function getJson(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}`);
  return payload;
}

function check(id, passed, evidence) {
  return { id, passed: Boolean(passed), evidence };
}

function markdown(result) {
  const lock = result.lock;
  return [
    '# Chanjet Cash Balance Field Lock Production Audit',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    `Decision: ${result.decision}`,
    '',
    `Next Gate: ${result.nextGate}`,
    '',
    '|Check|Result|Evidence|',
    '|---|---|---|',
    ...result.checks.map((item) => `|${item.id}|${item.passed ? 'PASS' : 'FAIL'}|${String(item.evidence).replace(/\|/g, '\\|')}|`),
    '',
    '## Locked Balance',
    '',
    `- Base currency: ${lock.baseCurrency || '—'}`,
    `- Total base balance: ${lock.totalBaseBalance ?? '—'}`,
    `- Current periods: ${(lock.currentPeriods || []).join(', ') || '—'}`,
    `- Eligible rows: ${lock.eligibleBalanceRows ?? 0}`,
    `- Book coverage: ${lock.coveredBooks ?? 0}/${lock.requiredBooks ?? 0}`,
    `- Invalid rows: ${lock.invalidContractRows ?? 0}`,
    `- Duplicate rows: ${lock.duplicateContractRows ?? 0}`,
    '',
    '## Guardrails',
    '',
    '- Chanjet write/delete/modify: disabled.',
    '- Voucher push: disabled.',
    '- ERP business overwrite: disabled.',
    '- FIN_ACCOUNT remains directory-only evidence.',
    '- A legitimate exact zero balance is allowed; missing contract evidence is not.',
    '',
  ].join('\n');
}

async function main() {
  const outputJson = join(outputDir, 'chanjet-cash-balance-field-lock-production-latest.json');
  const outputMd = join(outputDir, 'chanjet-cash-balance-field-lock-production-latest.md');
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run',
      apiBase,
      authenticated: Boolean(token),
      endpoints: [
        '/chanjet/integration/cash-balance-field-lock',
        '/chanjet/integration/finance-card-authority',
        '/v2/finance/reports/overview',
      ],
      outputJson,
      outputMd,
      chanjetWrite: false,
      databaseWrite: false,
    }, null, 2)}\n`);
    return;
  }
  if (!token) throw new Error('PHOENIX_ACCESS_TOKEN or --token is required');

  const [lockEnvelope, authorityEnvelope, overview] = await Promise.all([
    getJson('/chanjet/integration/cash-balance-field-lock'),
    getJson('/chanjet/integration/finance-card-authority'),
    getJson('/v2/finance/reports/overview'),
  ]);
  if (lockEnvelope.success !== true || !lockEnvelope.cashBalanceFieldLock?.lock) {
    throw new Error(lockEnvelope.error || 'cash balance field lock returned no payload');
  }
  if (authorityEnvelope.success !== true || !authorityEnvelope.financeCardAuthority) {
    throw new Error(authorityEnvelope.error || 'finance card authority returned no payload');
  }
  const lockOverview = lockEnvelope.cashBalanceFieldLock;
  const lock = lockOverview.lock;
  const authority = authorityEnvelope.financeCardAuthority;
  const authorityCard = (authority.cards || []).find((item) => item.cardKey === 'cashBalance');
  const businessMetric = overview.chanjetAlignment?.metrics?.cashBalance;
  const exactFields = lock.sourceFields || {};
  const checks = [
    check('authority_ready', lock.status === 'AUTHORITY_READY' && lock.readyForCardAuthority === true, `status=${lock.status}`),
    check('exact_source_fields', exactFields.book === '$entity.bookId'
      && exactFields.period === '$entity.period'
      && exactFields.subjectCode === 'rawData.glAccountCode'
      && exactFields.baseBalance === 'rawData.baseEndingBalance'
      && exactFields.originalBalance === 'rawData.endingBalance', JSON.stringify(exactFields)),
    check('eligible_rows_present', Number(lock.eligibleBalanceRows) > 0, `eligible=${lock.eligibleBalanceRows}`),
    check('contract_rows_clean', Number(lock.invalidContractRows) === 0 && Number(lock.duplicateContractRows) === 0, `invalid=${lock.invalidContractRows}, duplicate=${lock.duplicateContractRows}`),
    check('all_enabled_books_covered', Number(lock.requiredBooks) > 0 && Number(lock.coveredBooks) === Number(lock.requiredBooks), `${lock.coveredBooks}/${lock.requiredBooks}`),
    check('base_balance_is_numeric', Number.isFinite(Number(lock.totalBaseBalance)), `total=${lock.totalBaseBalance}`),
    check('mirror_fresh', Boolean(lock.latestPulledAt) && !lock.blockerReasons?.includes('cash_balance_mirror_stale_over_24h'), `latest=${lock.latestPulledAt}`),
    check('authority_card_enabled', authorityCard?.authorityEnabled === true, `enabled=${authorityCard?.authorityEnabled}`),
    check('authority_card_matches_lock', Number(authorityCard?.displayValue) === Number(lock.totalBaseBalance), `${authorityCard?.displayValue}/${lock.totalBaseBalance}`),
    check('business_page_uses_gl_source', businessMetric?.source === 'CHANJET_GL_CASH_BALANCE_MIRROR', `source=${businessMetric?.source || 'missing'}`),
    check('business_page_matches_lock', Number(businessMetric?.authoritativeValue) === Number(lock.totalBaseBalance), `${businessMetric?.authoritativeValue}/${lock.totalBaseBalance}`),
    check('external_write_disabled', lockOverview.guardrails?.chanjetWrite === false && lockOverview.guardrails?.dbWrite === false, JSON.stringify(lockOverview.guardrails)),
  ];
  const failed = checks.filter((item) => !item.passed);
  const nextGate = failed.length ? 'CHANJET_P3_CASH_BALANCE_FIELD_LOCK_REPAIR' : authority.summary?.nextGate;
  const result = {
    generatedAt: new Date().toISOString(),
    decision: failed.length ? 'HOLD' : lock.decision === 'GO' ? 'GO' : 'GO_WITH_CONDITIONS',
    nextGate,
    summary: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      totalBaseBalance: lock.totalBaseBalance,
      eligibleBalanceRows: lock.eligibleBalanceRows,
      bookCoverage: `${lock.coveredBooks}/${lock.requiredBooks}`,
    },
    checks,
    lock,
    guardrails: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      voucherPush: false,
      erpBusinessOverwrite: false,
      migration: false,
      databaseWrite: false,
    },
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(outputMd, `${markdown(result)}\n`);
  process.stdout.write(`${result.decision}: ${result.summary.passed}/${result.summary.checks}; ${result.nextGate}\n`);
  if (failed.length) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`chanjet-cash-balance-field-lock-production-audit: ${error.message}\n`);
  process.exitCode = 1;
});
