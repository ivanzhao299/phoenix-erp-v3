import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { classifySql, capturedStatements, capturedDatabaseStatements, sliceCapturedWindow, verifyBootstrap, assertDefaultBackgroundHold, parseBootControlIdentity, verifyCapturedControlIdentity } from './api-bootstrap-mutations.mjs';
const { auditBootstrap }=createRequire(import.meta.url)('./check-api-bootstrap-side-effects.cjs');

test('SQL detector rejects attempted DDL, business writes and sequence changes even when idempotent',()=>{
 for(const sql of ['CREATE TABLE IF NOT EXISTS t(id int)','ALTER TABLE t ADD COLUMN IF NOT EXISTS x text','DROP CONSTRAINT IF EXISTS f','CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'])assert.equal(classifySql(sql),'SCHEMA_MUTATION');
 for(const sql of ['UPDATE t SET x=1 WHERE false','INSERT INTO t VALUES(1) ON CONFLICT DO NOTHING','WITH old AS (SELECT 1) DELETE FROM t'])assert.equal(classifySql(sql),'BUSINESS_DATA_MUTATION');
 for(const sql of ["SELECT setval('t_seq',1)","SELECT nextval('t_seq')"])assert.equal(classifySql(sql),'SEQUENCE_MUTATION');
 assert.equal(classifySql('SELECT unreviewed_custom_function()'),'UNKNOWN_EXECUTABLE_SQL');
 assert.equal(classifySql('SELECT * FROM t WHERE ((id=$1))'),'READ');
 assert.equal(classifySql('SELECT 1; SELECT 2'),'UNKNOWN_SQL');
 assert.equal(classifySql("SELECT 'literal; harmless'"),'READ');
});

test('capture handles multi-line server statements and excludes other process SQL',()=>{
 const input='bootstrap-db=fixture user=rw app=target pid=1 LOG: execute <unnamed>: SELECT\n  1\nbootstrap-db=fixture user=admin app=psql pid=2 LOG: statement: CREATE TABLE x(id int)\nbootstrap-db=fixture user=rw app=target pid=1 LOG: statement: SELECT 2\n';
 assert.deepEqual(capturedStatements(input,'target'),['SELECT\n  1','SELECT 2\n']);
});

test('static scan follows lifecycle helper calls rather than just the hook body',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bootstrap-static-'));
 try {
  for(const file of ['apps/api/src/app.module.ts','apps/api/src/database/data-source.ts','apps/api/src/modules/generic-crud/generic-crud.service.ts','apps/api/src/modules/master/master.controller.ts']){
   fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),file.includes('module')?'const config={synchronize:false,migrationsRun:false,installExtensions:false};':file.includes('data-source')?'const config={synchronize:false,migrationsRun:false};':'export class Empty {}');
  }
  const file=path.join(dir,'apps/api/src/hook.ts');
  fs.writeFileSync(file,"function repair(q:any) { return q.query('ALTER TABLE t ADD COLUMN x text'); }\nexport class SystemController { onModuleInit(){ repair(this); } }");
  assert(auditBootstrap(dir).violations.some(v=>v.code==='STARTUP_SQL_MUTATION'&&v.entry==='repair'));
  fs.writeFileSync(file,"function inspect(q:any) { return q.query('SELECT 1'); }\nexport class SystemController { onModuleInit(){ inspect(this); } }");
  assert.deepEqual(auditBootstrap(dir).violations,[]);
  fs.writeFileSync(file,"export class NewlyIntroducedProvider { onModuleInit(){} }");
  assert(auditBootstrap(dir).violations.some(v=>v.code==='UNREVIEWED_LIFECYCLE_ENTRY'));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('whole database capture retains unmarked and rejected statements rather than silently filtering them',()=>{
 const log='bootstrap-db=api_bootstrap_fixture user=rw app=expected pid=1 LOG: statement: SELECT 1\nbootstrap-db=api_bootstrap_fixture user=rw app=other_driver pid=2 STATEMENT: ALTER TABLE missing ADD x text\nbootstrap-db=postgres user=rw app=other_driver pid=3 LOG: statement: CREATE TABLE x(id int)\n';
 const records=capturedDatabaseStatements(log);assert.equal(records.length,3);assert.equal(records[1].app,'other_driver');assert.equal(classifySql(records[1].sql),'SCHEMA_MUTATION');assert.equal(records[2].database,'postgres');
});

test('server markers preserve delayed rejected SQL and require visible boundaries',()=>{
 const log="bootstrap-db=fixture user=admin app=control pid=1 LOG: statement: SELECT 'BEGIN'\nbootstrap-db=fixture user=rw app=target pid=2 STATEMENT: UPDATE missing SET x=1\nbootstrap-db=fixture user=admin app=control pid=3 LOG: statement: SELECT 'END'\nbootstrap-db=fixture user=admin app=psql pid=4 LOG: statement: SELECT outside_window\n";
 const window=sliceCapturedWindow(log,"SELECT 'BEGIN'","SELECT 'END'",'control');assert.equal(window.length,1);assert.equal(classifySql(window[0].sql),'BUSINESS_DATA_MUTATION');assert.throws(()=>sliceCapturedWindow(log,"SELECT 'BEGIN'","SELECT 'NOT_VISIBLE'",'control'),/SERVER_BOUNDARY/);
});

test('failed preparation preserves a sanitized failure summary',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bootstrap-failure-'));const saved={...process.env};
 try {
  Object.assign(process.env,{BOOTSTRAP_FIXTURE_CONTAINER:'bootstrap_fixture_that_does_not_exist',PGUSER:'bootstrap_fixture',PGHOST:'127.0.0.1',PGDATABASE:'api_bootstrap_fixture',BOOTSTRAP_EVIDENCE_DIR:dir});
  await assert.rejects(verifyBootstrap(),/BOOTSTRAP_FIXTURE_OPERATION_FAILED/);
  const evidence=JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8'));assert.equal(evidence.outcome,'FAIL');assert.equal(evidence.failureCode,'BOOTSTRAP_FIXTURE_OPERATION_FAILED');assert.equal(fs.statSync(path.join(dir,'summary.json')).mode&0o777,0o600);assert(!JSON.stringify(evidence).includes('password'));
 } finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);fs.rmSync(dir,{recursive:true,force:true});}
});

test('legacy regression schema fixture refuses production or remote context and contains no business seed',()=>{
 const script='scripts/ci/api-bootstrap-schema-fixture.sh';
 const base={PATH:process.env.PATH,NODE_ENV:'test',MIG_MODE:'ci',PGHOST:'127.0.0.1',PGDATABASE:'api_bootstrap_fixture',PGUSER:'bootstrap_fixture'};
 for(const override of [{NODE_ENV:'production'},{PGHOST:'production.invalid'},{PGDATABASE:'production_erp'},{MIG_MODE:'production'}]){
  const result=spawnSync('bash',[script],{env:{...base,...override},encoding:'utf8'});assert.equal(result.status,1);assert.equal(result.stdout,'');
 }
 const sql=fs.readFileSync('scripts/ci/api-bootstrap-schema-fixture.sql','utf8').replace(/--[^\n]*/g,'');
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|setval|nextval|ALTER|DROP)\b/i);
 assert(!fs.readFileSync('apps/api/src/app.module.ts','utf8').includes('schema-fixture'));
});

function admissionStaticFixture() {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bootstrap-admission-static-'));
 const write=(file,text)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),text);};
 write('apps/api/src/app.module.ts','const config={synchronize:false,migrationsRun:false,installExtensions:false};');
 write('apps/api/src/database/data-source.ts','const config={synchronize:false,migrationsRun:false};');
 write('apps/api/src/modules/generic-crud/generic-crud.service.ts','export class EmptyGeneric {}');
 write('apps/api/src/modules/master/master.controller.ts','export class EmptyMaster {}');
 const base='apps/api/src/modules/background-control/';
 write(base+'background-control.types.ts','export const BACKGROUND_NAMESPACE=17455; export const BACKGROUND_ADMISSION_KEY=1; export const BACKGROUND_EXECUTION_KEY=2;');
 const backend=`import { BACKGROUND_NAMESPACE, BACKGROUND_ADMISSION_KEY, BACKGROUND_EXECUTION_KEY } from './background-control.types';
 export class BackgroundLockBackend {
  private async query(sql:string,key:number) { return this.runner.query(sql,[BACKGROUND_NAMESPACE,key]); }
  probe() { return this.query('SELECT pg_backend_pid() AS pid, $1::int AS namespace, $2::int AS session_probe',0); }
  gateEnter() { return this.query('SELECT pg_try_advisory_lock_shared($1::int, $2::int) AS acquired',BACKGROUND_ADMISSION_KEY); }
  executionExit() { return this.query('SELECT pg_advisory_unlock_shared($1::int, $2::int)',BACKGROUND_EXECUTION_KEY); }
 }`;
 const task=`export class BackgroundTaskService {
  constructor(private backend:BackgroundLockBackend) {}
  onModuleInit() { return this.backend.probe(); }
  run(name:string,kind:string,work:any) { return work(); }
 }`;
 const auth=`export class ChanjetAuthService {
  constructor(private background:BackgroundTaskService) {}
  onModuleInit() { return this.triggerAppTicket(); }
  async triggerAppTicket() { return this.background.run('chanjet-triggerAppTicket','CHANJET_AUTH',()=>this.triggerAppTicketAdmitted()); }
  private async triggerAppTicketAdmitted() {
   const url='https://openapi.chanjet.com/auth/appTicket/resend';
   return fetch(url,{method:'POST',redirect:'manual'});
  }
 }`;
 write(base+'background-lock.backend.ts',backend);write(base+'background-task.service.ts',task);
 const authFile='apps/api/src/modules/chanjet/chanjet-auth.service.ts';write(authFile,auth);
 return {dir,write,backend,task,auth,base,authFile,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

test('startup control SQL forwarding requires fixed SELECT call sites, namespace and exact parameters',()=>{
 const f=admissionStaticFixture();
 try {
  assert.deepEqual(auditBootstrap(f.dir).violations,[]);
  const mutations=[
   f.backend.replace("this.query('SELECT pg_backend_pid() AS pid, $1::int AS namespace, $2::int AS session_probe',0)","this.query(process.env.SQL,0)"),
   f.backend.replace('SELECT pg_backend_pid() AS pid, $1::int AS namespace, $2::int AS session_probe','UPDATE control SET phase=1'),
   f.backend.replace('SELECT pg_backend_pid() AS pid, $1::int AS namespace, $2::int AS session_probe','SELECT unreviewed_function()'),
   f.backend.replace('[BACKGROUND_NAMESPACE,key]','[999,key]'),
   f.backend.replace('return this.runner.query','sql=process.env.SQL; return this.runner.query'),
   f.backend.replace('  probe()',"  escaped() { return this.query; }\n  probe()"),
   f.backend.replace('  probe()',"  field=this.query(process.env.SQL,0);\n  probe()"),
   f.backend.replace('  probe()',"  hidden() { return this.query('DELETE FROM control',0); }\n  probe()"),
  ];
  for(const source of mutations) {
   f.write(f.base+'background-lock.backend.ts',source);
   const report=auditBootstrap(f.dir);
   assert(report.violations.some(v=>v.code==='UNREVIEWED_BACKGROUND_CONTROL_SQL'),source);
  }
  f.write(f.base+'background-lock.backend.ts',f.backend);
  f.write(f.base+'background-control.types.ts','export const BACKGROUND_NAMESPACE=12; export const BACKGROUND_ADMISSION_KEY=1; export const BACKGROUND_EXECUTION_KEY=2;');
  assert(auditBootstrap(f.dir).violations.some(v=>v.reason==='CONTROL_NAMESPACE_OR_KEYS_CHANGED'));
 } finally {f.close();}
});

test('resend helper requires the sole exact public CHANJET_AUTH admission and rejects unguarded calls anywhere',()=>{
 const f=admissionStaticFixture();
 try {
  assert.deepEqual(auditBootstrap(f.dir).violations,[]);
  const mutations=[
   f.auth.replace("'CHANJET_AUTH'","'LOCAL'"),
   f.auth.replace("'CHANJET_AUTH'",'dynamicKind'),
   f.auth.replace("this.background.run('chanjet-triggerAppTicket','CHANJET_AUTH',()=>this.triggerAppTicketAdmitted())",'this.triggerAppTicketAdmitted()'),
   f.auth.replace('  private async triggerAppTicketAdmitted()', '  ignoredButDangerous() { return this.triggerAppTicketAdmitted(); }\n  private async triggerAppTicketAdmitted()'),
   f.auth.replace('  private async triggerAppTicketAdmitted()', "  ignoredButDangerous() { return this['triggerAppTicketAdmitted'](); }\n  private async triggerAppTicketAdmitted()"),
   f.auth.replace('  private async triggerAppTicketAdmitted()', '  ignoredButDangerous() { return this.triggerAppTicketAdmitted; }\n  private async triggerAppTicketAdmitted()'),
   f.auth.replace('private async triggerAppTicketAdmitted()', 'async triggerAppTicketAdmitted()'),
   f.auth.replace('async triggerAppTicket()','private async triggerAppTicket()'),
  ];
  for(const source of mutations) {
   f.write(f.authFile,source);
   assert(auditBootstrap(f.dir).violations.some(v=>v.code==='UNGUARDED_STARTUP_REMOTE_HELPER'),source);
  }
 } finally {f.close();}
});

test('admitted resend retains literal endpoint, POST and manual redirect restrictions',()=>{
 const f=admissionStaticFixture();
 try {
  for(const source of [
   f.auth.replace('https://openapi.chanjet.com/auth/appTicket/resend','https://unreviewed.invalid/resend'),
   f.auth.replace("method:'POST'","method:'GET'"),
   f.auth.replace("method:'POST'",'method:process.env.METHOD'),
   f.auth.replace("redirect:'manual'","redirect:'follow'"),
   f.auth.replace("redirect:'manual'",'redirect:process.env.REDIRECT'),
   f.auth.replace("redirect:'manual'","redirect:'manual',...unreviewedOptions"),
   f.auth.replace("redirect:'manual'","redirect:'manual',redirect:'follow'"),
   f.auth.replace("method:'POST'","method:'POST',method:'GET'"),
   f.auth.replace("const url='https://openapi.chanjet.com/auth/appTicket/resend'",'const url=process.env.URL'),
  ]) {
   f.write(f.authFile,source);
   assert(auditBootstrap(f.dir).violations.some(v=>v.code==='UNREVIEWED_STARTUP_REMOTE_CALL'),source);
  }
 } finally {f.close();}
});


test('control-session classification requires exact statement and captured namespace/key bindings',()=>{
 const probe='SELECT pg_backend_pid() AS pid, $1::int AS namespace, $2::int AS session_probe';
 const lock='SELECT pg_try_advisory_lock_shared($1::int, $2::int) AS acquired';
 const unlock='SELECT pg_advisory_unlock_shared($1::int, $2::int) AS released';
 assert.equal(classifySql('SELECT 1'),'READ');
 assert.equal(classifySql(probe,['17455','0']),'CONTROL_SESSION');
 assert.equal(classifySql(lock,['17455','1']),'CONTROL_SESSION');
 assert.equal(classifySql(unlock,['17455','2']),'CONTROL_SESSION');
 for(const [sql,params] of [[probe,undefined],[probe,['17455','1']],[probe,['17456','0']],[lock,['17455','0']],[lock,['17455','3']],['SELECT pg_backend_pid()',[]],['SELECT pg_advisory_lock(17455,1)',[]],['SELECT unreviewed_function()', ['17455','0']]])
  assert.equal(classifySql(sql,params),'UNKNOWN_EXECUTABLE_SQL');
 assert.equal(classifySql(probe+'; UPDATE t SET x=1',['17455','0']),'BUSINESS_DATA_MUTATION');
 assert.equal(classifySql(probe+'; ALTER TABLE t ADD x int',['17455','0']),'SCHEMA_MUTATION');
});

test('server capture associates only numeric control DETAIL with the exact app/pid and never stores other parameters',()=>{
 const prefix=pid=>`bootstrap-db=fixture user=runtime app=target pid=${pid} `;
 const probe='SELECT pg_backend_pid() AS pid, $1::int AS namespace, $2::int AS session_probe';
 const log=prefix(1)+'LOG: execute <unnamed>: '+probe+'\n'
  +prefix(2)+'LOG: statement: SELECT business FROM t WHERE id=$1\n'
  +prefix(1)+"DETAIL: parameters: $1 = '17455', $2 = '0'\n"
  +prefix(2)+"DETAIL: parameters: $1 = 'sensitive-fixture-must-not-be-retained'\n";
 const records=capturedDatabaseStatements(log);
 assert.equal(records.length,2);assert.deepEqual(records[0].controlParameters,['17455','0']);
 assert.equal(classifySql(records[0].sql,records[0].controlParameters),'CONTROL_SESSION');
 assert(!JSON.stringify(records).includes('sensitive-fixture'));
 const mismatch=capturedDatabaseStatements(prefix(1)+'LOG: execute <unnamed>: '+probe+'\n'+prefix(3)+"DETAIL: parameters: $1 = '17455', $2 = '0'\n");
 assert.equal(classifySql(mismatch[0].sql,mismatch[0].controlParameters),'UNKNOWN_EXECUTABLE_SQL');
});

test('fixed-key unlock helper rejects dynamic key, escaped reference and key reassignment',()=>{
 const f=admissionStaticFixture();
 try {
  const source=f.backend.replace("executionExit() { return this.query('SELECT pg_advisory_unlock_shared($1::int, $2::int)',BACKGROUND_EXECUTION_KEY); }",`private async unlock(key:number) { return this.query('SELECT pg_advisory_unlock_shared($1::int, $2::int) AS released',key); }
   executionExit() { return this.unlock(BACKGROUND_EXECUTION_KEY); }`);
  f.write(f.base+'background-lock.backend.ts',source);assert.deepEqual(auditBootstrap(f.dir).violations,[]);
  for(const mutation of [source.replace('this.unlock(BACKGROUND_EXECUTION_KEY)','this.unlock(dynamicKey)'),source.replace('this.unlock(BACKGROUND_EXECUTION_KEY)','this.unlock'),source.replace("return this.query('SELECT pg_advisory_unlock_shared", "key=dynamicKey; return this.query('SELECT pg_advisory_unlock_shared")]) {
   f.write(f.base+'background-lock.backend.ts',mutation);assert(auditBootstrap(f.dir).violations.some(v=>v.code==='UNREVIEWED_BACKGROUND_CONTROL_SQL'));
  }
 } finally {f.close();}
});

test('bootstrap default-HOLD proof requires real stable boot/session identity and healthy quiescent coordinator',()=>{
 const status={protocolVersion:1,bootId:'12345678-1234-4123-8123-123456789abc',phase:'HOLD',inFlight:0,pendingChildren:0,taskGraphs:0,poisoned:false,stopping:false,controlSession:{connected:true,broken:false,sessionPid:42,databaseOid:100,backendStartedAt:'2026-10-18T00:00:00.000Z',applicationName:'phoenix-fence:12345678-1234-4123-8123-123456789abc'}};
 const safe=assertDefaultBackgroundHold(status);assert.equal(safe.bootId,status.bootId);
 assert.deepEqual(assertDefaultBackgroundHold({...status,phase:'FENCED'},safe).controlSession,safe.controlSession);
 for(const mutation of [{...status,phase:'OPEN'},{...status,bootId:undefined},{...status,inFlight:1},{...status,pendingChildren:1},{...status,taskGraphs:1},{...status,poisoned:true},{...status,controlSession:{connected:false,broken:false,sessionPid:42}},{...status,controlSession:{connected:true,broken:true,sessionPid:42}}])
  assert.throws(()=>assertDefaultBackgroundHold(mutation),/DEFAULT_HOLD_REQUIRED/);
 assert.throws(()=>assertDefaultBackgroundHold({...status,bootId:'87654321-1234-4123-8123-123456789abc'},safe),/DEFAULT_HOLD_REQUIRED/);
 assert.throws(()=>assertDefaultBackgroundHold({...status,controlSession:{...status.controlSession,sessionPid:43}},safe),/DEFAULT_HOLD_REQUIRED/);
});


test('session application_name setter is admitted only from exact UUIDv4 boot binding and fixed GUC',()=>{
 const f=admissionStaticFixture();
 try {
  const binding="private applicationName=''; bindIdentity(bootId:string) { if(this.runner || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(bootId)) throw Error('identity'); this.applicationName = `phoenix-fence:${bootId}`; }";
  const source=f.backend.replace('  private async query',binding+'\n  private async query').replace('return this.runner.query(sql,',`await this.runner.query("SELECT set_config('application_name', $1, false)",[this.applicationName]); return this.runner.query(sql,`);
  f.write(f.base+'background-lock.backend.ts',source);assert.deepEqual(auditBootstrap(f.dir).violations,[]);
  for(const mutation of [source.replace("set_config('application_name'","set_config('role'"),source.replace("$1, false)","$1, true)"),source.replace('[this.applicationName]','[process.env.VALUE]'),source.replace('`phoenix-fence:${bootId}`','process.env.VALUE'),source.replace('this.runner || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(bootId)','false')]) {
   f.write(f.base+'background-lock.backend.ts',mutation);assert(auditBootstrap(f.dir).violations.some(v=>v.code==='UNREVIEWED_BACKGROUND_CONTROL_SQL'));
  }
 } finally {f.close();}
});

test('runtime session identity SQL requires captured public UUID nonce and never permits other set_config',()=>{
 const statement="SELECT set_config('application_name', $1, false)";
 const nonce='phoenix-fence:12345678-1234-4123-8123-123456789abc';
 assert.equal(classifySql(statement,[nonce]),'CONTROL_SESSION');
 for(const [sql,params] of [[statement,[]],[statement,['arbitrary']],[statement.replace('application_name','role'),[nonce]],[statement.replace('false','true'),[nonce]],[statement.replace('$1',"'constant'"),[nonce]]])assert.equal(classifySql(sql,params),'UNKNOWN_EXECUTABLE_SQL');
 const log=`bootstrap-db=fixture user=runtime app=marked pid=4 LOG: execute <unnamed>: ${statement}\nbootstrap-db=fixture user=runtime app=marked pid=4 DETAIL: parameters: $1 = '${nonce}'\n`;
 const record=capturedDatabaseStatements(log)[0];assert.deepEqual(record.controlParameters,[nonce]);assert.equal(record.pid,4);
 assert.equal(classifySql(record.sql,record.controlParameters),'CONTROL_SESSION');
});


test('session SQL is restricted to exact reviewed transaction controls; mutable SET/RESET and set_config are denied',()=>{
 for(const sql of ['BEGIN','COMMIT','ROLLBACK','START TRANSACTION'])assert.equal(classifySql(sql),'SESSION');
 for(const sql of ["SET session_replication_role='replica'",'SET search_path=attacker,public','SET ROLE superuser','RESET ALL','RESET ROLE','BEGIN; SET ROLE superuser','SELECT 1; SET ROLE superuser','SELECT 1; /*comment*/ RESET ALL'])
  assert.equal(classifySql(sql),'UNREVIEWED_SESSION_SQL');
 const f=admissionStaticFixture();
 try {
  for(const sql of ["SET session_replication_role='replica'",'RESET ALL','SELECT 1; SET ROLE superuser','SELECT 1; /*comment*/ RESET ALL',"SELECT set_config('search_path','attacker',false)"]){
   f.write('apps/api/src/session-hook.ts',`export class SystemController { onModuleInit(){return this.ds.query(${JSON.stringify(sql)});} }`);
   assert(auditBootstrap(f.dir).violations.some(v=>v.code==='UNREVIEWED_STARTUP_SESSION_SQL'));
  }
 } finally {f.close();}
});


test('every CONTROL_SESSION record binds to one startup-sampled PID/boot/app/database/start and rejects extra identities',()=>{
 const boot={protocolVersion:1,bootId:'12345678-1234-4123-8123-123456789abc',phase:'HOLD',controlSession:{connected:true,broken:false,sessionPid:42,databaseOid:100,backendStartedAt:'2026-10-18T00:00:00.000Z',applicationName:'phoenix-fence:12345678-1234-4123-8123-123456789abc'}};
 const app='capture_fixture';const nonce=boot.controlSession.applicationName;
 const binding={app,pid:42,database:'api_bootstrap_fixture',sql:"SELECT set_config('application_name', $1, false)",controlParameters:[nonce]};
 const probe={app:nonce,pid:42,database:'api_bootstrap_fixture',sql:'SELECT pg_backend_pid() AS pid, $1::int AS namespace, $2::int AS session_probe',controlParameters:['17455','0']};
 const records=[binding,probe,{app,pid:7,database:'api_bootstrap_fixture',sql:'SELECT 1'}];
 const samples=[{...boot,inFlight:0,pendingChildren:0,taskGraphs:0,poisoned:false,stopping:false}];
 assert.equal(verifyCapturedControlIdentity(records,app,boot,samples).controlStatementCount,2);
 // A schema HOLD may lack HTTP samples, but never lacks the exact startup identity.
 assert.equal(verifyCapturedControlIdentity(records,app,boot,[]).identityBindingCount,1);
 for(const extra of [{...probe,app,pid:99},{...binding,pid:99,controlParameters:['phoenix-fence:87654321-1234-4123-8123-123456789abc']},{...probe,app:nonce,pid:99},{...probe,sql:'SELECT 1'}])
  assert.throws(()=>verifyCapturedControlIdentity([...records,extra],app,boot,samples),/BINDING_REQUIRED|UNMARKED_DATABASE/);
 for(const changed of [{...samples[0],controlSession:{...boot.controlSession,databaseOid:101}},{...samples[0],controlSession:{...boot.controlSession,backendStartedAt:'2026-10-18T00:00:01.000Z'}}])
  assert.throws(()=>verifyCapturedControlIdentity(records,app,boot,[changed]),/BINDING_REQUIRED/);
 assert.throws(()=>verifyCapturedControlIdentity(records,app,undefined,[]),/CONTROL_IDENTITY_REQUIRED/);
});

test('startup control marker requires exactly one allowlisted identity and never archives arbitrary log fields',()=>{
 const boot={protocolVersion:1,bootId:'12345678-1234-4123-8123-123456789abc',phase:'HOLD',controlSession:{connected:true,broken:false,sessionPid:42,databaseOid:100,backendStartedAt:'2026-10-18T00:00:00.000Z',applicationName:'phoenix-fence:12345678-1234-4123-8123-123456789abc'}};
 const marker='BACKGROUND_CONTROL_BOOT='+JSON.stringify(boot);
 assert.deepEqual(parseBootControlIdentity('[Nest] '+marker+'\n'),boot);
 assert.throws(()=>parseBootControlIdentity('schema hold without control identity'),/BOOT_MARKER_REQUIRED/);
 assert.throws(()=>parseBootControlIdentity(marker+'\n'+marker),/BOOT_MARKER_REQUIRED/);
 assert.throws(()=>parseBootControlIdentity('BACKGROUND_CONTROL_BOOT='+JSON.stringify({...boot,unreviewed:'must-not-save'})),/BOOT_MARKER_FIELDS/);
 assert.throws(()=>parseBootControlIdentity('BACKGROUND_CONTROL_BOOT='+JSON.stringify({...boot,phase:'OPEN'})),/CONTROL_IDENTITY_REQUIRED/);
});
