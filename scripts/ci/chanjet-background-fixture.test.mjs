import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { requireChanjetBackgroundFixture, createChanjetBackgroundFixture } from './chanjet-background-fixture.mjs';
import { runProductionPrepareCore } from '../ops/chanjet-readonly-production-prepare.mjs';
const container = 'a'.repeat(64);
const approval = {
  version: 3, approvalId: 'FIXTURE_APPROVAL', floorSha: 'f'.repeat(40), sourceClassification: 'PRODUCTION_DATA',
  remoteWrite: false, erpInbound: false, books: [{ bookId: 'SYNTHETIC_BOOK', companyCode: 'SYNTHETIC_COMPANY' }],
  scopes: ['RECEIVABLE_STATISTICS'], periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL',
  verification: { bookId: 'SYNTHETIC_BOOK', period: '202610', scope: ['RECEIVABLE_STATISTICS'], expiresAt: new Date(Date.now() + 600000).toISOString() },
};
const options = { pgUrl: 'postgres://postgres@127.0.0.1:55444/chanjet_admission_fixture', container,
  owner: 'owned-test-1234', providerBase: 'http://127.0.0.1:32123', approval };
const metadata = changes => [container, options.owner, [{ HostIp: '127.0.0.1', HostPort: '55444' }], true]
  .map((v, i) => JSON.stringify(changes?.[i] ?? v)).join('\t') + '\tDB_MATCH USER_MATCH';
test('fixture requires explicit full container ID and owner before any DB/provider work', () => {
  for (const change of [{ container: undefined }, { container: 'owned-db' }, { owner: undefined }, { pgUrl: 'postgres://postgres@production/phoenix_erp' }]) {
    let calls = 0;
    assert.throws(() => requireChanjetBackgroundFixture({ ...options, ...change }, () => { calls++; return metadata(); }));
    assert.equal(calls, 0);
  }
});
test('owned label, full instance, loopback provider/alignment and exact scope are mandatory', () => {
  for (const [change, response] of [
    [{}, metadata({ 0: 'b'.repeat(64) })], [{}, metadata({ 1: 'foreign-owner' })],
    [{ providerBase: 'https://openapi.chanjet.com' }], [{ alignmentBase: 'http://production/api' }],
    [{ providerBase: 'http://u:p@127.0.0.1:32123' }],
    [{ approval: { ...approval, remoteWrite: true } }],
    [{ approval: { ...approval, verification: { ...approval.verification, bookId: 'OTHER_BOOK' } } }],
  ]) {
    const commands = [];
    assert.throws(() => requireChanjetBackgroundFixture({ ...options, ...change }, args => { commands.push(args); return response || metadata(); }));
    assert.equal(commands.length, 1);
    assert.equal(commands[0][0], 'inspect');
    assert.equal(commands[0].includes('exec'), false);
  }
});
test('VERIFY policy placeholders are accepted only after complete policy validation', () => {
  assert.doesNotThrow(() => requireChanjetBackgroundFixture({ ...options,
    approval: { ...approval, verifiedRunId: '', verifiedEvidenceRunId: '' } }, () => metadata()));
  assert.throws(() => requireChanjetBackgroundFixture({ ...options,
    approval: { ...approval, unapprovedField: true } }, () => metadata()));
});
test('fabricated or connection-mismatched proof cannot instantiate real background participant', async () => {
  await assert.rejects(createChanjetBackgroundFixture({}, { options: { url: options.pgUrl } }), /OWNED_SCOPE_PROOF_REQUIRED/);
  const proof = requireChanjetBackgroundFixture(options, () => metadata());
  await assert.rejects(createChanjetBackgroundFixture(proof, { options: { url: 'postgres://production/phoenix_erp' } }), /OWNED_SCOPE_PROOF_REQUIRED/);
});
test('production executable remains an explicit HOLD before compiled imports, DB initialization or registration', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/chanjet-readonly-production-prepare.mjs'], {
    encoding: 'utf8', env: { ...process.env, R42D_DIST_ROOT: '/nonexistent/never-import', DB_HOST: 'must-not-connect.invalid' },
  });
  assert.equal(result.status, 4);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /PREPARE=HOLD;\{"reason":"BACKGROUND_CLI_PARTICIPANT_NOT_REGISTERED"\}/);
  assert.doesNotMatch(result.stdout, /PASS|TypeError|ENOTFOUND/);
});
test('imported production core without explicit fixture factory also refuses before imports or DB work', async () => {
  await assert.rejects(runProductionPrepareCore(), /BACKGROUND_CLI_PARTICIPANT_NOT_REGISTERED/);
});
