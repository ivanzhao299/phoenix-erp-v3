import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { compareManifests } from './schema-object-diff.mjs';

const manifest = (...lines) => `${lines.join('\0')}\0`;

test('identical manifests have no object differences', () => {
  const value = manifest('table\tpublic.a', 'column\tpublic.a.id:int4', 'index\tpublic.a_pkey:CREATE UNIQUE INDEX a_pkey ON public.a USING btree (id)');
  const result = compareManifests(value, value);
  assert.equal(result.verdict, 'NO_OBJECT_DRIFT');
  assert.equal(result.invariant.valid, true);
  assert.equal(result.tables.productionOnly.count, 0);
  assert.equal(result.families.column.definitionMismatches.count, 0);
});

test('production-only and canonical-only tables are separated', () => {
  const production = manifest('table\tpublic.a', 'table\tpublic.legacy');
  const canonical = manifest('table\tpublic.a', 'table\tpublic.required');
  const result = compareManifests(production, canonical);
  assert.deepEqual(result.tables.productionOnly.items, ['public.legacy']);
  assert.deepEqual(result.tables.canonicalOnly.items, ['public.required']);
  assert.equal(result.invariant.netTableDelta, 0);
  assert.equal(result.verdict, 'CANONICAL_OBJECTS_MISSING_IN_PRODUCTION');
});

test('same table extra column is identified', () => {
  const production = manifest('table\tpublic.a', 'column\tpublic.a.id:int4', 'column\tpublic.a.extra:text');
  const canonical = manifest('table\tpublic.a', 'column\tpublic.a.id:int4');
  const result = compareManifests(production, canonical);
  assert.deepEqual(result.families.column.productionOnly.items, ['public.a.extra']);
  assert.equal(result.verdict, 'EXTRA_OBJECTS_ONLY');
});

test('same column different type is a definition mismatch', () => {
  const production = manifest('table\tpublic.a', 'column\tpublic.a.id:int8');
  const canonical = manifest('table\tpublic.a', 'column\tpublic.a.id:int4');
  const result = compareManifests(production, canonical);
  assert.equal(result.families.column.definitionMismatches.count, 1);
  assert.equal(result.verdict, 'COMMON_OBJECT_SCHEMA_DRIFT');
});

test('constraint-only, index-only, and mixed differences are retained', () => {
  const production = manifest('table\tpublic.a', 'constraint\tpublic.a.ck:x:CHECK (x > 0)', 'index\tpublic.a_idx:CREATE INDEX a_idx ON public.a (x)');
  const canonical = manifest('table\tpublic.a', 'constraint\tpublic.a.ck:x:CHECK (x >= 0)', 'index\tpublic.a_idx:CREATE INDEX a_idx ON public.a (y)');
  const result = compareManifests(production, canonical);
  assert.equal(result.families.constraint.definitionMismatches.count, 1);
  assert.equal(result.families.index.definitionMismatches.count, 1);
  assert.equal(result.verdict, 'COMMON_OBJECT_SCHEMA_DRIFT');
});

test('NUL framing preserves multiline constraint definitions and embedded tabs', () => {
  const multilineConstraint = [
    'constraint\tpublic.audit_log.ck_event:c:CHECK (',
    '  CASE\tevent_type',
    "    WHEN 'A' THEN true",
    '  END',
    ')',
  ].join('\n');
  const value = ['table\tpublic.audit_log', multilineConstraint, 'index\tpublic.audit_idx:CREATE INDEX audit_idx ON public.audit_log (id)'].join('\0') + '\0';
  const result = compareManifests(value, value);
  assert.equal(result.verdict, 'NO_OBJECT_DRIFT');
  assert.equal(result.productionRecordCount, 3);
  assert.equal(result.families.constraint.definitionMismatches.count, 0);
});

test('NUL framing supports multiple multiline records and missing final separator', () => {
  const value = [
    'table\tpublic.audit_log',
    'constraint\tpublic.audit_log.first:c:CHECK (\n  x > 0\n)',
    'constraint\tpublic.audit_log.second:c:CHECK (\n  y > 0\n)',
  ].join('\0');
  const result = compareManifests(value, value);
  assert.equal(result.productionRecordCount, 3);
  assert.equal(result.verdict, 'NO_OBJECT_DRIFT');
});

test('PostgreSQL runtime emits a NUL-framed multiline record when available', (t) => {
  if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGDATABASE) {
    t.skip('PostgreSQL service environment is not available');
    return;
  }
  const query = "SELECT E'constraint\\tpublic.audit_log.ck_event:c:CHECK (\\n  CASE event_type\\n    WHEN ''A'' THEN true\\n  END\\n)'";
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-0', '-c', query], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\0/);
  const parsed = compareManifests(result.stdout, result.stdout);
  assert.equal(parsed.verdict, 'NO_OBJECT_DRIFT');
});
