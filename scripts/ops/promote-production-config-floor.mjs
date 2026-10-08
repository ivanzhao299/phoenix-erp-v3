import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { CONTRACT, git, requireCleanMain, assertFloorMonotonic, migrationScope, assertFloor, secureJson } from './production-config-guard.mjs';
import { atomicState } from './production-deployment-state.mjs';
import { captureRuntime } from './capture-production-runtime.mjs';
import { readonlyEnvironment } from './chanjet-readonly-policy.mjs';
export function promotionPlan({ previousFloor, previousActive, actual, target, approvedSha, runId, scope, now = Date.now() }) {
  if (CONTRACT.version !== 3 || previousFloor.version !== 2 || previousActive.version !== 2 || previousFloor.phase !== 'READY'
    || !/^[a-f0-9]{40}$/.test(target || '') || approvedSha !== target || !/^\d+-\d+$/.test(runId || '')
    || previousFloor.floorSha !== previousActive.floorSha || previousActive.outcome !== 'SUCCESS'
    || JSON.stringify(previousActive.active) !== JSON.stringify(actual)
    || scope.baseline !== actual.api.revision || scope.target !== target || scope.changed.length
    || previousFloor.operationalTuple.CHANJET_READONLY_SYNC_ENABLED !== 'false'
    || previousFloor.operationalTuple.CHANJET_ERP_INBOUND_SYNC_ENABLED !== 'false') throw new Error('CONFIG_HOLD=FLOOR_PROMOTION_APPROVAL');
  const floor = { ...previousFloor, version: 3, floorSha: target, chanjetPolicy: 'HOLD', readonlyApproval: null };
  const flags = { ...readonlyEnvironment(floor), CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false' };
  return { floor, active: { ...previousActive, version: 3, floorSha: target, configSha: target, outcome: 'CONFIG_READY_HOLD' },
    marker: { version: 3, operation: 'CODE_HOLD', phase: 'IN_PROGRESS', runId, target,
      previousFloorSha: previousFloor.floorSha, previous: actual, previousEnv: flags, nextEnv: flags,
      startedAt: new Date(now).toISOString(), expiresAt: new Date(now + CONTRACT.maximumTransitionMs).toISOString() } };
}
export async function promoteFloor(root) {
  const target = process.env.TARGET_SHA;
  if (process.env.APPROVED_CONFIG_FLOOR_SHA !== target || process.env.DEPLOY_MODE !== 'api'
    || process.env.BUILD_API !== 'true' || process.env.BUILD_WEB !== 'false'
    || process.env.ROTATE_CHANJET_CREDENTIALS === 'true' || process.env.ONE_TIME_CONFIG_FLOOR_TRANSITION === 'true') throw new Error('CONFIG_HOLD=FLOOR_PROMOTION_SCOPE');
  // Installed v2 validator remains the authority for the pre-promotion state.
  const installed = await import(pathToFileURL(path.join(root, 'scripts/ops/production-config-guard.mjs')).href);
  if (installed.CONTRACT.version !== 2) throw new Error('CONFIG_HOLD=V2_PROMOTION_REQUIRED');
  for (const key of ['repository', 'controlRoot', 'stateDirectory', 'archiveDirectory', 'executionUid', 'controlMounts']) {
    if (JSON.stringify(installed.CONTRACT[key]) !== JSON.stringify(CONTRACT[key])) throw new Error('CONFIG_HOLD=PROMOTION_CONTEXT_CHANGE');
  }
  const directory = CONTRACT.stateDirectory;
  const actual = captureRuntime();
  installed.guardProduction(root, directory, actual); requireCleanMain(root);
  for (const name of ['transaction.json', 'policy-transition.json']) if (fs.existsSync(path.join(directory, name))) throw new Error('CONFIG_HOLD=UNFINISHED_PROMOTION');
  if (git(root, ['rev-parse', 'origin/main']) !== target || git(root, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0] !== target) throw new Error('CONFIG_HOLD=LATEST_MAIN_CHANGED');
  git(root, ['merge-base', '--is-ancestor', git(root, ['rev-parse', 'HEAD']), target]);
  // Every executed staged helper must be identical to the exact approved merged tree.
  const base = path.dirname(new URL(import.meta.url).pathname);
  for (const file of ['production-config-contract.json', 'production-config-guard.mjs', 'production-deployment-state.mjs', 'production-trusted-paths.mjs', 'capture-production-runtime.mjs', 'update-managed-chanjet-env.mjs', 'chanjet-readonly-policy.mjs', 'promote-production-config-floor.mjs']) {
    if (!fs.readFileSync(path.join(base, file)).equals(Buffer.from(git(root, ['show', `${target}:scripts/ops/${file}`]) + '\n'))) throw new Error('CONFIG_HOLD=STAGED_HELPER_MISMATCH');
  }
  const previousFloor = installed.secureJson(path.join(directory, 'floor.json'));
  const previousActive = installed.secureJson(path.join(directory, 'active.json'));
  assertFloorMonotonic(root, previousFloor.floorSha, target);
  const scope = migrationScope(root, actual.api.revision, target);
  const plan = promotionPlan({ previousFloor, previousActive, actual, target, approvedSha: process.env.APPROVED_CONFIG_FLOOR_SHA, runId: process.env.DEPLOY_RUN_ID, scope });
  assertFloor(root, plan.floor, target, { targetTree: true });
  const record = path.join(directory, `floor-promotion-${process.env.DEPLOY_RUN_ID}.json`);
  if (fs.existsSync(record)) throw new Error('CONFIG_HOLD=PROMOTION_RUN_REUSED');
  const envHash = createHash('sha256').update(fs.readFileSync(path.join(root, '.env'))).digest('hex');
  atomicState(record, { version: 3, previousFloor, previousActive, approvedSha: target, envSha256: envHash, scope, marker: plan.marker });
  // Marker precedes all new state. Any interruption blocks subsequent callers.
  atomicState(path.join(directory, 'policy-transition.json'), plan.marker);
  atomicState(path.join(directory, 'floor.json'), plan.floor);
  atomicState(path.join(directory, 'active.json'), plan.active);
  console.log('CONFIG_FLOOR_PROMOTION=PREPARED_HOLD');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await promoteFloor(fs.realpathSync(process.cwd())); }
  catch { console.error('CONFIG_FLOOR_PROMOTION=HOLD'); process.exitCode = 1; }
}
