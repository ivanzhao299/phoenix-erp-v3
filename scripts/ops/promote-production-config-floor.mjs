import { assertAdmissionSchemaApplied } from './chanjet-admission-schema-receipt.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { CONTRACT, git, requireCleanMain, assertFloorMonotonic, migrationScope, assertFloor, secureJson, verifyContext } from './production-config-guard.mjs';
import { assertModernReleaseAdmission } from './production-maintenance-admission.mjs';
import { assertLegacyMaintenanceStateCore } from './production-deployment-state.mjs';
import { same, hold } from './production-maintenance-receipts.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { captureRuntime } from './capture-production-runtime.mjs';
import { assertBootstrapSchemaEvidence, readBootstrapSchemaEvidence } from './api-bootstrap-schema-preflight.mjs';
import { readonlyEnvironment } from './chanjet-readonly-policy.mjs';
export function promotionPlan({ previousFloor, previousActive, actual, target, approvedSha, runId, scope, criticalFilesChanged = false, expectedPreviousFloorSha = '', schemaApplied = false, now = Date.now() }) {
  if (CONTRACT.version !== 3 || ![2, 3].includes(previousFloor.version) || previousActive.version !== previousFloor.version || previousFloor.phase !== 'READY'
    || !/^[a-f0-9]{40}$/.test(target || '') || approvedSha !== target || !/^\d+-\d+$/.test(runId || '')
    || previousFloor.floorSha !== previousActive.floorSha || previousActive.outcome !== 'SUCCESS'
    || JSON.stringify(previousActive.active) !== JSON.stringify(actual)
    || scope.baseline !== actual.api.revision || scope.target !== target || (scope.changed.length && !schemaApplied)
    || previousFloor.operationalTuple.CHANJET_READONLY_SYNC_ENABLED !== 'false'
    || previousFloor.operationalTuple.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false') throw new Error('CONFIG_HOLD=FLOOR_PROMOTION_APPROVAL');
  if (previousFloor.version === 3) {
    // v3 → v3' re-anchor: the ONLY legitimate reason to move an established v3
    // floor is a reviewed criticalFiles change on merged main (otherwise a
    // normal deploy suffices and the floor must not move). The old floor must
    // be quiescent (HOLD, no approval) and is bound explicitly by SHA.
    if (previousFloor.chanjetPolicy !== 'HOLD' || previousFloor.readonlyApproval !== null) throw new Error('CONFIG_HOLD=FLOOR_REANCHOR_POLICY_ACTIVE');
    if (previousFloor.floorSha === target) throw new Error('CONFIG_HOLD=FLOOR_REANCHOR_SAME_SHA');
    if (criticalFilesChanged !== true) throw new Error('CONFIG_HOLD=FLOOR_REANCHOR_WITHOUT_CONTRACT_CHANGE');
    if (!/^[a-f0-9]{40}$/.test(expectedPreviousFloorSha || '')) throw new Error('CONFIG_HOLD=FLOOR_REANCHOR_PREVIOUS_FLOOR_REQUIRED');
    if (expectedPreviousFloorSha !== previousFloor.floorSha) throw new Error('CONFIG_HOLD=FLOOR_REANCHOR_PREVIOUS_FLOOR_MISMATCH');
  }
  const floor = { ...previousFloor, version: 3, floorSha: target, chanjetPolicy: 'HOLD', readonlyApproval: null };
  const flags = { ...readonlyEnvironment(floor), CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' };
  return { floor, active: { ...previousActive, version: 3, floorSha: target, configSha: target, outcome: 'CONFIG_READY_HOLD' },
    marker: { version: 3, operation: 'CODE_HOLD', phase: 'IN_PROGRESS', runId, target,
      previousFloorSha: previousFloor.floorSha, previous: actual, previousEnv: flags, nextEnv: flags,
      startedAt: new Date(now).toISOString(), expiresAt: new Date(now + CONTRACT.maximumTransitionMs).toISOString() } };
}
function present(file) { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function promoteFloorCore(root, env, dependencies, admit, legacy) {
  await admit();
  const target = env.TARGET_SHA;
  const directory = dependencies.directory || CONTRACT.stateDirectory;
  const getGit = dependencies.git || git, readFile = dependencies.readFile || fs.readFileSync;
  const write = dependencies.atomicState || atomicState;
  if (env.APPROVED_CONFIG_FLOOR_SHA !== target || env.DEPLOY_MODE !== 'api'
    || env.BUILD_API !== 'true' || env.BUILD_WEB !== 'false'
    || env.ROTATE_CHANJET_CREDENTIALS === 'true' || env.ONE_TIME_CONFIG_FLOOR_TRANSITION === 'true') throw new Error('CONFIG_HOLD=FLOOR_PROMOTION_SCOPE');
  // Installed v2 validator remains the authority for the pre-promotion state.
  const installed = await (dependencies.loadInstalledGuard || (async () => import(pathToFileURL(path.join(root, 'scripts/ops/production-config-guard.mjs')).href)))();
  // v2 → v3 is the one-time legacy promotion; v3 → v3' is the re-anchor path
  // for reviewed criticalFiles changes on merged main. Anything else is a HOLD.
  if (![2, 3].includes(installed.CONTRACT.version)) throw new Error('CONFIG_HOLD=V2_PROMOTION_REQUIRED');
  for (const key of ['repository', 'controlRoot', 'stateDirectory', 'archiveDirectory', 'executionUid', 'controlMounts']) {
    if (JSON.stringify(installed.CONTRACT[key]) !== JSON.stringify(CONTRACT[key])) throw new Error('CONFIG_HOLD=PROMOTION_CONTEXT_CHANGE');
  }
  const actual = (dependencies.captureRuntime || captureRuntime)();
  installed.guardProduction(root, directory, actual); (dependencies.requireCleanMain || requireCleanMain)(root);
  for (const name of ['transaction.json', 'policy-transition.json']) if (present(path.join(directory, name))) throw new Error('CONFIG_HOLD=UNFINISHED_PROMOTION');
  if (getGit(root, ['rev-parse', 'origin/main']) !== target || getGit(root, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0] !== target) throw new Error('CONFIG_HOLD=LATEST_MAIN_CHANGED');
  getGit(root, ['merge-base', '--is-ancestor', getGit(root, ['rev-parse', 'HEAD']), target]);
  // Every executed staged helper must be identical to the exact approved merged tree.
  const base = path.dirname(new URL(import.meta.url).pathname);
  for (const file of ['production-config-contract.json', 'production-config-guard.mjs', 'production-deployment-state.mjs', 'production-atomic-state.mjs', 'production-deployment-evidence.mjs', 'production-trusted-paths.mjs', 'capture-production-runtime.mjs', 'update-managed-chanjet-env.mjs', 'chanjet-readonly-policy.mjs', 'api-bootstrap-schema-preflight.mjs', 'api-bootstrap-schema-contract.json', 'promote-production-config-floor.mjs', 'chanjet-admission-schema-receipt.mjs', 'production-maintenance-admission.mjs', 'production-maintenance-receipts.mjs', 'production-maintenance-transition.mjs', 'background-control-legacy-transition.mjs', 'background-control-manifest.mjs']) {
    const source = file === 'api-bootstrap-schema-contract.json' ? `apps/api/src/common/database/${file}` : `scripts/ops/${file}`;
    if (!readFile(path.join(base, file)).equals(Buffer.from(getGit(root, ['show', `${target}:${source}`]) + '\n'))) throw new Error('CONFIG_HOLD=STAGED_HELPER_MISMATCH');
  }
  const previousFloor = installed.secureJson(path.join(directory, 'floor.json'));
  const previousActive = installed.secureJson(path.join(directory, 'active.json'));
  (dependencies.assertFloorMonotonic || assertFloorMonotonic)(root, previousFloor.floorSha, target);
  if (legacy && (previousFloor.version !== 3 || previousFloor.floorSha !== legacy.context.previousFloorSha
    || !same(actual, Object.fromEntries(['api', 'web'].map(service => [service, { imageId: legacy.context.preSnapshot[service].imageId, revision: legacy.context.preSnapshot[service].revision }]))))) hold('LEGACY_PROMOTION_PREVIOUS_PINS');
  const scope = (dependencies.migrationScope || migrationScope)(root, actual.api.revision, target);
  if (legacy && (scope.changed.length !== 0 || env.RUN_MIG !== 'false')) hold('LEGACY_MIGRATION_PATH_CHANGED');
  // Re-anchor justification: the approved target must actually change at least
  // one critical file relative to the current floor (a no-op re-anchor would
  // silently re-bless an unchanged contract). Empty diff → dedicated HOLD.
  const criticalFilesChanged = getGit(root, ['diff', '--name-only', previousFloor.floorSha, target, '--', ...CONTRACT.criticalFiles]).split('\n').filter(Boolean).length > 0;
  const schemaApplied = (dependencies.assertAdmissionSchemaApplied || assertAdmissionSchemaApplied)(root, scope);
  const plan = promotionPlan({ schemaApplied, previousFloor, previousActive, actual, target, approvedSha: env.APPROVED_CONFIG_FLOOR_SHA, runId: env.DEPLOY_RUN_ID, scope, criticalFilesChanged, expectedPreviousFloorSha: env.APPROVED_PREVIOUS_FLOOR_SHA || '', now: (dependencies.now || Date.now)() });
  (dependencies.assertFloor || assertFloor)(root, plan.floor, target, { targetTree: true });
  const record = path.join(directory, `floor-promotion-${env.DEPLOY_RUN_ID}.json`);
  if (present(record)) throw new Error('CONFIG_HOLD=PROMOTION_RUN_REUSED');
  await admit();
  // No floor/state mutation before the approved target's real production schema passes.
  const bootstrapContract = JSON.parse(readFile(path.join(base, 'api-bootstrap-schema-contract.json'), 'utf8'));
  let bootstrapSchema;
  try { bootstrapSchema = assertBootstrapSchemaEvidence(bootstrapContract, (dependencies.readBootstrapSchemaEvidence || readBootstrapSchemaEvidence)(bootstrapContract)); }
  catch (error) {
    await admit();
    write(path.join(directory, `bootstrap-schema-hold-${env.DEPLOY_RUN_ID}.json`), { version: 3, target, outcome: 'HOLD', code: 'BOOTSTRAP_SCHEMA_GAP', evidence: error.evidence || null });
    throw error;
  }
  const envHash = createHash('sha256').update(readFile(path.join(root, '.env'))).digest('hex');
  await admit();
  if (getGit(root, ['rev-parse', 'origin/main']) !== target || getGit(root, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0] !== target) throw new Error('CONFIG_HOLD=LATEST_MAIN_CHANGED');
  write(record, { version: 3, previousFloor, previousActive, approvedSha: target, envSha256: envHash, scope, bootstrapSchema, marker: plan.marker });
  // Marker precedes all new state. Any interruption blocks subsequent callers.
  write(path.join(directory, 'policy-transition.json'), plan.marker);
  write(path.join(directory, 'floor.json'), plan.floor);
  write(path.join(directory, 'active.json'), plan.active);
  return { floor: plan.floor, active: plan.active, marker: plan.marker, record };
}
export async function promoteFloor(root, dependencies = {}) {
  const admission = dependencies.maintenanceAdmission || assertModernReleaseAdmission;
  const admit = () => admission({ directory: CONTRACT.stateDirectory }, { guard: () => verifyContext(root, CONTRACT.stateDirectory) });
  const result = await promoteFloorCore(root, process.env, dependencies, admit);
  console.log('CONFIG_FLOOR_PROMOTION=PREPARED_HOLD'); return result;
}
export async function promoteLegacyMaintenanceFloor(request, dependencies = {}) {
  const admitted = await assertLegacyMaintenanceStateCore(request, 'PREPARE_PROMOTION', dependencies);
  const env = { TARGET_SHA: admitted.context.targetSha, APPROVED_CONFIG_FLOOR_SHA: admitted.context.targetSha,
    APPROVED_PREVIOUS_FLOOR_SHA: admitted.context.previousFloorSha, DEPLOY_RUN_ID: admitted.context.owner,
    DEPLOY_MODE: 'api', BUILD_API: 'true', BUILD_WEB: 'false', RUN_MIG: 'false',
    ROTATE_CHANJET_CREDENTIALS: 'false', ONE_TIME_CONFIG_FLOOR_TRANSITION: 'false' };
  const admit = () => assertLegacyMaintenanceStateCore(request, 'PREPARE_PROMOTION', dependencies);
  return promoteFloorCore(admitted.root, env, dependencies, admit, admitted);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await promoteFloor(fs.realpathSync(process.cwd())); }
  catch { console.error('CONFIG_FLOOR_PROMOTION=HOLD'); process.exitCode = 1; }
}
