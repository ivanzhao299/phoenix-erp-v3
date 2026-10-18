import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectBackgroundFloor, checkRepositoryBackgroundFloor } from './check-background-producer-floor.mjs';
const FILTER = 'apps/api/src/common/filters/all-exceptions.filter.ts';
const ENTRY = 'apps/api/src/modules/future/future.scheduler.ts';
const imported = "import { BackgroundTaskService as Tasks } from '../background-control/background-task.service';";
const entry = imported + 'class Job { execute() { this.queue.spawn("fixture", "LOCAL", async () => {}); } constructor(private readonly queue: Tasks) {} }';
test('current real production capability consumers are all pinned and preserve explicit IoT scope', () => {
  const actual = checkRepositoryBackgroundFloor(); assert.deepEqual(actual.missing, []);
  const filter = actual.consumers.find(c => c.file === FILTER); assert.equal(filter.pinned, true); assert.equal(filter.registrations.length, 4);
  const iot = actual.consumers.find(c => c.file.endsWith('/iot-sync.service.ts'));
  assert.equal(iot.sourceScope, 'LINE_25_ONWARD_LEGACY_HEADER_EXCLUDED'); assert.ok(iot.registrations.every(r => r.line >= 25));
});
test('removing only the real exception-filter pin fails on its actual source', () => {
  const contract = JSON.parse(fs.readFileSync(new URL('../ops/production-config-contract.json', import.meta.url), 'utf8'));
  const source = fs.readFileSync(new URL('../../' + FILTER, import.meta.url), 'utf8');
  assert.deepEqual(inspectBackgroundFloor({ [FILTER]: source }, contract.criticalFiles.filter(f => f !== FILTER)).missing, [FILTER]);
});
test('a new unpinned typed producer fails even when its method precedes the constructor', () => {
  const r = inspectBackgroundFloor({ [ENTRY]: entry }, []); assert.deepEqual(r.missing, [ENTRY]);
  assert.deepEqual(r.consumers[0].registrations.map(r => r.method), ['spawn']);
  assert.deepEqual(inspectBackgroundFloor({ [ENTRY]: entry }, [ENTRY]).missing, []);
});
test('all three registration methods and DI app.get handles are recognized', () => {
  const text = imported + 'const tasks = app.get(Tasks); tasks.run("a","LOCAL",async()=>{}); tasks.runScheduled("b","LOCAL",async()=>{}); tasks.spawn("c","LOCAL",async()=>{});';
  assert.deepEqual(inspectBackgroundFloor({ [ENTRY]: text }, []).consumers[0].registrations.map(r => r.method), ['run', 'runScheduled', 'spawn']);
});
test('namespace imports and function parameters preserve capability identity', () => {
  const text = 'import * as cap from "../background-control/background-task.service"; function start(tasks: cap.BackgroundTaskService) { return tasks.run("a","LOCAL",async()=>{}); }';
  const r = inspectBackgroundFloor({ [ENTRY]: text }, []); assert.deepEqual(r.missing, [ENTRY]); assert.equal(r.consumers[0].registrations.length, 1);
});
test('an escaped or indirect capability still requires a pin even with no precise call count', () => {
  const text = imported + 'function pass(tasks: Tasks) { const alias: any = tasks; return alias.run("a","LOCAL",async()=>{}); }';
  const r = inspectBackgroundFloor({ [ENTRY]: text }, []); assert.deepEqual(r.missing, [ENTRY]); assert.equal(r.consumers[0].registrations.length, 0);
});
test('unrelated run methods do not force arbitrary business files into the contract', () => {
  const text = 'class Unrelated { run() {} } const item = new Unrelated(); item.run();';
  assert.deepEqual(inspectBackgroundFloor({ [ENTRY]: text }, []).consumers, []);
});
test('explicit test fixture sources are excluded rather than reported as production producers', () => {
  assert.deepEqual(inspectBackgroundFloor({ 'apps/api/src/a.spec.ts': entry, 'apps/api/src/a.test-fixture.ts': entry }, []).consumers, []);
});
test('malformed source and duplicate pins fail closed without exposing source text', () => {
  assert.throws(() => inspectBackgroundFloor({ [ENTRY]: 'const PRIVATE_SOURCE_SENTINEL =' }, []), e => e.message === 'BACKGROUND_FLOOR_SOURCE_PARSE_REQUIRED');
  assert.throws(() => inspectBackgroundFloor({}, [ENTRY, ENTRY]), /BACKGROUND_FLOOR_CONTRACT_INVALID/);
});

test('the known IoT producer cannot disappear through an untyped indirect capability', () => {
  const file = 'apps/api/src/modules/iot/iot-sync.service.ts';
  const text = 'class Job { constructor(private tasks: any) {} execute() { const alias = this.tasks; return alias.spawn("iot", "EXTERNAL", async () => {}); } }';
  const result = inspectBackgroundFloor({ [file]: text }, []);
  assert.deepEqual(result.missing, [file]);
  assert.equal(result.consumers[0].registrations.length, 0);
  assert.deepEqual(inspectBackgroundFloor({ [file]: text }, [file]).missing, []);
});
