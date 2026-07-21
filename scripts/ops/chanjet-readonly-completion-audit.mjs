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

const checks = [
  ['currentState', 'chanjet/integration/current-state'],
  ['productionReadiness', 'chanjet/integration/production-readiness'],
  ['overview', 'chanjet/integration/overview'],
  ['baselineReadiness', 'chanjet/integration/baseline-readiness'],
  ['accountBookGate', 'chanjet/integration/account-book-mapping-gate'],
  ['masterDataAlignment', 'chanjet/integration/master-data-alignment'],
  ['masterDataMappingReview', 'chanjet/integration/master-data-mapping-review'],
  ['financeCoverage', 'chanjet/integration/finance-coverage'],
  ['financeReadModel', 'chanjet/integration/finance-read-model'],
  ['financeCardAuthority', 'chanjet/integration/finance-card-authority'],
  ['financeReconciliation', 'chanjet/integration/finance-reconciliation'],
  ['fieldGapReview', 'chanjet/integration/field-gap-review-gate'],
  ['readonlyFieldAdapters', 'chanjet/integration/readonly-field-adapters'],
  ['syncJobs', 'chanjet/integration/sync-jobs?limit=100'],
  ['voucherDrafts', 'chanjet/integration/voucher-drafts?limit=100'],
  ['writebackPreparation', 'chanjet/integration/writeback-preparation'],
  ['writebackOutbox', 'chanjet/integration/writeback-outbox?limit=100'],
];

function pick(payload, keys, fallback = null) {
  for (const key of keys) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
  }
  return fallback;
}

function summarize(results) {
  const byName = Object.fromEntries(results.map((result) => [result.name, result.payload]));
  const current = pick(byName.currentState, ['currentState'], byName.currentState) || {};
  const baseline = pick(byName.baselineReadiness, ['baseline', 'readiness'], byName.baselineReadiness) || {};
  const mapping = pick(byName.masterDataMappingReview, ['review', 'mappingReview'], byName.masterDataMappingReview) || {};
  const cards = pick(byName.financeCardAuthority, ['financeCardAuthority', 'authority', 'cardAuthority'], byName.financeCardAuthority) || {};
  const reconciliation = pick(byName.financeReconciliation, ['reconciliation'], byName.financeReconciliation) || {};
  const jobs = pick(byName.syncJobs, ['jobs'], []) || [];
  const drafts = pick(byName.voucherDrafts, ['drafts', 'items'], []) || [];
  const preparation = pick(byName.writebackPreparation, ['preparation'], byName.writebackPreparation) || {};
  const outbox = pick(byName.writebackOutbox, ['outbox', 'items'], []) || [];
  const failedJobs = Array.isArray(jobs) ? jobs.filter((job) => job.status === 'FAIL' || job.status === 'FAILED') : [];
  const unsafeDrafts = Array.isArray(drafts) ? drafts.filter((draft) => draft.pushAllowed === true || draft.push_allowed === true) : [];
  const unsafeOutbox = Array.isArray(outbox)
    ? outbox.filter((item) => item.externalWriteEnabled === true || item.external_write_enabled === true)
    : [];
  const httpFailures = results.filter((result) => !result.ok);
  const missingTargets = Number(baseline?.summary?.missingTargets ?? current?.summary?.missingMirrorTargets ?? 0);
  const mappingConflicts = Number(mapping?.summary?.conflicts ?? 0);
  const reconciliationOpen = Number(
    reconciliation?.summary?.open
      ?? reconciliation?.summary?.openItems
      ?? (reconciliation?.summary
        ? Number(reconciliation.summary.mismatch || 0)
          + Number(reconciliation.summary.needMapping || 0)
          + Number(reconciliation.summary.needManualReview || 0)
          + Number(reconciliation.summary.hold || 0)
        : undefined)
      ?? current?.summary?.reconciliationOpen
      ?? 0,
  );
  const blockers = [];
  if (httpFailures.length) blockers.push(`${httpFailures.length} 个审计端点失败`);
  if (missingTargets > 0) blockers.push(`${missingTargets} 个只读镜像目标缺失`);
  if (mappingConflicts > 0) blockers.push(`${mappingConflicts} 个主数据映射冲突`);
  if (unsafeDrafts.length > 0) blockers.push(`${unsafeDrafts.length} 条凭证草稿错误允许外部推送`);
  if (unsafeOutbox.length > 0) blockers.push(`${unsafeOutbox.length} 条 Outbox 错误启用外部写入`);
  if (preparation.externalWriteEnabled === true || preparation.externalNetworkTransportImplemented === true) {
    blockers.push('Wave 6 准备态错误启用外部写入或外部网络传输');
  }
  return {
    decision: blockers.length ? 'HOLD' : 'GO_WITH_CONDITIONS',
    endpointChecks: results.length,
    endpointPasses: results.length - httpFailures.length,
    httpFailures: httpFailures.map((item) => ({ name: item.name, status: item.status, error: item.error })),
    readonlyMirror: {
      expectedTargets: Number(baseline?.summary?.expectedTargets ?? current?.summary?.mirrorTargets ?? 0),
      freshTargets: Number(baseline?.summary?.freshTargets ?? current?.summary?.freshMirrorTargets ?? 0),
      missingTargets,
    },
    masterData: {
      validSourceRows: Number(mapping?.summary?.validSourceRows ?? 0),
      invalidExcluded: Number(mapping?.summary?.invalidSourceRowsExcluded ?? mapping?.summary?.invalidExcluded ?? 0),
      sourceReferences: Number(mapping?.summary?.sourceReferences ?? 0),
      exactMatches: Number(mapping?.summary?.exactMatches ?? 0),
      needMapping: Number(mapping?.summary?.needMapping ?? 0),
      conflicts: mappingConflicts,
    },
    financeCards: cards?.summary ?? {},
    reconciliationOpen,
    recentSyncJobs: Array.isArray(jobs) ? jobs.length : 0,
    recentFailedJobs: failedJobs.length,
    voucherDrafts: Array.isArray(drafts) ? drafts.length : 0,
    unsafeVoucherDrafts: unsafeDrafts.length,
    writebackOutbox: Array.isArray(outbox) ? outbox.length : 0,
    unsafeWritebackOutbox: unsafeOutbox.length,
    writebackPreparation: {
      decision: preparation.decision ?? null,
      externalWriteEnabled: preparation.externalWriteEnabled ?? false,
      externalNetworkTransportImplemented: preparation.externalNetworkTransportImplemented ?? false,
    },
    blockers,
    conditions: current?.conditions ?? [],
    nextGate: current?.summary?.nextGate ?? null,
    externalWriteEnabled: unsafeDrafts.length > 0
      || unsafeOutbox.length > 0
      || preparation.externalWriteEnabled === true
      || preparation.externalNetworkTransportImplemented === true,
  };
}

function markdown(report) {
  const rows = report.results.map((result) => (
    `|${result.name}|${result.status}|${result.ok ? 'PASS' : 'FAIL'}|${result.error || '-'}|`
  ));
  return [
    '# Chanjet Readonly Completion Audit',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Decision: ${report.summary.decision}`,
    '',
    '|Check|HTTP|Result|Error|',
    '|---|---:|---|---|',
    ...rows,
    '',
    '## Runtime Summary',
    '',
    `- Endpoint checks: ${report.summary.endpointPasses}/${report.summary.endpointChecks}`,
    `- Mirror targets: ${report.summary.readonlyMirror.freshTargets}/${report.summary.readonlyMirror.expectedTargets}; missing ${report.summary.readonlyMirror.missingTargets}`,
    `- Master data: exact ${report.summary.masterData.exactMatches}; readonly source references ${report.summary.masterData.sourceReferences}; need mapping ${report.summary.masterData.needMapping}; conflicts ${report.summary.masterData.conflicts}; invalid excluded ${report.summary.masterData.invalidExcluded}`,
    `- Reconciliation open: ${report.summary.reconciliationOpen}`,
    `- Recent failed sync jobs: ${report.summary.recentFailedJobs}/${report.summary.recentSyncJobs}`,
    `- Voucher drafts: ${report.summary.voucherDrafts}; unsafe push-enabled ${report.summary.unsafeVoucherDrafts}`,
    `- Writeback Outbox: ${report.summary.writebackOutbox}; unsafe external-write-enabled ${report.summary.unsafeWritebackOutbox}`,
    `- Writeback preparation: ${report.summary.writebackPreparation.decision || '-'}; external write ${report.summary.writebackPreparation.externalWriteEnabled}; network transport ${report.summary.writebackPreparation.externalNetworkTransportImplemented}`,
    `- Next gate: ${report.summary.nextGate || '-'}`,
    '',
    '## Guardrails',
    '',
    '- This audit uses authenticated GET requests only.',
    '- It does not write, modify, or delete Chanjet data.',
    '- It does not confirm ERP mappings, push vouchers, deploy, or run migrations.',
    '',
  ].join('\n');
}

async function fetchCheck([name, path]) {
  let lastResult = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(`${apiBase}/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { excerpt: text.slice(0, 500) };
    }
    const declaredFailure = payload?.success === false;
    lastResult = {
      name,
      path,
      status: response.status,
      ok: response.ok && !declaredFailure,
      error: response.ok && !declaredFailure ? '' : String(payload?.error || payload?.message || `HTTP ${response.status}`),
      payload,
      attempts: attempt,
    };
    if (lastResult.ok) return lastResult;
  }
  return lastResult;
}

async function main() {
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run',
      apiBase,
      checks: checks.map(([name, path]) => ({ name, path })),
      authenticated: Boolean(token),
      requestMethods: ['GET'],
      chanjetWrite: false,
      erpWrite: false,
      outputJson: join(outputDir, 'chanjet-readonly-completion-audit-latest.json'),
      outputMd: join(outputDir, 'chanjet-readonly-completion-audit-latest.md'),
    }, null, 2)}\n`);
    return;
  }
  if (!token) throw new Error('PHOENIX_ACCESS_TOKEN or --token is required');
  const results = [];
  for (const check of checks) results.push(await fetchCheck(check));
  const report = {
    generatedAt: new Date().toISOString(),
    apiBase,
    guardrails: { requestMethods: ['GET'], chanjetWrite: false, erpWrite: false },
    summary: summarize(results),
    results,
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'chanjet-readonly-completion-audit-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outputDir, 'chanjet-readonly-completion-audit-latest.md'), markdown(report));
  process.stdout.write(`${report.summary.decision}: ${report.summary.endpointPasses}/${report.summary.endpointChecks} checks; mirror ${report.summary.readonlyMirror.freshTargets}/${report.summary.readonlyMirror.expectedTargets}\n`);
  if (report.summary.decision === 'HOLD') process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`chanjet-readonly-completion-audit: ${error.message}\n`);
  process.exitCode = 1;
});
