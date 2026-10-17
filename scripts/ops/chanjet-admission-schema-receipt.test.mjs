import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchemaReceipt, ADMISSION_PATH, ADMISSION_NAME } from './chanjet-admission-schema-receipt.mjs';
import { promotionPlan } from './promote-production-config-floor.mjs';
const scope={baseline:'a'.repeat(40),target:'b'.repeat(40),changed:[ADMISSION_PATH]};
const receipt={schema:'phoenix.chanjet-admission-schema/v1',outcome:'SUCCESS',baseline:scope.baseline,sourceSha:'c'.repeat(40),sourceBlob:'d'.repeat(40),migrationPath:ADMISSION_PATH,migrationName:ADMISSION_NAME,runId:'123-1',backupSha256:'e'.repeat(64),beforeLedgerSha256:'f'.repeat(64),afterLedgerSha256:'1'.repeat(64)};
test('only the exact successful admission receipt covers its original running API and source blob',()=>{
  assert.equal(validateSchemaReceipt(receipt,scope,receipt.sourceBlob),true);
  for(const change of [{outcome:'HOLD'},{baseline:'2'.repeat(40)},{sourceBlob:'3'.repeat(40)},{backupSha256:''},{migrationName:'OtherMigration'}])assert.throws(()=>validateSchemaReceipt({...receipt,...change},scope,receipt.sourceBlob));
  assert.throws(()=>validateSchemaReceipt(receipt,{...scope,changed:[ADMISSION_PATH,'apps/api/migrations/other.sql']},receipt.sourceBlob));
});
test('migration scope still blocks floor promotion without verified schema receipt',()=>{
  const actual={api:{revision:scope.baseline}};
  const input={previousFloor:{version:3,phase:'READY',floorSha:scope.baseline,chanjetPolicy:'HOLD',readonlyApproval:null,operationalTuple:{CHANJET_READONLY_SYNC_ENABLED:'false',CHANJET_ERP_INBOUND_SYNC_ENABLED:'false'}},previousActive:{version:3,floorSha:scope.baseline,outcome:'SUCCESS',active:actual},actual,target:scope.target,approvedSha:scope.target,runId:'123-1',scope,criticalFilesChanged:true,expectedPreviousFloorSha:scope.baseline};
  assert.throws(()=>promotionPlan(input));
  assert.equal(promotionPlan({...input,schemaApplied:true}).floor.floorSha,scope.target);
});
