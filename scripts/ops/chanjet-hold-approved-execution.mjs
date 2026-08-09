#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertApprovedExecutionPreflight,
  assertApprovedExecutionResult,
  buildApprovedExecution,
} from './chanjet-hold-approved-execution-policy.mjs';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
};

const execute = args.includes('--execute');
const apiBase = getArg('--api-base', 'https://erp.eggslao.com').replace(/\/+$/, '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const batch = getArg('--batch', process.env.CHANJET_HOLD_BATCH || '');
const mappingId = getArg('--mapping-id', process.env.MAPPING_ID || '');
const confirmation = getArg('--confirmation', process.env.PRODUCTION_CONFIRMATION || '');
const token = process.env.PHOENIX_ADMIN_TOKEN || '';

if (!execute || !token) {
  console.error('Refusing approved production batch without --execute and protected authentication.');
  process.exit(2);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`${path} failed status=${response.status} error=${payload?.error || payload?.message || 'unknown'}`);
  }
  return payload;
}

const precisionEnvelope = await request('/api/chanjet/integration/erp-master-gap-closure/precision-audit');
const audit = precisionEnvelope.audit || precisionEnvelope;
const execution = buildApprovedExecution(audit, { batch, mappingId, confirmation });
let result;
let preflight = null;
if (execution.alreadyComplete) {
  result = { outcome: 'ALREADY_COMPLETE', auditHash: execution.auditHash };
} else {
  if (execution.preflightPath) {
    const preflightEnvelope = await request(execution.preflightPath, {
      method: 'POST',
      body: execution.preflightBody,
    });
    preflight = assertApprovedExecutionPreflight(execution, preflightEnvelope);
  }
  const envelope = await request(execution.path, { method: 'POST', body: execution.body });
  result = assertApprovedExecutionResult(execution, envelope);
}

const report = {
  generatedAt: new Date().toISOString(),
  batch,
  auditHash: execution.auditHash,
  expectedWriteCount: execution.expectedWriteCount,
  preflight,
  result,
};
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, 'chanjet-hold-approved-execution-latest.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Chanjet approved HOLD batch complete batch=${batch} outcome=${result.outcome || 'VERIFIED'}`);
console.log(`artifact=${output}`);
