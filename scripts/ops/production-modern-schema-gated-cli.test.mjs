import test from 'node:test';import assert from 'node:assert/strict';
import {validateModernSchemaCliBackend,runModernSchemaGatedCli,runModernSchemaGatedAdmission} from './production-modern-schema-gated-cli.mjs';
import {parseModernSchemaMigrationRun} from './production-modern-schema-migration-driver.mjs';
import {ModernSchemaExecutorWatch} from './production-modern-schema-watch.mjs';
import {pinModernSchemaChild,isOriginalModernSchemaChildTerminal} from './production-modern-schema-processes.mjs';
import {spawn} from 'node:child_process';
const binding={owner:'1234-1',contextDigest:'a'.repeat(64),nonce:'b'.repeat(64),mode:'run'};
const proof={schema:'phoenix.modern-schema-migration-backend/v1',...binding,backend:{pid:42,databaseOid:100,database:'owned_clone',systemIdentifier:'1234567890123456789',postmasterStartMicros:'1234567890123456',backendStartMicros:'1234567890123457',applicationName:'phoenix-schema-1234-1-run',readonly:false,primary:true}};
test('gate evidence requires the exact native first backend and fails on readonly-mode, nonce, identity or extra fields',()=>{
 assert.deepEqual(validateModernSchemaCliBackend(proof,binding),proof);
 for(const mutate of [v=>v.nonce='c'.repeat(64),v=>v.backend.pid=0,v=>v.backend.readonly=true,v=>v.backend.backendStartMicros=1234,v=>v.backend.extra=true]){
  const bad=structuredClone(proof);mutate(bad);assert.throws(()=>validateModernSchemaCliBackend(bad,binding),/GATED_CLI_HOLD=/);
 }
});
test('a gated CLI has no default production authority',async()=>{
 await assert.rejects(runModernSchemaGatedCli({...binding,mode:'run',imageId:'sha256:'+'a'.repeat(64),networkId:'b'.repeat(64),environment:{DB_HOST:'db',DB_PORT:'5432',DB_USER:'owned',DB_PASSWORD:'synthetic',DB_NAME:'owned'}}),/FIXED_GATED_CLI_SCOPE_REQUIRED/);
});
test('original schema script arguments are fixed to one run then one readonly show; credential text is data',()=>{
 const imageId='sha256:'+'a'.repeat(64),networkName='phoenix-erp_default',password="synthetic'`$(never execute)";
 const args=['run','--name','phoenix-migrate-schema-first-abcdefgh','--user','phoenix','--network',networkName,
  '-e','DB_HOST=db','-e','DB_PORT=5432','-e','DB_USER=owned','-e','DB_PASSWORD='+password,'-e','DB_NAME=owned','-e','PGOPTIONS=-c lock_timeout=5s -c statement_timeout=120s',
  '--entrypoint','./node_modules/.bin/typeorm',imageId,'-d','dist/database/data-source.js','migration:run','--transaction','all'];
 const parsed=parseModernSchemaMigrationRun(args,{imageId,networkName,mode:'run'});assert.equal(parsed.environment.DB_PASSWORD,password);
 for(const change of [a=>a[5]='root',a=>a[a.length-1]='each',a=>a.push('--privileged'),a=>a[2]='replay-unowned']){
  const bad=[...args];change(bad);assert.throws(()=>parseModernSchemaMigrationRun(bad,{imageId,networkName,mode:'run'}),/MIGRATION_DRIVER_HOLD=/);
 }
});

const deferred = () => {
 let resolve, reject;
 const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
 return {promise, resolve, reject};
};
const gateFixture = () => {
 const watch = Object.create(ModernSchemaExecutorWatch.prototype);
 watch.serial = Promise.resolve();
 const entry = {child: {exitCode: null, signalCode: null}};
 const controller = new AbortController();
 return {watch, serialize: work => watch.serially(work), entry, signal: controller.signal};
};

test('watch finishes pending census before attach, waits through permit, then resumes during the CLI run', {timeout: 5000}, async () => {
 const f = gateFixture(), before = deferred(), proof = deferred(), attached = deferred(), cli = deferred();
 const events = [];
 const prior = f.watch.serially(() => before.promise);
 const execution = runModernSchemaGatedAdmission({
  serialize: f.serialize,
  start: async onSpawn => {
   events.push('attach');
   await onSpawn(f.entry, {signal: f.signal});
   return cli.promise;
  },
  async admit(assertWaiting) {
   attached.resolve();
   await proof.promise;
   assertWaiting();
   events.push('native proof verified and permit published');
  },
 });
 const observe = f.watch.serially(() => events.push('census'));
 try {
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, []);
  before.resolve();
  await prior;
  await attached.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['attach']);
  proof.resolve();
  await observe;
  assert.deepEqual(events, ['attach', 'native proof verified and permit published', 'census']);
 } finally { before.resolve();proof.resolve();cli.resolve('CLI_RESULT'); }
 assert.equal(await execution, 'CLI_RESULT');
});

test('expired original admission window cannot publish after a slow native observation', async t => {
 const f = gateFixture();
 let now = 100, writes = 0;
 t.mock.method(performance, 'now', () => now);
 await assert.rejects(runModernSchemaGatedAdmission({
  serialize: f.serialize,
  start: onSpawn => onSpawn(f.entry, {signal: f.signal}),
  async admit(assertWaiting) {
   assertWaiting();
   now += 30001;
   assertWaiting();
   writes++;
  },
 }), /FIRST_BACKEND_GATE_UNRESOLVED/);
 await f.watch.serially(() => assert.equal(writes, 0));
});

test('attach exit during pending native admission drains the handler before watch can proceed', {timeout: 5000}, async () => {
 const f = gateFixture(), pendingObservation = deferred(), entered = deferred(), exit = deferred();
 let writes = 0, observed = false, handlerFinished = false;
 const execution = runModernSchemaGatedAdmission({
  serialize: f.serialize,
  start: onSpawn => Promise.race([onSpawn(f.entry, {signal: f.signal}), exit.promise]),
  async admit(assertWaiting) {
   try {
    entered.resolve();
    await pendingObservation.promise;
    assertWaiting();
    writes++;
   } finally { handlerFinished = true; }
  },
 });
 const rejected = assert.rejects(execution, /fixture attach exit/);
 await entered.promise;
 f.entry.child.exitCode = 64;
 exit.reject(Error('fixture attach exit'));
 const observe = f.watch.serially(() => { observed = true; assert.equal(handlerFinished, true); });
 try {
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(observed, false);
 } finally { pendingObservation.resolve(); }
 await rejected;
 await observe;
 assert.equal(writes, 0);
});

test('an actual attach zombie cannot pass the native check before permit publication', {timeout: 5000}, async () => {
 const f = gateFixture();
 const child = spawn('/usr/bin/sleep', ['10'], {stdio: 'ignore'});
 const exited = new Promise(resolve => child.once('exit', resolve));
 let writes = 0;
 try {
  const entry = pinModernSchemaChild(child);
  await assert.rejects(runModernSchemaGatedAdmission({
   serialize: f.serialize,
   start: onSpawn => onSpawn(entry, {signal: f.signal}),
   async admit(_assertWaiting, assertOriginalAttach) {
    assertOriginalAttach();
    child.kill('SIGKILL');
    const wait = new Int32Array(new SharedArrayBuffer(4));
    const deadline = performance.now() + 1000;
    while (!isOriginalModernSchemaChildTerminal(entry) && performance.now() < deadline) Atomics.wait(wait, 0, 0, 10);
    assert.equal(isOriginalModernSchemaChildTerminal(entry), true);
    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null);
    assertOriginalAttach();
    writes++;
   },
  }), /ORIGINAL_GATED_ATTACH_CHANGED/);
  assert.equal(writes, 0);
 } finally {
  child.kill('SIGKILL');
  await exited;
 }
});

test('a fast CLI exit after a durable permit still waits for mandatory post-admission', {timeout: 5000}, async () => {
 const f = gateFixture(), checking = deferred(), finishCheck = deferred(), cliExited = deferred();
 const failure = Error('fixture post-admission refused');
 const execution = runModernSchemaGatedAdmission({
  serialize: f.serialize,
  async start(onSpawn) {
   await onSpawn(f.entry, {signal: f.signal});
   cliExited.resolve('CLI_EXIT_0');
   return 'CLI_EXIT_0';
  },
  async admit(assertWaiting) { assertWaiting(); },
  async afterAdmission() { checking.resolve(); await finishCheck.promise; },
 });
 const rejected = assert.rejects(execution, error => error === failure);
 let observed = false;
 const observation = f.watch.serially(() => { observed = true; });
 await Promise.all([checking.promise,cliExited.promise]);
 assert.equal(observed, false);
 finishCheck.reject(failure);
 await rejected;
 await observation;
});
