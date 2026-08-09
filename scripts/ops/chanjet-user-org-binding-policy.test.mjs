import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvedUserOrgBindingTarget,
  buildUserOrgBindingPlan,
  evidenceHashForUserOrgBindingPlan,
  publicUserOrgBindingPlan,
} from './chanjet-user-org-binding-policy.mjs';

const organizations = [
  { id: 1, orgCode: 'GROUP', orgName: '集团', orgType: 'GROUP', status: 'ACTIVE' },
  { id: 2, orgCode: 'STORE-A', orgName: '门店 A', orgType: 'STORE', status: 'ACTIVE', companyCode: 'COMP-A' },
];

function plan(users, bindingEntries = []) {
  return buildUserOrgBindingPlan({
    users,
    organizations,
    bindingsByUserId: new Map(bindingEntries),
  });
}

test('proposes only an active non-admin exact organization-code match', () => {
  const result = plan([{ id: 7, username: 'worker', status: 'ACTIVE', role: 'ROLE_STORE', store_code: 'STORE-A' }]);
  assert.equal(result.summary.exactWriteCandidates, 1);
  assert.equal(result.entries[0].disposition, 'PROPOSE_EXACT_ORG_CODE_BINDING');
  assert.deepEqual(result.entries[0].target, {
    orgId: 2,
    orgCode: 'STORE-A',
    orgName: '门店 A',
    orgType: 'STORE',
    companyCode: 'COMP-A',
    isPrimary: true,
    dataScopeLevel: 'COMPANY',
  });
});

test('keeps inactive users and role-global admins unbound', () => {
  const result = plan([
    { id: 8, username: 'frozen', status: 'FROZEN', role: 'ROLE_STORE', store_code: 'STORE-A' },
    { id: 9, username: 'admin', status: 'ACTIVE', role: 'ROLE_ADMIN', store_code: 'ALL' },
  ]);
  assert.deepEqual(result.entries.map((entry) => entry.disposition), [
    'KEEP_UNBOUND_INACTIVE',
    'KEEP_UNBOUND_ROLE_GLOBAL',
  ]);
  assert.equal(result.summary.exactWriteCandidates, 0);
});

test('holds active users without one exact active organization code', () => {
  const result = plan([
    { id: 10, username: 'missing', status: 'ACTIVE', role: 'ROLE_STORE', store_code: '' },
    { id: 11, username: 'unknown', status: 'ACTIVE', role: 'ROLE_STORE', store_code: 'NOPE' },
  ]);
  assert.equal(result.entries[0].disposition, 'HOLD_ACTIVE_USER_ORG_EVIDENCE_REQUIRED');
  assert.equal(result.entries[1].disposition, 'HOLD_ACTIVE_USER_ORG_EVIDENCE_REQUIRED');
});

test('never touches an already-bound user', () => {
  const result = plan(
    [{ id: 12, username: 'bound', status: 'ACTIVE', role: 'ROLE_STORE', store_code: 'STORE-A' }],
    [[12, [{ id: 88, org_id: 2 }]]],
  );
  assert.equal(result.entries[0].disposition, 'ALREADY_BOUND');
  assert.equal(result.entries[0].writeEligible, false);
});

test('public evidence contains no raw user id or username and approval is exact', () => {
  const result = plan([{ id: 7, username: 'worker', status: 'ACTIVE', role: 'ROLE_STORE', store_code: 'STORE-A' }]);
  const publicPlan = publicUserOrgBindingPlan(result);
  const serialized = JSON.stringify(publicPlan);
  assert.equal(serialized.includes('worker'), false);
  assert.equal(serialized.includes('"userId"'), false);
  const evidenceHash = evidenceHashForUserOrgBindingPlan(result);
  const identityHash = result.entries[0].identityHash;
  assert.throws(() => approvedUserOrgBindingTarget(result, { evidenceHash, identityHash, confirmation: 'wrong' }));
  const target = approvedUserOrgBindingTarget(result, {
    evidenceHash,
    identityHash,
    confirmation: `BIND_ACTIVE_USER_ORG:${identityHash}:STORE-A`,
  });
  assert.equal(target.userId, 7);
  assert.equal(target.target.orgId, 2);
});
