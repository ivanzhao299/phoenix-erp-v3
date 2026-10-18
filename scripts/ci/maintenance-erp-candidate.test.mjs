import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { permittedDependencyFile, copyProductionDependencies, requireOwnedResource, verifyLiveControlRow } from './maintenance-erp-candidate.fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test('dependency capsule excludes env, keys, test trees and nested host node_modules', () => {
  for (const file of ['.env', '.env.production', '.npmrc', '.yarnrc.yml', 'fixtures/client.key', 'cert.pem', '.ssh/id_ed25519', 'test/fixture.js', 'tests/a', 'node_modules/foo']) {
    assert.equal(permittedDependencyFile(file), false, file);
  }
  for (const file of ['index.js', 'dist/server.js', 'package.json', 'lib/binding/napi-v3/bcrypt_lib.node']) assert.equal(permittedDependencyFile(file), true);
});
test('owned immutable full container and both labels are mandatory', () => {
  const resource = { Id: 'a'.repeat(64), Config: { Labels: { 'phoenix.test.owner': 'owner-one', 'phoenix.test.kind': 'maintenance-erp-candidate' } } };
  assert.equal(requireOwnedResource(resource, 'owner-one'), resource);
  assert.throws(() => requireOwnedResource(resource, 'different'), /UNOWNED_RESOURCE/);
  assert.throws(() => requireOwnedResource({ ...resource, Id: 'short' }, 'owner-one'), /UNOWNED_RESOURCE/);
});
function identity() {
  const bootId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const status = { bootId, poisoned: false, stopping: false, controlSession: { connected: true, broken: false, sessionPid: 15,
    databaseOid: 12, backendStartedAt: '2026-10-18T00:00:00.000Z', backendStartedAtUs: '2026-10-18T00:00:00.000123Z', applicationName: `phoenix-fence:${bootId}` } };
  return { status, rows: [{ pid: 15, datid: 12, backend_start: '2026-10-18T00:00:00.000Z', backend_started_at_us: '2026-10-18T00:00:00.000123Z' }] };
}
test('live root PostgreSQL unique session must match actual boot, PID, DB and start', () => {
  const { status, rows } = identity(); assert.equal(verifyLiveControlRow(status, rows, 12).unique, true);
  for (const mutate of [r => r[0].pid++, r => r[0].datid++, r => r[0].backend_start = '2026-10-18T00:00:01.000Z', r => r.push(r[0]), r => r.splice(0)]) {
    const invalid = structuredClone(rows); mutate(invalid); assert.throws(() => verifyLiveControlRow(status, invalid, 12), /CONTROL_SESSION_BINDING/);
  }
  assert.throws(() => verifyLiveControlRow(status, rows, 13), /CONTROL_SESSION_BINDING/);
  assert.throws(() => verifyLiveControlRow({ ...status, poisoned: true }, rows, 12), /CONTROL_SESSION_BINDING/);
});
test('actual ERP binding refuses raw microsecond mismatch or absence even when PID and Date match',()=>{
  const {status,rows}=identity();
  for(const raw of [undefined,'2026-10-18T00:00:00.000Z','2026-10-18T00:00:00.000124Z']){
    assert.throws(()=>verifyLiveControlRow({...status,controlSession:{...status.controlSession,backendStartedAtUs:raw}},rows,12),/CONTROL_SESSION_BINDING/);
    assert.throws(()=>verifyLiveControlRow(status,[{...rows[0],backend_started_at_us:raw}],12),/CONTROL_SESSION_BINDING/);
  }
});
test('production dependency closure preserves nested versions and never includes env/key fixtures', () => {
  const dir = path.join(root, 'artifacts/maintenance-erp-candidate', `unit-${randomUUID()}`); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const api = path.join(dir, 'api'); const modules = path.join(api, 'node_modules');
  fs.mkdirSync(path.join(modules, 'one'), { recursive: true }); fs.mkdirSync(path.join(modules, 'two'), { recursive: true });
  fs.writeFileSync(path.join(api, 'package.json'), JSON.stringify({ dependencies: { one: '1' } }));
  fs.writeFileSync(path.join(modules, 'one/package.json'), JSON.stringify({ name: 'one', version: '1.0.0', dependencies: { two: '1' } }));
  fs.writeFileSync(path.join(modules, 'one/index.js'), "module.exports=require('two')");
  fs.writeFileSync(path.join(modules, 'one/.env'), 'synthetic-should-never-be-copied');
  fs.symlinkSync('.env', path.join(modules, 'one/innocent-alias'));
  fs.writeFileSync(path.join(modules, 'one/private.key'), 'synthetic-should-never-be-copied');
  fs.writeFileSync(path.join(modules, 'two/package.json'), JSON.stringify({ name: 'two', version: '1.0.0' }));
  fs.writeFileSync(path.join(modules, 'two/index.js'), 'module.exports=2');
  const out = path.join(dir, 'capsule'); const records = copyProductionDependencies(api, out);
  assert.deepEqual(records.map(r => r.name).sort(), ['one', 'two']);
  assert.equal(fs.readFileSync(path.join(out, 'one/index.js'), 'utf8'), "module.exports=require('two')");
  assert.equal(fs.existsSync(path.join(out, 'one/.env')), false); assert.equal(fs.existsSync(path.join(out, 'one/private.key')), false);
  assert.equal(fs.existsSync(path.join(out, 'one/innocent-alias')), false);
  assert.equal(fs.realpathSync(path.join(out, 'one/node_modules/two')), fs.realpathSync(path.join(out, '.capsule', fs.readdirSync(path.join(out, '.capsule')).find(n => n.startsWith('two-')))));
});

import { actualPhaseMaterials } from './maintenance-erp-phase-correlation.fixture.mjs';
import { bindingDigest, canonicalDigest } from '../ops/production-maintenance-receipts.mjs';
function phaseInput() {
  const at = '2026-10-19T01:00:00.000Z', owner = '1792371600000-42', sourceSha = 'b'.repeat(40), imageId = 'sha256:' + '5'.repeat(64);
  const runtime = { Id: 'a'.repeat(64), Image: imageId, Config: { Labels: { 'org.opencontainers.image.revision': sourceSha } }, RestartCount: 0, State: { Running: true, Health: { Status: 'healthy' }, StartedAt: at, Pid: 41, Restarting: false, Dead: false } };
  const dbRuntime = { Id: 'd'.repeat(64), Image: 'sha256:' + '6'.repeat(64), State: { StartedAt: at, Running: true, Health: { Status: 'healthy' } }, RestartCount: 0, Mounts: [] };
  return { owner, sourceSha, imageId, runtime, dbRuntime, clock: () => Date.parse(at) + 10000,
    status: { ...identity().status, owner, phase: 'FENCED', inFlight: 0, pendingChildren: 0, taskGraphs: 0 },
    database: { containerId: dbRuntime.Id, imageId: dbRuntime.Image, containerStartedAt: at } };
}
test('real phase material builder binds every digest after final owner, source, clock and actual identity input', () => {
  const input = phaseInput(), f = actualPhaseMaterials(input), digest = bindingDigest(f.context);
  assert.equal(f.context.owner, input.owner); assert.equal(f.context.targetSha, input.sourceSha);
  assert.equal(f.context.preSnapshot.db.id, input.dbRuntime.Id); assert.equal(f.candidate.api.id, input.runtime.Id);
  assert.equal(f.candidate.api.health, input.runtime.State.Health.Status); assert.equal(f.candidate.bootId, input.status.bootId);
  assert.equal(f.material.approval.bindingDigest, digest); assert.equal(f.material.recoveryPlan.bindingDigest, digest);
  assert.equal(f.material.preEvidence.bindingDigest, digest); assert.equal(f.completion.bindingDigest, digest);
  assert.equal(f.material.approval.serverRecord.commitId, input.sourceSha);
  assert.equal(f.material.recoveryPlan.materials.find(m => m.kind === 'PRE_SNAPSHOT').sha256, canonicalDigest(f.context.preSnapshot));
  assert.equal(f.material.preEvidence.capturedAt, new Date(input.clock()).toISOString());
});
test('phase material builder refuses mismatched actual API, database, owner and health inputs', () => {
  for (const change of [i => i.status.owner = 'different', i => i.database.containerId = 'f'.repeat(64),
    i => i.runtime.Config.Labels['org.opencontainers.image.revision'] = 'c'.repeat(40), i => i.runtime.State.Health.Status = 'starting']) {
    const input = phaseInput(); change(input); assert.throws(() => actualPhaseMaterials(input));
  }
});
