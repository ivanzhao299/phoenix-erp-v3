import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CONTRACT, guardProduction, secureJson, rollbackEligibility, assertRuntimePins } from './production-config-guard.mjs';
import { executionEnv, IMAGE_ID, captureRuntime } from './capture-production-runtime.mjs';
import { transactionFile, inspectCandidate } from './production-deployment-state.mjs';
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
  const state = (dependencies.readState || secureJson)(file); const images = state.active;
  const floor = (dependencies.guard || guardProduction)(root, directory, images);
  const command = composeArguments(root, args, floor.project);
  for (const service of ['api', 'web']) {
    if (!IMAGE_ID.test(images[service]?.imageId)) throw new Error('COMPOSE_HOLD=PIN_REQUIRED');
    const inspected = (dependencies.inspect || inspectCandidate)(images[service].imageId, images[service].revision);
    if (inspected.imageId !== images[service].imageId) throw new Error('COMPOSE_HOLD=PIN_DRIFT');
  }
  const service = args.at(-1);
  if (['up', 'restart'].includes(args[0])) {
    const actual = (dependencies.capture || captureRuntime)();
    // restart acts on actual containers; DB/Web operations can indirectly affect API.
    if (args[0] === 'restart') assertRuntimePins(actual, images);
    const apiToExecute = service === 'api' && args[0] === 'up' ? images.api : actual.api;
    if (!(dependencies.eligibility || rollbackEligibility)(root, floor, apiToExecute).allowed) throw new Error('ROLLBACK_API_IMAGE_ALLOWED=NO:PRE_FLOOR_API_RECOVERY_HOLD');
  }
  if (['up', 'restart'].includes(args[0]) && !(dependencies.eligibility || rollbackEligibility)(root, floor, images.api).allowed) throw new Error('ROLLBACK_API_IMAGE_ALLOWED=NO:PRE_FLOOR_API_RECOVERY_HOLD');
  let apiImage = images.api.imageId; let webImage = images.web.imageId;
  if (args[0] === 'pull') {
    if (!process.env.DEPLOY_RUN_ID || !['api', 'web'].includes(service)) throw new Error('COMPOSE_HOLD=PULL_SCOPE');
    const ref = `ghcr.io/ivanzhao299/phoenix-erp-v3/${service}:sha-${state.target}`;
    if (service === 'api') apiImage = ref; else webImage = ref;
  }
  return (dependencies.execute || execFileSync)('docker', command, { cwd: root, env: { ...executionEnv(), API_IMAGE: apiImage, WEB_IMAGE: webImage }, stdio: ['ignore', 'pipe', 'pipe'] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCompose(process.argv.slice(2));
    console.log('PRODUCTION_COMPOSE=PASS');
  } catch { console.error('PRODUCTION_COMPOSE=HOLD'); process.exitCode = 1; }
}
