#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const baseRef = process.env.FREEZE_BASE_REF || process.env.GITHUB_BASE_REF || 'main';
const headRef = process.env.FREEZE_HEAD_REF || 'HEAD';
const allowFreezeTouch = process.env.ALLOW_FREEZE_TOUCH === 'true';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function changedFiles() {
  const files = new Set();
  const candidates = [
    [`${baseRef}...${headRef}`],
    [`origin/${baseRef}...${headRef}`],
    ['HEAD~1...HEAD'],
  ];

  for (const [range] of candidates) {
    try {
      const out = git(['diff', '--name-only', range]);
      for (const file of out.split('\n').filter(Boolean)) files.add(file);
      break;
    } catch {
      // Try the next range. Local runs may not have origin/base refs.
    }
  }

  for (const args of [
    ['diff', '--name-only', '--cached'],
    ['diff', '--name-only'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    try {
      const out = git(args);
      for (const file of out.split('\n').filter(Boolean)) files.add(file);
    } catch {
      // Ignore unavailable diff views.
    }
  }

  return [...files].sort();
}

const checks = [
  {
    name: 'migration files',
    pattern: /(^|\/)(migrations?\/|.*migration.*\.(sql|ts|js|mjs)$|apps\/api\/src\/database\/migrations\/)/i,
  },
  {
    name: 'schema/entity/table/column surface',
    pattern: /(schema|entity|entities|table|column|data-source|typeorm|database)/i,
  },
  {
    name: 'procurement core business',
    pattern: /apps\/(api|web)\/src\/.*(procurement|purchase|prc)/i,
  },
  {
    name: 'sales/POS core business',
    pattern: /apps\/(api|web)\/src\/.*(sales|sal-|sal_|pos|store-pos)/i,
  },
  {
    name: 'finance core business',
    pattern: /apps\/(api|web)\/src\/.*(finance|fin-|fin_|cash|ledger|invoice|payable|receivable)/i,
  },
  {
    name: 'permission/RBAC/Auth business logic',
    pattern: /apps\/api\/src\/.*(auth|rbac|permission|permissions|role|roles|guard|jwt|datascope|data-scope)/i,
  },
  {
    name: 'Chanjet/Yonyou integration business',
    pattern: /apps\/api\/src\/.*(chanjet|yonyou|webhook|signature|nonce|timestamp)/i,
  },
  {
    name: 'production deploy chain',
    pattern: /(^|\/)(docker-compose\.yml|nginx\/|deploy\/|apps\/api\/Dockerfile|apps\/web\/Dockerfile)$/i,
  },
];

const files = changedFiles();
const violations = [];

for (const file of files) {
  for (const check of checks) {
    if (check.pattern.test(file)) {
      violations.push({ file, check: check.name });
    }
  }
}

console.log(`check-freeze-boundaries: ${files.length} changed file(s) inspected`);

if (violations.length) {
  for (const v of violations) {
    console.error(`FREEZE_BOUNDARY: ${v.check}: ${v.file}`);
  }

  if (!allowFreezeTouch) {
    console.error('Result: FAIL. Frozen boundary touched without ALLOW_FREEZE_TOUCH=true.');
    process.exit(1);
  }

  console.warn('Result: WARN. Frozen boundary touched with explicit override.');
  process.exit(0);
}

console.log('Result: PASS. No frozen boundary touched.');
