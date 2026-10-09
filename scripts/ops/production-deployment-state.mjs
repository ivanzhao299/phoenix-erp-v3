import { validatePolicyTransition } from './chanjet-readonly-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CONTRACT, secureJson, assertStateVersion, verifyContext, guardProduction, migrationScope, git, rollbackEligibility, assertTransactionOwnership } from './production-config-guard.mjs';
import { inspectTrustedDirectory, assertSameDirectory, assertRegularFile, assertContained, readPinnedFile } from './production-trusted-paths.mjs';
import { captureRuntime, executionEnv, IMAGE_ID, REVISION } from './capture-production-runtime.mjs';
export function atomicState(file, value, dependencies = {}) {
  const io = dependencies.fs || fs;
  assertContained(file, (dependencies.contract || CONTRACT).stateDirectory);
  const inspect = dependencies.inspectDirectory || (directory => inspectTrustedDirectory(directory, CONTRACT));
  const directory = path.dirname(file); const before = inspect(directory);
  const original = io.existsSync(file) ? io.lstatSync(file) : undefined;
  if (original) assertRegularFile(original);
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd; let temporaryIdentity;
  try {
    fd = io.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    temporaryIdentity = io.fstatSync(fd); assertRegularFile(temporaryIdentity);
    io.writeFileSync(fd, JSON.stringify(value) + '\n'); io.fsyncSync(fd);
    const written = io.fstatSync(fd);
    io.closeSync(fd); fd = undefined;
    assertSameDirectory(before, inspect(directory));
    const named = io.lstatSync(temporary); assertRegularFile(named);
    if (named.ino !== written.ino || named.dev !== written.dev || named.size !== written.size) throw new Error('STATE_HOLD=TEMPORARY_FILE_CHANGED');
    const current = io.existsSync(file) ? io.lstatSync(file) : undefined;
    if (current) assertRegularFile(current);
    if (JSON.stringify(current && [current.dev,current.ino,current.size,current.mtimeMs]) !== JSON.stringify(original && [original.dev,original.ino,original.size,original.mtimeMs])) throw new Error('STATE_HOLD=DESTINATION_CHANGED');
    io.renameSync(temporary, file);
    const parent = io.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try { io.fsyncSync(parent); } finally { io.closeSync(parent); }
    assertSameDirectory(before, inspect(directory));
  } finally {
    if (fd !== undefined) io.closeSync(fd);
    if (io.existsSync(temporary)) { const remaining = io.lstatSync(temporary); assertRegularFile(remaining); if (!temporaryIdentity || remaining.dev !== temporaryIdentity.dev || remaining.ino !== temporaryIdentity.ino) throw new Error('STATE_HOLD=FOREIGN_TEMPORARY_RETAINED'); io.unlinkSync(temporary); }
  }
}
export function beginState({ previous, configSha, target, scope, floor, evidence }) {
  if (configSha !== target || !REVISION.test(configSha) || !REVISION.test(target) || scope.baseline !== previous.api.revision || scope.target !== target) throw new Error('STATE_HOLD=BASELINE');
  return { expiresAt: new Date(Date.now() + CONTRACT.maximumTransitionMs).toISOString(), version: CONTRACT.version, configSha, target, floorSha: floor.floorSha, previous, active: previous, candidates: {}, switched: { api: false, web: false }, outcome: 'PREPARED', migrationBaseline: previous.api.revision, migrationPaths: scope.changed, protectedImages: [previous.api.imageId, previous.web.imageId], evidence };
}
export function rollbackPlan(state, eligible) {
  // DB/schema-changing releases use the separate controlled migration authority.
  if (state.migrationPaths.length) throw new Error('ROLLBACK_HOLD=SCHEMA_COMPATIBILITY');
  const services = [];
  for (const service of ['api', 'web']) {
    if (!state.switched[service]) continue;
    if (service === 'api' && !eligible.allowed) throw new Error(`ROLLBACK_API_IMAGE_ALLOWED=NO:${eligible.reason}`);
    services.push({ service, ...state.previous[service] });
  }
  return services;
}
export function requireFirstTransition({ legacyApi, floor, proof, composeBytes, mode, buildApi, buildWeb, authorized, rotateCredentials }) {
  if (!legacyApi) return;
  if (!authorized || mode !== 'full' || !buildApi || !buildWeb || rotateCredentials || !proof
    || proof.version !== CONTRACT.version || proof.executionUid !== CONTRACT.executionUid || proof.archiveDirectory !== CONTRACT.archiveDirectory
    || proof.target !== floor.floorSha || proof.compositionEquivalent !== true || proof.archiveVerified !== true
    || proof.composeDuringIntermediateStateAllowed !== false || !/^[a-f0-9]{64}$/.test(proof.backupSha256 || '')
    || proof.composeSha256 !== createHash('sha256').update(composeBytes).digest('hex')) throw new Error('STATE_HOLD=ONE_TIME_TRANSITION_AUTHORIZATION_AND_C3_PROOF_REQUIRED');
}
export function transactionFile(directory = CONTRACT.stateDirectory, runId = process.env.DEPLOY_RUN_ID) {
  if (!/^\d+(?:-\d+)?$/.test(runId || '')) throw new Error('STATE_HOLD=RUN_ID');
  return path.join(directory, `deploy-${runId}.json`);
}
export function inspectCandidate(ref, target, run = args => execFileSync('docker', args, { env: executionEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()) {
  const imageId = run(['image', 'inspect', ref, '--format', '{{.Id}}']);
  const revision = run(['image', 'inspect', imageId, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
  if (!IMAGE_ID.test(imageId) || !REVISION.test(revision) || revision !== target) throw new Error('STATE_HOLD=CANDIDATE_REVISION');
  return { imageId, revision };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [operation, input, value] = process.argv.slice(2); const directory = CONTRACT.stateDirectory;
    const root = fs.realpathSync(process.cwd()); verifyContext(root, directory);
    const file = transactionFile(directory); let state;
    if (operation === 'begin') {
      if (fs.existsSync(file) || fs.existsSync(path.join(directory, 'transaction.json'))) throw new Error('STATE_HOLD=RUN_ALREADY_EXISTS_OR_UNFINISHED');
      const previous = secureJson(input); const actual = captureRuntime();
      if (JSON.stringify(previous) !== JSON.stringify(actual)) throw new Error('STATE_HOLD=RUNTIME_CHANGED');
      const active = assertStateVersion(secureJson(path.join(directory, 'active.json')));
      if (JSON.stringify(active.active) !== JSON.stringify(actual)) throw new Error('STATE_HOLD=ACTIVE_PINS_DRIFT');
      const floor = guardProduction(root, directory, previous);
      const target = process.env.TARGET_SHA;
      const legacyApi = !rollbackEligibility(root, floor, previous.api).allowed;
      const policyPath = path.join(directory, 'policy-transition.json');
      const promotion = fs.existsSync(policyPath) ? secureJson(policyPath) : undefined;
      if (promotion) {
        validatePolicyTransition(promotion, { runId: process.env.DEPLOY_RUN_ID, target, actual });
        if (promotion.operation !== 'CODE_HOLD' || process.env.DEPLOY_MODE !== 'api' || process.env.BUILD_API !== 'true' || process.env.BUILD_WEB !== 'false' || process.env.ROTATE_CHANJET_CREDENTIALS === 'true') throw new Error('STATE_HOLD=PROMOTION_SCOPE');
      }
      const proof = legacyApi && !promotion ? assertStateVersion(secureJson(path.join(directory, 'transition-proof.json'))) : undefined;
      if (proof) {
        assertContained(proof.archiveBackup, CONTRACT.archiveDirectory);
        if (createHash('sha256').update(readPinnedFile(proof.archiveBackup, { contract: CONTRACT })).digest('hex') !== proof.backupSha256) throw new Error('STATE_HOLD=C3_ARCHIVE_CHANGED');
      }
      requireFirstTransition({ legacyApi: legacyApi && !promotion, floor, proof, composeBytes: fs.readFileSync(path.join(root, 'docker-compose.yml')),
        mode: process.env.DEPLOY_MODE, buildApi: process.env.BUILD_API === 'true', buildWeb: process.env.BUILD_WEB === 'true',
        authorized: process.env.ONE_TIME_CONFIG_FLOOR_TRANSITION === 'true', rotateCredentials: process.env.ROTATE_CHANJET_CREDENTIALS === 'true' });
      const scope = migrationScope(root, previous.api.revision, target);
      const evidence = process.env.DEPLOYMENT_EVIDENCE_PRE && process.env.DEPLOYMENT_EVIDENCE_POST && process.env.DEPLOYMENT_EVIDENCE_LOG
        ? { pre: process.env.DEPLOYMENT_EVIDENCE_PRE, post: process.env.DEPLOYMENT_EVIDENCE_POST, log: process.env.DEPLOYMENT_EVIDENCE_LOG } : undefined;
      if (!evidence) throw new Error('STATE_HOLD=DEPLOYMENT_EVIDENCE_BINDING');
      state = beginState({ previous, configSha: git(root, ['rev-parse', 'HEAD']), target, scope, floor, evidence });
      atomicState(file, state);
      atomicState(path.join(directory, 'transaction.json'), { version: CONTRACT.version, runId: process.env.DEPLOY_RUN_ID, phase: 'IN_PROGRESS', target, configSha: state.configSha });
      if (scope.changed.length) throw new Error('MIGRATION_SCOPE=HOLD:CONTROLLED_SCHEMA_RELEASE_REQUIRED');
      console.log(`PREV_API_REVISION=${previous.api.revision}\nPREV_WEB_REVISION=${previous.web.revision}\nRUN_MIG=false`);
    } else {
      if (!assertTransactionOwnership(directory, process.env.DEPLOY_RUN_ID)) throw new Error('STATE_HOLD=TRANSACTION_MARKER_REQUIRED');
      state = assertStateVersion(secureJson(file)); const floor = guardProduction(root, directory, state.active);
      if (operation === 'candidate') {
        if (!['api', 'web'].includes(input) || value !== `ghcr.io/ivanzhao299/phoenix-erp-v3/${input}:sha-${state.target}`) throw new Error('STATE_HOLD=CANDIDATE_REF');
        state.candidates[input] = inspectCandidate(value, state.target);
        const promotionPath = path.join(directory, 'policy-transition.json');
        if (fs.existsSync(promotionPath)) {
          if (input !== 'api') throw new Error('STATE_HOLD=PROMOTION_API_ONLY');
          const promotion = secureJson(promotionPath); promotion.candidateApi = state.candidates.api; atomicState(promotionPath, promotion);
        }
        state.protectedImages = [...new Set([...state.protectedImages, state.candidates[input].imageId])];
      } else if (operation === 'switch') {
        if (!['api', 'web'].includes(input) || !state.candidates[input]) throw new Error('STATE_HOLD=NO_CANDIDATE');
        state.switched[input] = true; state.active[input] = state.candidates[input]; state.outcome = 'SWITCHING';
      } else if (operation === 'rollback-plan') {
        console.log(JSON.stringify(rollbackPlan(state, rollbackEligibility(root, floor, state.previous.api)))); process.exit(0);
      } else if (operation === 'rollback-pin') {
        if (!['api', 'web'].includes(input)) throw new Error('STATE_HOLD=SERVICE');
        rollbackPlan(state, rollbackEligibility(root, floor, state.previous.api));
        state.active[input] = state.previous[input]; state.outcome = 'ROLLING_BACK';
      } else if (operation === 'complete' || operation === 'rolled-back') {
        if (operation === 'complete' && (!state.evidence?.pre || !state.evidence?.post || !state.evidence?.log)) throw new Error('STATE_HOLD=DEPLOYMENT_EVIDENCE_REQUIRED');
        const actual = captureRuntime();
        if (JSON.stringify(actual) !== JSON.stringify(state.active)) throw new Error('STATE_HOLD=POST_SWITCH_IDENTITY');
        if (operation === 'complete') {
          const evidence = await import('./production-deployment-evidence.mjs');
          const post = JSON.parse(fs.readFileSync(state.evidence.post, 'utf8'));
          evidence.verifyLiveSnapshot(post, { runId: process.env.DEPLOY_RUN_ID, targetSha: state.target });
        }
        state.outcome = operation === 'complete' ? 'SUCCESS' : 'ROLLED_BACK';
        atomicState(path.join(directory, 'active.json'), { version: CONTRACT.version, configSha: state.configSha, floorSha: state.floorSha, active: state.active, protectedImages: state.protectedImages, outcome: state.outcome, migrationBaseline: state.active.api.revision });
      } else throw new Error('STATE_HOLD=OPERATION');
      atomicState(file, state);
      if (state.outcome === 'SUCCESS' && fs.existsSync(path.join(directory, 'policy-transition.json'))) {
        const promotion = secureJson(path.join(directory, 'policy-transition.json'));
        if (promotion.operation !== 'CODE_HOLD' || promotion.runId !== process.env.DEPLOY_RUN_ID) throw new Error('STATE_HOLD=PROMOTION_COMPLETION');
        fs.unlinkSync(path.join(directory, 'policy-transition.json'));
      }
      if (['SUCCESS', 'ROLLED_BACK'].includes(state.outcome)) fs.unlinkSync(path.join(directory, 'transaction.json'));
      console.log(`DEPLOYMENT_STATE=${state.outcome}`);
    }
  } catch (error) { console.error(/^(STATE_HOLD|CONFIG_HOLD|MIGRATION_SCOPE|ROLLBACK_)/.test(error.message) ? error.message : 'STATE_HOLD=VALIDATION_FAILED'); process.exitCode = 1; }
}
