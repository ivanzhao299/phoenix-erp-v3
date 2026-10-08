import { execFileSync } from 'node:child_process';
import { businessFingerprints } from './chanjet-readonly-first-sync.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readonlyEnvironment,expiredVerifyHoldEnvironment,validateReadonlyPolicy,validatePolicyTransition } from './chanjet-readonly-policy.mjs';
import { promotionPlan } from './promote-production-config-floor.mjs';
import { readonlyFlagSource,switchPlan,replaceReadonlyEnv } from './chanjet-readonly-config-transaction.mjs';
import { auditMappingScope } from './chanjet-readonly-production-audit.mjs';
import { validateEffectiveConfig,CONTRACT } from './production-config-guard.mjs';
const sha='a'.repeat(40),now=Date.now();
const pin=n=>({imageId:`sha256:${n.repeat(64)}`,revision:n.repeat(40)});
const actual={api:pin('a'),web:pin('b')};
const tuple={PHOENIX_DATA_MOUNT_GUARD:'true',PHOENIX_PG_DATA_DIR:'/data/test/postgres',PHOENIX_UPLOADS_DIR:'/data/test/uploads',CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'};
const floor={version:3,phase:'READY',floorSha:sha,project:'phoenix',operationalTuple:tuple,chanjetPolicy:'HOLD',readonlyApproval:null};
const approval={version:3,approvalId:'FINANCE_APPROVAL',floorSha:sha,sourceClassification:'PRODUCTION_DATA',remoteWrite:false,erpInbound:false,books:[{bookId:'BOOK-1',companyCode:'COMP-1'}],scopes:['RECEIVABLE_STATISTICS'],periodPolicy:'REQUESTED_PERIOD_NO_BACKFILL',verification:{bookId:'BOOK-1',period:'202610',scope:['RECEIVABLE_STATISTICS'],expiresAt:new Date(now+60000).toISOString()}};
const evidence={books:[{bookId:'BOOK-1',companyCode:'COMP-1',enabled:true}],mappings:[{bookId:'BOOK-1',companyCode:'COMP-1',syncEnabled:true,companyActive:true}],runningJobs:0,queuedJobs:0,recoveryCandidates:0,legacyRunningJobs:0,writebackPending:0,wmsWritebackPending:0,mappingConflicts:0};
const expected=f=>({...readonlyEnvironment(f),CHANJET_READONLY_SYNC_ENABLED:f.operationalTuple.CHANJET_READONLY_SYNC_ENABLED,CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'});
test('default HOLD requires false/false; explicit true alone cannot bypass approval',()=>{
  assert.deepEqual(readonlyEnvironment(floor),{CHANJET_SYNC_POLICY:'HOLD',CHANJET_READONLY_APPROVAL:''});
  assert.throws(()=>readonlyEnvironment({...floor,operationalTuple:{...tuple,CHANJET_READONLY_SYNC_ENABLED:'true'}}),/POLICY_FLAGS/);
  assert.throws(()=>readonlyEnvironment({...floor,chanjetPolicy:'READONLY_ACTIVE'}),/APPROVAL/);
});
test('VERIFY is a bounded exact single book/period read before schedule activation',()=>{
  const next=switchPlan(floor,'READONLY_VERIFY',approval,now);assert.equal(next.operationalTuple.CHANJET_READONLY_SYNC_ENABLED,'true');
  assert.equal(next.operationalTuple.CHANJET_ERP_INBOUND_SYNC_ENABLED,'false');
  assert.throws(()=>validateReadonlyPolicy('READONLY_VERIFY',approval,sha,now+60001),/VERIFY_DEADLINE/);
  assert.throws(()=>validateReadonlyPolicy('READONLY_VERIFY',{...approval,verification:{...approval.verification,expiresAt:new Date(now+3600000).toISOString()}},sha,now),/VERIFY_DEADLINE/);
});
test('ACTIVE requires completed first-run evidence, same scope and independent transition',()=>{
  assert.throws(()=>switchPlan(floor,'READONLY_ACTIVE',approval,now),/ACTIVE_REQUIRES/);
  const verify=switchPlan(floor,'READONLY_VERIFY',approval,now);
  assert.throws(()=>switchPlan(verify,'READONLY_ACTIVE',approval,now),/FIRST_SYNC_PROOF/);
  const active=switchPlan(verify,'READONLY_ACTIVE',{...approval,verifiedRunId:'CHANJET-RO-VERIFIED',verifiedEvidenceRunId:'1-1'},now);
  assert.equal(active.chanjetPolicy,'READONLY_ACTIVE');
  assert.throws(()=>switchPlan(verify,'READONLY_ACTIVE',{...approval,books:[{bookId:'OTHER',companyCode:'OTHER'}],verifiedRunId:'CHANJET-RO-VERIFIED',verifiedEvidenceRunId:'1-1'},now),/SCOPE_CHANGED/);
  assert.equal(switchPlan(active,'HOLD',null,now).operationalTuple.CHANJET_READONLY_SYNC_ENABLED,'false');
});
for(const change of [{remoteWrite:true},{erpInbound:true},{sourceClassification:'UAT'},{floorSha:'b'.repeat(40)},{books:[{bookId:'BOOK-1',companyCode:'COMP-1'},{bookId:'BOOK-2',companyCode:'COMP-1'}]}]){
  test(`rejects unapproved policy ${Object.keys(change)[0]}`,()=>assert.throws(()=>validateReadonlyPolicy('READONLY_VERIFY',{...approval,...change},sha,now)));
}
test('approved mappings match current enabled books exactly; candidates do not count as approval',()=>{
  assert.deepEqual(auditMappingScope(evidence,approval),approval.books);
  assert.throws(()=>auditMappingScope({...evidence,mappings:[...evidence.mappings,{bookId:'OTHER',companyCode:'COMP-1',syncEnabled:true,companyActive:true}]},approval),/CROSS_COMPANY/);
  assert.throws(()=>auditMappingScope({...evidence,books:[{bookId:'BOOK-1',companyCode:'COMP-2',enabled:true}]},approval),/BOOK_BINDING/);
  assert.throws(()=>auditMappingScope(evidence,{...approval,books:[]}),/SCOPE_CHANGED/);
});
for(const key of ['runningJobs','queuedJobs','recoveryCandidates','legacyRunningJobs','writebackPending','wmsWritebackPending','mappingConflicts'])test(`current ${key} blocks restoration without deleting evidence`,()=>assert.throws(()=>auditMappingScope({...evidence,[key]:1},approval)));
test('floor promotion binds exact separately approved SHA and actual running API migration baseline',()=>{
  const previousFloor={...floor,version:2};const previousActive={version:2,floorSha:sha,outcome:'SUCCESS',active:actual};
  const args={previousFloor,previousActive,actual,target:sha,approvedSha:sha,runId:'12-1',scope:{baseline:actual.api.revision,target:sha,changed:[]},now};
  const plan=promotionPlan(args);assert.equal(plan.floor.version,3);assert.equal(plan.floor.chanjetPolicy,'HOLD');assert.deepEqual(plan.floor.operationalTuple,tuple);
  assert.equal(plan.marker.operation,'CODE_HOLD');assert.equal(plan.active.outcome,'CONFIG_READY_HOLD');
  for(const change of [{approvedSha:'b'.repeat(40)},{scope:{...args.scope,changed:['migrations/x.sql']}},{actual:{...actual,api:pin('c')}},{previousActive:{...previousActive,outcome:'ROLLED_BACK'}}])assert.throws(()=>promotionPlan({...args,...change}));
});
test('transition accepts only exact old/new API, unchanged Web, owning run and short deadline',()=>{
  const marker={version:3,operation:'CODE_HOLD',phase:'IN_PROGRESS',runId:'12-1',target:sha,previous:actual,candidateApi:pin('c'),startedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString()};
  validatePolicyTransition(marker,{runId:'12-1',target:sha,actual,now});
  validatePolicyTransition(marker,{runId:'12-1',target:sha,actual:{...actual,api:pin('c')},now});
  for(const change of [{runId:'13-1'},{target:'b'.repeat(40)},{now:now+60001},{actual:{...actual,api:pin('d')}},{actual:{...actual,web:pin('c')}}])assert.throws(()=>validatePolicyTransition(marker,{runId:'12-1',target:sha,actual,now,...change}));
});
test('env replacement changes only canonical readonly bytes and preserves every other key and formatting',()=>{
  const source='# config\r\nCHANJET_READONLY_SYNC_ENABLED=false\r\nCHANJET_ERP_INBOUND_SYNC_ENABLED=false\r\nOTHER="quoted\nvalue"\n';
  const output=readonlyFlagSource(source,'true');assert.equal(output,source.replace('READONLY_SYNC_ENABLED=false','READONLY_SYNC_ENABLED=true'));
  assert.throws(()=>readonlyFlagSource(source+'CHANJET_READONLY_SYNC_ENABLED=false\n','true'));
  assert.throws(()=>readonlyFlagSource(source,'yes'));
});
test('real atomic env writer preserves owner/group/0600 and validates CAS before rename',{skip:process.getuid()!==0},()=>{ // UID0 writer fixture is mandatory in CI.
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'chanjet-env-'));const stage=path.join(directory,'stage');fs.mkdirSync(stage,{mode:0o700});const env=path.join(directory,'.env');
  try{
    const source=Buffer.from('CHANJET_READONLY_SYNC_ENABLED=false\nCHANJET_ERP_INBOUND_SYNC_ENABLED=false\nOTHER=fixture\n');fs.writeFileSync(env,source,{mode:0o600});fs.chownSync(env,1002,1002);
    const output=Buffer.from(readonlyFlagSource(source.toString(),'true'));replaceReadonlyEnv(env,source,output,stage);
    const stat=fs.statSync(env);assert.equal(stat.uid,1002);assert.equal(stat.gid,1002);assert.equal(stat.mode&0o777,0o600);assert.deepEqual(fs.readFileSync(env),output);
    assert.throws(()=>replaceReadonlyEnv(env,source,output,stage),/CAS_CHANGED/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('resolved compose must match approved policy and unchanged data binds',()=>{
  const next=switchPlan(floor,'READONLY_VERIFY',approval,now);const env=expected(next);
  const config={services:{api:{environment:env,volumes:[{type:'bind',source:tuple.PHOENIX_UPLOADS_DIR,target:'/app/uploads'}]},db:{volumes:[{type:'bind',source:tuple.PHOENIX_PG_DATA_DIR,target:'/var/lib/postgresql/data'}]}}};
  validateEffectiveConfig(config,next.operationalTuple,next);
  assert.throws(()=>validateEffectiveConfig({...config,services:{...config.services,api:{...config.services.api,environment:{...env,CHANJET_ERP_INBOUND_SYNC_ENABLED:'true'}}}},next.operationalTuple,next));
});
test('formal workflow separates audit, code-floor deployment, bounded first sync and activation',()=>{
  const w=fs.readFileSync('.github/workflows/chanjet-readonly-restoration.yml','utf8');
  assert.match(w,/environment: production/);assert.match(w,/test "\$GITHUB_REF" = refs\/heads\/main/);assert.match(w,/APPROVED_SHA.*GITHUB_SHA/);assert.match(w,/production-control-bootstrap/);
  assert.doesNotMatch(w,/docker compose (?:up|down)|migration:run|git reset|git clean|git stash/);
  const deploy=fs.readFileSync('.github/workflows/deploy.yml','utf8');assert.match(deploy,/approved_config_floor_sha/);assert.match(deploy,/test "\$BUILD_WEB" = false/);
  assert.ok(CONTRACT.criticalFiles.includes('scripts/ops/chanjet-readonly-policy.mjs'));
});

test('real isolated PostgreSQL fingerprints detect same-count fact overwrite within the query deadline', {skip:!process.env.CHANJET_HASH_FIXTURE_CONTAINER}, () => {
  const container=process.env.CHANJET_HASH_FIXTURE_CONTAINER;
  const db='chanjet_restore_fixture';
  const query=(sql,readonly=true) => execFileSync('docker',['exec','-i',container,'sh','-c',`exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${db}`],{encoding:'utf8',input:(readonly ? "BEGIN READ ONLY; SET LOCAL statement_timeout='20s'; " : '')+sql+(readonly ? 'ROLLBACK;' : ''),stdio:['pipe','pipe','pipe']});
  assert.ok(query('SELECT current_database();').includes(db));
  const tables=['fin_ar_ledger','fin_ar_invoices','fin_ap_invoices','fin_cash_transactions','inv_batches','inv_ledger','sal_sales_orders'];
  for(const table of tables) query(`CREATE TABLE IF NOT EXISTS ${table}(id bigserial PRIMARY KEY, amount numeric, detail text); INSERT INTO ${table}(amount,detail) SELECT n,repeat('fixture',200) FROM generate_series(1,1000) n WHERE NOT EXISTS(SELECT 1 FROM ${table});`,false);
  const read=sql=>JSON.parse(query(sql).split('\n').find(line=>line.startsWith('{')));
  const start=Date.now();const before=businessFingerprints(read);assert.ok(Date.now()-start<20000);
  query('UPDATE fin_ar_ledger SET amount=amount+1 WHERE id=(SELECT MIN(id) FROM fin_ar_ledger);',false);
  const after=businessFingerprints(read);assert.equal(before.fin_ar_ledger.count,after.fin_ar_ledger.count);assert.notEqual(before.fin_ar_ledger.digest,after.fin_ar_ledger.digest);
});

test('expired VERIFY can only close through an exact fresh HOLD operation',()=>{
  const verify=switchPlan(floor,'READONLY_VERIFY',approval,now);
  const expiredNow=now+60001,context={operation:'HOLD',runId:'12-1',target:sha};
  assert.throws(()=>readonlyEnvironment(verify,expiredNow),/VERIFY_DEADLINE/);
  const env=expiredVerifyHoldEnvironment(verify,context,expiredNow);assert.equal(env.CHANJET_SYNC_POLICY,'READONLY_VERIFY');
  const config={services:{api:{environment:{...env,CHANJET_READONLY_SYNC_ENABLED:'true',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'},volumes:[{type:'bind',source:tuple.PHOENIX_UPLOADS_DIR,target:'/app/uploads'}]},db:{volumes:[{type:'bind',source:tuple.PHOENIX_PG_DATA_DIR,target:'/var/lib/postgresql/data'}]}}};
  const old=Date.now;Date.now=()=>expiredNow;try {
    assert.throws(()=>validateEffectiveConfig(config,verify.operationalTuple,verify),/VERIFY_DEADLINE/);
    validateEffectiveConfig(config,verify.operationalTuple,verify,context);
    assert.throws(()=>validateEffectiveConfig({...config,services:{...config.services,api:{...config.services.api,environment:{...config.services.api.environment,CHANJET_ERP_INBOUND_SYNC_ENABLED:'true'}}}},verify.operationalTuple,verify,context),/POLICY_FLAGS/);
  } finally {Date.now=old;}
  for(const change of [{operation:'READONLY_ACTIVE'},{operation:'READONLY_VERIFY'},{runId:'legacy'},{target:'b'.repeat(40)}])assert.throws(()=>expiredVerifyHoldEnvironment(verify,{...context,...change},expiredNow));
  assert.throws(()=>expiredVerifyHoldEnvironment(verify,context,now),/HOLD_SCOPE/);
  for(const change of [{remoteWrite:true},{erpInbound:true},{sourceClassification:'UAT'}])assert.throws(()=>expiredVerifyHoldEnvironment({...verify,readonlyApproval:{...approval,...change}},context,expiredNow));
  assert.throws(()=>expiredVerifyHoldEnvironment({...verify,operationalTuple:{...verify.operationalTuple,CHANJET_ERP_INBOUND_SYNC_ENABLED:'true'}},context,expiredNow),/POLICY_FLAGS/);
  const next=switchPlan(verify,'HOLD',null,expiredNow);assert.equal(next.operationalTuple.CHANJET_READONLY_SYNC_ENABLED,'false');assert.equal(readonlyEnvironment(next,expiredNow).CHANJET_SYNC_POLICY,'HOLD');
});
