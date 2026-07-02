#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const writeReport = args.has('--write-report');
const baselinePath = resolve(ROOT, 'docs/ops/MASTER_DATA_LEGACY_REFERENCE_BASELINE.json');
const jsonReportPath = resolve(ROOT, 'docs/ops/runs/master-data-legacy-growth-latest.json');
const mdReportPath = resolve(ROOT, 'docs/ops/runs/master-data-legacy-growth-latest.md');

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function runReferenceCheck() {
  const out = execFileSync('node', ['scripts/check-master-data-references.mjs', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

function baselineByTable(baseline) {
  const map = new Map();
  for (const item of baseline.legacy_drift ?? []) {
    map.set(item.table, item);
  }
  return map;
}

function evaluate(current, baseline) {
  const baselineMap = baselineByTable(baseline);
  const findings = [];
  const rows = [];

  for (const drift of current.legacyDrift ?? []) {
    const base = baselineMap.get(drift.table);
    if (!base) {
      findings.push({
        table: drift.table,
        severity: 'FAIL',
        reason: 'Legacy source is not registered in baseline.',
        currentTotal: drift.total,
        baselineTotal: null,
        currentModuleCount: drift.moduleCount,
        baselineModuleCount: null,
      });
      rows.push({ table: drift.table, status: 'FAIL', current: drift.total, baseline: '-', modules: drift.moduleCount, moduleBaseline: '-' });
      continue;
    }

    const grewTotal = drift.total > base.baseline_total;
    const grewModules = drift.moduleCount > base.baseline_module_count;
    const status = grewTotal || grewModules ? 'FAIL' : 'PASS';

    rows.push({
      table: drift.table,
      status,
      current: drift.total,
      baseline: base.baseline_total,
      modules: drift.moduleCount,
      moduleBaseline: base.baseline_module_count,
    });

    if (status === 'FAIL') {
      findings.push({
        table: drift.table,
        severity: 'FAIL',
        reason: [
          grewTotal ? `total hits grew ${base.baseline_total} -> ${drift.total}` : null,
          grewModules ? `module count grew ${base.baseline_module_count} -> ${drift.moduleCount}` : null,
        ].filter(Boolean).join('; '),
        currentTotal: drift.total,
        baselineTotal: base.baseline_total,
        currentModuleCount: drift.moduleCount,
        baselineModuleCount: base.baseline_module_count,
        sampleHits: (drift.hits ?? []).slice(0, 5),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    baselineId: baseline.baseline_id,
    scannedFiles: current.scannedFiles,
    decision: findings.length ? 'FAIL' : 'PASS',
    findings,
    rows,
  };
}

function toMarkdown(result) {
  const lines = [
    '# Master Data Legacy Reference Growth Gate',
    '',
    `- Generated At: ${result.generatedAt}`,
    `- Baseline: ${result.baselineId}`,
    `- Scanned Files: ${result.scannedFiles}`,
    `- Decision: ${result.decision}`,
    '',
    '| Table | Status | Current Hits | Baseline Hits | Current Modules | Baseline Modules |',
    '|---|---:|---:|---:|---:|---:|',
  ];

  for (const row of result.rows) {
    lines.push(`| ${row.table} | ${row.status} | ${row.current} | ${row.baseline} | ${row.modules} | ${row.moduleBaseline} |`);
  }

  if (result.findings.length) {
    lines.push('', '## Findings', '');
    for (const finding of result.findings) {
      lines.push(`- ${finding.table}: ${finding.reason}`);
    }
  } else {
    lines.push('', 'No legacy master-data reference growth detected.');
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  if (!existsSync(baselinePath)) {
    console.error(`Missing baseline: ${baselinePath}`);
    process.exit(2);
  }

  const baseline = loadJson(baselinePath);
  const current = runReferenceCheck();
  const result = evaluate(current, baseline);
  const md = toMarkdown(result);

  console.log(md.trim());

  if (writeReport) {
    mkdirSync(dirname(jsonReportPath), { recursive: true });
    writeFileSync(jsonReportPath, `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(mdReportPath, md);
  }

  if (result.decision !== 'PASS') {
    console.error('Result: FAIL. Legacy master-data references grew beyond baseline.');
    process.exit(1);
  }

  console.log('Result: PASS. Legacy master-data references did not grow.');
}

main();
