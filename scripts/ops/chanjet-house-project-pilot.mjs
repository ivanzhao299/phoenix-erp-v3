#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveHouseProjectRolloutTarget } from './chanjet-house-project-rollout-policy.mjs';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};

const execute = args.includes('--execute');
const apiBase = getArg('--api-base', 'https://erp.eggslao.com').replace(/\/+$/, '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const houseCode = getArg('--house-code');
const requestedBookId = getArg('--book-id');
const requestedName = getArg('--expected-name');
const confirmation = getArg('--confirmation');
const token = process.env.PHOENIX_ADMIN_TOKEN || '';

let target;
try {
  target = resolveHouseProjectRolloutTarget(houseCode);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const { bookId, expectedName, projectCategoryCode, order, phase } = target;

if (!execute) {
  console.error('Refusing production write without --execute.');
  process.exit(2);
}
if (confirmation !== 'CREATE_HOUSE_PROJECT_CANARY') {
  console.error('Exact --confirmation=CREATE_HOUSE_PROJECT_CANARY is required.');
  process.exit(2);
}
if (!token) {
  console.error('PHOENIX_ADMIN_TOKEN is required.');
  process.exit(2);
}
if ((requestedBookId && requestedBookId !== bookId) || (requestedName && requestedName !== expectedName)) {
  console.error('Provided book or name does not match the reviewed rollout target.');
  process.exit(2);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 180000);
let response;
let payload = {};
try {
  response = await fetch(`${apiBase}/api/chanjet/integration/house-projects/pilot`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      approveProduction: true,
      confirmation,
      bookId,
      houseCode,
      expectedName,
      projectCategoryCode,
    }),
  });
  payload = await response.json().catch(() => ({}));
} finally {
  clearTimeout(timer);
}

const report = {
  generatedAt: new Date().toISOString(),
  request: { bookId, houseCode, expectedName, projectCategoryCode, order, phase },
  httpStatus: response?.status || 0,
  success: response?.ok === true && payload?.success === true,
  outcome: payload?.outcome || 'FAILED',
  writeChanjet: payload?.writeChanjet === true,
  changedExistingDepartment: payload?.changedExistingDepartment,
  project: payload?.project || null,
  readback: payload?.readback || null,
  rollback: payload?.rollback || null,
  error: payload?.error || null,
};

mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, 'chanjet-house-project-pilot-latest.json');
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

if (!report.success || report.changedExistingDepartment !== false) process.exitCode = 1;
