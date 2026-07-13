#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};

const dryRun = hasFlag('--dry-run');
const apiBase = getArg('--api-base', process.env.PHOENIX_API_BASE_URL || 'http://127.0.0.1:3100/api').replace(/\/$/, '');
const token = getArg('--token', process.env.PHOENIX_ADMIN_TOKEN || process.env.PHOENIX_AUTH_TOKEN || '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const outputJson = join(outputDir, 'chanjet-p0-production-readonly-gate-latest.json');
const outputMd = join(outputDir, 'chanjet-p0-production-readonly-gate-latest.md');

const endpoints = [
  { key: 'baseline', path: '/chanjet/integration/baseline-readiness?freshnessHours=24', payloadKey: 'baseline' },
  { key: 'accountBookGate', path: '/chanjet/integration/account-book-mapping-gate', payloadKey: 'gate' },
  { key: 'counterpartyCandidates', path: '/chanjet/integration/counterparty-mapping-candidates', payloadKey: 'candidateOverview' },
];

function markdownTable(headers, rows) {
  if (!rows.length) return '_none_';
  return [
    `|${headers.join('|')}|`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `|${headers.map((header) => String(row[header] ?? '').replace(/\|/g, '\\|')).join('|')}|`),
  ].join('\n');
}

async function readEndpoint(endpoint) {
  const response = await fetch(`${apiBase}${endpoint.path}`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${endpoint.key} returned non-JSON HTTP ${response.status}`);
  }
  if (!response.ok || !payload?.success || !payload?.[endpoint.payloadKey]) {
    throw new Error(`${endpoint.key} failed HTTP ${response.status}: ${String(payload?.error || 'invalid payload').slice(0, 240)}`);
  }
  return payload[endpoint.payloadKey];
}

function buildReport(data, errors = []) {
  const baseline = data.baseline || null;
  const gate = data.accountBookGate || null;
  const candidates = data.counterpartyCandidates || null;
  const decisions = [baseline?.decision, gate?.decision, candidates?.decision].filter(Boolean);
  const decision = errors.length || decisions.includes('HOLD')
    ? 'HOLD'
    : decisions.includes('GO_WITH_CONDITIONS')
      ? 'GO_WITH_CONDITIONS'
      : decisions.length === 3 ? 'GO' : 'HOLD';
  return {
    generatedAt: new Date().toISOString(),
    decision,
    dryRun: false,
    source: { apiBase, methods: ['GET'], authenticated: true },
    summary: {
      baselineDecision: baseline?.decision || 'UNAVAILABLE',
      expectedScopes: baseline?.summary?.expectedScopes ?? 0,
      expectedTargets: baseline?.summary?.expectedTargets ?? 0,
      freshTargets: baseline?.summary?.freshTargets ?? 0,
      staleTargets: baseline?.summary?.staleTargets ?? 0,
      missingTargets: baseline?.summary?.missingTargets ?? 0,
      accountBookDecision: gate?.decision || 'UNAVAILABLE',
      cachedBooks: gate?.summary?.cachedBooks ?? 0,
      validMappings: gate?.summary?.validMappings ?? 0,
      counterpartyDecision: candidates?.decision || 'UNAVAILABLE',
      sourceCounterparties: candidates?.summary?.sourceRows ?? 0,
      candidateCount: candidates?.summary?.candidates ?? 0,
      matchedCandidates: candidates?.summary?.matched ?? 0,
      pendingCandidates: candidates?.summary?.pending ?? 0,
      conflictCandidates: candidates?.summary?.conflicts ?? 0,
      unknownRoleCandidates: candidates?.summary?.unknownRole ?? 0,
      nextGate: baseline?.summary?.nextGate || candidates?.summary?.nextGate || 'HOLD',
    },
    errors,
    accountBookGate: gate,
    baselineScopes: baseline?.scopes || [],
    counterpartySummary: candidates?.summary || null,
    guardrails: {
      chanjetWrite: false,
      chanjetDelete: false,
      chanjetModify: false,
      voucherPush: false,
      erpBusinessOverwrite: false,
      mappingAutoApprove: false,
      requestMethods: ['GET'],
    },
  };
}

function buildMarkdown(report) {
  const summary = report.summary || {};
  const scopes = report.baselineScopes || [];
  return `# Chanjet P0 Production Readonly Gate Audit

- generated_at: ${report.generatedAt}
- decision: ${report.decision}
- api_base: ${apiBase}
- request_methods: GET only
- chanjet_write: false
- mapping_auto_approve: false

## Summary

- baseline: ${summary.baselineDecision}
- fresh_targets: ${summary.freshTargets}/${summary.expectedTargets}
- stale_targets: ${summary.staleTargets}
- missing_targets: ${summary.missingTargets}
- account_book_gate: ${summary.accountBookDecision}
- cached_books: ${summary.cachedBooks}
- valid_book_company_mappings: ${summary.validMappings}
- counterparty_gate: ${summary.counterpartyDecision}
- counterparty_candidates: ${summary.candidateCount}
- matched / pending / conflict / unknown: ${summary.matchedCandidates} / ${summary.pendingCandidates} / ${summary.conflictCandidates} / ${summary.unknownRoleCandidates}
- next_gate: ${summary.nextGate}

## Scope Readiness

${markdownTable(['endpointKey', 'bookId', 'status', 'rowCount', 'entityCount', 'ageHours', 'latestJobStatus'], scopes.map((scope) => ({
  endpointKey: scope.endpointKey,
  bookId: scope.bookId || 'enterprise',
  status: scope.status,
  rowCount: scope.rowCount,
  entityCount: scope.entityCount,
  ageHours: scope.ageHours ?? '—',
  latestJobStatus: scope.latestJobStatus,
})))}

## Errors

${(report.errors || []).length ? report.errors.map((error) => `- ${error}`).join('\n') : '- none'}

## Boundary

This audit reads three Phoenix ERP governance endpoints with GET only. It does not write, delete, or modify Chanjet data; does not push vouchers; does not approve mappings; and does not overwrite ERP business facts.
`;
}

function writeReport(report) {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outputMd, buildMarkdown(report));
  console.log(`CHANJET_P0_PRODUCTION_READONLY_GATE ${report.decision}`);
  console.log(`json=${outputJson}`);
  console.log(`md=${outputMd}`);
}

async function main() {
  if (dryRun) {
    const report = {
      generatedAt: new Date().toISOString(),
      decision: 'DRY_RUN_READY',
      dryRun: true,
      source: { apiBase, authenticated: !!token },
      summary: { nextGate: 'AUTHENTICATED_GET_ONLY_AUDIT' },
      errors: [],
      baselineScopes: [],
      plannedRequests: endpoints.map((endpoint) => ({ method: 'GET', url: `${apiBase}${endpoint.path}` })),
      guardrails: { chanjetWrite: false, mappingAutoApprove: false, requestMethods: ['GET'] },
    };
    writeReport(report);
    return;
  }
  if (!token) {
    const report = buildReport({}, ['Missing PHOENIX_ADMIN_TOKEN / PHOENIX_AUTH_TOKEN; authenticated audit failed closed.']);
    writeReport(report);
    process.exitCode = 2;
    return;
  }

  const data = {};
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      data[endpoint.key] = await readEndpoint(endpoint);
    } catch (error) {
      errors.push(error.message);
    }
  }
  const report = buildReport(data, errors);
  writeReport(report);
  if (report.decision === 'HOLD') process.exitCode = 2;
}

main().catch((error) => {
  console.error(`CHANJET_P0_PRODUCTION_READONLY_GATE FAILED: ${error.message}`);
  process.exit(1);
});
