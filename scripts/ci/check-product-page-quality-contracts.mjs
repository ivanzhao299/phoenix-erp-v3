#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const writeReport = args.has('--write-report');
const contractPath = resolve(ROOT, 'docs/ops/PRODUCT_PAGE_QUALITY_CONTRACTS.json');
const jsonReportPath = resolve(ROOT, 'docs/ops/runs/product-page-quality-contracts-latest.json');
const mdReportPath = resolve(ROOT, 'docs/ops/runs/product-page-quality-contracts-latest.md');

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readPageFiles(files) {
  const parts = [];
  const missing = [];
  for (const file of files) {
    const abs = resolve(ROOT, file);
    if (!existsSync(abs)) {
      missing.push(file);
      continue;
    }
    parts.push(readFileSync(abs, 'utf8'));
  }
  return { source: parts.join('\n'), missing };
}

function evaluatePage(page) {
  const { source, missing } = readPageFiles(page.files ?? []);
  const missingMustInclude = (page.must_include ?? []).filter((signal) => !source.includes(signal));
  const forbiddenHits = (page.must_not_include ?? []).filter((signal) => source.includes(signal));
  const rawUploadRisk = [
    /href\s*=\s*["'`]\s*\/uploads\//,
    /window\.open\([^)]*\/uploads\//,
    /storage_path|storagePath/,
  ].filter((pattern) => pattern.test(source)).map(String);
  const failures = [
    ...missing.map((file) => `missing file: ${file}`),
    ...missingMustInclude.map((signal) => `missing required signal: ${signal}`),
    ...forbiddenHits.map((signal) => `forbidden signal present: ${signal}`),
    ...rawUploadRisk.map((signal) => `raw attachment exposure risk: ${signal}`),
  ];
  return {
    name: page.name,
    route: page.route,
    status: failures.length ? 'FAIL' : 'PASS',
    files: page.files ?? [],
    failures,
    requiredSignalCount: (page.must_include ?? []).length,
    forbiddenSignalCount: (page.must_not_include ?? []).length,
  };
}

function toMarkdown(result) {
  const lines = [
    '# Product Page Quality Contracts',
    '',
    `- Generated At: ${result.generatedAt}`,
    `- Contract: ${result.contractId}`,
    `- Decision: ${result.decision}`,
    '',
    '| Page | Route | Result | Required Signals | Forbidden Signals |',
    '|---|---|---:|---:|---:|',
  ];
  for (const page of result.pages) {
    lines.push(`| ${page.name} | ${page.route} | ${page.status} | ${page.requiredSignalCount} | ${page.forbiddenSignalCount} |`);
  }
  if (result.failures.length) {
    lines.push('', '## Failures', '');
    for (const page of result.failures) {
      lines.push(`- ${page.name} (${page.route})`);
      for (const failure of page.failures) lines.push(`  - ${failure}`);
    }
  } else {
    lines.push('', 'All high-frequency product pages satisfy their quality contracts.');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  if (!existsSync(contractPath)) {
    console.error(`Missing product page quality contract: ${contractPath}`);
    process.exit(2);
  }
  const contract = loadJson(contractPath);
  const pages = (contract.pages ?? []).map(evaluatePage);
  const failures = pages.filter((page) => page.status !== 'PASS');
  const result = {
    generatedAt: new Date().toISOString(),
    contractId: contract.contract_id,
    decision: failures.length ? 'FAIL' : 'PASS',
    pages,
    failures,
  };
  const md = toMarkdown(result);
  console.log(md.trim());
  if (writeReport) {
    mkdirSync(dirname(jsonReportPath), { recursive: true });
    writeFileSync(jsonReportPath, `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(mdReportPath, md);
  }
  if (failures.length) {
    console.error(`Result: FAIL. ${failures.length} page quality contract(s) failed.`);
    process.exit(1);
  }
  console.log('Result: PASS. product page quality contracts passed.');
}

main();
