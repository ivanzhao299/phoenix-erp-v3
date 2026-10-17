import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ControlledComposeReplacement, validateCandidateReplacement } from './production-maintenance-replacement.mjs';
import { canonicalDigest } from './production-maintenance-receipts.mjs';
import { OwnedComposeCapsule, delay } from './production-maintenance-replacement.docker.fixture.mjs';

test('Node20 real owned Docker Compose replacement retains images/Web/DB and produces lifecycle tombstone', {
  skip: process.env.MAINTENANCE_REPLACEMENT_DOCKER_FIXTURE !== '1', timeout: 120000,
}, async t => {
  const capsule = new OwnedComposeCapsule(process.env.MAINTENANCE_REPLACEMENT_MANIFEST);
  t.after(() => capsule.captureOwnedProject()); await capsule.start();
  const state = { phase: 'PROMOTION_PREPARED', stateDigest: canonicalDigest({ fixtureOnly: true, owner: capsule.owner }) };
  const executor = new ControlledComposeReplacement({ context: capsule.context, state, prerequisites: capsule.prerequisites,
    approval: { fixtureOnly: true }, project: capsule.project }, {
    store: capsule.store(state), guard() {}, run: capsule.capsuleRun, publicSource: capsule.publicSource,
    // This isolated capsule substitutes only authority/source collection. The
    // default real event observer, fixed Compose command and validations run.
    verifySource: () => ({ root: capsule.root, composeFileSha256: capsule.composeFileSha256 }),
    verifyAuthority: async () => true, verifyEvidence: async () => true,
    verifyPublicFence: async () => {
      const source = fs.statSync(capsule.publicSource), manifest = JSON.parse(fs.readFileSync(capsule.publicSource + '/manifest.json', 'utf8'));
      return (source.mode & 0o777) === 0o555 && manifest.phase === 'FENCED' && manifest.participants.length === 0;
    },
  });
  const receipt = await executor.replace();
  const body = validateCandidateReplacement(receipt, capsule.context, { publicSource: capsule.publicSource });
  capsule.own(body.candidate.id, 'candidate');
  assert.equal(body.oldDisposition, 'REMOVED_BY_CONTROLLED_REPLACEMENT'); assert.equal(body.legacyDrainResult, 'UNSUPPORTED');
  assert.equal(capsule.docker(['ps', '-a', '--no-trunc', '--filter', `id=${capsule.apiId}`, '-q']), '');
  assert.equal(JSON.parse(capsule.docker(['image', 'inspect', capsule.oldImage, '--format', '{{json .Id}}'])), capsule.oldImage);
  for (const role of ['web', 'db']) {
    const actual = capsule.inspect(capsule[`${role}Id`]);
    for (const key of ['id', 'imageId', 'startedAt', 'restartCount', 'running', 'health']) assert.equal(actual[key], capsule.pre[role][key]);
  }
  const actual = capsule.inspect(body.candidate.id); assert.equal(actual.restartPolicy, 'no'); assert.equal(actual.revision, capsule.context.targetSha);
  const mounts = JSON.parse(capsule.docker(['inspect', body.candidate.id, '--format', '{{json .Mounts}}']));
  assert.ok(mounts.some(m => m.Source === capsule.publicSource && m.Destination === '/run/phoenix-background-control' && m.RW === false));
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      const status = capsule.docker(['exec', body.candidate.id, 'node', '-e', "fetch('http://127.0.0.1:3100/',{method:'POST'}).then(async r=>console.log(r.status+':'+await r.text()))"]);
      assert.equal(status, '503:FENCED'); break;
    } catch (error) { if (Date.now() > deadline) throw error; await delay(100); }
  }
  assert.equal(body.webSwitched, false); assert.equal(body.runMigration, false);
  fs.writeFileSync(capsule.manifest + '.result.json', JSON.stringify({ fixtureOnly: true, productionReceipt: false, result: 'PASS', node: process.version, receipt,
    resourceManifest: capsule.manifest, cleanupExecuted: false }, null, 2), { flag: 'wx', mode: 0o600 });
});

test('actual old-container revival during replacement leaves only pending intent and HOLD', {
  skip: process.env.MAINTENANCE_REPLACEMENT_DOCKER_FIXTURE !== '1', timeout: 120000,
}, async t => {
  const manifest = process.env.MAINTENANCE_REPLACEMENT_MANIFEST + '.reviver.json';
  const capsule = new OwnedComposeCapsule(manifest);
  t.after(() => capsule.captureOwnedProject()); await capsule.start();
  const state = { phase: 'PROMOTION_PREPARED', stateDigest: canonicalDigest({ fixtureOnly: true, owner: capsule.owner }) };
  const executor = new ControlledComposeReplacement({ context: capsule.context, state, prerequisites: capsule.prerequisites, approval: { fixtureOnly: true }, project: capsule.project }, {
    store: capsule.store(state), guard() {}, run: capsule.capsuleRun, publicSource: capsule.publicSource,
    verifySource: () => ({ root: capsule.root, composeFileSha256: capsule.composeFileSha256 }),
    verifyAuthority: async () => true, verifyEvidence: async () => true, verifyPublicFence: async () => true,
    execute(args, options) {
      // Deliberate owned fixture race after the final stop check. It performs no
      // business calls. Events must expose revival even though Compose removes
      // that same old ID and the final inventory otherwise looks legitimate.
      capsule.own(capsule.apiId, 'api'); capsule.docker(['start', capsule.apiId]); capsule.docker(args, options);
    },
  });
  let observedError;
  try { await executor.replace(); } catch (error) { observedError = error; }
  const candidate = capsule.docker(['ps', '-a', '--no-trunc', '--filter', `label=com.docker.compose.project=${capsule.project}`, '--filter', 'label=com.docker.compose.service=api', '-q']);
  capsule.own(candidate, 'candidate-after-held-replacement');
  assert.match(observedError?.message || '', /REPLACEMENT_OLD_REVIVED/);
  assert.equal(fs.existsSync(capsule.stateDirectory + '/maintenance-replacement-intent-987654321-1.json'), true);
  assert.equal(fs.existsSync(capsule.stateDirectory + '/maintenance-replacement-987654321-1.json'), false);
  fs.writeFileSync(manifest + '.result.json', JSON.stringify({ fixtureOnly: true, productionReceipt: false, result: 'PASS_EXPECTED_HOLD', node: process.version,
    hold: 'REPLACEMENT_OLD_REVIVED', resourceManifest: manifest, cleanupExecuted: false }, null, 2), { flag: 'wx', mode: 0o600 });
});
