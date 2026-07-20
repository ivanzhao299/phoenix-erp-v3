#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
};

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
    '# Chanjet P2 Master Data Mapping Review Production Audit',
    '',
    `Generated: ${result.generatedAt}`,
    `Decision: ${result.decision}`,
    `Next Gate: ${result.nextGate}`,
    '',
    '|Check|Result|Evidence|',
    '|---|---|---|',
    ...result.checks.map((item) => `|${item.id}|${item.passed ? 'PASS' : 'FAIL'}|${String(item.evidence).replace(/\|/g, '\\|')}|`),
    '',
    '## Domain Review',
    '',
    '|Domain|Source rows|Exact|Need mapping|Conflicts|Waiting valid source|',
    '|---|---:|---:|---:|---:|---|',
    ...result.domains.map((domain) => `|${domain.domain}|${domain.sourceRows}|${domain.exactMatches}|${domain.needMapping}|${domain.conflicts}|${domain.waitingValidSource ? 'yes' : 'no'}|`),
    '',
    '## Guardrails',
    '',
    '- Chanjet write/delete/modify: disabled.',
    '- ERP business-table write: disabled.',
    '- Middle-layer write: disabled by this audit.',
    '- Fuzzy and cross-company auto matching: disabled.',
    '',
  ].join('\n');
}

async function main() {
  const outputJson = join(outputDir, 'chanjet-master-data-mapping-review-production-latest.json');
  const outputMd = join(outputDir, 'chanjet-master-data-mapping-review-production-latest.md');
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run',
      apiBase,
      authenticated: Boolean(token),
      endpoints: [
        '/chanjet/integration/master-data-alignment',
        '/chanjet/integration/master-data-mapping-review',
      ],
      outputJson,
      outputMd,
      chanjetWrite: false,
      databaseWrite: false,
    }, null, 2)}\n`);
    return;
  }
  if (!token) throw new Error('PHOENIX_ACCESS_TOKEN or --token is required');

  const [alignmentEnvelope, review] = await Promise.all([
    getJson('/chanjet/integration/master-data-alignment'),
    getJson('/chanjet/integration/master-data-mapping-review'),
  ]);
  if (alignmentEnvelope.success !== true || !alignmentEnvelope.alignment) {
    throw new Error(alignmentEnvelope.error || 'master-data alignment returned no payload');
  }
  const alignment = alignmentEnvelope.alignment;
  const counterparty = alignment.domains?.find((domain) => domain.key === 'COUNTERPARTY');
  const project = alignment.domains?.find((domain) => domain.key === 'PROJECT');
  const cash = review.domains?.find((domain) => domain.domain === 'CASH_ACCOUNT');
  const fakeCandidates = (review.candidates || []).filter((candidate) => (
    candidate.chanjetId === '50000'
    || candidate.chanjetCode === '50000'
    || candidate.chanjetName === '50000'
  ));
  const checks = [
    check('review_payload_available', Array.isArray(review.candidates), `candidates=${review.candidates?.length || 0}`),
    check('invalid_failure_rows_excluded', fakeCandidates.length === 0 && Number(review.summary?.invalidSourceRowsExcluded) >= 0, `fake=${fakeCandidates.length}, excluded=${review.summary?.invalidSourceRowsExcluded}`),
    check('counterparty_rejected_debt_excluded', counterparty?.status === 'READY' && counterparty?.mapping?.pending === 0, `status=${counterparty?.status}, rejected=${counterparty?.mapping?.rejected}`),
    check('project_target_is_canonical', project?.erpTargets?.includes('biz_projects.project_code'), JSON.stringify(project?.erpTargets || [])),
    check('cash_exact_candidates_present', Number(cash?.exactMatches) > 0, `exact=${cash?.exactMatches}, total=${cash?.sourceRows}`),
    check('cash_conflict_free', Number(cash?.conflicts) === 0, `conflicts=${cash?.conflicts}`),
    check('no_fuzzy_matching', review.guardrails?.fuzzyAutoMatch === false && review.guardrails?.crossCompanyMatch === false, JSON.stringify(review.guardrails || {})),
    check('external_and_business_writes_disabled', review.guardrails?.chanjetWrite === false
      && review.guardrails?.erpBusinessTableWrite === false
      && review.guardrails?.middleLayerWrite === false, JSON.stringify(review.guardrails || {})),
  ];
  const failed = checks.filter((item) => !item.passed);
  const result = {
    generatedAt: new Date().toISOString(),
    decision: failed.length ? 'HOLD' : 'GO_WITH_CONDITIONS',
    nextGate: failed.length
      ? 'CHANJET_P2_MASTER_DATA_MAPPING_REVIEW_REPAIR'
      : review.summary?.nextGate,
    summary: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      exactMatches: review.summary?.exactMatches || 0,
      needMapping: review.summary?.needMapping || 0,
      conflicts: review.summary?.conflicts || 0,
    },
    checks,
    domains: review.domains || [],
    guardrails: review.guardrails || {},
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(outputMd, `${markdown(result)}\n`);
  process.stdout.write(`${result.decision}: ${result.summary.passed}/${result.summary.checks}; ${result.nextGate}\n`);
  if (failed.length) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`chanjet-master-data-mapping-review-production-audit: ${error.message}\n`);
  process.exitCode = 1;
});
