import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isCompatibleReceipt, secureJsonOptional } from './record-migration-apply-receipt.mjs';

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
