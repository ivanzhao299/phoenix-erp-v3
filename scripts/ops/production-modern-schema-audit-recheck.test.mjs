import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {modernSchemaFixture} from '../ci/modern-schema-release.fixture.mjs';
import {compareStableLegacyAudit,modernSchemaMigrationEvidenceDigest} from './production-modern-schema-audit-recheck.mjs';
import {losslessJsonFacts} from './production-lossless-json.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const time=minute=>new Date(Date.UTC(2026,10,19,0,minute)).toISOString();
const seal=e=>({...e,evidenceSha256:canonicalDigest(e)});
function fixture(conclusion='HOLD'){
 const f=modernSchemaFixture(conclusion),context=f.context,identity={name:'owned-fixture',schema:'public',systemIdentifier:'1234567890123456789'};
 context.databaseIdentitySha256=canonicalDigest(identity);
 const g=f.frozen?.manifest.groups[0],b=g?.batches[0];
 const batch=g?{id:413,batch_no:b.batchNo,company_code:b.companyCode,warehouse_code:b.warehouseCode,product_code:b.productCode,sku_code:b.skuCode,source_no:b.sourceNo,
  qty:30,qty_available:30,source_type:'TEMP_PRODUCTION',material_code:null,egg_date:g.date,collection_batch_ref:'HOUSE-'+g.houseCode,grade_code_std:g.gradeCode,packaging_batch_ref:null,legacy_source:null}:null;
 const journal=b?{id:649,batch_no:b.batchNo,change_type:'TEMP_PRODUCTION_INBOUND',qty_change:30,company_code:b.companyCode,ref_no:b.sourceNo,sku_code:b.skuCode,warehouse_code:b.warehouseCode}:null;
 if(b){b.batchSha256=canonicalDigest(batch);b.ledgerSha256=canonicalDigest(journal);context.testManifestSha256=canonicalDigest(f.frozen.manifest);}
 const audit={checked_at:time(1),conclusion,daily_duplicate_groups:0,daily_unknown_identity_rows:0,daily_mixed_summary_groups:0,duplicate_source_groups:0,unbalanced_production_batches:0,legacy_daily_farm_in_rows:0,
  overposted_grade_groups:conclusion==='HOLD'?1:0,overposted_grades:g?[{log_date:g.date,house_code:g.houseCode,grade:g.gradeCode,reported_qty:0,inbound_qty:30,over_qty:30,inbound_batches:[batch],inbound_ledger:[journal]}]:[]};
 const originalAudit=JSON.stringify(audit),evidence={schema:'phoenix.legacy-egg-audit-evidence/v1',targetSha:context.targetSha,floorSha:context.floorSha,runningApiSha:context.runtimeSha,
  ledgerSha256:context.beforeLedgerSha256,observedLedgerSha256:context.beforeLedgerSha256,migrationEvidenceSha256:modernSchemaMigrationEvidenceDigest(context),databaseIdentity:identity,capturedAt:audit.checked_at,
  originalAuditSha256:sha(originalAudit),originalConclusion:conclusion,disposition:conclusion==='HOLD'?'HOLD':'ORIGINAL_AUDIT_GO',reason:conclusion==='HOLD'?'MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW':null,
  groups:f.frozen?.manifest.groups??null,referenceCoverage:conclusion==='HOLD'?{inspected:['inv_batches.descendants','sal_order_items','sal_order_item_batch_allocations','store_sale_allocations','wms_transfer_items','pkg_source_batches','fin_ar_invoices','fin_ap_invoices','chanjet_voucher_drafts'],missing:[],matches:[],uninspectedSources:[]}:null,
  manifestSha256:context.testManifestSha256,verifiedTestScope:false,releaseAuthorized:false};
 const reviewed={originalAudit,evidence:seal(evidence)};
 context.originalAuditSha256=reviewed.evidence.originalAuditSha256;context.auditEvidenceSha256=reviewed.evidence.evidenceSha256;
 const nextAudit={...audit,checked_at:time(5)},freshOriginalAudit=JSON.stringify(nextAudit),next={...evidence,capturedAt:nextAudit.checked_at,originalAuditSha256:sha(freshOriginalAudit)};
 return {context,reviewed,fresh:{originalAudit:freshOriginalAudit,evidence:seal(next)},frozenManifest:f.frozen?.manifest??null,sampleStartedAt:time(5),sampleFinishedAt:time(5)};
}
function resealFresh(f){const {evidenceSha256,...e}=f.fresh.evidence;f.fresh.evidence=seal(e);}
for(const conclusion of ['HOLD','GO'])test(`${conclusion} keeps both original reports while accepting a new checked_at with identical stable facts`,()=>{
 const f=fixture(conclusion),before=structuredClone(f),result=compareStableLegacyAudit(f);
 assert.equal(result.stable,true);assert.equal(result.releaseAuthorized,false);assert.equal(result.observationOnly,true);assert.equal(result.originalConclusion,conclusion);
 assert.notEqual(result.reviewedOriginalAuditSha256,result.freshOriginalAuditSha256);assert.deepEqual(f,before);
});
test('source audit or evidence cannot be substituted even with matching fresh claims',()=>{
 for(const change of [f=>f.context.originalAuditSha256='e'.repeat(64),f=>f.context.auditEvidenceSha256='e'.repeat(64),f=>f.reviewed.originalAudit+=' ']){
  const f=fixture();change(f);assert.throws(()=>compareStableLegacyAudit(f),/MODERN_SCHEMA_HOLD=/);
 }
});
test('stable ledger, database, source, references, groups and structural facts are rechecked',()=>{
 for(const change of [f=>f.fresh.evidence.observedLedgerSha256='e'.repeat(64),f=>f.fresh.evidence.databaseIdentity.schema='other',f=>f.fresh.evidence.targetSha='e'.repeat(40),
  f=>f.fresh.evidence.referenceCoverage.matches.push('sal_order_items'),f=>f.fresh.evidence.referenceCoverage.missing.push('fin_ar_invoices'),
  f=>f.fresh.evidence.referenceCoverage.uninspectedSources.push('unknown_view'),f=>f.fresh.evidence.referenceCoverage.inspected.pop(),
  f=>f.fresh.evidence.reason='MATCHING_FROZEN_TEST_MANIFEST_REQUIRED',f=>f.fresh.evidence.groups=[],f=>f.fresh.evidence.verifiedTestScope=true,f=>f.fresh.evidence.releaseAuthorized=true]){
  const f=fixture();change(f);resealFresh(f);assert.throws(()=>compareStableLegacyAudit(f),/MODERN_SCHEMA_HOLD=/);
 }
 const f=fixture(),audit=JSON.parse(f.fresh.originalAudit);audit.daily_duplicate_groups=1;f.fresh.originalAudit=JSON.stringify(audit);f.fresh.evidence.originalAuditSha256=sha(f.fresh.originalAudit);resealFresh(f);
 assert.throws(()=>compareStableLegacyAudit(f),/STRUCTURAL_HOLD/);
});
test('facts hidden behind regenerated digests still differ from the protected reviewed observation',()=>{
 const f=fixture(),audit=JSON.parse(f.fresh.originalAudit);audit.legacy_daily_farm_in_rows=1;f.fresh.originalAudit=JSON.stringify(audit);f.fresh.evidence.originalAuditSha256=sha(f.fresh.originalAudit);resealFresh(f);
 assert.throws(()=>compareStableLegacyAudit(f),/REVIEWED_AUDIT_FACTS_MOVED/);
});
test('old reads, backwards windows and reads beyond the owner window cannot serve as fenced evidence',()=>{
 for(const change of [f=>f.sampleStartedAt=time(6),f=>f.sampleFinishedAt=time(4),f=>f.sampleFinishedAt=time(20),f=>f.sampleStartedAt='invalid']){
  const f=fixture();change(f);assert.throws(()=>compareStableLegacyAudit(f),/TIME_UNVERIFIED/);
 }
});

test('two mutually matching summaries cannot omit any original raw anomalous group',()=>{
 for(const conclusion of ['HOLD','GO']){const f=fixture(conclusion);
  for(const name of ['reviewed','fresh']){const a=JSON.parse(f[name].originalAudit);if(conclusion==='HOLD')a.overposted_grade_groups=2;else a.overposted_grades=[{unexpected:true}];
   f[name].originalAudit=JSON.stringify(a);const {evidenceSha256,...e}=f[name].evidence;e.originalAuditSha256=sha(f[name].originalAudit);f[name].evidence=seal(e);}
  f.context.originalAuditSha256=f.reviewed.evidence.originalAuditSha256;f.context.auditEvidenceSha256=f.reviewed.evidence.evidenceSha256;
  assert.throws(()=>compareStableLegacyAudit(f),/RAW_AUDIT_GROUPS|ORIGINAL_AUDIT_GO/);
 }
});
test('numeric(18,6) movement cannot disappear through JavaScript number rounding',()=>{
 const f=fixture('GO');
 for(const [name,amount]of [['reviewed','100000000000.000020'],['fresh','100000000000.000021']]){
  f[name].originalAudit=f[name].originalAudit.slice(0,-1)+',"unit_cost":'+amount+'}';
  f[name].evidence.originalAuditSha256=sha(f[name].originalAudit);const {evidenceSha256,...e}=f[name].evidence;f[name].evidence=seal(e);
 }
 assert.equal(JSON.parse(f.reviewed.originalAudit).unit_cost,JSON.parse(f.fresh.originalAudit).unit_cost);
 f.context.originalAuditSha256=f.reviewed.evidence.originalAuditSha256;f.context.auditEvidenceSha256=f.reviewed.evidence.evidenceSha256;
 assert.throws(()=>compareStableLegacyAudit(f),/REVIEWED_AUDIT_FACTS_MOVED/);
});
test('lossless facts omit only a top-level timestamp and reject duplicate or malformed JSON',()=>{
 const a='{"checked_at":"old","nested":{"checked_at":"must stay","n":1.000001},"s":"quote \\\" comma ,"}';
 const b='{"s":"quote \\\" comma ,","nested":{"n":1.000001,"checked_at":"must stay"},"checked_at":"new"}';
 assert.deepEqual(losslessJsonFacts(a,{omitTopLevel:['checked_at']}),losslessJsonFacts(b,{omitTopLevel:['checked_at']}));
 assert.notDeepEqual(losslessJsonFacts(a,{omitTopLevel:['checked_at']}),losslessJsonFacts(b.replace('must stay','changed'),{omitTopLevel:['checked_at']}));
 for(const raw of ['{"x":1,"x":2}','[1,]','{"x":01}','{"x":NaN}','true trailing','{"x":"bad\\q"}'])assert.throws(()=>losslessJsonFacts(raw));
});

function fencedFixture(elapsed) {
 const f=fixture();
 const proof={schema:'phoenix.modern-schema-fenced-audit-observation/v1',owner:f.context.owner,contextDigest:canonicalDigest(f.context),
  phase:'R_STOPPED',generation:84,leaseSha256:'a'.repeat(64),ingressIdentitySha256:'b'.repeat(64),
  backgroundSha256:'c'.repeat(64),checkedAt:f.sampleStartedAt};
 f.sampleFinishedAt=new Date(Date.parse(f.sampleStartedAt)+elapsed).toISOString();
 f.fences={before:proof,after:{...proof,checkedAt:f.sampleFinishedAt}};
 return f;
}

test('the extended audit time applies only to two matching protected fenced observations',()=>{
 const f=fencedFixture(120000);
 const result=compareStableLegacyAudit(f);
 assert.deepEqual(result.fenceEvidence,{beforeSha256:canonicalDigest(f.fences.before),afterSha256:canonicalDigest(f.fences.after)});
 assert.equal(result.releaseAuthorized,false);
 delete f.fences;
 assert.throws(()=>compareStableLegacyAudit(f),/TIME_UNVERIFIED/);
 assert.throws(()=>compareStableLegacyAudit(fencedFixture(120001)),/TIME_UNVERIFIED/);
});

test('changed lease, generation or ingress and incomplete time evidence never extend the audit window',()=>{
 for(const mutate of [
  fences=>{delete fences.after;},fences=>{fences.after.leaseSha256='d'.repeat(64);},fences=>{fences.after.generation++;},
  fences=>{fences.after.ingressIdentitySha256='d'.repeat(64);},fences=>{fences.after.backgroundSha256='d'.repeat(64);},
  fences=>{fences.after.phase='DDL_STARTED';},fences=>{fences.before.checkedAt=time(6);},
  fences=>{fences.after.checkedAt=time(4);},fences=>{fences.after.checkedAt=time(12);},
 ]){
  const f=fencedFixture(98000);mutate(f.fences);
  assert.throws(()=>compareStableLegacyAudit(f),/FENCED_AUDIT_BOUNDARY_UNVERIFIED/);
 }
});
