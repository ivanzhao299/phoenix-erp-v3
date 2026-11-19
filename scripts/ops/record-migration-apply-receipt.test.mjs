import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isCompatibleReceipt, publishVerifiedMigrationApplyReceipts, secureJsonOptional } from './record-migration-apply-receipt.mjs';
import { ADMISSION_PATH, RECEIPT_DIRECTORY, digest, verifyScopeRegistryReceiptsFromLedger } from './chanjet-admission-schema-receipt.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-receipt-proof-'));
after(() => {
  const resolved = fs.realpathSync(root);
  assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('migration-receipt-proof-'));
  fs.rmSync(resolved, { recursive: true });
});
const objectGit = (args, input) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
  cwd: root, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_NAME: 'Receipt Test', GIT_AUTHOR_EMAIL: 'receipt@example.invalid',
    GIT_COMMITTER_NAME: 'Receipt Test', GIT_COMMITTER_EMAIL: 'receipt@example.invalid' },
}).trim();
objectGit(['init', '--bare']);
const migrationPath = 'apps/api/src/database/migrations/1794400000000-SkuVarietyOrgScope.ts';
function sourceTree(source) {
  const blob = objectGit(['hash-object', '-w', '--stdin'], source);
  const parts = migrationPath.split('/');
  let tree = objectGit(['mktree'], `100644 blob ${blob}\t${parts.pop()}\n`);
  for (const part of parts.reverse()) tree = objectGit(['mktree'], `040000 tree ${tree}\t${part}\n`);
  return { blob, tree };
}
const original = sourceTree('export class SkuVarietyOrgScope1794400000000 {}\n');
const changed = sourceTree('export class SkuVarietyOrgScope1794400000000 { changed = true; }\n');
const commit = (tree, message, parent) => objectGit(['commit-tree', tree, '-m', message, ...(parent ? ['-p', parent] : [])]);
const sourceSha = commit(original.tree, 'original reviewed migration');
const targetSha = commit(original.tree, 'later reviewed target', sourceSha);
const changedSha = commit(changed.tree, 'changed migration', sourceSha);
const unrelatedSha = commit(original.tree, 'unrelated history');
const base = {
  schema: 'phoenix.migration-apply-receipt/v1', outcome: 'SUCCESS',
  migrationPath, migrationTimestamp: 1794400000000, migrationName: 'SkuVarietyOrgScope',
  sourceSha, sourceBlob: original.blob,
  runId: '100-1', appliedAt: '2026-01-01T00:00:00.000Z',
  beforeLedgerSha256: 'c'.repeat(64), afterLedgerSha256: 'd'.repeat(64),
};
const expected = { ...base, sourceSha: targetSha, runId: '200-2', appliedAt: '2026-11-12T01:00:00.000Z',
  beforeLedgerSha256: 'e'.repeat(64), afterLedgerSha256: 'f'.repeat(64) };
const ledger = { legacy: [], typeorm: [{ timestamp: base.migrationTimestamp, name: `${base.migrationName}${base.migrationTimestamp}` }] };
const proof = { root, ledger };

test('reuses an ancestor receipt with identical real Git blobs despite different target/run/ledger timing', () => {
  assert.notEqual(sourceSha, targetSha);
  assert.equal(objectGit(['rev-parse', `${sourceSha}:${migrationPath}`]), original.blob);
  assert.equal(objectGit(['rev-parse', `${targetSha}:${migrationPath}`]), original.blob);
  assert.equal(isCompatibleReceipt(base, expected, proof), true);
  assert.equal(isCompatibleReceipt(base, base, proof), true);
  assert.equal(isCompatibleReceipt(base, expected, { root, ledger: { typeorm: [{ timestamp: String(base.migrationTimestamp), name: base.migrationName }] } }), true);
});

test('rejects changed immutable migration identity on either side', () => {
  for (const key of ['schema', 'sourceBlob', 'migrationPath', 'migrationTimestamp', 'migrationName', 'outcome']) {
    const value = key === 'migrationTimestamp' ? 1 : 'changed';
    assert.equal(isCompatibleReceipt({ ...base, [key]: value }, expected, proof), false, `existing ${key}`);
    assert.equal(isCompatibleReceipt(base, { ...expected, [key]: value }, proof), false, `expected ${key}`);
  }
});

test('rejects changed source, including a forged recorded blob matching only the reviewed target', () => {
  assert.equal(isCompatibleReceipt(base, { ...expected, sourceSha: changedSha }, proof), false);
  assert.equal(isCompatibleReceipt({ ...base, sourceBlob: changed.blob }, { ...expected, sourceSha: changedSha, sourceBlob: changed.blob }, proof), false);
  // An ancestor commit alone is insufficient: its exact path must exist.
  const missingPathSha = commit(objectGit(['mktree'], ''), 'no migration path');
  const descendant = commit(original.tree, 'migration introduced later', missingPathSha);
  assert.equal(isCompatibleReceipt({ ...base, sourceSha: missingPathSha }, { ...expected, sourceSha: descendant }, proof), false);
});

test('rejects invalid, missing, non-commit and nonancestor source identities', () => {
  for (const sha of ['invalid', '0'.repeat(40), original.blob, original.tree, unrelatedSha]) {
    assert.equal(isCompatibleReceipt({ ...base, sourceSha: sha }, expected, proof), false, sha);
  }
  for (const sha of ['invalid', '0'.repeat(40), original.blob, original.tree]) {
    assert.equal(isCompatibleReceipt(base, { ...expected, sourceSha: sha }, proof), false, `target ${sha}`);
  }
});

test('rejects absent or mismatching applied-ledger proof', () => {
  for (const typeorm of [undefined, [], [{ timestamp: 1, name: base.migrationName }],
    [{ timestamp: base.migrationTimestamp, name: 'OtherMigration' }]]) {
    assert.equal(isCompatibleReceipt(base, expected, { root, ledger: { typeorm } }), false);
  }
  assert.equal(isCompatibleReceipt(base, expected, { root, ledger: {} }), false);
  assert.equal(isCompatibleReceipt(base, expected, { root, ledger: { typeorm: [null] } }), false);
});

test('does not skip the registry schema validator for historical receipts', () => {
  for (const key of ['runId', 'beforeLedgerSha256', 'afterLedgerSha256']) {
    assert.equal(isCompatibleReceipt({ ...base, [key]: 'corrupt' }, expected, proof), false, key);
    assert.equal(isCompatibleReceipt(base, { ...expected, [key]: 'corrupt' }, proof), false, `expected ${key}`);
  }
  for (const record of [null, false, 0, '', [], {}]) assert.equal(isCompatibleReceipt(record, expected, proof), false);
});

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
test('reusing a prior receipt leaves its exact bytes and inode unchanged', () => {
  const file = path.join(root, 'immutable-receipt.json');
  const bytes = `${JSON.stringify(base, null, 2)}\n`;
  fs.writeFileSync(file, bytes);
  const before = fs.statSync(file);
  const existing = secureJsonOptional(file, { readJson });
  assert.equal(isCompatibleReceipt(existing, expected, proof), true);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  assert.equal(fs.statSync(file).ino, before.ino);
});

test('only lstat ENOENT means a receipt is absent', () => {
  assert.equal(secureJsonOptional(path.join(root, 'absent.json')), undefined);
  for (const code of ['EACCES', 'EPERM', 'EIO', 'ENOTDIR', 'ELOOP']) {
    const failure = Object.assign(new Error(code), { code });
    assert.throws(() => secureJsonOptional('unused', { lstat() { throw failure; } }), error => error === failure);
  }
});

test('malformed, unreadable and untrusted existing receipts cannot become absence', () => {
  const file = path.join(root, 'corrupt-receipt.json');
  fs.writeFileSync(file, '{broken json');
  assert.throws(() => secureJsonOptional(file, { readJson }), SyntaxError);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken json');
  for (const failure of [new Error('CONFIG_HOLD=FILE_PERMISSIONS_OR_LINK'),
    new Error('CONFIG_HOLD=PATH_CHANGED_DURING_OPERATION'), Object.assign(new Error('read denied'), { code: 'EACCES' }),
    Object.assign(new Error('disappeared during read'), { code: 'ENOENT' })]) {
    assert.throws(() => secureJsonOptional(file, { readJson() { throw failure; } }), error => error === failure);
  }
  // JSON primitives are existing invalid evidence, not a falsy "absent" value.
  for (const value of [null, false, 0, '']) {
    fs.writeFileSync(file, JSON.stringify(value));
    const existing = secureJsonOptional(file, { readJson });
    assert.notEqual(existing, undefined);
    assert.equal(isCompatibleReceipt(existing, expected, proof), false);
  }
});

test('a dangling receipt symlink is existing evidence and secure-read errors propagate', () => {
  const file = path.join(root, 'dangling-receipt.json');
  fs.symlinkSync(path.join(root, 'missing-destination.json'), file);
  assert.throws(() => secureJsonOptional(file, { readJson }), { code: 'ENOENT' });
  assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
});

const unit = { path: migrationPath, sourceBlob: original.blob, timestamp: base.migrationTimestamp,
  effectiveName: base.migrationName + base.migrationTimestamp };
const ledgerProof = value => ({ ledger: value, sha256: digest(JSON.stringify(value)) });
const scoped = { baseline: sourceSha, target: targetSha, changed: [migrationPath, 'scripts/db-migrate.sh'] };
function verifiedFixture() {
  const directory = fs.mkdtempSync(path.join(root, 'verified-'));
  const file = path.join(directory, RECEIPT_DIRECTORY, path.basename(migrationPath, '.ts') + '.json');
  const created = [];
  const input = { root, directory, targetSha, runId: expected.runId, beforeLedgerSha256: expected.beforeLedgerSha256,
    verifiedLedger: ledgerProof(ledger), pendingMigrations: [unit],
    publish(fileName, receipt) {
      fs.writeFileSync(fileName, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600 });
      created.push(fileName);
    },
  };
  let guards = 0;
  const dependencies = {
    guard() { guards++; },
    readOptional(fileName) { return secureJsonOptional(fileName, { readJson }); },
    ensureDirectory(dir) {
      assert.equal(dir, directory);
      fs.mkdirSync(path.join(dir, RECEIPT_DIRECTORY), { recursive: true, mode: 0o700 });
    },
  };
  return { input, file, created, dependencies, get guards() { return guards; } };
}

test('verified publication and registry verification use the same full supplied ledger, exact blobs and immutable files', async () => {
  const fixture = verifiedFixture();
  await publishVerifiedMigrationApplyReceipts(fixture.input, fixture.dependencies);
  assert.deepEqual(fixture.created, [fixture.file]);
  assert.ok(fixture.guards >= 3);
  const receipt = readJson(fixture.file);
  assert.equal(receipt.runId, expected.runId);
  assert.equal(receipt.sourceSha, targetSha);
  assert.equal(receipt.sourceBlob, original.blob);
  assert.equal(receipt.beforeLedgerSha256, expected.beforeLedgerSha256);
  assert.equal(receipt.afterLedgerSha256, fixture.input.verifiedLedger.sha256);
  let reads = 0;
  const registry = await verifyScopeRegistryReceiptsFromLedger(root, scoped, ledger, {directory: fixture.input.directory,
    readJson(file) { reads++; return readJson(file); }});
  assert.deepEqual(registry, [{migrationPath, file: fixture.file, receipt}]);
  assert.equal(reads, 1);

  const old = fs.statSync(fixture.file), raw = fs.readFileSync(fixture.file);
  await publishVerifiedMigrationApplyReceipts(fixture.input, fixture.dependencies);
  assert.deepEqual(fixture.created, [fixture.file]);
  assert.equal(fs.statSync(fixture.file).ino, old.ino);
  assert.deepEqual(fs.readFileSync(fixture.file), raw);
});

test('verified publication rejects changed proof, path, blob, identity, and repeated units before any write', async () => {
  for (const [alter, reason] of [
    [{verifiedLedger: {ledger, sha256:'a'.repeat(64)}}, /VERIFIED_LEDGER/],
    [{verifiedLedger: ledgerProof({typeorm: ledger.typeorm})}, /VERIFIED_LEDGER/],
    [{verifiedLedger: ledgerProof({legacy: [], typeorm: []})}, /UNIT_NOT_APPLIED/],
    [{verifiedLedger: ledgerProof({legacy: [], typeorm: [{...ledger.typeorm[0], name: base.migrationName}]})}, /UNIT_NOT_APPLIED/],
    [{verifiedLedger: ledgerProof({legacy: [], typeorm: [ledger.typeorm[0], ledger.typeorm[0]]})}, /UNIT_NOT_APPLIED/],
    [{pendingMigrations: [{...unit, path: migrationPath.replace('/migrations/', '/migrations/../migrations/')}]}, /PATH_SCOPE/],
    [{pendingMigrations: [{...unit, sourceBlob: changed.blob}]}, /SOURCE_BLOB/],
    [{pendingMigrations: [{...unit, effectiveName: 'unbound'}, unit]}, /UNIT_IDENTITY/],
    [{pendingMigrations: [unit, unit]}, /UNIT_IDENTITY/],
  ]) {
    const fixture = verifiedFixture();
    await assert.rejects(publishVerifiedMigrationApplyReceipts({...fixture.input, ...alter}, fixture.dependencies), reason);
    assert.deepEqual(fixture.created, []);
    assert.equal(fs.existsSync(fixture.file), false);
  }
});

test('modern publication rejects a different run and preserves its formal receipt, even when legacy reuse is valid', async () => {
  const fixture = verifiedFixture();
  const historical = {...base, afterLedgerSha256: fixture.input.verifiedLedger.sha256};
  assert.ok(isCompatibleReceipt(historical, expected, proof));
  fixture.dependencies.ensureDirectory(fixture.input.directory);
  fs.writeFileSync(fixture.file, JSON.stringify(historical));
  const before = fs.statSync(fixture.file);
  await assert.rejects(publishVerifiedMigrationApplyReceipts(fixture.input, fixture.dependencies), /VERIFIED_RECEIPT_CONFLICT/);
  assert.deepEqual(readJson(fixture.file), historical);
  assert.equal(fs.statSync(fixture.file).ino, before.ino);
  assert.deepEqual(fixture.created, []);
});

test('supplied-ledger registry verification refuses scope, ancestry, and ledger drift', async () => {
  const fixture = verifiedFixture();
  await publishVerifiedMigrationApplyReceipts(fixture.input, fixture.dependencies);
  const dependencies = {directory: fixture.input.directory, readJson};
  await assert.rejects(verifyScopeRegistryReceiptsFromLedger(root, scoped, {legacy: [], typeorm: []}, dependencies), /MIGRATION_NOT_APPLIED/);
  await assert.rejects(verifyScopeRegistryReceiptsFromLedger(root, scoped,
    {legacy: [{filename: 'changed'}], typeorm: ledger.typeorm}, dependencies), /APPLIED_LEDGER_DRIFT/);
  await assert.rejects(verifyScopeRegistryReceiptsFromLedger(root, {...scoped, target: changedSha}, ledger, dependencies),
    /MIGRATION_APPLY_RECEIPT_INVALID/);
  await assert.rejects(verifyScopeRegistryReceiptsFromLedger(root, {...scoped, target: unrelatedSha}, ledger, dependencies),
    /merge-base --is-ancestor/);
  await assert.rejects(verifyScopeRegistryReceiptsFromLedger(root, {...scoped, changed: [ADMISSION_PATH]}, ledger, dependencies),
    /ADMISSION_SCHEMA_RECEIPT_REQUIRED/);
});
