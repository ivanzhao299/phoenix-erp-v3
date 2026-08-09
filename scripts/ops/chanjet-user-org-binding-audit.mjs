#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildUserOrgBindingPlan,
  evidenceHashForUserOrgBindingPlan,
  publicUserOrgBindingPlan,
  rowsOf,
} from './chanjet-user-org-binding-policy.mjs';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
};
const execute = args.includes('--execute');
const apiBase = getArg('--api-base', 'https://erp.eggslao.com').replace(/\/+$/, '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const token = process.env.PHOENIX_ADMIN_TOKEN || '';

if (!execute || !token) {
  console.error('Refusing production audit without --execute and protected authentication. The audit itself is read-only.');
  process.exit(2);
}

async function request(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false || Number(payload?.code || 200) >= 400) {
    throw new Error(`${path} failed status=${response.status} error=${payload?.error || payload?.msg || 'unknown'}`);
  }
  return payload;
}

async function boundedMap(values, concurrency, mapper) {
  const results = new Array(values.length);
  let index = 0;
  async function worker() {
    while (index < values.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(values[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

const [userEnvelope, organizationEnvelope] = await Promise.all([
  request('/api/system/users'),
  request('/api/organizations'),
]);
const users = rowsOf(userEnvelope);
const organizations = rowsOf(organizationEnvelope);
const bindings = await boundedMap(users, 5, async (user) => ({
  userId: Number(user.id ?? user.userId ?? user.user_id ?? 0),
  rows: rowsOf(await request(`/api/org/user-orgs/${Number(user.id ?? user.userId ?? user.user_id ?? 0)}`)),
}));
const plan = buildUserOrgBindingPlan({
  users,
  organizations,
  bindingsByUserId: new Map(bindings.map((row) => [row.userId, row.rows])),
});
const publicPlan = publicUserOrgBindingPlan(plan);
const unresolvedActiveUsers = publicPlan.entries.filter((entry) => (
  entry.status === 'ACTIVE'
  && entry.bindingCount === 0
  && ![
    'KEEP_UNBOUND_ROLE_GLOBAL',
    'KEEP_UNBOUND_SERVICE_IDENTITY',
  ].includes(entry.disposition)
)).length;
const report = {
  generatedAt: new Date().toISOString(),
  decision: publicPlan.summary.exactWriteCandidates > 0
    ? 'READY_FOR_EXACT_BATCH_APPROVAL'
    : unresolvedActiveUsers > 0
      ? 'HOLD_ACTIVE_USER_ORG_EVIDENCE_REQUIRED'
      : 'NO_USER_ORG_WRITE_REQUIRED',
  evidenceHash: evidenceHashForUserOrgBindingPlan(plan),
  ...publicPlan,
  guardrails: {
    readOnly: true,
    erpWrite: false,
    chanjetWrite: false,
    providerCalls: 0,
    rawUserIdentityInArtifact: false,
    existingBindingsPreserved: true,
    inactiveUsersNeverGrantedAccess: true,
    serviceIdentitiesNeverGrantedBusinessScope: true,
  },
};
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, 'chanjet-user-org-binding-audit-latest.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  decision: report.decision,
  evidenceHash: report.evidenceHash,
  summary: report.summary,
  writeErp: false,
  writeChanjet: false,
  providerCalls: 0,
}));
