import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldBlockGenericDeploy } from './phase1-generic-deploy-guard.mjs';
import { loadPhase1Manifest } from './phase1-production-execution-gate.mjs';

const workflow = fs.readFileSync('.github/workflows/phase1-controlled-production-execution.yml', 'utf8');
const wrapper = fs.readFileSync('scripts/phase1-controlled-production-execution.sh', 'utf8');
const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

test('controlled workflow is manual-only, serial, and production-bound', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|schedule:|workflow_run:|workflow_call:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /RUN_PHASE1_CONTROLLED_PRODUCTION_EXECUTION/);
  assert.match(workflow, /129fdb85c81ab0c201044daf021caf778b37b40b/);
  assert.match(workflow, /api:sha-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /web:sha-\$\{\{ github\.sha \}\}/);
});

test('controlled path excludes legacy replay and bridge apply', () => {
  assert.doesNotMatch(wrapper, /db-migrate\.sh|bridge-schema-migrations-to-typeorm\.sh|migration:revert/);
  assert.match(wrapper, /PRODUCTION_SHA_CHANGED/);
  assert.match(wrapper, /PRESERVE_ARTIFACTS/);
});

test('generic deploy remains protected by a separate Phase 1 guard contract', () => {
  assert.match(deploy, /phase1-generic-deploy-guard\.mjs/);
  assert.match(deploy, /只读 ledger preflight/);
  assert.match(deploy, /bash scripts\/db-migrate\.sh/);
  assert.match(deploy, /deploy-schema-first\.sh/);
  const manifest = loadPhase1Manifest(new URL('./phase1-production-migration-manifest.json', import.meta.url));
  const phase1 = { pass: true, diagnostics: { canonical_typeorm_pending: manifest.map((entry) => entry.name) } };
  assert.equal(shouldBlockGenericDeploy(phase1, manifest), true);
  assert.equal(shouldBlockGenericDeploy({ pass: true, diagnostics: { canonical_typeorm_pending: [] } }, manifest), false);
});
