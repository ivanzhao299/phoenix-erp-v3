#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const checks = [
  {
    name: 'Phase 0 operating docs exist',
    pass: existsSync('docs/ops/AI_DELIVERY_STATE_MACHINE.md')
      && existsSync('docs/ops/PRODUCTION_GO_NO_GO.md')
      && existsSync('docs/ops/ROLLBACK_RUNBOOK.md'),
  },
  {
    name: 'PR template exists',
    pass: existsSync('.github/pull_request_template.md'),
  },
  {
    name: 'migration down() gate script exists',
    pass: existsSync('scripts/check-ts-migration-down.sh'),
  },
  {
    name: 'migration data-DML gate script exists',
    pass: existsSync('scripts/check-ts-migration-no-data-dml.sh'),
  },
  {
    name: 'nullable unique gate script exists',
    pass: existsSync('scripts/check-nullable-in-unique.js'),
  },
  {
    name: 'RBAC audit script exists',
    pass: existsSync('scripts/g5c-rbac-audit.sh') || existsSync('scripts/g5a-rbac-audit.mjs'),
  },
  {
    name: 'smoke test script exists',
    pass: existsSync('scripts/smoke-test.sh'),
  },
  {
    name: 'freeze boundary static gate passes',
    pass: run('node', ['scripts/ci/check-freeze-boundaries.mjs']),
  },
  {
    name: 'security regression static gate passes',
    pass: run('node', ['scripts/ci/check-security-regression.mjs']),
  },
  {
    name: 'unsafe attachment reference gate passes',
    pass: run('node', ['scripts/ci/check-unsafe-attachment-refs.mjs']),
  },
  {
    name: 'menu permission atomicity gate passes',
    pass: run('node', ['scripts/ci/check-menu-permission-atomicity.mjs']),
  },
  {
    name: 'procurement DataScope write gate passes',
    pass: run('node', ['scripts/ci/check-procurement-datascope-writes.mjs']),
  },
];

let failed = 0;

for (const check of checks) {
  const mark = check.pass ? 'PASS' : 'FAIL';
  console.log(`${mark}: ${check.name}`);
  if (!check.pass) failed += 1;
}

if (failed) {
  console.error(`Result: FAIL. ${failed} W5 closeout static gate(s) failed.`);
  process.exit(1);
}

console.log('Result: PASS. W5 closeout static gates passed.');
