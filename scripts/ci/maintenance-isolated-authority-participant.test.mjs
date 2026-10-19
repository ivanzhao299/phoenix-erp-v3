/** Real issuer IPC inside the lifecycle graph; the other two controllers here
 * are explicitly synthetic lifecycle fixtures, not full-factory acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './maintenance-transition-fixture.mjs';
import { openControlParticipantFixture } from './maintenance-control-participants.fixture.mjs';
import { prepareIsolatedAuthorityParticipant } from './maintenance-isolated-authority-participant.fixture.mjs';
import { MaintenanceControlParticipants } from '../ops/production-maintenance-control-participants.mjs';
import { bindingDigest, verifyGithubMaintenanceAuthority } from '../ops/production-maintenance-receipts.mjs';

async function using(action, { expectedCloseFailure = false } = {}) {
  const f = fixture({ clock: Date.now }), initial = { context: f.context, records: [{ purpose: 'MAINTENANCE', payload: f.material.approval.payload }] };
  const authority = prepareIsolatedAuthorityParticipant(initial), others = await openControlParticipantFixture({ context: f.context });
  const graph = new MaintenanceControlParticipants({ context: f.context,
    definitions: others.definitions.map(d => d.role === 'AUTHORITY_READER' ? authority.definition : d) });
  try { await action({ f, initial, authority, graph, others }); }
  finally {
    try {
      if (expectedCloseFailure) await assert.rejects(graph.close(), /CLOSE_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/);
      else await graph.close();
    } finally { await others.cleanup(); }
  }
}
test('a frozen unsigned plan gains isolated authority only after original issuer bootstrap and fresh signed reads', () => using(async ({ f, authority, graph, others }) => {
  const expected = { context: f.context, bindingDigest: bindingDigest(f.context), targetSha: f.context.targetSha, purpose: 'MAINTENANCE' };
  assert.throws(() => authority.reader.readApproval('MAINTENANCE'), /UNVERIFIED/);
  assert.equal(await verifyGithubMaintenanceAuthority(authority.proposal, expected), false);
  await graph.bootstrap(); assert.equal(others.clients.length, 2);
  assert.equal(await authority.reader.verifyAuthority(authority.proposal, expected), true);
  assert.equal(authority.productionAuthorized, false);
  const before = graph.inventory().participants.find(p => p.role === 'AUTHORITY_READER');
  await graph.check(); const after = graph.inventory().participants.find(p => p.role === 'AUTHORITY_READER');
  assert.equal(after.pid, before.pid); assert.notEqual(after.lastProbeSha256, before.lastProbeSha256);
  assert.equal(authority.supervisor.cleanupDebt().pendingReads, 0);
  const closed = await graph.close(); assert.equal(closed.graphClosed, true);
  assert.equal(authority.supervisor.cleanupDebt().originalChildClosed, true);
  assert.equal(await authority.reader.verifyAuthority(authority.proposal, expected), false);
}));
test('revocation poisons the same graph and fresh signed health cannot reuse the old approval', () => using(async ({ authority, graph }) => {
  await graph.bootstrap(); await authority.supervisor.revoke('MAINTENANCE');
  await assert.rejects(graph.check(), /MAINTENANCE_PARTICIPANT_HOLD=/);
  assert.throws(() => graph.assertLive(), /MAINTENANCE_PARTICIPANT_HOLD=/);
  await assert.rejects(graph.check(), /MAINTENANCE_PARTICIPANT_HOLD=/);
  // The poisoned issuer is actually joined via its owned SIGTERM fallback;
  // this is not a clean original exit0 graph receipt and must remain HOLD.
  await assert.rejects(graph.close(), /CLOSE_UNVERIFIED_MANUAL_RECOVERY_REQUIRED/);
  assert.equal(authority.supervisor.cleanupDebt().originalChildClosed, true);
  assert.equal(graph.inventory().graphClosed, false);
}, { expectedCloseFailure: true }));
