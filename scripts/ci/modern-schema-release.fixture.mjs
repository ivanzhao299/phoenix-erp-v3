/** Synthetic authority data for local contract tests only. No production registration. */
import {canonicalDigest} from '../ops/production-maintenance-receipts.mjs';
import {MODERN_SCHEMA_SCOPE,MODERN_SCHEMA_CONTEXT} from '../ops/production-modern-schema-authority.mjs';
const hash=c=>c.repeat(64),sha=c=>c.repeat(40),time=n=>new Date(Date.UTC(2026,10,19,0,n)).toISOString();
export function modernSchemaFixture(conclusion='HOLD'){
 const manifest={schema:'phoenix.legacy-egg-test-manifest/v1',classification:'HISTORICAL_TEST',businessEvidenceSha256:hash('2'),groups:[{date:'2026-11-18',houseCode:'OWNED-HOUSE',gradeCode:'G4',quantity:30,batches:[{batchNo:'OWNED-BATCH',companyCode:'OWNED-COMPANY',warehouseCode:'OWNED-WH',productCode:'OWNED-PRODUCT',skuCode:'OWNED-SKU',sourceNo:'OWNED-SOURCE',quantity:30,batchSha256:hash('c'),ledgerSha256:hash('d')}]}]};
 const context={schema:MODERN_SCHEMA_CONTEXT,owner:'1234-1',floorSha:sha('a'),runtimeSha:sha('b'),targetSha:sha('c'),window:{start:time(0),end:time(20)},
  databaseIdentitySha256:hash('a'),runtimeSnapshotSha256:hash('b'),candidateImageId:'sha256:'+hash('c'),candidateInventorySha256:hash('d'),sourceInventorySha256:hash('e'),runtimeInventorySha256:hash('f'),beforeLedgerSha256:hash('1'),
  pendingMigrations:[{path:'apps/api/src/database/migrations/1795029621917-ProductionCutoverExecutionAdmissions.ts',sourceBlob:sha('d'),timestamp:1795029621917,effectiveName:'ProductionCutoverExecutionAdmissions1795029621917',compiledSha256:hash('3')}],
  changedMigrationPaths:['apps/api/src/database/migrations/1795029621917-ProductionCutoverExecutionAdmissions.ts'],originalAuditSha256:hash('4'),originalConclusion:conclusion,auditEvidenceSha256:hash('5'),testManifestSha256:conclusion==='HOLD'?canonicalDigest(manifest):null,
  oldRuntimeCompatibilitySha256:hash('6'),defaultOffEvidenceSha256:hash('7'),ingressScopeSha256:hash('8')};
 const frozen=conclusion==='HOLD'?{schema:'phoenix.registered-frozen-legacy-test-scope/v1',owner:context.owner,authorizationOrigin:'TRUSTED_INTERACTIVE_USER',authorizationDigest:hash('9'),manifest,manifestSha256:context.testManifestSha256,businessEvidenceSha256:manifest.businessEvidenceSha256,frozenAt:time(0),custodian:'owned-custodian',technicalReviewer:'owned-independent-reviewer'}:null;
 const grant={schema:'phoenix.modern-schema-release-approval/v1',repository:'ivanzhao299/phoenix-erp-v3',authorizationOrigin:'TRUSTED_INTERACTIVE_USER',authorizationRef:'MODERN_DEFAULT_OFF_SCHEMA_RELEASE',authorizationDigest:hash('1'),context:structuredClone(context),contextDigest:canonicalDigest(context),scope:structuredClone(MODERN_SCHEMA_SCOPE),sourceReviewSha256:hash('a'),frozenRegistrationSha256:frozen?canonicalDigest(frozen):null,
  technicalReview:{reviewer:'owned-independent-reviewer',kind:'TECHNICAL_CHECK',humanApproval:false,reviewedAt:time(1),decision:conclusion==='HOLD'?'PASS_ONLY_FROZEN_LEGACY_DIFFERENCE':'PASS_ORIGINAL_GO',originalAuditSha256:context.originalAuditSha256,auditEvidenceSha256:context.auditEvidenceSha256,testManifestSha256:context.testManifestSha256,custodyEvidenceSha256:hash('b')},registeredAt:time(2),expiresAt:context.window.end};
 return {context,grant,frozen};
}

import {CONFIRMED_MODERN_SCHEMA_DIRECTIVE} from '../ops/production-modern-schema-confirmed-scope.mjs';
export function fixedScopeFixture(){
 const source='DAILY-2026-11-17-HOUSE_MS_01-4c5f2ca',company='COMP-LAO-AGRI';
 const groups=[['GRADE_4',413,'EGG-20261117-00005',649],['GRADE_5',415,'EGG-20261117-00007',651]].map(([grade,id,batchNo,ledgerId])=>({
  log_date:'2026-11-17',house_code:'HOUSE_MS_01',grade,reported_qty:0,inbound_qty:30,over_qty:30,
  inbound_batches:[{id,batch_no:batchNo,company_code:company,warehouse_code:'LPH_MS_EGG_FARM',location_code:'MSCSKW001',product_code:grade==='GRADE_4'?'PRD-EGG-4':'PRD-EGG-5',sku_code:grade==='GRADE_4'?'SKU-4-LOOSE':'SKU-5-LOOSE',source_no:source,
   qty:30,qty_available:30,source_type:'TEMP_PRODUCTION',material_code:null,egg_date:'2026-11-17',collection_batch_ref:'HOUSE-HOUSE_MS_01',grade_code_std:grade,packaging_batch_ref:null,legacy_source:null}],
  inbound_ledger:[{id:ledgerId,batch_no:batchNo,log_date:'2026-11-17',change_type:'TEMP_PRODUCTION_INBOUND',qty_change:30,company_code:company,ref_no:source,sku_code:grade==='GRADE_4'?'SKU-4-LOOSE':'SKU-5-LOOSE',warehouse_code:'LPH_MS_EGG_FARM'}],
 }));
 return {sourceDirectiveSha256:canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE),originalAudit:JSON.stringify({conclusion:'HOLD',checked_at:'2026-11-19T00:00:00.000Z',daily_duplicate_groups:0,daily_unknown_identity_rows:0,
  daily_mixed_summary_groups:0,duplicate_source_groups:0,unbalanced_production_batches:0,overposted_grade_groups:2,overposted_grades:groups}),
  dailyRowsRaw:JSON.stringify([{id:106,log_date:'2026-11-17',house_code:'HOUSE_MS_01',shift:'DAILY',eggs_by_grade:{GRADE_0:540,GRADE_1:11880,GRADE_2:32760,GRADE_3:1980,DIRTY:540,BROKEN:230}}])};
}
