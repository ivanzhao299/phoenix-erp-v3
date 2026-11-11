import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module, { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

// Offline setup/guard contracts only: these do not claim the 49 live API
// regression assertions passed. Run: node --test apps/api/scripts/packaging-regression.offline.test.mjs
const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../../..');
const source=fs.readFileSync(path.join(directory,'packaging-regression.sh'),'utf8');
const setup=source.slice(0,source.indexOf('cyan "▶ T1:'));
const apiRequire=createRequire(path.join(root,'apps/api/package.json'));
const mock=`#!/usr/bin/env node
const fs=require('node:fs');const path=require('node:path');
const args=process.argv.slice(2),tool=path.basename(process.argv[1]);
fs.appendFileSync(process.env.MOCK_RECORD,JSON.stringify({tool,args})+'\\n');
if(tool==='psql') {
 if(process.env.SQL_FAIL) {console.error('offline SQL failure');process.exit(3);}
 const sql=args[args.indexOf('-c')+1];
 if(sql.includes('FROM sys_organizations')) console.log(process.env.ORG_CONTEXT??'COMP-TEST|SITE-TEST');
 else if(sql.includes('SELECT COUNT(*) FROM pkg_shifts')) console.log(process.env.SOURCE_COUNT??'2');
 process.exit(0);
}
const url=args.find(arg=>arg.startsWith('http://'));
if(url.endsWith('/auth/login')) {console.log('{"token":"offline-secret-must-not-print"}');process.exit(0);}
const calls=fs.readFileSync(process.env.MOCK_RECORD,'utf8').trim().split('\\n').map(JSON.parse).filter(row=>row.tool==='curl'&&!row.args.some(arg=>arg.endsWith('/auth/login')));
if(calls.length===Number(process.env.FAIL_AT||0)) {
 if(process.env.TRANSPORT_FAIL) process.exit(7);
 console.log('{"code":409,"msg":"offline fixture rejected"}');process.stdout.write('409');process.exit(0);
}
if(url.endsWith('/packaging/shifts')) {
 const id=process.env.DUPLICATE_SHIFT?'17':(calls.length===3?'17':'18');
 console.log(JSON.stringify({code:200,data:{id:Number(id)}}));
} else console.log('{"msg":"Created successfully"}');
process.stdout.write('201');
`;
function runSetup(overrides={}) {
 const tmp=fs.mkdtempSync(path.join(directory,'.packaging-offline-'));
 try {
  for(const tool of ['curl','psql']) fs.writeFileSync(path.join(tmp,tool),mock,{mode:0o700});
  const record=path.join(tmp,'calls.jsonl');
  const env={...process.env,PATH:tmp+path.delimiter+process.env.PATH,PSQL:path.join(tmp,'psql'),
   MOCK_RECORD:record,API_URL:'http://offline.invalid',DB_NAME:'packaging_offline_db'};
  for(const key of ['SQL_FAIL','ORG_CONTEXT','SOURCE_COUNT','FAIL_AT','TRANSPORT_FAIL','DUPLICATE_SHIFT']) delete env[key];
  Object.assign(env,overrides);
  const result=spawnSync('bash',['-c',setup],{env,encoding:'utf8',timeout:15000});
  assert.ifError(result.error);
  const rows=fs.existsSync(record)?fs.readFileSync(record,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  return {result,rows,payloads:rows.filter(row=>row.tool==='curl'&&row.args.includes('-d')&&!row.args.some(arg=>arg.endsWith('/auth/login')))
   .map(row=>({route:row.args.find(arg=>arg.startsWith('http://')),body:JSON.parse(row.args[row.args.indexOf('-d')+1])}))};
 } finally {
  assert.equal(path.dirname(tmp),directory);assert(path.basename(tmp).startsWith('.packaging-offline-'));
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
function realOwnershipService() {
 // Load the complete canonical resolver (including static SQL constants), not
 // an ownership stub or a duplicate join in the policy harness.
 const ts=apiRequire('typescript');
 const filename=path.join(root,'apps/api/src/modules/org/services/org-ownership.service.ts');
 const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{
  target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
  experimentalDecorators:true,emitDecoratorMetadata:true,
 }}).outputText;
 const loaded=new Module(filename);loaded.filename=filename;
 loaded.paths=Module._nodeModulePaths(path.dirname(filename));
 loaded._compile(compiled,filename);
 return loaded.exports.OrgOwnershipService;
}
function realGuard() {
 const ts=apiRequire('typescript');
 const filename=path.join(root,'apps/api/src/modules/terminal/packaging.service.ts');
 const parsed=ts.createSourceFile(filename,fs.readFileSync(filename,'utf8'),ts.ScriptTarget.Latest,true);
 const declaration=parsed.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='PackagingService');
 const method=declaration.members.find(node=>node.name?.getText(parsed)==='assertLegacyStockWriteAllowed');
 assert(method,'execute the actual policy method, not a copied implementation');
 const compiled=ts.transpileModule(`class OfflineGuard { constructor(em) { this.em=em; } ${method.getText(parsed)} }`,
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 return new Function('ConflictException','OrgOwnershipService',compiled+';return OfflineGuard;')(
  apiRequire('@nestjs/common').ConflictException,realOwnershipService());
}
function guardFixture(payloads,profiles=[],batches=[]) {
 const farm=payloads.find(row=>row.route.endsWith('/brd_farms')).body;
 const house=payloads.find(row=>row.route.endsWith('/brd_houses')).body;
 const shifts=payloads.filter(row=>row.route.endsWith('/packaging/shifts')).map((row,index)=>({...row.body,id:17+index}));
 const rows=[];
 const Guard=realGuard();
 const em={query:async(sql,args=[])=>{
  rows.push({sql,args});
  if(sql.includes('FROM pkg_shifts')) return shifts.filter(shift=>shift.id===args[0]);
  if(sql.includes('FROM inv_batches')) return batches.filter(batch=>batch.batch_no===args[0]);
  if(sql.includes('FROM brd_houses')) return args[0]===house.house_code?[{...house,company_code:farm.company_code}]:[];
  if(sql.includes('FROM md_egg_source_profiles')) return profiles.filter(profile=>profile.company_code===args[0]);
  throw Error('unexpected guard query');
 }};
 const guard=new Guard(em);
 return {farm,house,shifts,rows,run:(records,body={})=>guard.assertLegacyStockWriteAllowed(records,body)};
}

test('packaging regression shell syntax is valid',()=>{
 const result=spawnSync('bash',['-n',path.join(directory,'packaging-regression.sh')]);assert.equal(result.status,0);
});
test('setup creates farm/house plus two distinct real legacy shifts without printing credentials',()=>{
 const {result,rows,payloads}=runSetup();assert.equal(result.status,0,result.stdout+result.stderr);
 assert.equal(payloads.length,4);assert.match(result.stdout,/legacy 来源已持久化/);
 assert(!result.stdout.includes('offline-secret-must-not-print'));
 const f=guardFixture(payloads);
 assert.equal(f.farm.company_code,'COMP-TEST');assert.equal(f.farm.mapped_site_code,'SITE-TEST');
 assert.equal(f.house.farm_code,f.farm.farm_code);assert.equal(f.house.status,'ACTIVE');
 for(const retired of ['company_code','site_code','store_code']) assert(!(retired in f.house));
 assert.deepEqual(f.shifts.map(shift=>shift.house_code),[f.house.house_code,f.house.house_code]);
 for(const row of rows.filter(row=>row.tool==='psql')) {
  assert(row.args.includes('packaging_offline_db'));assert(row.args.includes('ON_ERROR_STOP=1'));
 }
});
test('the real legacy gate accepts the persisted unconfigured setup and linked PACKING sources',async()=>{
 const f=guardFixture(runSetup().payloads);
 await f.run([f.shifts[0]]);
 await f.run([{house_code:f.house.house_code,shift_id:18,batch_no:'BAT-REGR-PACK'}]);
 assert(f.rows.some(row=>row.sql.includes('md_egg_source_profiles')&&row.args[0]===f.farm.company_code));
 assert(f.rows.every(row=>!row.sql.includes('pkg_work_shifts')));
});
test('the same real gate still rejects ACTIVE or INACTIVE configured companies with HTTP409',async()=>{
 for(const status of ['ACTIVE','INACTIVE']) {
  const f=guardFixture(runSetup().payloads,[{company_code:'COMP-TEST',profile_code:'EXISTING',status}]);
  await assert.rejects(f.run([f.shifts[0]]),error=>error.status===409);
 }
 const f=guardFixture(runSetup().payloads);
 await assert.rejects(f.run([{house_code:'UNKNOWN'}]),error=>error.status===409);
 await assert.rejects(f.run([{shift_id:999,house_code:f.house.house_code}]),error=>error.status===409);
});
test('company selection executes NOT EXISTS over all profiles, including disabled profiles',()=>{
 const {rows}=runSetup();
 const sql=rows.find(row=>row.tool==='psql'&&row.args[row.args.indexOf('-c')+1].includes('FROM sys_organizations')).args.at(-1);
 const python=`import sqlite3,json,sys
sql=json.load(sys.stdin)
with sqlite3.connect(':memory:') as db:
 db.executescript("CREATE TABLE sys_organizations(id int,org_code text,parent_id int,org_type text,status text,company_code text);CREATE TABLE md_egg_source_profiles(company_code text,status text);INSERT INTO sys_organizations VALUES(1,'COMP-A',NULL,'COMPANY','ACTIVE','COMP-A'),(2,'SITE-A',1,'SITE','ACTIVE',NULL),(3,'COMP-B',NULL,'COMPANY','ACTIVE','COMP-B'),(4,'SITE-B',3,'SITE','ACTIVE',NULL);")
 assert db.execute(sql).fetchall()==[('COMP-A|SITE-A',)]
 db.execute("INSERT INTO md_egg_source_profiles VALUES('COMP-A','INACTIVE')")
 assert db.execute(sql).fetchall()==[('COMP-B|SITE-B',)]
 db.execute("INSERT INTO md_egg_source_profiles VALUES('COMP-B','ACTIVE')")
 assert db.execute(sql).fetchall()==[]
`;
 const result=spawnSync('python3',['-c',python],{input:JSON.stringify(sql),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('missing eligible company or source relation fails setup rather than choosing UNKNOWN/ALL',()=>{
 for(const env of [{ORG_CONTEXT:''},{ORG_CONTEXT:'UNKNOWN|SITE-TEST'},{SOURCE_COUNT:'0'},{SOURCE_COUNT:'3'},{DUPLICATE_SHIFT:'1'},{SQL_FAIL:'1'}]) {
  const {result}=runSetup(env);assert.equal(result.status,99,result.stdout+result.stderr);
  assert(!result.stdout.includes('legacy 来源已持久化'));
 }
});
test('each failed HTTP seed stops immediately and preserves its response',()=>{
 for(const failAt of [1,2,3,4]) {
  const {result,payloads}=runSetup({FAIL_AT:String(failAt)});
  assert.equal(result.status,99);assert.equal(payloads.length,failAt);
  assert.match(result.stderr,/HTTP 409/);assert.match(result.stderr,/offline fixture rejected/);
  assert(!result.stdout.includes('legacy 来源已持久化'));
 }
 const {result}=runSetup({FAIL_AT:'1',TRANSPORT_FAIL:'1'});assert.equal(result.status,99);assert.match(result.stderr,/transport failure/);
});
test('manual PACKING and REMAINDER fixtures bind the separate pkg_shifts namespace; policy data is never mutated',()=>{
 const inserts=[...source.matchAll(/INSERT INTO pkg_tasks \(([^)]*)\)([\s\S]*?);/g)];
 assert.equal(inserts.length,3);
 for(const [,columns,values] of inserts) {
  assert(columns.split(',').map(value=>value.trim()).includes('shift_id'));
  assert(values.includes('$PACK_SHIFT_ID'));
 }
 assert.doesNotMatch(source,/\b(?:DELETE FROM|UPDATE|INSERT INTO|TRUNCATE)\s+md_egg_source_profiles\b/i);
 assert.doesNotMatch(source,/\b(?:DELETE FROM|UPDATE|INSERT INTO|TRUNCATE)\s+sys_organizations\b/i);
 assert.doesNotMatch(source,/INSERT INTO\s+pkg_work_shifts/i);
});
