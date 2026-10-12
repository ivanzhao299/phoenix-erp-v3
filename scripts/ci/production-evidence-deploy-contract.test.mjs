import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const workflow = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
const contract = JSON.parse(fs.readFileSync('scripts/ops/production-config-contract.json', 'utf8'));
const at = needle => { const index = workflow.indexOf(needle); assert.notEqual(index, -1, `missing ${needle}`); return index; };

test('API-only deployment binds PRE before floor promotion and POST before SUCCESS', () => {
  assert(contract.criticalFiles.includes('scripts/ops/production-deployment-evidence.mjs'));
  assert(at('EVIDENCE_PHASE=PRE_SNAPSHOT') < at('node "$FLOOR_STAGE/promote-production-config-floor.mjs"'));
  assert(at('node "$EVIDENCE_HELPER" capture "$POST_EVIDENCE_FILE"') < at('node scripts/ops/production-deployment-state.mjs complete'));
  assert.match(workflow, /EVIDENCE_PHASE=POST_SNAPSHOT node "\$EVIDENCE_HELPER" capture/);
  assert(at('node "$EVIDENCE_HELPER" verify "$PRE_EVIDENCE_FILE" "$POST_EVIDENCE_FILE" "$LOG_EVIDENCE_FILE"') < at('node scripts/ops/production-deployment-state.mjs complete'));
  assert.match(workflow, /DEPLOY_RUN_ATTEMPT/);
});

test('evidence failure has no recovery Compose path and API mode cannot recreate Web/DB', () => {
  const deploySection = workflow.slice(workflow.indexOf('name: Deploy via SSH'));
  assert.match(deploySection, /trap rollback_deploy ERR/);
  assert.doesNotMatch(deploySection.slice(deploySection.indexOf('node "$EVIDENCE_HELPER" verify'), deploySection.indexOf('node scripts/ops/production-deployment-state.mjs complete')), /compose up .*\b(?:db|web)\b/);
  assert.match(deploySection, /test "\$BUILD_WEB" = false/);
  assert.match(deploySection, /RUN_MIG=false/);
});

test('approved floor promotion is API-only and fail-closed before PRE on migration flags', () => {
  assert.match(workflow, /APPROVED_CONFIG_FLOOR_SHA: \$\{\{ inputs\.approved_config_floor_sha \|\| '' \}\}/);
  assert.match(workflow, /approved_config_floor_sha 只允许 api 模式/);
  const guard = workflow.indexOf('test "$RUN_MIG" = false');
  const pre = workflow.indexOf('EVIDENCE_PHASE=PRE_SNAPSHOT');
  assert.ok(guard >= 0 && guard < pre, 'floor migration guard must precede PRE capture');
  const apiDecision = workflow.slice(workflow.indexOf('            api)'), workflow.indexOf('            full|*'));
  assert.match(apiDecision, /APPROVED_CONFIG_FLOOR_SHA/);
  assert.match(apiDecision, /run_mig=false/);
});

test('startup evidence contract captures both Docker streams and preserves fail-closed limits', () => {
  const helper = fs.readFileSync('scripts/ops/production-deployment-evidence.mjs', 'utf8');
  assert.match(helper, /spawnSync\('docker'/);
  assert.match(helper, /stdout/); assert.match(helper, /stderr/);
  assert.match(helper, /MAX_LOG_BYTES/); assert.match(helper, /combinedBytes/);
  assert.match(helper, /DOCKER_LOG_COMMAND_FAILED/);
  assert.match(helper, /stdoutLineCount/); assert.match(helper, /stderrLineCount/);
  assert.match(helper, /sensitiveLineCount/); assert.match(helper, /rawOutput: false/);
  assert.match(helper, /schemaWriteSignalCount/); assert.match(helper, /errorSignalCount/);
});

test('v3 floor re-anchor entrance threads the previous-floor binding and justification checks', () => {
  const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(deploy, /approved_previous_floor_sha:/);
  assert.match(deploy, /APPROVED_PREVIOUS_FLOOR_SHA: \$\{\{ inputs\.approved_previous_floor_sha \}\}/);
  assert.match(deploy, /envs: APPROVED_CONFIG_FLOOR_SHA,APPROVED_PREVIOUS_FLOOR_SHA,/);
  const promote = fs.readFileSync('scripts/ops/promote-production-config-floor.mjs', 'utf8');
  // re-anchor only from a quiescent v3 floor, with a real criticalFiles delta,
  // and with the old floor bound by exact SHA
  assert.match(promote, /!\[2, 3\]\.includes\(installed\.CONTRACT\.version\)/);
  assert.match(promote, /FLOOR_REANCHOR_POLICY_ACTIVE/);
  assert.match(promote, /FLOOR_REANCHOR_SAME_SHA/);
  assert.match(promote, /FLOOR_REANCHOR_WITHOUT_CONTRACT_CHANGE/);
  assert.match(promote, /FLOOR_REANCHOR_PREVIOUS_FLOOR_REQUIRED/);
  assert.match(promote, /FLOOR_REANCHOR_PREVIOUS_FLOOR_MISMATCH/);
  assert.match(promote, /criticalFilesChanged/);
  assert.match(promote, /CONTRACT\.criticalFiles\]/);
});

test('disk report never dies of SIGPIPE under pipefail and stays fail-closed on real docker failures', () => {
  const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
  // the old early-exiting consumer must be gone from the docker images feed
  assert.doesNotMatch(deploy, /docker images --format[^\n]*\| sed -n '1,20p'/);
  assert.match(deploy, /IMAGE_REPORT="\$\(docker images --format/);
  assert.match(deploy, /printf '%s\\n' "\$IMAGE_REPORT" \| sed -n '1,20p'/);
  // real shell regression under the exact script discipline
  const script = (dockerExit, lines) => `set -euo pipefail; docker() { ${dockerExit ? 'return 13' : `printf 'img-%s\\n' $(seq 1 ${lines})`}; }; IMAGE_REPORT="$(docker images --format x)"; printf '%s\\n' "$IMAGE_REPORT" | sed -n '1,20p' > /dev/null; echo SURVIVED`;
  const run = body => execFileSync('bash', ['-c', body], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  // >20 images: the 38217361863-1 shape must not trip the ERR trap
  assert.equal(run(script(false, 31)), 'SURVIVED');
  // <=20 images: unchanged behavior
  assert.equal(run(script(false, 7)), 'SURVIVED');
  // a REAL docker failure stays fatal (fail-closed preserved)
  let failed = false;
  try { execFileSync('bash', ['-c', script(true, 31)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { failed = true; }
  assert.equal(failed, true, 'docker images failure must abort the deploy');
});
