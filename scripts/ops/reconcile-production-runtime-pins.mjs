import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  CONTRACT,
  secureJson,
  verifyContext,
  guardProduction,
  rollbackEligibility,
} from './production-config-guard.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';

const hold = reason => { throw new Error(`RUNTIME_PIN_RECONCILIATION=HOLD_${reason}`); };
const root = fs.realpathSync(process.cwd());
const stateDirectory = CONTRACT.stateDirectory;
const targetSha = process.env.TARGET_SHA || '';
const expectedFloorSha = process.env.EXPECTED_FLOOR_SHA || '';
const runId = process.env.REPAIR_RUN_ID || '';
const git = args => execFileSync('git', ['-c', `safe.directory=${root}`, '-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    for (const name of ['floor.json', 'active.json', 'mutation.lock']) {
      const stat = fs.lstatSync(path.join(stateDirectory, name));
      console.error(`RUNTIME_PIN_STATE_META=${name}:uid=${stat.uid}:mode=${(stat.mode & 0o7777).toString(8)}:nlink=${stat.nlink}:type=${stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other'}`);
    }
    console.error('RUNTIME_PIN_STAGE=VERIFY_CONTEXT_START');
    verifyContext(root, stateDirectory);
    console.error('RUNTIME_PIN_STAGE=VERIFY_CONTEXT_DONE');
    if (!/^[a-f0-9]{40}$/.test(targetSha) || !/^\d+$/.test(runId)) hold('INPUT');
    if (targetSha !== git(['rev-parse', 'HEAD'])) hold('CHECKOUT');
    if (targetSha !== git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s/)[0]) hold('REMOTE_MAIN');
    console.error('RUNTIME_PIN_STAGE=READ_STATE_START');
    const floor = secureJson(path.join(stateDirectory, 'floor.json'));
    const active = secureJson(path.join(stateDirectory, 'active.json'));
    console.error('RUNTIME_PIN_STAGE=READ_STATE_DONE');
    if (floor.version !== 3 || floor.phase !== 'READY' || floor.floorSha !== expectedFloorSha || floor.chanjetPolicy !== 'HOLD') hold('FLOOR');
    if (active.version !== 3 || active.outcome !== 'SUCCESS' || active.floorSha !== floor.floorSha) hold('ACTIVE_STATE');
    for (const name of ['transaction.json', 'policy-transition.json']) {
      if (fs.existsSync(path.join(stateDirectory, name))) hold('UNFINISHED_TRANSACTION');
    }
    console.error('RUNTIME_PIN_STAGE=CAPTURE_RUNTIME_START');
    const actual = captureRuntime();
    console.error('RUNTIME_PIN_STAGE=CAPTURE_RUNTIME_DONE');
    const inspectHealth = service => execFileSync('docker', ['inspect', `phoenix-v3-${service}`, '--format', '{{.State.Health.Status}}'], { env: executionEnv(), encoding: 'utf8' }).trim();
    if (inspectHealth('api') !== 'healthy' || inspectHealth('web') !== 'healthy') hold('UNHEALTHY_RUNTIME');
    if (actual.api.revision !== floor.floorSha || actual.web.revision !== active.active.web.revision) hold('REVISION_BINDING');
    if (rollbackEligibility(root, floor, actual.api).allowed !== true) hold('API_FLOOR_ELIGIBILITY');
    const oldPins = active.active;
    if (oldPins.api?.revision !== actual.api.revision || oldPins.web?.revision !== actual.web.revision) hold('ACTIVE_REVISION_DRIFT');
    if (oldPins.api?.imageId === actual.api.imageId && oldPins.web?.imageId === actual.web.imageId) hold('NOOP');
    const next = {
      ...active,
      active: actual,
      runtimePinReconciliation: {
        schema: 'phoenix.production-runtime-pin-reconciliation/1',
        runId,
        targetSha,
        previous: oldPins,
        reconciled: actual,
        reason: 'RECOVERY_IMAGE_DIGEST_DRIFT_SAME_REVISION',
        completedAt: new Date().toISOString(),
      },
    };
    console.error('RUNTIME_PIN_STAGE=ATOMIC_WRITE_START');
    atomicState(path.join(stateDirectory, 'active.json'), next);
    console.error('RUNTIME_PIN_STAGE=ATOMIC_WRITE_DONE');
    console.error('RUNTIME_PIN_STAGE=POST_GUARD_START');
    guardProduction(root, stateDirectory, actual);
    console.error('RUNTIME_PIN_STAGE=POST_GUARD_DONE');
    console.log('RUNTIME_PIN_RECONCILIATION=PASS');
  } catch (error) {
    const message = String(error?.message || '').replace(/\s+/g, ' ').slice(0, 160);
    console.error(message.startsWith('RUNTIME_PIN_RECONCILIATION=') ? message : `RUNTIME_PIN_RECONCILIATION=HOLD_VALIDATION:${message || 'UNKNOWN'}`);
    process.exitCode = 1;
  }
}
