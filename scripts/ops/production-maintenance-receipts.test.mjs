import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MaintenanceReceiptStore, canonicalDigest, bindingDigest, validateMaintenanceContext, runtimeTimestamp, iso, verifyGithubMaintenanceAuthority, MAINTENANCE_CONTEXT_SCHEMA, MAINTENANCE_AUTHORITY_SCHEMA } from './production-maintenance-receipts.mjs';
const hash = 'a'.repeat(64); const old = 'a'.repeat(40); const target = 'b'.repeat(40);
function context() {
  const pin = n => ({ id: n.repeat(64), imageId: `sha256:${n.repeat(64)}`, revision: old, startedAt: '2026-10-17T00:00:00.000Z', restartCount: 0, running: true, health: 'healthy' });
  const api = pin('1'); return { schema: MAINTENANCE_CONTEXT_SCHEMA, protocolVersion: 1, owner: '123-1', previousFloorSha: old, previousApiSha: old, previousWebSha: old, targetSha: target,
    window: { start: '2026-10-18T00:00:00.000Z', end: '2026-10-18T00:20:00.000Z' }, candidate: { revision: target, imageId: `sha256:${hash}` }, sourceHelperSha256: hash, schemaEvidenceSha256: hash,
    migrationPaths: [], preSnapshot: { api, web: pin('2'), db: { ...pin('3'), mountsSha256: hash } }, executors: [api] };
}
function store(c = context()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-maintenance-receipts-')); fs.chmodSync(directory, 0o700);
  const inspectDirectory = () => { const s = fs.lstatSync(directory); return [s.dev, s.ino, s.uid, s.mode]; };
  return new MaintenanceReceiptStore(c, { directory, guard: () => {}, inspectDirectory, expectedUid: process.getuid() });
}
test('canonical digest ignores object order but rejects undefined, nonfinite numbers and non-plain objects', () => {
  assert.equal(canonicalDigest({ a: 1, b: 2 }), canonicalDigest({ b: 2, a: 1 }));
  for (const input of [{ a: undefined }, { a: NaN }, new Date()]) assert.throws(() => canonicalDigest(input), /NON_CANONICAL/);
});
test('exact context rejects abbreviated SHA, duplicate executor, missing image and migration changes', () => {
  for (const mutate of [c => { c.previousApiSha = old.slice(0, 8); }, c => { c.executors.push(c.executors[0]); }, c => { delete c.candidate.imageId; }, c => { c.migrationPaths.push('DDL'); }]) {
    const c = context(); mutate(c); assert.throws(() => validateMaintenanceContext(c));
  }
});
test('runtime StartedAt preserves actual Docker nanoseconds while malformed dates and noncanonical receipt times reject', () => {
  const startedAt = '2026-10-18T00:20:00.123456789Z'; const c = context(); c.preSnapshot.api.startedAt = startedAt;
  validateMaintenanceContext(c); assert.equal(c.preSnapshot.api.startedAt, startedAt); assert.equal(runtimeTimestamp(startedAt), true); assert.equal(iso(startedAt), false);
  for (const value of ['2026-02-30T00:20:00.123Z', '2026-10-18T00:20:00.1234567890Z', '2026-10-18T00:20:00.123+00:00', '2026-10-18T00:20:61.123Z']) assert.equal(runtimeTimestamp(value), false);
});
test('receipts are create-only 0600 and content-addressed; altered payload is rejected', () => {
  const s = store(); const ref = s.appendReceipt('PRE', { value: 42 }, null, '2026-10-18T00:10:00.000Z');
  assert.equal(fs.statSync(s.receiptFile(ref)).mode & 0o777, 0o600); assert.equal(s.readReceipt(ref).payload.value, 42);
  assert.throws(() => s.appendReceipt('PRE', { value: 42 }, null, '2026-10-18T00:10:00.000Z'), /EEXIST/);
  const record = JSON.parse(fs.readFileSync(s.receiptFile(ref))); record.payload.value = 43;
  fs.writeFileSync(s.receiptFile(ref), JSON.stringify(record)); assert.throws(() => s.readReceipt(ref), /RECEIPT_DIGEST/);
});
test('symlinks, hardlinks and permissive mode cannot impersonate a trusted receipt', () => {
  const s = store(); const ref = { sequence: 1, digest: hash }; const outside = path.join(s.directory, 'outside.json'); fs.writeFileSync(outside, '{}', { mode: 0o600 });
  fs.symlinkSync(outside, s.receiptFile(ref)); assert.throws(() => s.readReceipt(ref), /UNTRUSTED_RECEIPT_FILE/);
  const other = store(); const hardRef = { sequence: 1, digest: hash }; const source = path.join(other.directory, 'source.json'); fs.writeFileSync(source, '{}', { mode: 0o600 });
  fs.linkSync(source, other.receiptFile(hardRef)); assert.throws(() => other.readReceipt(hardRef), /UNTRUSTED_RECEIPT_FILE/);
  const mode = store(); const actual = mode.appendReceipt('PRE', {}, null, '2026-10-18T00:10:00.000Z'); fs.chmodSync(mode.receiptFile(actual), 0o644);
  assert.throws(() => mode.readReceipt(actual), /UNTRUSTED_RECEIPT_FILE/);
});
test('state is bound to full context and every immutable receipt in order', () => {
  const s = store(); const ref = s.appendReceipt('PRE', {}, null, '2026-10-18T00:10:00.000Z');
  const content = { context: s.context, contextDigest: s.digest, receipts: [ref] }; s.writeState(content); assert.equal(s.readState().contextDigest, bindingDigest(s.context));
  const c = context(); c.window.end = '2026-10-18T00:25:00.000Z';
  const other = new MaintenanceReceiptStore(c, { directory: s.directory, guard: () => {}, inspectDirectory: s.inspect, expectedUid: process.getuid() });
  assert.throws(() => other.readState(), /STATE_CONTEXT_CHANGED/);
});
test('pending marker is global across owners and cannot be overwritten by a second run', () => {
  const s = store(); s.beginMarker({ operation: 'STOP_LEGACY' });
  const c = context(); c.owner = '456-1'; const other = new MaintenanceReceiptStore(c, { directory: s.directory, guard: () => {}, inspectDirectory: s.inspect, expectedUid: process.getuid() });
  assert.throws(() => other.beginMarker({ operation: 'STOP_LEGACY' }), /UNRESOLVED_MAINTENANCE_TRANSACTION/);
  assert.equal(s.read(s.markerFile).owner, '123-1');
});
test('GitHub approval structure is not authority without independently re-fetched server evidence', async () => {
  const c = context(); const payload = { scope: 'STOP_AND_RECONCILE' }; const payloadSha256 = canonicalDigest(payload); const digest = bindingDigest(c);
  const body = `MAINTENANCE ${digest} ${payloadSha256} ${target}`;
  const approval = { schema: MAINTENANCE_AUTHORITY_SCHEMA, purpose: 'MAINTENANCE', bindingDigest: digest, decision: 'APPROVED', payload, payloadSha256,
    serverRecord: { kind: 'GITHUB_REVIEW', id: 1, state: 'APPROVED', reviewer: 'human-reviewer', author: 'author', permission: 'MAINTAIN', commitId: target, submittedAt: '2026-10-18T00:00:00.000Z', rawRecordSha256: hash,
      body, bodySha256: createHash('sha256').update(body).digest('hex') } };
  const expected = { purpose: 'MAINTENANCE', bindingDigest: digest, targetSha: target };
  assert.equal(await verifyGithubMaintenanceAuthority(approval, expected), false);
  assert.equal(await verifyGithubMaintenanceAuthority(approval, expected, { verifyServerRecord: async () => true }), true);
  for (const mutate of [a => { a.serverRecord.reviewer = 'author'; }, a => { a.serverRecord.commitId = old; }, a => { a.serverRecord.permission = 'WRITE'; }, a => { a.serverRecord.body += 'changed'; }]) {
    const a = structuredClone(approval); mutate(a); assert.equal(await verifyGithubMaintenanceAuthority(a, expected, { verifyServerRecord: async () => true }), false);
  }
});
