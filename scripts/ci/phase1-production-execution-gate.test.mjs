import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeApiSwitch, evaluatePhase1PostMigration, evaluatePhase1PreExecution, loadPhase1Manifest, validateCandidateInventory } from './phase1-production-execution-gate.mjs';

const manifest = loadPhase1Manifest(new URL('./phase1-production-migration-manifest.json', import.meta.url));
const inventory = manifest.map((entry) => ({ effective_name: entry.name, timestamp: Number(entry.timestamp) }));
const preflight = { pass: true, failures: [] };

test('manifest and candidate identity are exact', () => {
  assert.equal(manifest.length, 4);
  assert.doesNotThrow(() => validateCandidateInventory(manifest, inventory));
});

test('pre-execution requires the exact four pending migrations', () => {
  const result = evaluatePhase1PreExecution({ preflight, pending: manifest.map((entry) => entry.name), manifest, candidateInventory: inventory });
  assert.equal(result.pass, true);
  assert.equal(result.phase1PendingExact, true);
  assert.equal(evaluatePhase1PreExecution({ preflight, pending: manifest.slice(1).map((entry) => entry.name), manifest, candidateInventory: inventory }).pass, false);
});

test('pre-execution blocks pre-existing pending, already-applied, unknown, and image mismatch states', () => {
  const pending = [...manifest.map((entry) => entry.name), 'OldPending1780000000000'];
  assert.equal(evaluatePhase1PreExecution({ preflight, pending, manifest, candidateInventory: inventory }).pass, false);
  assert.throws(() => validateCandidateInventory(manifest, inventory, { imageDigest: 'sha256:' + 'a'.repeat(64), executionImageDigest: 'sha256:' + 'b'.repeat(64) }), /CANDIDATE_IMAGE_DIGEST_MISMATCH/);
});

test('registry digest remains authoritative when local image IDs differ', () => {
  const digest = 'sha256:' + 'c'.repeat(64);
  assert.doesNotThrow(() => validateCandidateInventory(manifest, inventory, { imageDigest: digest, executionImageDigest: digest }));
  assert.throws(() => validateCandidateInventory(manifest, inventory, { imageDigest: digest, executionImageDigest: 'sha256:' + 'd'.repeat(64) }), /CANDIDATE_IMAGE_DIGEST_MISMATCH/);
});

test('post-migration requires no pending and all four applied', () => {
  const postflight = { pass: true, failures: [], counts: { canonical_typeorm_pending: 0 } };
  const result = evaluatePhase1PostMigration({ postflight, applied: manifest.map((entry) => entry.name), manifest, candidateInventory: inventory, invariants: { schema: true, data: true } });
  assert.equal(result.pass, true);
  assert.equal(evaluatePhase1PostMigration({ postflight, applied: [], manifest, candidateInventory: inventory, invariants: { schema: true, data: true } }).pass, false);
});

test('API switch remains fail-closed until every gate passes', () => {
  const args = { backupVerified: true, precheck: true, migrationExitCode: 0, postcheck: true, phase1Applied: true, schemaInvariants: true, dataInvariants: true, candidateIdentity: true };
  assert.equal(authorizeApiSwitch(args), true);
  assert.equal(authorizeApiSwitch({ ...args, postcheck: false }), false);
  assert.equal(authorizeApiSwitch({ ...args, migrationExitCode: 1 }), false);
});
