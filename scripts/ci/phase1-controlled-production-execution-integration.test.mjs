import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldBlockGenericDeploy } from './phase1-generic-deploy-guard.mjs';
import { loadPhase1Manifest } from './phase1-production-execution-gate.mjs';

const workflow = fs.readFileSync('.github/workflows/phase1-controlled-production-execution.yml', 'utf8');
const wrapper = fs.readFileSync('scripts/phase1-controlled-production-execution.sh', 'utf8');
const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const invariants = fs.readFileSync('scripts/ci/phase1-production-invariants.mjs', 'utf8');

test('controlled workflow is manual-only, serial, and production-bound', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request:|schedule:|workflow_run:|workflow_call:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /RUN_PHASE1_CONTROLLED_PRODUCTION_EXECUTION/);
  assert.match(workflow, /129fdb85c81ab0c201044daf021caf778b37b40b/);
  assert.match(workflow, /expected_target_sha:/);
  assert.doesNotMatch(workflow, /expected_production_sha:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /api:sha-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /web:sha-\$\{\{ github\.sha \}\}/);
});

test('remote transport layout, run identity, auth, and SSH parity are explicit', () => {
  assert.match(workflow, /EXECUTION_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /GHCR_USER: \$\{\{ github\.actor \}\}/);
  assert.match(workflow, /GHCR_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(workflow, /envs: [^\n]*EXECUTION_RUN_ID[^\n]*GHCR_TOKEN/);
  assert.match(workflow, /proxy_host:/);
  assert.match(workflow, /proxy_username:/);
  assert.match(workflow, /proxy_key:/);
  assert.match(workflow, /mkdir -p "\$ROOT_DIR\/scripts\/ci"/);
  assert.match(workflow, /PREFLIGHT_FILE="\$ROOT_DIR\/scripts\/ledger-preflight\.mjs"/);
  assert.match(workflow, /GATE_FILE="\$ROOT_DIR\/scripts\/ci\/phase1-production-execution-gate\.mjs"/);
  assert.match(workflow, /INVARIANTS_FILE="\$ROOT_DIR\/scripts\/ci\/phase1-production-invariants\.mjs"/);
  assert.match(workflow, /WRAPPER_FILE="\$ROOT_DIR\/scripts\/phase1-controlled-production-execution\.sh"/);
  assert.match(workflow, /node --check "\$PREFLIGHT_FILE"/);
  assert.doesNotMatch(workflow, /SCRIPT_FILE=\$\(mktemp\)/);
  assert.match(wrapper, /umask 077/);
  assert.match(wrapper, /sha256sum -c .*backup\.sha256/);
  assert.match(wrapper, /docker compose run --no-deps -d --name "\$PROBE_NAME" api/);
  assert.match(wrapper, /DB_CHANGED_APPLICATION_NOT_SWITCHED/);
  assert.match(wrapper, /DB_CHANGED_APPLICATION_SWITCH_FAILED/);
  assert.doesNotMatch(wrapper, /PREV_API_IMAGE_ID|PREV_WEB_IMAGE_ID/);
  assert.match(workflow, /git merge --ff-only "\$TARGET_SHA"/);
  assert.match(workflow, /production-final-sha\.txt/);
});

test('invariants validate exact schema and real data evidence', () => {
  for (const token of [
    "'acc_ledger','store_code','character varying',64",
    "'acc_ledger','ref_no','character varying',128",
    "'acc_ledger','ledger_type','character varying',64",
    "'wms_stocktake','status','character varying',32",
    "'pda_sync_log','payload','jsonb'",
    "'wms_inbound','created_at','timestamp with time zone'",
    "'wms_inbound','updated_at','timestamp with time zone'",
    "'dataValid', to_regclass",
    "'rowCounts', json_build_object"
  ]) assert.match(invariants, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(invariants, /'dataValid', true/);
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
