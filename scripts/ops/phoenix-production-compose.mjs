import { readonlyEnvironment } from './chanjet-readonly-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CONTRACT, guardProduction, secureJson, assertStateVersion, rollbackEligibility, assertRuntimePins } from './production-config-guard.mjs';
import { executionEnv, IMAGE_ID, captureRuntime } from './capture-production-runtime.mjs';
import { transactionFile, inspectCandidate } from './production-deployment-state.mjs';
import { inspectPublicDirectory, readPublicManifest, PUBLIC_DIRECTORY } from './background-control-manifest.mjs';
import { metadataFor } from './production-deployment-evidence.mjs';
export function assertBackgroundFence(directory = CONTRACT.stateDirectory, dependencies = {}) {
  const env = dependencies.env || process.env;
  const fail = () => { throw new Error('COMPOSE_HOLD=BACKGROUND_DRAIN_PROOF_REQUIRED'); };
  if (!/^\d+-\d+$/.test(env.DEPLOY_RUN_ID || '') || !/^[a-f0-9]{40}$/.test(env.TARGET_SHA || '')) fail();
  const read = dependencies.readState || secureJson;
  let record; let proof; let manifest;
  try {
    record = read(path.join(directory, 'background-control.json'));
    proof = read(path.join(directory, `background-drain-${env.DEPLOY_RUN_ID}.json`));
    manifest = (dependencies.readManifest || readPublicManifest)();
  } catch { fail(); }
  if (!record || !proof || !manifest || record.protocolVersion !== 1 || proof.protocolVersion !== 1 || manifest.protocolVersion !== 1
    || !['FENCED', 'CODE_HOLD'].includes(record.phase) || record.holdReason || manifest.phase !== record.phase
    || record.owner !== env.DEPLOY_RUN_ID || proof.owner !== record.owner || manifest.owner !== record.owner
    || record.targetSha !== env.TARGET_SHA || proof.targetSha !== record.targetSha || manifest.targetSha !== record.targetSha
    || proof.previousFloorSha !== record.previousFloorSha || !/^[a-f0-9]{40}$/.test(record.previousFloorSha || '')
    || proof.outcome !== 'DRAINED' || !Number.isSafeInteger(record.generation) || record.generation < 1
    || proof.generation !== record.generation || manifest.generation !== record.generation
    || record.manifestDigest !== createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
    || !Array.isArray(proof.participants) || proof.participants.length !== 1 || !Array.isArray(manifest.participants) || manifest.participants.length !== 1) fail();
  const p = proof.participants[0]; const m = manifest.participants[0];
  if (!/^[a-f0-9]{64}$/.test(p.containerId || '') || !/^[a-f0-9-]{36}$/.test(p.bootId || '')
    || p.revision !== record.previousFloorSha || p.containerId !== m.containerId || p.bootId !== m.bootId || p.revision !== m.revision
    || !Number.isFinite(Date.parse(p.startedAt)) || !Number.isInteger(p.restartCount)) fail();
  // The proof applies to one concrete old executor. It cannot authorize a
  // second recreation, a replaced/restarted process, or a legacy stop receipt.
  const actual = (dependencies.metadata || metadataFor)('api');
  if (actual.id !== p.containerId || actual.ociRevision !== p.revision || actual.startedAt !== p.startedAt
    || actual.restartCount !== p.restartCount || actual.running !== true || actual.health !== 'healthy') fail();
  return proof;
}
export function assertBackgroundMount(root, inspect = inspectPublicDirectory, readManifest = readPublicManifest) {
  inspect(PUBLIC_DIRECTORY);
  // The floor contract pins this Compose source. Do not allow environment
  // substitutions or the Docker short-bind form which creates a missing host
  // directory silently and can leave an API without its trusted deny manifest.
  const source = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  const api = source.split(/^  api:\s*$/m)[1]?.split(/^  [a-z][a-z0-9_-]*:\s*$/m)[0];
  if (!api || !/source: \/var\/lib\/phoenix-background-control\s*\n\s*target: \/run\/phoenix-background-control\s*\n\s*read_only: true\s*\n\s*bind:\s*\n\s*create_host_path: false/.test(api)) throw new Error('COMPOSE_HOLD=BACKGROUND_READONLY_DIRECTORY_MOUNT');
  if (!readManifest(PUBLIC_DIRECTORY, inspect)) throw new Error('COMPOSE_HOLD=BACKGROUND_MANIFEST_REQUIRED');
}
export function composeArguments(root, args, project) {
  if (!/^phoenix[a-z0-9_-]*$/.test(project || '')) throw new Error('COMPOSE_HOLD=APPROVED_PROJECT');
  const exact = [
    ['ps'], ['pull', 'api'], ['pull', 'web'],
    ...['api', 'web', 'db'].flatMap(service => [
      ['up', '-d', '--no-deps', '--wait', service], ['up', '-d', '--wait', service], ['restart', service],
    ]),
  ];
  if (!exact.some(profile => JSON.stringify(profile) === JSON.stringify(args))) throw new Error('COMPOSE_HOLD=UNSUPPORTED_OPERATION');
  return ['compose', '--project-name', project, '--env-file', path.join(root, '.env'), '-f', path.join(root, 'docker-compose.yml'), ...args,
    ...(args[0] === 'up' ? ['--no-build', '--pull', 'never', '--no-deps'] : [])];
}
export function runCompose(args, dependencies = {}) {
  const root = dependencies.root || fs.realpathSync(process.cwd()); const directory = dependencies.directory || CONTRACT.stateDirectory;
  const file = process.env.DEPLOY_RUN_ID ? transactionFile(directory) : path.join(directory, 'active.json');
  const state = assertStateVersion((dependencies.readState || secureJson)(file)); const images = state.active;
  const floor = (dependencies.guard || guardProduction)(root, directory, images);
  const command = composeArguments(root, args, floor.project);
  for (const service of ['api', 'web']) {
    if (!IMAGE_ID.test(images[service]?.imageId)) throw new Error('COMPOSE_HOLD=PIN_REQUIRED');
    const inspected = (dependencies.inspect || inspectCandidate)(images[service].imageId, images[service].revision);
    if (inspected.imageId !== images[service].imageId) throw new Error('COMPOSE_HOLD=PIN_DRIFT');
  }
  const service = args.at(-1);
  if (fs.existsSync(path.join(directory, 'policy-transition.json')) && args[0] !== 'ps' && !(service === 'api' && ['up', 'pull'].includes(args[0]))) throw new Error('COMPOSE_HOLD=POLICY_TRANSITION_API_ONLY');
  if (['up', 'restart'].includes(args[0])) {
    const actual = (dependencies.capture || captureRuntime)();
    // restart acts on actual containers; DB/Web operations can indirectly affect API.
    if (args[0] === 'restart') assertRuntimePins(actual, images);
    const apiToExecute = service === 'api' && args[0] === 'up' ? images.api : actual.api;
    if (!(dependencies.eligibility || rollbackEligibility)(root, floor, apiToExecute).allowed) throw new Error('ROLLBACK_API_IMAGE_ALLOWED=NO:PRE_FLOOR_API_RECOVERY_HOLD');
  }
  if (['up', 'restart'].includes(args[0]) && !(dependencies.eligibility || rollbackEligibility)(root, floor, images.api).allowed) throw new Error('ROLLBACK_API_IMAGE_ALLOWED=NO:PRE_FLOOR_API_RECOVERY_HOLD');
  if (service === 'api' && ['up', 'restart'].includes(args[0])) {
    (dependencies.backgroundMount || assertBackgroundMount)(root);
    (dependencies.backgroundFence || assertBackgroundFence)(directory);
  }
  let apiImage = images.api.imageId; let webImage = images.web.imageId;
  if (args[0] === 'pull') {
    if (!process.env.DEPLOY_RUN_ID || !['api', 'web'].includes(service)) throw new Error('COMPOSE_HOLD=PULL_SCOPE');
    const ref = `ghcr.io/ivanzhao299/phoenix-erp-v3/${service}:sha-${state.target}`;
    if (service === 'api') apiImage = ref; else webImage = ref;
  }
  return (dependencies.execute || execFileSync)('docker', command, { cwd: root, env: { ...executionEnv(), ...readonlyEnvironment(floor), API_IMAGE: apiImage, WEB_IMAGE: webImage }, stdio: ['ignore', 'pipe', 'pipe'] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCompose(process.argv.slice(2));
    console.log('PRODUCTION_COMPOSE=PASS');
  } catch { console.error('PRODUCTION_COMPOSE=HOLD'); process.exitCode = 1; }
}
