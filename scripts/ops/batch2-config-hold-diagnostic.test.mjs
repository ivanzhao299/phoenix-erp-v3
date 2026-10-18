import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeClass, safeFlag, safeSha, safePin, ledgerSummary, verifiedTopologyCollector } from './batch2-config-hold-diagnostic.mjs';

test('exception details and environment canaries never become diagnostic values', () => {
  const privateValue = 'sensitive-canary-value';
  assert.equal(safeClass(Error('CONFIG_HOLD=ACTIVE_RUNTIME_DRIFT ' + privateValue)), 'CONFIG_HOLD=ACTIVE_RUNTIME_DRIFT');
  assert.equal(safeClass(Error('password=' + privateValue)), 'UNVERIFIED_READ_FAILED');
  assert.equal(safeFlag(privateValue), 'INVALID_OR_UNSET');
  assert.equal(safeSha(privateValue), null);
  assert.deepEqual(safePin({ revision: privateValue, imageId: privateValue, extra: privateValue }), { revision: null, imageId: null });
});
test('only exact literal booleans and complete immutable identities are emitted', () => {
  assert.equal(safeFlag('true'), 'true'); assert.equal(safeFlag('false'), 'false');
  assert.equal(safeFlag('TRUE'), 'INVALID_OR_UNSET'); assert.equal(safeFlag(undefined), 'INVALID_OR_UNSET');
  const revision = 'a'.repeat(40), imageId = 'sha256:' + 'b'.repeat(64);
  assert.deepEqual(safePin({ revision, imageId }), { revision, imageId });
  assert.equal(safeSha('a'.repeat(39)), null);
});
test('ledger detects real pending, unknown, duplicates, timestamp drift and legacy mismatch', () => {
  const inventory = { canonicalTypeorm: [{ effective_name: 'Current1', timestamp: 1 }, { effective_name: 'Current2', timestamp: 2 }],
    retired: [{ name: 'Retired', timestamp: 3 }], legacy: ['baseline.sql'] };
  const actual = { typeorm: [{ name: 'Current1', timestamp: 9 }, { name: 'Current1', timestamp: 9 }, { name: 'Unknown', timestamp: 4 }], legacy: [] };
  const out = ledgerSummary(inventory, actual);
  assert.equal(out.pendingCount, 1); assert.equal(out.unknownCount, 1); assert.equal(out.duplicateCount, 1);
  assert.equal(out.timestampMismatchCount, 3); assert.equal(out.legacyExactSet, false);
  const good = ledgerSummary(inventory, { typeorm: [{ name: 'Current1', timestamp: 1 }, { name: 'Current2', timestamp: 2 }, { name: 'Retired', timestamp: 3 }], legacy: [{ filename: 'baseline.sql' }] });
  assert.equal(good.pendingCount + good.unknownCount + good.duplicateCount + good.timestampMismatchCount, 0);
  assert.equal(good.legacyExactSet, true);
});
test('host payload retains readonly DB fence and does not contain mutation or whole-state output APIs', () => {
  const s = fs.readFileSync(new URL('./batch2-config-hold-diagnostic.mjs', import.meta.url), 'utf8');
  assert.match(s, /guard\.verifyContext\(ROOT, STATE\)/);
  assert.match(s, /guard\.requireCleanMain\(ROOT\)/);
  assert.match(s, /default_transaction_read_only=on/);
  assert.match(s, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(s, /ROLLBACK;/);
  assert.doesNotMatch(s, /fs\.(write|append|mkdir|unlink|rm|rename|chmod|chown|truncate)/);
  assert.doesNotMatch(s, /(?:console\.(?:log|error)\([^\n]*(?:records|floor|active|values)|JSON\.stringify\(records\))/);
  assert.doesNotMatch(s, /CHANJET_SYNC_OPERATOR_TOKEN|READONLY_APPROVAL'\)\s*[,}]/);
});

test('topology code is hashed before import and a mismatched payload cannot execute', async () => {
  const bytes = Buffer.from('globalThis.__topologyCanary = true;');
  await assert.rejects(verifiedTopologyCollector(bytes.toString('base64'), '0'.repeat(64)), /TOPOLOGY_PROGRAM_MISMATCH/);
  assert.equal(globalThis.__topologyCanary, undefined);
  await assert.rejects(verifiedTopologyCollector(bytes.toString('base64') + '\n', '0'.repeat(64)), /TOPOLOGY_PROGRAM_MISMATCH/);
  await assert.rejects(verifiedTopologyCollector('A'.repeat(131073), '0'.repeat(64)), /TOPOLOGY_PROGRAM_MISMATCH/);
});

test('fixed local psql rejects connection-string identifiers and cannot inherit libpq routing',async()=>{
  const {READONLY_LOCAL_PSQL}=await import('./batch2-config-hold-diagnostic.mjs');
  const {spawnSync}=await import('node:child_process');
  const {readFileSync}=await import('node:fs');
  for(const delta of [{POSTGRES_DB:'postgresql://unapproved.invalid/db'},{POSTGRES_DB:'host=unapproved.invalid dbname=foo'},{POSTGRES_USER:'-option'}]){
    const result=spawnSync('/bin/sh',['-c',READONLY_LOCAL_PSQL],{env:{POSTGRES_USER:'fixture_owner',POSTGRES_DB:'phoenix_erp',...delta},encoding:'utf8',timeout:1000});
    assert.equal(result.status,64);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
  }
  assert.match(READONLY_LOCAL_PSQL,/\/usr\/bin\/env -i/);assert.match(READONLY_LOCAL_PSQL,/--host=\/var\/run\/postgresql --port=5432/);
  const source=readFileSync(new URL('./batch2-config-hold-diagnostic.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/FROM (?:schema_migrations|migrations|chanjet_sync_jobs|chanjet_writeback_outbox|chanjet_wms_writeback_outbox|chanjet_master_mapping)\b/);
});
