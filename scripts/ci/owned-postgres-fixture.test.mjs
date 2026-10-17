import test from 'node:test';
import assert from 'node:assert/strict';
import { requireOwnedPostgresFixture } from './owned-postgres-fixture.mjs';
const options = { url: 'postgres://postgres@127.0.0.1:54321/chanjet_admission_fixture', container: 'owned-test-postgres', owner: 'test-owner-123456' };
const metadata = (changes = {}) => {
  const x = { id: 'a'.repeat(64), owner: options.owner, ports: [{ HostIp: '127.0.0.1', HostPort: '54321' }], running: true, db: 'DB_MATCH USER_MATCH', ...changes };
  return [x.id, x.owner, x.ports, x.running].map(JSON.stringify).join('\t') + '\t' + x.db;
};
test('missing explicit owner/container, nonloopback or nondisposable DB fails with zero commands', () => {
  for (const change of [{ owner: undefined }, { container: undefined }, { url: 'postgres://postgres@production/chanjet_admission_fixture' },
    { url: 'postgres://postgres@127.0.0.1:54321/phoenix_erp' }, { container: 'phoenix-v3-db' }, { owner: '' }]) {
    let calls = 0;
    assert.throws(() => requireOwnedPostgresFixture({ ...options, ...change }, () => { calls++; return metadata(); }), /OWNED_POSTGRES_FIXTURE_REQUIRED/);
    assert.equal(calls, 0);
  }
});
test('label, mapped port, DB/user or runtime mismatch executes only safe inspect and zero exec/SQL', () => {
  for (const change of [{ owner: null }, { owner: 'some-other-owner' }, { ports: [{ HostIp: '0.0.0.0', HostPort: '54321' }] },
    { ports: [{ HostIp: '127.0.0.1', HostPort: '54322' }] }, { db: '' }, { db: 'DB_MATCH' }, { db: 'USER_MATCH' }, { running: false }]) {
    const calls = [];
    assert.throws(() => requireOwnedPostgresFixture(options, args => { calls.push(args); return metadata(change); }), /OWNED_POSTGRES_FIXTURE_REQUIRED/);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'inspect');
    assert.equal(calls.some(args => args.includes('exec') || args.includes('psql')), false);
  }
});
test('exact owned loopback instance returns full immutable container ID without enumerating or executing', () => {
  const calls = [];
  assert.equal(requireOwnedPostgresFixture(options, args => { calls.push(args); return metadata(); }), 'a'.repeat(64));
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'inspect'); assert.equal(calls[0][1], options.container);
  assert.doesNotMatch(calls[0][3], /POSTGRES_PASSWORD|json \.Config.Env/);
});
