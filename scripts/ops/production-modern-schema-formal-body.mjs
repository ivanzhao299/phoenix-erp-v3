/** The native supervisor serves these operations to its one original Bash
 * child after schema receipts. This module has no CLI or authority environment. */
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {CONTRACT, verifyContext} from './production-config-guard.mjs';
import {REVISION, IMAGE_ID, executionEnv} from './capture-production-runtime.mjs';
import {validateModernSchemaContext} from './production-modern-schema-authority.mjs';
import {modernSchemaReleaseBinding} from './production-modern-schema-state.mjs';
import {assertSameBinding} from './background-control-manifest.mjs';
import {assertModernSchemaLeaseStillOriginal, assertOriginalModernSchemaProcess} from './production-modern-schema-session-lease.mjs';
import {observeMaintenanceProcessIdentity} from './production-maintenance-root-readers.mjs';
import {verifyModernSchemaChild} from './production-modern-schema-processes.mjs';
import {metadataFor} from './production-deployment-evidence.mjs';
import {API_READINESS_PROGRAM} from './production-maintenance-candidate-health.mjs';
import {runModernSchemaDeploymentState} from './production-deployment-state.mjs';
import {promoteFloor} from './promote-production-config-floor.mjs';
import {assertBackgroundFence, runCompose} from './phoenix-production-compose.mjs';
import {same} from './production-maintenance-receipts.mjs';

const order = ['PROMOTE', 'BEGIN', 'CANDIDATE', 'SWITCH', 'COMPOSE', 'READINESS', 'COMPLETE'];
const composeUp = ['up', '-d', '--no-deps', '--wait', 'api'];
const ID = /^[a-f0-9]{64}$/;
const fail = code => { throw Error('MODERN_SCHEMA_FORMAL_HOLD=' + code); };

function boundedDockerRead(args) {
  try {
    return execFileSync('/usr/bin/docker', args, {
      env: executionEnv(), timeout: 5000, maxBuffer: 65536, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    fail('FIXED_DOCKER_OBSERVATION_FAILED');
  }
}

export function verifyOriginalExecutorStopped(participant, read = boundedDockerRead) {
  if (!ID.test(participant?.containerId ?? '') || !REVISION.test(participant?.revision ?? '')) fail('EXACT_ORIGINAL_EXECUTOR_REQUIRED');
  const fields = ['.Id', '.Name', '.Image', '.State.StartedAt', '.State.Running', '.State.Status',
    '.State.ExitCode', '.State.OOMKilled', '.RestartCount', '.HostConfig.RestartPolicy.Name'];
  let observed;
  try {
    const format = fields.map(field => '{{json ' + field + '}}').join('\\t');
    observed = read(['inspect', participant.containerId, '--format', format]).split('\\t').map(JSON.parse);
  } catch {
    fail('ORIGINAL_EXECUTOR_OBSERVATION_FAILED');
  }
  const [id, name, image, startedAt, running, status, exitCode, oom, restarts, restartPolicy] = observed;
  if (observed.length !== fields.length || id !== participant.containerId || name !== '/phoenix-v3-api' ||
      !IMAGE_ID.test(image ?? '') || startedAt !== participant.startedAt || running !== false ||
      status !== 'exited' || exitCode !== 0 || oom !== false || restarts !== participant.restartCount ||
      !['no', ''].includes(restartPolicy)) fail('ORIGINAL_EXECUTOR_NOT_GRACEFULLY_STOPPED');
  const revision = read(['image', 'inspect', image, '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}']);
  if (revision !== participant.revision) fail('ORIGINAL_EXECUTOR_REVISION_CHANGED');
  return true;
}

function candidatePin(metadata, context, old) {
  if (!ID.test(metadata?.id ?? '') || metadata.id === old.containerId ||
      metadata.ociRevision !== context.targetSha || metadata.image !== context.candidateImageId ||
      metadata.running !== true || metadata.health !== 'healthy' || !Number.isFinite(Date.parse(metadata.startedAt)) ||
      !Number.isSafeInteger(metadata.restartCount) || metadata.restartCount !== 0) fail('CANDIDATE_RUNTIME_UNVERIFIED');
  return {id: metadata.id, imageId: metadata.image, revision: metadata.ociRevision,
    startedAt: metadata.startedAt, restartCount: metadata.restartCount};
}

function observeReadiness(pin, read) {
  let value;
  try {
    value = JSON.parse(read(['exec', pin.id, '/usr/bin/env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin',
      '/usr/local/bin/node', '-e', API_READINESS_PROGRAM]));
  } catch {
    fail('CANDIDATE_READINESS_UNVERIFIED');
  }
  if (!value || Object.keys(value).sort().join(',') !== 'bodyBytes,bodySha256,dbConnected,ready,status' ||
      value.status !== 200 || value.ready !== true || value.dbConnected !== true ||
      !ID.test(value.bodySha256 ?? '') || !Number.isSafeInteger(value.bodyBytes) ||
      value.bodyBytes < 1 || value.bodyBytes > 4096) fail('CANDIDATE_READINESS_UNVERIFIED');
}

export function createModernSchemaFormalBodyAdapters({
  context: inputContext, preparationSha256, rootLease, originalProcess, originalChild, admit,
}, dependencies = {}) {
  const context = validateModernSchemaContext(inputContext);
  const binding = modernSchemaReleaseBinding(context, preparationSha256);
  const root = dependencies.root ?? CONTRACT.repository;
  const directory = dependencies.directory ?? CONTRACT.stateDirectory;
  const checkContext = dependencies.guard ?? (() => verifyContext(root, directory));
  const checkProcess = dependencies.checkProcess ?? assertOriginalModernSchemaProcess;
  const checkLease = dependencies.checkLease ?? assertModernSchemaLeaseStillOriginal;
  const checkChild = dependencies.checkChild ?? (entry => verifyModernSchemaChild(entry, observeMaintenanceProcessIdentity(entry.pin.pid)));
  const inspect = dependencies.metadata ?? metadataFor;
  const read = dependencies.dockerRead ?? boundedDockerRead;
  const executeCompose = dependencies.executeCompose;
  if (!rootLease || originalProcess?.pid !== process.pid || !originalChild?.pin ||
      typeof admit !== 'function' || typeof executeCompose !== 'function') fail('ORIGINAL_SUPERVISOR_CHANNEL_REQUIRED');

  const env = Object.freeze({
    DEPLOY_RUN_ID: context.owner, DEPLOY_RUN_ATTEMPT: context.owner.split('-').at(-1),
    TARGET_SHA: context.targetSha, APPROVED_CONFIG_FLOOR_SHA: context.targetSha, APPROVED_PREVIOUS_FLOOR_SHA: context.floorSha,
    DEPLOY_MODE: 'api', BUILD_API: 'true', BUILD_WEB: 'false', RUN_MIG: 'false',
    ROTATE_CHANJET_CREDENTIALS: 'false', ONE_TIME_CONFIG_FLOOR_TRANSITION: 'false',
    DEPLOYMENT_EVIDENCE_PRE: path.join(directory, 'deploy-' + context.owner + '-pre-evidence.json'),
    DEPLOYMENT_EVIDENCE_POST: path.join(directory, 'deploy-' + context.owner + '-post-evidence.json'),
    DEPLOYMENT_EVIDENCE_LOG: path.join(directory, 'deploy-' + context.owner + '-startup-evidence.json'),
  });
  const floorStage = path.join(directory, 'floor-stage-' + context.owner);
  const beforeRuntime = path.join(directory, 'run-' + context.owner, 'runtime-before.json');

  let index = 0, executing = false, poisoned = false;
  let originalExecutor = null, candidate = null;
  const verifyOwner = () => {
    checkContext();
    if (checkProcess(originalProcess) !== true || checkLease(rootLease) !== true || checkChild(originalChild) !== true) {
      fail('ORIGINAL_SUPERVISOR_CHANNEL_LOST');
    }
    return true;
  };
  const authorize = async (operation, when) => {
    verifyOwner();
    if (await admit(Object.freeze({operation, when})) !== true) fail('SAME_OWNER_ADMISSION_REQUIRED');
    const replacement = order.indexOf('COMPOSE');
    if (index < replacement || (index === replacement && when !== 'AFTER')) originalDrained();
    if (candidate) verifyCandidate();
    return verifyOwner();
  };
  const originalDrained = () => {
    const proof = (dependencies.backgroundFence ?? assertBackgroundFence)(directory, {
      env,
      verifyOldExecutor: participant => verifyOriginalExecutorStopped(participant, read),
    });
    assertSameBinding(proof, binding);
    const [prior] = proof.participants;
    if (originalExecutor && !same(originalExecutor, prior)) fail('ORIGINAL_EXECUTOR_PIN_CHANGED');
    originalExecutor ??= structuredClone(prior);
    return true;
  };
  const verifyCandidate = () => {
    const found = candidatePin(inspect('api'), context, originalExecutor);
    if (candidate && !same(candidate, found)) fail('CANDIDATE_RUNTIME_CHANGED');
    return found;
  };
  const act = async (operation, effect) => {
    if (executing || poisoned || order[index] !== operation) fail('FORMAL_OPERATIONS_OUT_OF_ORDER');
    executing = true;
    try {
      await authorize(operation, 'BEFORE');
      const result = await effect();
      await authorize(operation, 'AFTER');
      index++;
      return result;
    } catch (error) {
      poisoned = true;
      if (/^MODERN_SCHEMA_FORMAL_HOLD=[A-Z_]+$/.test(error?.message ?? '')) throw error;
      fail(operation + '_UNVERIFIED');
    } finally {
      executing = false;
    }
  };

  return Object.freeze({
    state(operation, ...args) {
      const expected = {
        begin: [beforeRuntime],
        candidate: ['api', context.candidateImageId],
        switch: ['api'],
        complete: [],
      };
      if (!Object.hasOwn(expected, operation) || !same(args, expected[operation])) fail('FORMAL_STATE_SCOPE');
      const label = operation.toUpperCase();
      return act(label, () => (dependencies.runState ?? runModernSchemaDeploymentState)({
        operation, input: args[0], value: args[1], schemaRelease: context, env,
        admit: () => authorize(label, 'WRITE'),
      }, {root, directory}));
    },
    promote(stagedPath) {
      if (stagedPath !== floorStage) fail('FORMAL_STAGE_SCOPE');
      return act('PROMOTE', () => (dependencies.promote ?? promoteFloor)(root, {
        directory, environment: env, stagingDirectory: floorStage,
        maintenanceAdmission: () => authorize('PROMOTE', 'WRITE'),
      }));
    },
    compose(args) {
      if (!same(args, composeUp)) fail('FORMAL_COMPOSE_SCOPE');
      return act('COMPOSE', async () => {
        await (dependencies.compose ?? runCompose)(composeUp, {
          root, directory, env, maintenanceAdmission: verifyOwner,
          backgroundFence: originalDrained,
          execute: async (_program, argv, {cwd, env: composeEnv}) => {
            await authorize('COMPOSE', 'WRITE');
            return executeCompose({binary: '/usr/bin/docker', args: argv, cwd, env: composeEnv});
          },
        });
        candidate = verifyCandidate();
        return true;
      });
    },
    readiness(...args) {
      if (args.length !== 0) fail('FORMAL_READINESS_SCOPE');
      return act('READINESS', () => {
        if (!candidate) fail('CANDIDATE_RUNTIME_UNVERIFIED');
        observeReadiness(candidate, read);
        return true;
      });
    },
    completed() {
      return index === order.length && !poisoned && !executing;
    },
  });
}
