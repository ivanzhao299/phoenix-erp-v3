/** Compiled isolated authority-controller adapter. The signed issuer is an
 * actual separate original process; its approval is SIMULATED, never GitHub
 * or production authority. Not a complete registry or production factory. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { bindingDigest, canonicalDigest, same } from '../ops/production-maintenance-receipts.mjs';
import { openFixtureAuthority, prepareFixtureAuthorityApproval, verifyFixtureAuthorityResponse } from './maintenance-fixture-authority.fixture.mjs';

const fail = () => { throw Error('ISOLATED_AUTHORITY_PARTICIPANT_HOLD=UNVERIFIED'); };

export function prepareIsolatedAuthorityParticipant(value) {
  const initial = structuredClone(value), context = initial.context;
  const proposal = prepareFixtureAuthorityApproval(initial, 'MAINTENANCE');
  const sourceSha256 = canonicalDigest(['./maintenance-isolated-authority-participant.fixture.mjs', './maintenance-fixture-authority.fixture.mjs']
    .map(name => ({ name, sha256: createHash('sha256').update(fs.readFileSync(new URL(name, import.meta.url))).digest('hex') })));
  let service = null, attempted = false;
  const current = () => { if (!service) fail(); return service; };
  const definition = Object.freeze({ role: 'AUTHORITY_READER', sourceSha256,
    async start({ registerOwnedChild, timeoutMs, signal }) {
      if (attempted || signal?.aborted) fail(); attempted = true;
      service = await openFixtureAuthority(initial, { timeoutMs, registerOwnedChild });
      return service;
    },
    async probe(client, { nonce, timeoutMs, signal }) {
      if (client !== current() || signal?.aborted) fail();
      const requestedAt = Date.now(), response = await client.reader.observeRecord('MAINTENANCE', { nonce, timeoutMs, signal });
      if (!verifyFixtureAuthorityResponse(client.controller.publicKey, response, { nonce, requestedAt, context, purpose: 'MAINTENANCE' })
        || !same(response.approval, proposal)) fail();
      const debt = client.controller.cleanupDebt();
      if (debt.originalChildClosed || debt.manualRecoveryRequired || debt.pendingReads !== 0 || signal?.aborted) fail();
      return { schema: 'phoenix.maintenance-control-participant-health/v1', role: 'AUTHORITY_READER',
        owner: context.owner, contextDigest: bindingDigest(context), sourceSha256, childPid: client.controller.childPid,
        nonce, healthy: true, pending: debt.pendingReads, protocolVersion: 1 };
    },
    async close(client, { timeoutMs }) {
      if (client !== current()) fail();
      const closed = await client.controller.close({ timeoutMs });
      if (!closed.originalChildClosed || closed.productionAuthorized !== false || closed.childPid !== client.controller.childPid) fail();
      return closed;
    }
  });
  return Object.freeze({ definition, proposal: structuredClone(proposal),
    // These runner capabilities cannot issue, modify, revoke or sign records.
    reader: Object.freeze({
      readApproval: (...args) => current().reader.readApproval(...args),
      verifyAuthority: (...args) => current().reader.verifyAuthority(...args)
    }),
    // Kept by the trusted isolated supervisor only, for explicit fault tests.
    supervisor: Object.freeze({
      revoke: purpose => current().controller.revoke(purpose),
      cleanupDebt: () => current().controller.cleanupDebt(),
      close: options => current().controller.close(options)
    }),
    fixtureOnly: true, productionAuthorized: false });
}
