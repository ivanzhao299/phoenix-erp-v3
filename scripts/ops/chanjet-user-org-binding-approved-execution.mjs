#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  approvedUserOrgBindingTarget,
  buildUserOrgBindingPlan,
  rowsOf,
} from './chanjet-user-org-binding-policy.mjs';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const apiBase = getArg('--api-base', 'https://erp.eggslao.com').replace(/\/+$/, '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const identityHash = getArg('--identity-hash', process.env.USER_IDENTITY_HASH || '');
const evidenceHash = getArg('--evidence-hash', process.env.USER_ORG_EVIDENCE_HASH || '');
const confirmation = getArg('--confirmation', process.env.PRODUCTION_CONFIRMATION || '');
const token = process.env.PHOENIX_ADMIN_TOKEN || '';

if (!args.includes('--execute') || !token) {
  console.error('Refusing production write without --execute and protected authentication.');
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
  if (!response.ok || payload?.success === false || Number(payload?.code || 200) >= 400) {
    throw new Error(`${path} failed status=${response.status} error=${payload?.error || payload?.msg || 'unknown'}`);
  }
  return payload;
}

async function loadPlan() {
  const [userEnvelope, organizationEnvelope] = await Promise.all([
    request('/api/system/users'),
    request('/api/organizations'),
  ]);
  const users = rowsOf(userEnvelope);
  const organizations = rowsOf(organizationEnvelope);
  const bindingsByUserId = new Map();
  for (const user of users) {
    const userId = Number(user.id ?? user.userId ?? user.user_id ?? 0);
    bindingsByUserId.set(userId, rowsOf(await request(`/api/org/user-orgs/${userId}`)));
  }
  return buildUserOrgBindingPlan({ users, organizations, bindingsByUserId });
}

const plan = await loadPlan();
const approved = approvedUserOrgBindingTarget(plan, { evidenceHash, identityHash, confirmation });
const beforeBindings = rowsOf(await request(`/api/org/user-orgs/${approved.userId}`));
if (beforeBindings.length !== 0) throw new Error('USER_ORG_BINDING_CHANGED_AFTER_APPROVAL');

let createdBindingId = 0;
let rollbackAttempted = false;
let rollbackSucceeded = false;
try {
  const createEnvelope = await request('/api/org/user-orgs', {
    method: 'POST',
    body: {
      userId: approved.userId,
      orgId: approved.target.orgId,
      isPrimary: true,
      dataScopeLevel: approved.target.dataScopeLevel,
    },
  });
  createdBindingId = Number(createEnvelope?.data?.id ?? createEnvelope?.result?.id ?? 0);
  const readback = rowsOf(await request(`/api/org/user-orgs/${approved.userId}`));
  const exact = readback.filter((row) => (
    Number(row.org_id ?? row.orgId) === approved.target.orgId
    && row.is_primary === true
    && String(row.data_scope_level ?? row.dataScopeLevel) === approved.target.dataScopeLevel
  ));
  if (readback.length !== 1 || exact.length !== 1) throw new Error('USER_ORG_BINDING_READBACK_MISMATCH');
  createdBindingId = Number(exact[0].id || createdBindingId);
  if (!createdBindingId) throw new Error('USER_ORG_BINDING_ID_MISSING');

  const result = {
    outcome: 'CREATED_AND_VERIFIED',
    evidenceHash: approved.evidenceHash,
    identityHash: approved.identityHash,
    target: approved.target,
    backup: { bindingCount: 0 },
    readback: { bindingCount: readback.length, exactPrimaryBinding: true },
    writeErp: true,
    writeChanjet: false,
    providerCalls: 0,
    automaticRollbackOnFailure: true,
  };
  mkdirSync(outputDir, { recursive: true });
  const output = join(outputDir, 'chanjet-user-org-binding-approved-execution-latest.json');
  writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), result }, null, 2)}\n`, 'utf8');
  console.log(`ERP user-org binding verified identity=${approved.identityHash} org=${approved.target.orgCode}`);
} catch (error) {
  let current = [];
  try {
    current = rowsOf(await request(`/api/org/user-orgs/${approved.userId}`));
  } catch {
    current = [];
  }
  const created = current.find((row) => Number(row.org_id ?? row.orgId) === approved.target.orgId);
  const rollbackId = Number(created?.id || createdBindingId || 0);
  if (rollbackId) {
    rollbackAttempted = true;
    try {
      await request(`/api/org/user-orgs/${rollbackId}`, { method: 'DELETE' });
      const rollbackReadback = rowsOf(await request(`/api/org/user-orgs/${approved.userId}`));
      rollbackSucceeded = rollbackReadback.length === 0;
    } catch {
      rollbackSucceeded = false;
    }
  }
  const suffix = rollbackAttempted
    ? rollbackSucceeded ? 'automatic rollback verified' : 'MANUAL_RECOVERY_REQUIRED'
    : 'no write observed';
  throw new Error(`${error.message}; ${suffix}`);
}
