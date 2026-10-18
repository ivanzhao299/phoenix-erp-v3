import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { persistRootBindingFailure, settleFixtureRootLease } from './maintenance-erp-root-binding.fixture.mjs';

function child({ eofCloses = true, signalCloses = true } = {}) {
  const calls = []; let resolve;
  const owned = { closed: false, done: new Promise(done => { resolve = done; }) };
  const close = () => { owned.closed = true; resolve(); };
  owned.child = { stdin: { end() { calls.push('EOF'); if (eofCloses) close(); } }, kill(signal) { calls.push(signal); if (signalCloses) close(); } };
  return { owned, calls };
}
test('failed server close still settles the original child and cannot certify server release', async () => {
  const f = child();
  const result = await settleFixtureRootLease({ close: async () => { throw Error('synthetic guard failure'); } }, [f.owned]);
  assert.deepEqual(f.calls, ['EOF']); assert.equal(result.originalChildrenClosed, true); assert.equal(result.serverReleaseVerified, false);
  assert.deepEqual(result.failures, ['ROOT_SERVER_RELEASE_UNVERIFIED']);
});
test('an EOF timeout attempts a bounded local signal and still fails the fixture', async () => {
  const f = child({ eofCloses: false });
  const result = await settleFixtureRootLease({ close: async () => ({ ownedBackendGone: true }) }, [f.owned], { timeoutMs: 5 });
  assert.deepEqual(f.calls, ['EOF', 'SIGTERM']); assert.equal(result.originalChildrenClosed, true);
  assert.deepEqual(result.failures, ['ORIGINAL_CHILD_EOF_NOT_SETTLED']);
});
test('a surviving original child leaves explicit debt after both deadlines', async () => {
  const f = child({ eofCloses: false, signalCloses: false });
  const result = await settleFixtureRootLease({ close: async () => { throw Error('synthetic failure'); } }, [f.owned], { timeoutMs: 5 });
  assert.equal(result.originalChildrenClosed, false);
  assert.deepEqual(result.failures, ['ROOT_SERVER_RELEASE_UNVERIFIED', 'ORIGINAL_CHILD_EOF_NOT_SETTLED', 'ORIGINAL_CHILD_CLOSE_UNVERIFIED']);
});
test('normal verified EOF requires exactly one registered original child', async () => {
  const f = child();
  const result = await settleFixtureRootLease({ close: async () => ({ ownedBackendGone: true }) }, [f.owned]);
  assert.deepEqual(result.failures, []); assert.equal(result.serverReleaseVerified, true); assert.equal(result.originalChildrenClosed, true);
  assert.deepEqual((await settleFixtureRootLease({ close: async () => ({ ownedBackendGone: true }) }, [])).failures, ['EXACT_ORIGINAL_CHILD_COUNT_UNVERIFIED']);
});
test('an outer failure record cannot overwrite the independent child-debt artifact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-erp-binding-debt-'));
  const resources = path.join(root, 'resources.json'); let file;
  try {
    const capsule = { root, sourceSha: 'a'.repeat(40), record(extra) { fs.writeFileSync(resources, JSON.stringify(extra)); } };
    file = persistRootBindingFailure(capsule, 16, { serverReleaseVerified: false, failures: ['ROOT_SERVER_RELEASE_UNVERIFIED'] },
      [{ child: { pid: 12345 }, closed: false }]);
    capsule.record({ outcome: 'FAIL', failureCode: 'outer-sanitized-error' });
    const debt = JSON.parse(fs.readFileSync(file));
    assert.equal(debt.result, 'FAIL'); assert.equal(debt.productionReceipt, false);
    assert.deepEqual(debt.originalChildren, [{ pid: 12345, closeEventObserved: false }]);
    assert.deepEqual(debt.cleanup.failures, ['ROOT_SERVER_RELEASE_UNVERIFIED']);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.throws(() => persistRootBindingFailure(capsule, 16, {}, []), { code: 'EEXIST' });
  } finally { if (file && fs.existsSync(file)) fs.unlinkSync(file); if (fs.existsSync(resources)) fs.unlinkSync(resources); fs.rmdirSync(root); }
});
