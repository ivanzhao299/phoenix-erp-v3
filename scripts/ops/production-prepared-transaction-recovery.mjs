import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CONTRACT, secureJson, verifyContext, migrationScope, git } from './production-config-guard.mjs';
import { atomicState } from './production-atomic-state.mjs';
import { captureRuntime, executionEnv } from './capture-production-runtime.mjs';
import { assertScopeMigrationsReceipted } from './chanjet-admission-schema-receipt.mjs';

const hold = reason => { throw new Error(`PREPARED_RECOVERY=HOLD_${reason}`); };
const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stateDir = CONTRACT.stateDirectory;
const targetRunId = process.env.RECOVERY_TARGET_RUN_ID || '';
const approvedSha = process.env.RECOVERY_APPROVED_SHA || '';
const previousFloorSha = process.env.RECOVERY_PREVIOUS_FLOOR_SHA || '';
const recoveryRunId = process.env.RECOVERY_RUN_ID || '';
const expectedMode = process.env.RECOVERY_MODE || '';

function readOptional(name) {
  const file = path.join(stateDir, name);
  return fs.existsSync(file) ? secureJson(file) : null;
}
function healthy(service) {
  return execFileSync('docker', ['inspect', `phoenix-v3-${service}`, '--format', '{{.State.Health.Status}}'], { env: executionEnv(), encoding: 'utf8' }).trim() === 'healthy';
}
function exact(value, expected) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    if (process.env.RECOVERY_EXECUTE !== 'true' || expectedMode !== 'prepared-no-switch') hold('EXECUTION_NOT_AUTHORIZED');
    if (!/^\d+-\d+$/.test(targetRunId) || !/^[a-f0-9]{40}$/.test(approvedSha) || !/^[a-f0-9]{40}$/.test(previousFloorSha) || !/^\d+-\d+$/.test(recoveryRunId)) hold('INPUT');
    verifyContext(CONTRACT.repository, stateDir);
    const floor = secureJson(path.join(stateDir, 'floor.json'));
    const active = secureJson(path.join(stateDir, 'active.json'));
    const transaction = secureJson(path.join(stateDir, 'transaction.json'));
    const deployRecord = secureJson(path.join(stateDir, `deploy-${targetRunId}.json`));
    const background = secureJson(path.join(stateDir, 'background-control.json'));
    if (floor.version !== 3 || floor.phase !== 'READY' || floor.floorSha !== previousFloorSha || floor.chanjetPolicy !== 'HOLD' || floor.readonlyApproval !== null) hold('FLOOR_BINDING');
    if (active.version !== 3 || active.outcome !== 'SUCCESS' || active.floorSha !== previousFloorSha || active.configSha !== previousFloorSha
      || active.active?.api?.revision !== previousFloorSha || active.active?.web?.revision !== previousFloorSha) hold('ACTIVE_BINDING');
    if (transaction.version !== 3 || transaction.runId !== targetRunId || transaction.phase !== 'IN_PROGRESS' || transaction.target !== approvedSha || transaction.configSha !== approvedSha) hold('TRANSACTION_BINDING');
    if (deployRecord.version !== 3 || deployRecord.outcome !== 'PREPARED' || deployRecord.target !== approvedSha || deployRecord.configSha !== approvedSha || deployRecord.floorSha !== previousFloorSha
      || !exact(deployRecord.switched, { api: false, web: false }) || !exact(deployRecord.active, deployRecord.previous)
      || deployRecord.previous?.api?.revision !== previousFloorSha || deployRecord.previous?.web?.revision !== previousFloorSha
      || deployRecord.candidates?.api?.revision !== approvedSha || deployRecord.candidates?.web?.revision !== approvedSha
      || !Array.isArray(deployRecord.migrationPaths) || deployRecord.migrationPaths.length === 0) hold('DEPLOY_RECORD_BINDING');
    if (background.protocolVersion !== 1 || background.owner !== targetRunId || background.targetSha !== approvedSha || background.phase !== 'FENCED' || background.holdReason !== 'DEPLOY_SESSION_FAILED') hold('BACKGROUND_BINDING');
    if (!healthy('api') || !healthy('web')) hold('UNHEALTHY_RUNTIME');
    const runtime = captureRuntime();
    if (runtime.api.revision !== previousFloorSha || runtime.web.revision !== previousFloorSha) hold('RUNTIME_CHANGED');
    const readiness = execFileSync('curl', ['-fsSL', '--max-time', '20', '-o', '/dev/null', '-w', '%{http_code}', 'http://127.0.0.1:3100/api/readiness'], { encoding: 'utf8' }).trim();
    if (readiness !== '200') hold('READINESS');
    const scope = migrationScope(CONTRACT.repository, previousFloorSha, approvedSha);
    if (!scope.changed.length || !exact(scope.changed, deployRecord.migrationPaths)) hold('MIGRATION_SCOPE');
    assertScopeMigrationsReceipted(CONTRACT.repository, scope);
    const archive = {
      schema: 'phoenix.production-prepared-transaction-recovery/1', recoveryRunId, recoveredAt: new Date().toISOString(), targetRunId, approvedSha, previousFloorSha,
      reason: 'PREPARED_DEPLOY_ABORTED_BEFORE_SWITCH', runtime, readinessHttp: 200,
      archived: [
        { name: 'transaction.json', sha256: sha256(transaction), value: transaction },
        { name: 'background-control.json', sha256: sha256(background), value: background },
        { name: `deploy-${targetRunId}.json`, sha256: sha256(deployRecord), value: deployRecord },
      ],
    };
    atomicState(path.join(stateDir, `recovery-prepared-${targetRunId}.json`), archive);
    fs.unlinkSync(path.join(stateDir, 'transaction.json'));
    fs.unlinkSync(path.join(stateDir, 'background-control.json'));
    atomicState(path.join(stateDir, `recovery-prepared-${targetRunId}-complete.json`), { ...archive, completedAt: new Date().toISOString(), cleared: ['transaction.json', 'background-control.json'] });
    console.log(`PREPARED_RECOVERY=PASS;RUN=${recoveryRunId};TARGET=${approvedSha}`);
  } catch (error) {
    const message = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 240);
    console.error(message.startsWith('PREPARED_RECOVERY=') ? message : `PREPARED_RECOVERY=HOLD_VALIDATION:${message}`);
    process.exitCode = 1;
  }
}
