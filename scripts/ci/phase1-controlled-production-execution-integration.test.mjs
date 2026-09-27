import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { shouldBlockGenericDeploy } from './phase1-generic-deploy-guard.mjs';
import { loadPhase1Manifest } from './phase1-production-execution-gate.mjs';
import { compareInvariantEvidence } from './phase1-production-invariants.mjs';

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
  assert.match(workflow, /api:sha-\$\{TARGET_SHA\}/);
  assert.match(workflow, /web:sha-\$\{TARGET_SHA\}/);
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
  assert.doesNotMatch(wrapper, /PREV_API_IMAGE_ID|PREV_WEB_IMAGE_ID|API_IMAGE_ID|WEB_IMAGE_ID/);
  assert.match(wrapper, /api-image-digest\.txt/);
  assert.match(wrapper, /web-image-digest\.txt/);
  assert.match(wrapper, /imageDigest/);
  assert.match(wrapper, /executionImageDigest/);
  assert.match(workflow, /git merge --ff-only "\$TARGET_SHA"/);
  assert.match(workflow, /PRODUCTION_BRANCH=.*git branch --show-current/);
  assert.match(workflow, /PRODUCTION_BRANCH_NOT_MAIN/);
  assert.match(workflow, /PRODUCTION_REMOTE_MISMATCH/);
  assert.match(workflow, /production-branch\.txt/);
  assert.match(workflow, /production-origin-fingerprint\.txt/);
  assert.doesNotMatch(workflow, /production-origin\.txt/);
  assert.doesNotMatch(workflow, /printf ['"]%s\n['"] \"\$ORIGIN_URL/);
  assert.match(workflow, /git rev-parse refs\/heads\/main/);
  assert.match(workflow, /production-final-sha\.txt/);
  assert.match(workflow, /API_IMAGE_DIGEST/);
  assert.match(workflow, /WEB_IMAGE_DIGEST/);
  assert.match(workflow, /API_IMAGE_REF/);
  assert.match(workflow, /WEB_IMAGE_REF/);
  assert.match(workflow, /RepoDigests/);
  assert.doesNotMatch(workflow, /API_IMAGE_ID|WEB_IMAGE_ID|ACTUAL_API_IMAGE_ID|ACTUAL_WEB_IMAGE_ID/);
  assert.doesNotMatch(workflow, /format '{{\.Id}}'/);
  assert.match(workflow, /API_IMAGE_REF/);
  assert.match(workflow, /WEB_IMAGE_REF/);
});

test('registry digest resolver produces a portable release identity', () => {
  const start = workflow.indexOf('          resolve_repo_digest() {');
  const end = workflow.indexOf('\n          API_IMAGE_DIGEST=', start);
  assert.ok(start >= 0 && end > start, 'registry digest resolver must be present');
  const resolver = workflow.slice(start, end).split('\n').map((line) => line.slice(10)).join('\n');
  const fakeDockerDir = fs.mkdtempSync('/tmp/phase1-docker-');
  fs.writeFileSync(`${fakeDockerDir}/docker`, '#!/bin/sh\nprintf "%s\\n" "ghcr.io/ivanzhao299/phoenix-erp-v3/api@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"\n');
  fs.chmodSync(`${fakeDockerDir}/docker`, 0o755);
  const result = spawnSync('bash', ['-c', `${resolver}\nresolve_repo_digest "$1"`, 'digest-resolver', 'ghcr.io/ivanzhao299/phoenix-erp-v3/api:sha-target'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeDockerDir}:${process.env.PATH}` }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `sha256:${'c'.repeat(64)}`);
});

test('production origin gate normalizes identity and rejects impostors', () => {
  const start = workflow.indexOf('            fingerprint_remote() {');
  const end = workflow.indexOf('\n            ORIGIN_URL="$(git config --get remote.origin.url || true)"', start);
  assert.ok(start >= 0 && end > start, 'fingerprint parser must be present in the workflow');
  const parser = workflow.slice(start, end).split('\n').map((line) => line.slice(12)).join('\n');
  const fakeSshDir = fs.mkdtempSync('/tmp/phase1-origin-ssh-');
  fs.writeFileSync(`${fakeSshDir}/ssh`, '#!/bin/sh\nprintf "%s\\n" "hostname github.com"\n');
  fs.chmodSync(`${fakeSshDir}/ssh`, 0o755);
  const run = (url, useAlias = false) => {
    const script = `${parser}\nfingerprint_remote "$1"\nprintf '%s|%s|%s|%s\\n' "$ORIGIN_URL_TYPE" "$ORIGIN_HOST_CLASS" "$ORIGIN_REPOSITORY" "$ORIGIN_ALIAS_GITHUB"`;
    return spawnSync('bash', ['-c', script, 'origin-fingerprint', url], {
      encoding: 'utf8',
      env: { ...process.env, PATH: useAlias ? `${fakeSshDir}:${process.env.PATH}` : process.env.PATH }
    });
  };
  const accepted = [
    ['git@github.com:ivanzhao299/phoenix-erp-v3.git', false, 'scp_ssh|github.com|ivanzhao299/phoenix-erp-v3|false'],
    ['git@github.com:ivanzhao299/phoenix-erp-v3', false, 'scp_ssh|github.com|ivanzhao299/phoenix-erp-v3|false'],
    ['https://github.com/ivanzhao299/phoenix-erp-v3.git', false, 'https_url|github.com|ivanzhao299/phoenix-erp-v3|false'],
    ['https://github.com/ivanzhao299/phoenix-erp-v3', false, 'https_url|github.com|ivanzhao299/phoenix-erp-v3|false'],
    ['https://deploy-user@github.com/ivanzhao299/phoenix-erp-v3', false, 'https_url|github.com|ivanzhao299/phoenix-erp-v3|false'],
    ['https://deploy-user@github.com/ivanzhao299/phoenix-erp-v3.git', false, 'https_url|github.com|ivanzhao299/phoenix-erp-v3|false'],
    ['https://deploy-user:placeholder@github.com:443/ivanzhao299/phoenix-erp-v3', false, 'https_url|github.com|ivanzhao299/phoenix-erp-v3|false'],
    ['ssh://git@github.com/ivanzhao299/phoenix-erp-v3', false, 'ssh_url|github.com|ivanzhao299/phoenix-erp-v3|false'],
    ['ssh://git@github-alias/ivanzhao299/phoenix-erp-v3', true, 'ssh_url|github_alias|ivanzhao299/phoenix-erp-v3|true']
  ];
  for (const [url, alias, expected] of accepted) {
    const result = run(url, alias);
    assert.equal(result.status, 0, `${url}: ${result.stderr}`);
    assert.equal(result.stdout.trim(), expected, `${url} must normalize to the release identity`);
  }
  const rejected = [
    'git@github.com:emvia/phoenix-erp-final.git',
    'https://github.com/ivanzhao299/other-repo.git',
    'https://github.com.evil.example/ivanzhao299/phoenix-erp-v3',
    'https://evil.example/ivanzhao299/phoenix-erp-v3',
    '/srv/phoenix-erp-v3',
    'not-a-remote',
    ''
  ];
  for (const url of rejected) {
    const result = spawnSync('bash', ['-c', `${parser}\nfingerprint_remote "$1"\n[ "$ORIGIN_REPOSITORY" = "ivanzhao299/phoenix-erp-v3" ] && { [ "$ORIGIN_HOST_CLASS" = github.com ] || [ "$ORIGIN_HOST_CLASS" = github_alias ]; }`, 'origin-fingerprint', url], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, `${url || '<empty>'} must fail the normalized identity gate`);
  }
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

test('semantic fingerprints fail closed and tolerate canonical JSON normalization', () => {
  const base = {
    rowCounts: { acc_ledger: 1 }, timestampDelta: null,
    timestampNegativeCount: 0, timestampMinDelta: null, timestampMaxDelta: null,
    warehouseForeignKeys: 6, iotDynamicPropertyCodeForeignKeys: 0,
    schemaValid: true, dataValid: true,
    semanticFingerprints: {
      accLedger: 'a', pdaPayloadSemantic: 'jsonb-canonical',
      inboundTimestamps: 'utc', warehouseCodes: { wms_warehouses: 'empty' }
    }
  };
  assert.equal(compareInvariantEvidence(base, structuredClone(base)).pass, true);
  const changed = structuredClone(base);
  changed.semanticFingerprints.accLedger = 'changed';
  assert.match(compareInvariantEvidence(base, changed).failures.join(','), /DATA_FINGERPRINT_CHANGED:accLedger/);
  const missing = structuredClone(base);
  delete missing.semanticFingerprints.pdaPayloadSemantic;
  assert.match(compareInvariantEvidence(base, missing).failures.join(','), /DATA_FINGERPRINT_SET_CHANGED/);
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
