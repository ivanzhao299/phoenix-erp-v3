import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Client } from '../../apps/api/node_modules/pg/index.js';
import { authorizeApiSwitch, evaluatePhase1PostMigration, evaluatePhase1PreExecution, loadPhase1Manifest } from './phase1-production-execution-gate.mjs';

const manifest = loadPhase1Manifest(new URL('./phase1-production-migration-manifest.json', import.meta.url));
const pg = new Client();
await pg.connect();
try {
  const version = await pg.query('SHOW server_version_num');
  assert.equal(version.rows[0].server_version_num, '160014', 'PG16.14 is required');
  await pg.query('DROP TABLE IF EXISTS phase1_rehearsal_ledger');
  await pg.query('CREATE TABLE phase1_rehearsal_ledger (name text primary key, timestamp bigint not null)');

  const historical = Array.from({ length: 84 }, (_, index) => ({ name: `HistoricalMigration${String(index).padStart(3, '0')}178000000${String(index).padStart(4, '0')}`, timestamp: `178000000${String(index).padStart(4, '0')}` }));
  const inventory = [...historical, ...manifest.map((entry) => ({ effective_name: entry.name, timestamp: Number(entry.timestamp) }))];
  for (const row of historical) await pg.query('INSERT INTO phase1_rehearsal_ledger(name, timestamp) VALUES ($1, $2)', [row.name, row.timestamp]);
  const preflight = { pass: true, failures: [], counts: { canonical_typeorm_pending: 4 } };
  const pending = manifest.map((entry) => entry.name);
  const pre = evaluatePhase1PreExecution({ preflight, pending, manifest, candidateInventory: inventory });
  assert.equal(pre.pass, true);
  console.log('PRECHECK_EXACT_SET=PASS');

  const extraPending = evaluatePhase1PreExecution({ preflight, pending: [...pending, historical[0].name], manifest, candidateInventory: inventory });
  assert.equal(extraPending.pass, false);
  console.log('EXTRA_PENDING=BLOCK_PASS');
  const alreadyApplied = evaluatePhase1PreExecution({ preflight, pending: pending.slice(1), manifest, candidateInventory: inventory });
  assert.equal(alreadyApplied.pass, false);
  console.log('PHASE1_ALREADY_APPLIED=BLOCK_PASS');
  const unknown = evaluatePhase1PreExecution({ preflight: { pass: false, failures: ['unknown_typeorm_applied'] }, pending, manifest, candidateInventory: inventory });
  assert.equal(unknown.pass, false);
  console.log('UNKNOWN_APPLIED=BLOCK_PASS');

  await pg.query('BEGIN');
  await pg.query('CREATE TABLE phase1_rollback_probe (id integer)');
  await pg.query('INSERT INTO phase1_rollback_probe VALUES (1)');
  await pg.query('ROLLBACK');
  const rollbackProbe = await pg.query("SELECT to_regclass('public.phase1_rollback_probe') AS name");
  assert.equal(rollbackProbe.rows[0].name, null);
  console.log('MIGRATION_TRANSACTION_ROLLBACK=PASS');

  for (const entry of manifest) await pg.query('INSERT INTO phase1_rehearsal_ledger(name, timestamp) VALUES ($1, $2)', [entry.name, entry.timestamp]);
  const post = evaluatePhase1PostMigration({ postflight: { pass: true, failures: [], counts: { canonical_typeorm_pending: 0 } }, applied: [...historical.map((row) => row.name), ...pending], manifest, candidateInventory: inventory, invariants: { schema: true, data: true } });
  assert.equal(post.pass, true);
  console.log('POSTFLIGHT_ZERO_PENDING=PASS');
  assert.equal(authorizeApiSwitch({ backupVerified: true, precheck: true, migrationExitCode: 0, postcheck: true, phase1Applied: true, schemaInvariants: true, dataInvariants: true, candidateIdentity: true }), true);
  assert.equal(authorizeApiSwitch({ backupVerified: true, precheck: true, migrationExitCode: 0, postcheck: false, phase1Applied: true, schemaInvariants: true, dataInvariants: true, candidateIdentity: true }), false);
  console.log('API_SWITCH_AUTHORIZATION=PASS');
  console.log('PHASE1_CONTROLLED_EXECUTION_REHEARSAL=PASS');
} finally {
  await pg.query('DROP TABLE IF EXISTS phase1_rehearsal_ledger').catch(() => {});
  await pg.end();
}
