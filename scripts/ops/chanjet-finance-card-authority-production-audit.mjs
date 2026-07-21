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
  return [
    '# Chanjet Finance Card Authority Production Audit',
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
    '## Card State',
    '',
    '|Card|Read model|Authority|Source|Status|',
    '|---|---|---|---|---|',
    ...result.cards.map((item) => `|${item.cardKey}|${item.readModelKey}|${item.authorityEnabled ? 'ENABLED' : 'BLOCKED'}|${item.source}|${item.status}|`),
    '',
    '## Guardrails',
    '',
    '- Chanjet write/delete/modify: disabled.',
    '- Voucher push: disabled.',
    '- ERP business overwrite: disabled.',
    '- Today receipt/payment cumulative mirror totals stay blocked until daily filtering and status reconciliation pass.',
    '',
  ].join('\n');
}

async function main() {
  const outputJson = join(outputDir, 'chanjet-finance-card-authority-production-latest.json');
  const outputMd = join(outputDir, 'chanjet-finance-card-authority-production-latest.md');
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run',
      apiBase,
      authenticated: Boolean(token),
      endpoints: [
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

  const [authorityEnvelope, overview] = await Promise.all([
    getJson('/chanjet/integration/finance-card-authority'),
    getJson('/v2/finance/reports/overview'),
  ]);
  if (authorityEnvelope.success !== true || !authorityEnvelope.financeCardAuthority) {
    throw new Error(authorityEnvelope.error || 'finance-card-authority returned no audit payload');
  }
  const authority = authorityEnvelope.financeCardAuthority;
  const alignment = overview.chanjetAlignment || {};
  const authorityCards = new Map((authority.cards || []).map((item) => [item.cardKey, item]));
  const businessMetrics = alignment.metrics || {};
  const authorityKeys = ['arOpen', 'apOpen', 'cashBalance', 'todayInflow', 'todayOutflow'];
  const readonlyKeys = ['subjectBalance', 'balanceSheet', 'incomeStatement'];
  const expectedSources = {
    arOpen: 'CHANJET_AR_STATISTICS_MIRROR',
    apOpen: 'CHANJET_AP_STATISTICS_MIRROR',
    cashBalance: 'CHANJET_GL_CASH_BALANCE_MIRROR',
    todayInflow: 'CHANJET_AR_RECEIPT_DAILY_EFFECTIVE_MIRROR',
    todayOutflow: 'CHANJET_AP_PAYMENT_DAILY_EFFECTIVE_MIRROR',
  };
  const checks = [
    check('eight_card_contract', authority.cards?.length === 8, `cards=${authority.cards?.length || 0}`),
    check('five_authority_cards_enabled', authorityKeys.every((key) => authorityCards.get(key)?.authorityEnabled === true), authorityKeys.join(', ')),
    check('authority_business_sources_locked', authorityKeys.every((key) => (
      businessMetrics[key]?.authorityEligible === true
      && businessMetrics[key]?.source === expectedSources[key]
    )), authorityKeys.map((key) => `${key}:${businessMetrics[key]?.source || 'missing'}`).join(', ')),
    check('readonly_report_cards_fail_closed', readonlyKeys.every((key) => (
      authorityCards.get(key)?.authorityEnabled === false
      && authorityCards.get(key)?.status === 'READONLY_READY'
    )), readonlyKeys.map((key) => `${key}:${authorityCards.get(key)?.status || 'missing'}`).join(', ')),
    check('daily_cards_use_effective_business_date_contract', ['todayInflow', 'todayOutflow'].every((key) => (
      businessMetrics[key]?.readyForCardAuthority === true
      && businessMetrics[key]?.source === expectedSources[key]
    )), ['todayInflow', 'todayOutflow'].map((key) => `${key}:${businessMetrics[key]?.source || 'missing'}`).join(', ')),
    check('authority_wiring_verified', authority.summary?.authorityWiringVerified === true, `authorityWiringVerified=${authority.summary?.authorityWiringVerified}`),
    check('next_gate_advanced', authority.summary?.nextGate === 'CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW', `nextGate=${authority.summary?.nextGate || 'missing'}`),
    check('external_write_disabled', alignment.guardrail?.includes('never overwritten') || alignment.authority === 'CHANJET_AUTHORITY_READY_ONLY_FOR_FINANCIAL_CARDS', alignment.authority || 'missing'),
  ];
  const failed = checks.filter((item) => !item.passed);
  const cards = (authority.cards || []).map((item) => ({
    cardKey: item.cardKey,
    readModelKey: item.readModelKey,
    authorityEnabled: item.authorityEnabled,
    source: businessMetrics[item.cardKey]?.source || 'NOT_EXPOSED',
    status: businessMetrics[item.cardKey]?.status || item.status,
  }));
  const result = {
    generatedAt: new Date().toISOString(),
    decision: failed.length ? 'HOLD' : 'GO_WITH_CONDITIONS',
    nextGate: authority.summary?.nextGate || 'HOLD_MISSING_NEXT_GATE',
    summary: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      authorityReady: authority.summary?.authorityReady ?? 0,
      readonlyReady: authority.summary?.readonlyReady ?? 0,
      authorityReadyRate: alignment.authorityReadyRate ?? null,
    },
    checks,
    cards,
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
  process.stderr.write(`chanjet-finance-card-authority-production-audit: ${error.message}\n`);
  process.exitCode = 1;
});
