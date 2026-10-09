import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
