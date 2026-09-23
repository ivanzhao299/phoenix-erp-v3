import test from 'node:test';
import assert from 'node:assert/strict';
import { compareManifests } from './schema-object-diff.mjs';

const manifest = (...lines) => `${lines.join('\n')}\n`;

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
