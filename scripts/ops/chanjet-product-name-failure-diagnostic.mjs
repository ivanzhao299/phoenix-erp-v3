#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  return fallback;
};
const execute = args.includes('--execute');
const apiBase = getArg('--api-base', 'https://erp.eggslao.com').replace(/\/+$/, '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const token = process.env.PHOENIX_ADMIN_TOKEN || '';

if (!execute || !token) {
  console.error('Refusing production diagnostic without --execute and protected authentication.');
  process.exit(2);
}

const response = await fetch(`${apiBase}/api/chanjet/integration/product-name-canary/latest-failure`, {
  headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(120_000),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload?.success !== true || payload?.readOnly !== true
  || Number(payload?.providerCalls) !== 0) {
  throw new Error(`failure diagnostic rejected status=${response.status}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  providerCalls: 0,
  latestFailure: payload.result || null,
};
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, 'chanjet-product-name-failure-diagnostic-latest.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Chanjet B1 failure diagnostic complete providerCalls=0 artifact=${output}`);
