#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
const mappingId = getArg('--mapping-id', process.env.MAPPING_ID || '');
const token = process.env.PHOENIX_ADMIN_TOKEN || '';

if (!execute) {
  console.error('Refusing production preflight without --execute. This command is read-only.');
  process.exit(2);
}
if (!token || !/^\d+$/.test(mappingId)) {
  console.error('Authentication material or numeric mapping id is unavailable.');
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
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(`${path} failed status=${response.status} error=${payload?.error || payload?.message || 'unknown'}`);
  }
  return payload;
}

const precisionEnvelope = await request('/api/chanjet/integration/erp-master-gap-closure/precision-audit');
const audit = precisionEnvelope.audit || precisionEnvelope;
const target = (audit.items || []).find((item) => (
  String(item.mappingId || '') === mappingId
  && item.mappingType === 'PRODUCT'
  && item.disposition === 'CHANJET_CHANGE_PROPOSAL'
  && item.chanjetChangeProposal?.field === 'name'
));
if (!target) throw new Error('requested mapping is not a current name-only change proposal');

const preflightEnvelope = await request('/api/chanjet/integration/product-name-canary/preflight', {
  method: 'POST',
  body: { mappingId, auditHash: audit.auditHash },
});
const result = preflightEnvelope.result || preflightEnvelope;
const expectedUpdatePayloadFields = [
  'productCategory',
  'productCode',
  'productName',
  'productUomSetting',
  'specNo',
];
if (result.decision !== 'READY_FOR_EXPLICIT_APPROVAL'
  || result.writeChanjet !== false
  || result.writeErpBusinessTables !== false
  || Number(result.providerCalls) !== 1
  || String(result.mappingId || '') !== mappingId) {
  throw new Error('production preflight did not prove the required read-only guardrails');
}
const updatePayloadReady = Boolean(result.updatePayloadHash)
  && JSON.stringify(result.updatePayloadFields) === JSON.stringify(expectedUpdatePayloadFields);
const report = {
  generatedAt: new Date().toISOString(),
  decision: result.decision,
  mappingId,
  bookId: result.bookId,
  productCode: result.productCode,
  currentName: result.currentName,
  proposedName: result.proposedName,
  providerRowHash: result.providerRowHash,
  providerInvariantHash: result.providerInvariantHash,
  providerState: result.providerState,
  businessFields: result.businessFields,
  updatePayloadHash: result.updatePayloadHash,
  updatePayloadFields: result.updatePayloadFields,
  updatePayloadReady,
  auditHash: result.auditHash,
  providerCalls: 1,
  writeChanjet: false,
  writeErpBusinessTables: false,
};
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, 'chanjet-product-name-preflight-latest.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Chanjet update DTO fields=${JSON.stringify(result.updatePayloadFields || [])}`);
console.log(`Chanjet provider state=${result.providerState || 'UNKNOWN'}`);
console.log(`Chanjet update DTO hash=${result.updatePayloadHash || 'MISSING'}`);
if (!updatePayloadReady) {
  throw new Error('production preflight update DTO is incomplete or outside the approved field boundary');
}
console.log(`Chanjet product-name preflight ready mapping=${mappingId} providerCalls=1`);
console.log(`artifact=${output}`);
