/** Child body for the explicitly owned Compose fixture, never a deploy entry. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promotionPlan } from '../ops/promote-production-config-floor.mjs';
import { assertBackgroundFence } from '../ops/phoenix-production-compose.mjs';

assert.equal(process.env.FLOCK_REANCHOR_COMPOSE_FIXTURE, '1');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [directory, owner, project, failure] = process.argv.slice(2);
assert.ok(path.resolve(directory).startsWith(path.join(root, 'artifacts/flock-lifecycle-supervision-20261117/reanchor-compose-')));
assert.equal(fs.realpathSync(directory), directory);
assert.match(owner, /^\d+-\d+$/);
assert.match(project, /^phoenix-reanchor-[a-f0-9-]{36}$/);
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value), { mode: 0o600 });
const context = read('fixture-context.json');
assert.equal(context.fixtureOnly, true); assert.equal(context.productionReceipt, false); assert.equal(context.project, project);
const { F, R, T: target } = context;
const docker = args => execFileSync('/usr/bin/docker', args, { encoding: 'utf8', timeout: 30000 }).trim();
function metadata() {
  const id = docker(['ps', '--no-trunc', '--filter', `label=com.docker.compose.project=${project}`, '--filter', 'label=com.docker.compose.service=api', '-q']);
  assert.match(id, /^[a-f0-9]{64}$/);
  const value = JSON.parse(docker(['inspect', id, '--format', '{{json .}}']));
  assert.equal(value.Config.Labels['phoenix.test.owner'], context.owner);
  return { id, ociRevision: value.Config.Labels['org.opencontainers.image.revision'], startedAt: value.State.StartedAt,
    restartCount: value.RestartCount, running: value.State.Running, health: value.State.Health.Status, imageId: value.Image };
}
const previous = read('active.json');
const scope = { baseline: R, target, changed: [] };
const plan = promotionPlan({ previousFloor: read('floor.json'), previousActive: previous, actual: previous.active, target,
  approvedSha: target, runId: owner, scope, criticalFilesChanged: true, expectedPreviousFloorSha: F, schemaApplied: true });
write('promotion.json', { version: 3, approvedSha: target, previousFloor: read('floor.json'), previousActive: previous, scope, marker: plan.marker });
write('floor.json', plan.floor); write('active.json', plan.active);
if (failure === 'FAIL_BEFORE_API') process.exit(17);
assert.equal(failure, 'SUCCESS');
assertBackgroundFence(directory, { env: { DEPLOY_RUN_ID: owner, TARGET_SHA: target },
  readState: file => JSON.parse(fs.readFileSync(file, 'utf8')), readManifest: () => read('manifest-copy.json'), metadata });
execFileSync('/usr/bin/docker', ['compose', '-p', project, '-f', path.join(directory, 'compose.json'),
  'up', '-d', '--no-deps', '--wait', '--no-build', '--pull', 'never', 'api'], {
  env: { PATH: process.env.PATH, API_IMAGE: `${project}:target`, WEB_IMAGE: `${project}:old` }, stdio: 'ignore', timeout: 60000 });
const actual = metadata();
const pins = { api: { imageId: actual.imageId, revision: target }, web: previous.active.web };
assert.equal(actual.ociRevision, target);
write('active.json', { version: 3, outcome: 'SUCCESS', floorSha: target, configSha: target, active: pins });
write('deployment.json', { version: 3, outcome: 'SUCCESS', deployMode: 'api', target, configSha: target, floorSha: target,
  switched: { api: true, web: false }, previous: previous.active, active: pins, migrationPaths: [] });
