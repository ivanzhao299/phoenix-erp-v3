import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {assertModernSchemaWindowBudget,createModernSchemaFirstHoldEvidence} from './production-modern-schema-supervisor.mjs';
import {captureModernSchemaCatalog} from './production-modern-schema-catalog.mjs';
import {compareStableLegacyAudit,modernSchemaMigrationEvidenceDigest} from './production-modern-schema-audit-recheck.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';

test('the fenced database sample reserves two further scans and release overhead before DDL',()=>{
 const end='2026-11-20T00:30:00.000Z',deadline=Date.parse(end),factsElapsedMs=191329;
 const reserve=Math.ceil(factsElapsedMs*2*1.15)+240000;
 assert.doesNotThrow(()=>assertModernSchemaWindowBudget({end,factsElapsedMs,operation:'ddl'},deadline-reserve));
 for(const inputs of [
  {end,factsElapsedMs}, {end,factsElapsedMs:null}, {end,factsElapsedMs:-1}, {end:'invalid',factsElapsedMs},
 ]){
  assert.throws(()=>assertModernSchemaWindowBudget({...inputs,operation:'ddl'},deadline-reserve+1),/INSUFFICIENT_WINDOW_BEFORE_DDL/);
 }
});

test('rehearsal retains a separate window for two recovery scans before the original API can reopen',()=>{
 const end='2026-11-20T00:30:00.000Z',deadline=Date.parse(end),factsElapsedMs=191329;
 const reserve=Math.ceil(factsElapsedMs*2*1.15)+150000;
 assert.doesNotThrow(()=>assertModernSchemaWindowBudget({end,factsElapsedMs,operation:'recoverOriginal'},deadline-reserve));
 assert.throws(()=>assertModernSchemaWindowBudget({end,factsElapsedMs,operation:'recoverOriginal'},deadline-reserve+1),/INSUFFICIENT_WINDOW_TO_RECOVER_ORIGINAL/);
});

test('the first watcher failure keeps its fenced audit stage when a later stage fails',()=>{
 let clock=0;
 const evidence=createModernSchemaFirstHoldEvidence(()=>clock);
 clock=12;evidence.enter('R_STOPPED_STEP');
 clock=18;evidence.enter('FRESH_CONFIRMED_SCOPE');
 clock=8041;evidence.enter('FRESH_AUDIT_EVIDENCE');
 clock=15040;
 const first=evidence.record(Error('MODERN_SCHEMA_EXECUTORS_HOLD=UNKNOWN_DATABASE_APPLY_OR_EXTENSION_WORKER'),'EXECUTOR_WATCH');
 assert.deepEqual(first,{source:'EXECUTOR_WATCH',code:'MODERN_SCHEMA_EXECUTORS_HOLD=UNKNOWN_DATABASE_APPLY_OR_EXTENSION_WORKER',
  stage:'FRESH_AUDIT_EVIDENCE',elapsedMs:6999,priorStages:[
   {stage:'BEFORE_STOPPED_PROOF',elapsedMs:12},{stage:'R_STOPPED_STEP',elapsedMs:6},{stage:'FRESH_CONFIRMED_SCOPE',elapsedMs:8023},
  ]});
 clock=30027;evidence.enter('FRESH_AUDIT_COMPARE');
 assert.strictEqual(evidence.record(Error('MODERN_SCHEMA_HOLD=FRESH_FENCED_AUDIT_TIME_UNVERIFIED'),'SUPERVISOR'),first);
 assert.equal(Object.isFrozen(first.priorStages),true);
});

test('the audit time-check failure and a later ledger failure have distinct fixed diagnostics',()=>{
 for(const [stage,code] of [
  ['FRESH_AUDIT_COMPARE','MODERN_SCHEMA_HOLD=FRESH_FENCED_AUDIT_TIME_UNVERIFIED'],
  ['FRESH_LEDGER','MODERN_SCHEMA_SUPERVISOR_HOLD=FENCED_LEDGER_CHANGED'],
 ]){
  const evidence=createModernSchemaFirstHoldEvidence(()=>0);
  evidence.enter(stage);
  assert.deepEqual(evidence.record(Error(code),'SUPERVISOR'),{
   source:'SUPERVISOR',stage,code,elapsedMs:0,priorStages:[{stage:'BEFORE_STOPPED_PROOF',elapsedMs:0}],
  });
 }
});

test('the complete fenced audit still admits 30 seconds and refuses one millisecond more',()=>{
 const {context}=modernSchemaFixture('GO'),identity={name:'audit-fixture',schema:'public',systemIdentifier:'123'};
 context.databaseIdentitySha256=canonicalDigest(identity);
 const checked=Date.parse(context.window.start)+60000,at=ms=>new Date(ms).toISOString();
 const audit=capturedAt=>{
  const originalAudit=JSON.stringify({checked_at:capturedAt,conclusion:'GO',daily_duplicate_groups:0,daily_unknown_identity_rows:0,
   daily_mixed_summary_groups:0,duplicate_source_groups:0,unbalanced_production_batches:0,overposted_grade_groups:0,overposted_grades:[]});
  const evidence={schema:'phoenix.legacy-egg-audit-evidence/v1',targetSha:context.targetSha,floorSha:context.floorSha,runningApiSha:context.runtimeSha,
   ledgerSha256:context.beforeLedgerSha256,observedLedgerSha256:context.beforeLedgerSha256,databaseIdentity:identity,
   migrationEvidenceSha256:modernSchemaMigrationEvidenceDigest(context),capturedAt,originalAuditSha256:createHash('sha256').update(originalAudit).digest('hex'),
   originalConclusion:'GO',disposition:'ORIGINAL_AUDIT_GO',reason:null,groups:null,referenceCoverage:null,manifestSha256:null,
   verifiedTestScope:false,releaseAuthorized:false};
  return {originalAudit,evidence:{...evidence,evidenceSha256:canonicalDigest(evidence)}};
 };
 const reviewed=audit(at(checked-1000)),fresh=audit(at(checked));
 context.originalAuditSha256=reviewed.evidence.originalAuditSha256;
 context.auditEvidenceSha256=reviewed.evidence.evidenceSha256;
 const sample={context,reviewed,fresh,sampleStartedAt:at(checked),sampleFinishedAt:at(checked+30000)};
 assert.equal(compareStableLegacyAudit(sample).stable,true);
 assert.throws(()=>compareStableLegacyAudit({...sample,sampleFinishedAt:at(checked+30001)}),/FRESH_FENCED_AUDIT_TIME_UNVERIFIED/);
});

test('a failed before-catalog admission is observable before any output file is opened',async()=>{
 const evidence=createModernSchemaFirstHoldEvidence(()=>0);
 evidence.enter('BEFORE_CATALOG_ADMISSION');
 const failure=Error('MODERN_SCHEMA_LEASE_HOLD=ORIGINAL_NATIVE_SESSION_LOST');
 await assert.rejects(captureModernSchemaCatalog({
  owner:'1234-1',stage:'before',databasePin:{id:'a'.repeat(64)},directory:'/synthetic',
  privateRuntime:{guard(){},run:()=>assert.fail('raw output must not be opened')},
  admit:async()=>{throw failure;},
 }),error=>error===failure);
 assert.equal(evidence.record(failure,'SUPERVISOR').stage,'BEFORE_CATALOG_ADMISSION');
});

test('catalog output reports only fixed filesystem codes and never error or SQL content',()=>{
 for(const [stage,error,code] of [
  ['BEFORE_CATALOG_OUTPUT',Object.assign(Error('private path containing native output'),{code:'ENOSPC'}),'CATALOG_FILE_ENOSPC'],
  ['FRESH_AUDIT_EVIDENCE',Error('MODERN_SCHEMA_READ_HOLD=NOT_AN_APPROVED_CODE'),'UNCLASSIFIED'],
  ['FRESH_LEDGER',Error('SELECT sensitive_value FROM private_rows'),'UNCLASSIFIED'],
  ['BEFORE_CATALOG_RECEIPT',{get message(){throw Error('private error getter');}},'UNCLASSIFIED'],
 ]){
  const evidence=createModernSchemaFirstHoldEvidence(()=>0);
  evidence.enter(stage);
  const reason=evidence.record(error,'SUPERVISOR');
  assert.equal(reason.code,code);
  assert.doesNotMatch(JSON.stringify(reason),/private |SELECT|NOT_AN_APPROVED_CODE/);
 }
});

test('a host executor hold records only numeric identity, fixed families and digests',()=>{
 const error=Object.assign(Error('MODERN_SCHEMA_WATCH_HOLD=NEW_OR_CHANGED_HOST_EXECUTOR'),{
  nativeHostProcess:{pid:200,ppid:1,kind:'PYTHON',parentKind:'OTHER',identitySha256:'a'.repeat(64),argvSha256:'b'.repeat(64),
   groupSha256:'c'.repeat(64),erpControlReference:false,registeredParent:false,ownedDumpParent:true,argv:'private command'},
 });
 const hold=createModernSchemaFirstHoldEvidence(()=>0).record(error,'EXECUTOR_WATCH');
 assert.equal(hold.nativeHostProcess.ownedDumpParent,true);
 assert.equal(hold.nativeHostProcess.parentKind,'OTHER');
 assert.doesNotMatch(JSON.stringify(hold),/private command/);
 error.nativeHostProcess.kind='private unexpected kind';
 assert.equal(createModernSchemaFirstHoldEvidence(()=>0).record(error,'EXECUTOR_WATCH').nativeHostProcess,undefined);
});

test('early native failure records its guarded transition without logging error contents',()=>{
 for(const [stage,error,code,type] of [
  ['DRAINED_COMMIT',Error('HANDOFF_TRANSFER_HOLD=INGRESS_CHANGED'),'HANDOFF_TRANSFER_HOLD=INGRESS_CHANGED',undefined],
  ['PRIMARY_READ_CHANNEL',Error('MODERN_SCHEMA_WATCH_HOLD=ORIGINAL_OWNED_READ_CHANNEL_REQUIRED'),'MODERN_SCHEMA_WATCH_HOLD=ORIGINAL_OWNED_READ_CHANNEL_REQUIRED',undefined],
  ['NATIVE_WATCH_INITIALIZE',new TypeError('private executor information'),'UNCLASSIFIED','TypeError'],
  ['NATIVE_FENCE_BUDGET',Error('MODERN_SCHEMA_SUPERVISOR_HOLD=INSUFFICIENT_WINDOW_BEFORE_FENCE'),'MODERN_SCHEMA_SUPERVISOR_HOLD=INSUFFICIENT_WINDOW_BEFORE_FENCE',undefined],
 ]){
  const evidence=createModernSchemaFirstHoldEvidence(()=>0);
  evidence.enter(stage);
  const recorded=evidence.record(error,'SUPERVISOR');
  assert.equal(recorded.stage,stage);
  assert.equal(recorded.code,code);
  assert.equal(recorded.errorType,type);
  assert.doesNotMatch(JSON.stringify(recorded),/private executor/);
 }
});
