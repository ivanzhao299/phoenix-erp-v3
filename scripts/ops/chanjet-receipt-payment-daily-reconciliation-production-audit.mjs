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
const businessDate = getArg('--business-date', '');
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
    '# Chanjet Receipt Payment Daily Reconciliation Production Audit',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    `Business date: ${result.businessDate}`,
    '',
    `Decision: ${result.decision}`,
    '',
    `Next Gate: ${result.nextGate}`,
    '',
    '|Check|Result|Evidence|',
    '|---|---|---|',
    ...result.checks.map((item) => `|${item.id}|${item.passed ? 'PASS' : 'FAIL'}|${String(item.evidence).replace(/\|/g, '\\|')}|`),
    '',
    '## Daily Metrics',
    '',
    '|Metric|Entity|Business date|Effective rows|Excluded rows|Amount|Authority|',
    '|---|---|---|---:|---:|---:|---|',
    ...result.metrics.map((item) => `|${item.key}|${item.entityType}|${item.businessDate}|${item.effectiveRows}|${item.excludedRows}|${item.amount ?? '—'}|${item.readyForCardAuthority ? 'READY' : 'HOLD'}|`),
    '',
    '## Guardrails',
    '',
    '- Chanjet write/delete/modify: disabled.',
    '- Voucher push: disabled.',
    '- ERP business overwrite: disabled.',
    '- Daily totals use only rawData.bizDate + EFFECTIVE + rawData.totalAmount.',
    '- SUBMITTED and every non-EFFECTIVE status remain excluded.',
    '',
  ].join('\n');
}

async function main() {
  const outputJson = join(outputDir, 'chanjet-receipt-payment-daily-reconciliation-production-latest.json');
  const outputMd = join(outputDir, 'chanjet-receipt-payment-daily-reconciliation-production-latest.md');
  const query = businessDate ? `?businessDate=${encodeURIComponent(businessDate)}` : '';
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run',
      apiBase,
      authenticated: Boolean(token),
      endpoints: [
        `/chanjet/integration/receipt-payment-daily-reconciliation${query}`,
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

  const [dailyEnvelope, authorityEnvelope, overview] = await Promise.all([
    getJson(`/chanjet/integration/receipt-payment-daily-reconciliation${query}`),
    getJson('/chanjet/integration/finance-card-authority'),
    getJson('/v2/finance/reports/overview'),
  ]);
  if (dailyEnvelope.success !== true || !dailyEnvelope.dailyReconciliation) {
    throw new Error(dailyEnvelope.error || 'daily reconciliation returned no payload');
  }
  if (authorityEnvelope.success !== true || !authorityEnvelope.financeCardAuthority) {
    throw new Error(authorityEnvelope.error || 'finance card authority returned no payload');
  }
  const daily = dailyEnvelope.dailyReconciliation;
  const authority = authorityEnvelope.financeCardAuthority;
  const metrics = daily.metrics || [];
  const dailyByKey = new Map(metrics.map((item) => [item.key, item]));
  const authorityByKey = new Map((authority.cards || []).map((item) => [item.cardKey, item]));
  const businessMetrics = overview.chanjetAlignment?.metrics || {};
  const expected = [
    { key: 'TODAY_RECEIPT', cardKey: 'todayInflow', source: 'CHANJET_AR_RECEIPT_DAILY_EFFECTIVE_MIRROR' },
    { key: 'TODAY_PAYMENT', cardKey: 'todayOutflow', source: 'CHANJET_AP_PAYMENT_DAILY_EFFECTIVE_MIRROR' },
  ];
  const checks = [
    check('daily_contract_two_metrics', metrics.length === 2, `metrics=${metrics.length}`),
    check('daily_authority_ready', daily.summary?.authorityReady === 2, `authorityReady=${daily.summary?.authorityReady}`),
    check('exact_source_fields', expected.every(({ key }) => {
      const fields = dailyByKey.get(key)?.sourceFields || {};
      return fields.businessDate === 'rawData.bizDate'
        && fields.status === 'rawData.voucherStatusEnum'
        && fields.amount === 'rawData.totalAmount'
        && fields.direction === 'entity_type_contract';
    }), 'bizDate + voucherStatusEnum + totalAmount + entity contract'),
    check('effective_only_guardrail', daily.guardrails?.effectiveStatus === 'EFFECTIVE'
      && String(daily.guardrails?.excludedStatuses || '').includes('non_EFFECTIVE'), JSON.stringify({
      effectiveStatus: daily.guardrails?.effectiveStatus,
      excludedStatuses: daily.guardrails?.excludedStatuses,
    })),
    check('today_cards_authority_enabled', expected.every(({ cardKey }) => authorityByKey.get(cardKey)?.authorityEnabled === true), expected.map(({ cardKey }) => `${cardKey}:${authorityByKey.get(cardKey)?.authorityEnabled}`).join(', ')),
    check('today_cards_use_daily_amount', expected.every(({ key, cardKey }) => Number(authorityByKey.get(cardKey)?.displayValue) === Number(dailyByKey.get(key)?.amount)), expected.map(({ key, cardKey }) => `${cardKey}:${authorityByKey.get(cardKey)?.displayValue}/${dailyByKey.get(key)?.amount}`).join(', ')),
    check('business_pages_use_daily_source', expected.every(({ cardKey, source }) => businessMetrics[cardKey]?.source === source), expected.map(({ cardKey }) => `${cardKey}:${businessMetrics[cardKey]?.source || 'missing'}`).join(', ')),
    check('next_gate_advanced', authority.summary?.nextGate === 'CHANJET_P3_CASH_BALANCE_FIELD_LOCK', `nextGate=${authority.summary?.nextGate || 'missing'}`),
    check('external_write_disabled', daily.guardrails?.chanjetWrite === false && daily.guardrails?.dbWrite === false, JSON.stringify({ chanjetWrite: daily.guardrails?.chanjetWrite, dbWrite: daily.guardrails?.dbWrite })),
  ];
  const failed = checks.filter((item) => !item.passed);
  const result = {
    generatedAt: new Date().toISOString(),
    businessDate: daily.businessDate,
    decision: failed.length ? 'HOLD' : 'GO_WITH_CONDITIONS',
    nextGate: failed.length ? 'CHANJET_P3_RECEIPT_PAYMENT_DAILY_RECONCILIATION_REPAIR' : authority.summary?.nextGate,
    summary: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      authorityReady: daily.summary?.authorityReady ?? 0,
      effectiveRows: daily.summary?.effectiveRows ?? 0,
      excludedRows: daily.summary?.excludedRows ?? 0,
    },
    checks,
    metrics,
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
  process.stderr.write(`chanjet-receipt-payment-daily-reconciliation-production-audit: ${error.message}\n`);
  process.exitCode = 1;
});
