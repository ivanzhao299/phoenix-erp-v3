import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateLedger, normalizeLegacy } from './ledger-preflight.mjs';

const schemaRows = [{ filename: '20260101_init.sql', applied_at: '2026-01-01T00:00:00.000Z' }];
const legacyName = normalizeLegacy(schemaRows[0].filename);
const matchingTimestamp = String(new Date(schemaRows[0].applied_at).getTime());

function base(extra = {}) {
  return evaluateLedger({
    schemaRows,
    typeormRows: [{ name: legacyName, timestamp: matchingTimestamp }],
    canonicalTsNames: ['1781749821162-CreateTypeormMetadata'],
    mode: 'pre-migration',
    ...extra,
  });
}

test('perfect ledger passes and allows current pending TS migration in pre mode', () => {
  const result = base();
  assert.equal(result.pass, true);
  assert.deepEqual(result.diagnostics.pending_ts, ['1781749821162-CreateTypeormMetadata']);
});

test('legacy-only row blocks', () => {
  const result = base({ typeormRows: [] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /legacy_only/);
});

test('mirror-only legacy row blocks', () => {
  const result = base({ typeormRows: [{ name: legacyName, timestamp: matchingTimestamp }, { name: '20260102_extra', timestamp: '2' }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /mirror_only/);
});

test('duplicate legacy identity blocks', () => {
  const result = base({ schemaRows: [...schemaRows, { ...schemaRows[0], filename: '20260101_init.sql' }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /duplicate_legacy/);
});

test('duplicate TypeORM legacy mirror blocks', () => {
  const result = base({ typeormRows: [{ name: legacyName, timestamp: matchingTimestamp }, { name: legacyName, timestamp: matchingTimestamp }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /duplicate_typeorm_legacy/);
});

test('timestamp mismatch blocks', () => {
  const result = base({ typeormRows: [{ name: legacyName, timestamp: '1' }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /timestamp_mismatch/);
});

test('post mode blocks pending canonical TS migration', () => {
  const result = base({ mode: 'post-migration' });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /unexpected_pending/);
});

test('unknown TypeORM row blocks', () => {
  const result = base({ typeormRows: [{ name: legacyName, timestamp: matchingTimestamp }, { name: 'UnknownMigration999', timestamp: '9' }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /unexpected_typeorm/);
});

test('missing tracking table fixture blocks closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-preflight-'));
  const fixture = path.join(dir, 'missing.json');
  fs.writeFileSync(fixture, JSON.stringify({ typeormRows: [], canonicalTsNames: [] }));
  const result = spawnSync(process.execPath, [path.resolve('scripts/ledger-preflight.mjs'), '--fixture', fixture], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schema_migrations fixture\/table is unavailable/);
});
