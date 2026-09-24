import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLedger, normalizePsqlOutput, validateRetiredRegistry } from './ledger-preflight.mjs';

const retired = [{ name: 'DropHouseOwnershipRedundantColumns1787647200000', timestamp: '1787647200000', removal_commit: 'a162cda6360dae1f5b18975a4c029adac1761c0d', classification: 'KNOWN_RETIRED_APPLIED' }];
const legacy = [{ filename: '20260101_init.sql', applied_at: '2026-01-01T00:00:00.000Z' }];
const canonical = [{ effective_name: 'CreateTypeormMetadata1781749821162', timestamp: '1781749821162' }, { effective_name: 'PhaseOne1789600000000', timestamp: '1789600000000' }];
const applied = [{ name: legacy[0].filename.replace('.sql', ''), timestamp: String(new Date(legacy[0].applied_at).getTime()) }, { name: canonical[0].effective_name, timestamp: canonical[0].timestamp }];

function base(extra = {}) { return evaluateLedger({ schemaRows: legacy, canonicalLegacy: legacy.map((row) => row.filename), canonicalTypeorm: canonical, typeormRows: applied, retiredTypeorm: retired, mode: 'pre-migration', ...extra }); }

test('legacy ledger complete and bridge absent still passes pre-migration', () => {
  const result = base({ typeormRows: [applied[1], { name: retired[0].name, timestamp: retired[0].timestamp }] });
  assert.equal(result.pass, true);
  assert.equal(result.diagnostics.bridge_state, 'ABSENT');
  assert.deepEqual(result.diagnostics.known_retired_applied, [retired[0].name]);
});

test('post-migration requires zero canonical pending', () => {
  const result = base({ mode: 'post-migration', typeormRows: [...applied, { name: retired[0].name, timestamp: retired[0].timestamp }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /canonical_pending/);
});

test('unknown applied row remains a hard failure', () => {
  const result = base({ typeormRows: [...applied, { name: 'UnknownMigration9999999999999', timestamp: '9999999999999' }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /unknown_typeorm_applied/);
});

test('retired timestamp mismatch is a hard failure', () => {
  const result = base({ typeormRows: [...applied, { name: retired[0].name, timestamp: '1787647200001' }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /retired_timestamp_mismatch/);
});

test('legacy missing and unexpected remain hard failures', () => {
  const result = base({ schemaRows: [] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /legacy_missing/);
});

test('duplicate identity and timestamp remain hard failures', () => {
  const result = base({ typeormRows: [...applied, { ...applied[1] }] });
  assert.equal(result.pass, false);
  assert.match(result.failures.join(','), /duplicate_typeorm_name/);
  assert.match(result.failures.join(','), /duplicate_typeorm_timestamp/);
});

test('retired registry validates exact governance shape', () => {
  assert.equal(validateRetiredRegistry(retired).length, 1);
  assert.throws(() => validateRetiredRegistry([{ ...retired[0], timestamp: '1' }]));
});

test('normalizes psql transaction command tags around JSON output', () => {
  const output = 'BEGIN\nSET\n[{"filename":"20260101_init.sql","applied_at":"2026-01-01T00:00:00.000Z"}]\nCOMMIT';
  const normalized = normalizePsqlOutput(output);
  assert.deepEqual(JSON.parse(normalized), [{ filename: '20260101_init.sql', applied_at: '2026-01-01T00:00:00.000Z' }]);
});

test('normalizes CRLF psql output', () => {
  const output = 'BEGIN\r\nSET\r\n[{"name":"migration"}]\r\nCOMMIT\r\n';
  assert.equal(normalizePsqlOutput(output), '[{"name":"migration"}]');
});

test('normalizes scalar psql output', () => {
  assert.equal(normalizePsqlOutput('BEGIN\nSET\nt\nCOMMIT'), 't');
});

test('preserves query data equal to SET inside JSON', () => {
  const output = 'BEGIN\nSET\n[{"name":"SET"}]\nCOMMIT';
  assert.deepEqual(JSON.parse(normalizePsqlOutput(output)), [{ name: 'SET' }]);
});
