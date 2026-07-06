#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const outputDir = valueAfter('--output-dir') || 'docs/ops/runs';

function valueAfter(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8');
}

function ensureDir(dir) {
  fs.mkdirSync(path.join(repoRoot, dir), { recursive: true });
}

function contains(file, pattern) {
  return pattern.test(read(file));
}

const checks = [
  {
    id: 'api_service_method',
    title: 'Backend readonly statement report service exists',
    pass: contains(
      'apps/api/src/modules/chanjet/chanjet-integration.service.ts',
      /financeSubjectBalanceReadonlyReportOverview/,
    ),
  },
  {
    id: 'api_endpoint',
    title: 'Backend endpoint is exposed behind Chanjet menu guard',
    pass: contains(
      'apps/api/src/modules/chanjet/chanjet-callback.controller.ts',
      /integration\/subject-balance-readonly-report[\s\S]*@RequireMenu\(CHANJET_PROXY_MENU,\s*'V'\)/,
    ),
  },
  {
    id: 'web_tab',
    title: 'Frontend Chanjet integration page includes readonly report tab',
    pass: contains(
      'apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx',
      /statementReports[\s\S]*科目\/报表只读/,
    ),
  },
  {
    id: 'web_endpoint_call',
    title: 'Frontend loads subject balance readonly report endpoint',
    pass: contains(
      'apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx',
      /\/chanjet\/integration\/subject-balance-readonly-report/,
    ),
  },
  {
    id: 'readonly_guardrails',
    title: 'Readonly guardrails forbid Chanjet write, voucher push, ERP overwrite, and migration',
    pass: contains(
      'apps/api/src/modules/chanjet/chanjet-integration.service.ts',
      /chanjetWrite:\s*false[\s\S]*voucherPush:\s*false[\s\S]*erpBusinessOverwrite:\s*false[\s\S]*migration:\s*false/,
    ),
  },
];

const failed = checks.filter((check) => !check.pass);
const result = {
  generatedAt: new Date().toISOString(),
  taskId: 'CHANJET-P3-SUBJECT-BALANCE-READONLY-REPORT',
  decision: failed.length ? 'HOLD' : 'GO_WITH_CONDITIONS',
  checks,
  guardrails: {
    chanjetWrite: false,
    chanjetDelete: false,
    chanjetModify: false,
    voucherPush: false,
    erpBusinessOverwrite: false,
    migration: false,
    deploy: false,
  },
  nextAction: failed.length
    ? 'Fix missing readonly report wiring before exposing the Chanjet report tab.'
    : 'Run API/Web typecheck and W5 gate, then keep Chanjet data readonly while finance cards are reconciled.',
};

ensureDir(outputDir);
const jsonPath = path.join(repoRoot, outputDir, 'chanjet-subject-balance-readonly-report-latest.json');
const mdPath = path.join(repoRoot, outputDir, 'chanjet-subject-balance-readonly-report-latest.md');
fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(mdPath, [
  '# Chanjet Subject Balance Readonly Report Audit',
  '',
  `Generated: ${result.generatedAt}`,
  `Decision: ${result.decision}`,
  '',
  '## Checks',
  ...checks.map((check) => `- ${check.pass ? 'PASS' : 'FAIL'} ${check.id}: ${check.title}`),
  '',
  '## Guardrails',
  '- Chanjet write: false',
  '- Voucher push: false',
  '- ERP business overwrite: false',
  '- Migration: false',
  '- Deploy: false',
  '',
  `Next action: ${result.nextAction}`,
  '',
].join('\n'));

console.log(`Decision: ${result.decision}`);
console.log(`Checks: ${checks.length - failed.length}/${checks.length} passed`);
console.log(`JSON: ${path.relative(repoRoot, jsonPath)}`);
console.log(`Markdown: ${path.relative(repoRoot, mdPath)}`);
if (failed.length) process.exit(1);
