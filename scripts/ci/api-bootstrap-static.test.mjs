import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { classifySql, capturedStatements, capturedDatabaseStatements, sliceCapturedWindow, verifyBootstrap } from './api-bootstrap-mutations.mjs';
const { auditBootstrap }=createRequire(import.meta.url)('./check-api-bootstrap-side-effects.cjs');

test('SQL detector rejects attempted DDL, business writes and sequence changes even when idempotent',()=>{
 for(const sql of ['CREATE TABLE IF NOT EXISTS t(id int)','ALTER TABLE t ADD COLUMN IF NOT EXISTS x text','DROP CONSTRAINT IF EXISTS f','CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'])assert.equal(classifySql(sql),'SCHEMA_MUTATION');
 for(const sql of ['UPDATE t SET x=1 WHERE false','INSERT INTO t VALUES(1) ON CONFLICT DO NOTHING','WITH old AS (SELECT 1) DELETE FROM t'])assert.equal(classifySql(sql),'BUSINESS_DATA_MUTATION');
 for(const sql of ["SELECT setval('t_seq',1)","SELECT nextval('t_seq')"])assert.equal(classifySql(sql),'SEQUENCE_MUTATION');
 assert.equal(classifySql('SELECT unreviewed_custom_function()'),'UNKNOWN_EXECUTABLE_SQL');
 assert.equal(classifySql('SELECT * FROM t WHERE ((id=$1))'),'READ');
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
