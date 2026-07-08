#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};

const inputJson = getArg('--input-json', 'docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.json');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const outputJson = join(outputDir, 'chanjet-readonly-adapter-sample-review-latest.json');
const outputMd = join(outputDir, 'chanjet-readonly-adapter-sample-review-latest.md');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isMissing(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  return !text || text === '—' || text === 'UNKNOWN';
}

function percent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 1000) / 10;
}

function table(headers, rows) {
  if (!rows.length) return '_none_';
  return [
    `|${headers.join('|')}|`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `|${headers.map((header) => String(row[header] ?? '').replace(/\|/g, '\\|')).join('|')}|`),
  ].join('\n');
}

function domainReview(adapter, fields) {
  const rows = asArray(adapter?.rows);
  const fieldStats = fields.map((field) => {
    const present = rows.filter((row) => !isMissing(row?.[field])).length;
    const samples = [...new Set(rows.map((row) => row?.[field]).filter((value) => !isMissing(value)).map(String))].slice(0, 8);
    return {
      field,
      present,
      total: rows.length,
      coverage: percent(present, rows.length),
      samples,
      locked: rows.length > 0 && present === rows.length,
    };
  });
  return {
    adapterKey: adapter?.adapterKey || 'UNKNOWN',
    status: adapter?.status || 'UNKNOWN',
    sampleRows: rows.length,
    fieldStats,
    lockedFields: fieldStats.filter((item) => item.locked).map((item) => item.field),
    openFields: fieldStats.filter((item) => !item.locked).map((item) => item.field),
  };
}

function buildReview(audit) {
  const adapters = new Map(asArray(audit.adapters).map((adapter) => [adapter.adapterKey, adapter]));
  const voucherHeader = domainReview(adapters.get('CHANJET_VOUCHER_HEADER'), [
    'voucherId',
    'voucherNo',
    'voucherDate',
    'status',
  ]);
  const voucherLine = domainReview(adapters.get('CHANJET_VOUCHER_LINE'), [
    'lineNo',
    'subjectCode',
    'subjectName',
    'debitAmount',
    'creditAmount',
    'currency',
  ]);
  const counterparty = domainReview(adapters.get('CHANJET_COUNTERPARTY'), [
    'externalId',
    'externalCode',
    'externalName',
    'roleCandidate',
    'mappingReviewStatus',
  ]);

  const allFields = [...voucherHeader.fieldStats, ...voucherLine.fieldStats, ...counterparty.fieldStats];
  const lockedCount = allFields.filter((item) => item.locked).length;
  const openFields = [
    ...voucherHeader.openFields.map((field) => `voucher_header.${field}`),
    ...voucherLine.openFields.map((field) => `voucher_line.${field}`),
    ...counterparty.openFields.map((field) => `counterparty.${field}`),
  ];
  const blockers = [];
  const conditions = [];
  if (voucherHeader.openFields.includes('status')) conditions.push('voucher_status_semantics_require_authenticated_rerun_after_adapter_patch');
  if (voucherLine.openFields.includes('subjectCode') || voucherLine.openFields.includes('subjectName')) {
    conditions.push('subject_code_name_semantics_require_glAccount_adapter_patch_deployed_and_verified');
  }
  if (counterparty.openFields.includes('mappingReviewStatus')) {
    conditions.push('counterparty_mapping_review_status_requires_approved_mapping_before_business_page_authority');
  }
  if ((audit.decision || '').startsWith('HOLD')) blockers.push('source_adapter_audit_is_hold');

  return {
    generatedAt: new Date().toISOString(),
    source: inputJson,
    decision: blockers.length ? 'HOLD' : openFields.length ? 'GO_WITH_CONDITIONS' : 'GO',
    summary: {
      sourceDecision: audit.decision || 'UNKNOWN',
      reviewedDomains: 3,
      reviewedFields: allFields.length,
      lockedFields: lockedCount,
      openFields: openFields.length,
      semanticCoverage: percent(lockedCount, allFields.length),
      nextGate: openFields.length
        ? 'CHANJET_READONLY_ADAPTER_PATCH_DEPLOY_AND_AUTHENTICATED_RERUN'
        : 'CHANJET_FINANCE_CARD_AUTHORITY_PROMOTION_REVIEW',
    },
    domains: {
      voucherHeader,
      voucherLine,
      counterparty,
    },
    openFields,
    conditions,
    blockers,
    guardrails: {
      chanjetWrite: false,
      chanjetModify: false,
      chanjetDelete: false,
      voucherPush: false,
      erpBusinessOverwrite: false,
      dbWrite: false,
      rule: 'Sample review is read-only and only promotes fields after explicit semantic coverage evidence.',
    },
  };
}

function markdown(report) {
  const domainRows = Object.values(report.domains).map((domain) => ({
    domain: domain.adapterKey,
    sourceStatus: domain.status,
    sampleRows: domain.sampleRows,
    lockedFields: domain.lockedFields.join(', ') || 'none',
    openFields: domain.openFields.join(', ') || 'none',
  }));
  const fieldRows = Object.values(report.domains).flatMap((domain) => domain.fieldStats.map((field) => ({
    domain: domain.adapterKey,
    field: field.field,
    coverage: `${field.coverage}%`,
    samples: field.samples.join(', ') || 'none',
    locked: field.locked ? 'yes' : 'no',
  })));
  return `# Chanjet Readonly Adapter Sample Review

- generated_at: ${report.generatedAt}
- source: ${report.source}
- decision: ${report.decision}
- semantic_coverage: ${report.summary.semanticCoverage}%
- next_gate: ${report.summary.nextGate}
- chanjet_write: false
- voucher_push: false
- erp_business_overwrite: false

## Domain Summary

${table(['domain', 'sourceStatus', 'sampleRows', 'lockedFields', 'openFields'], domainRows)}

## Field Coverage

${table(['domain', 'field', 'coverage', 'samples', 'locked'], fieldRows)}

## Conditions

${report.conditions.length ? report.conditions.map((item) => `- ${item}`).join('\n') : '- none'}

## Blockers

${report.blockers.length ? report.blockers.map((item) => `- ${item}`).join('\n') : '- none'}

## Guardrails

${report.guardrails.rule}
`;
}

function main() {
  if (!existsSync(inputJson)) {
    console.error(`Input audit JSON not found: ${inputJson}`);
    process.exit(2);
  }
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const audit = JSON.parse(readFileSync(inputJson, 'utf8'));
  const report = buildReview(audit);
  writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(outputMd, markdown(report));
  console.log(`CHANJET_READONLY_ADAPTER_SAMPLE_REVIEW ${report.decision}`);
  console.log(`semanticCoverage=${report.summary.semanticCoverage}%`);
  console.log(`json=${outputJson}`);
  console.log(`md=${outputMd}`);
  if (report.decision === 'HOLD') process.exitCode = 2;
}

main();
