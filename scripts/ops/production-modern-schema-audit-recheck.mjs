/** Compare a new fenced read with protected reviewed source evidence without
 * changing either original report. Stability is not release authority. */
import {createHash} from 'node:crypto';
import {canonicalDigest,HASH,same} from './production-maintenance-receipts.mjs';
import {observedLegacyEggGroups} from './production-legacy-egg-audit-evidence.mjs';
import {losslessJsonFacts} from './production-lossless-json.mjs';
import {validateModernSchemaContext,validateModernSchemaMigrationPlan,modernSchemaMigrationPlanFields} from './production-modern-schema-authority.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_HOLD='+code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const blockers=['daily_duplicate_groups','daily_unknown_identity_rows','daily_mixed_summary_groups','duplicate_source_groups','unbalanced_production_batches'];
export function modernSchemaMigrationEvidenceDigest(context){
 return canonicalDigest(validateModernSchemaMigrationPlan(Object.fromEntries(modernSchemaMigrationPlanFields.map(key=>[key,context[key]]))));
}
function auditEnvelope(value,context,frozenManifest){
 if(!record(value)||!record(value.evidence)||typeof value.originalAudit!=='string'||Buffer.byteLength(value.originalAudit)>8*1024*1024)fail('ORIGINAL_AUDIT_BYTES_REQUIRED');
 const evidence=structuredClone(value.evidence),{evidenceSha256,...signed}=evidence;
 if(canonicalDigest(signed)!==evidenceSha256||evidence.originalAuditSha256!==hash(value.originalAudit))fail('AUDIT_EVIDENCE_DIGEST_MISMATCH');
 let audit;try{audit=JSON.parse(value.originalAudit);}catch{fail('ORIGINAL_AUDIT_JSON_REQUIRED');}
 if(!record(audit)||evidence.schema!=='phoenix.legacy-egg-audit-evidence/v1'||audit.conclusion!==context.originalConclusion
  ||evidence.originalConclusion!==audit.conclusion||evidence.targetSha!==context.targetSha||evidence.floorSha!==context.floorSha||evidence.runningApiSha!==context.runtimeSha
  ||evidence.ledgerSha256!==context.beforeLedgerSha256||evidence.observedLedgerSha256!==context.beforeLedgerSha256
  ||canonicalDigest(evidence.databaseIdentity)!==context.databaseIdentitySha256||evidence.migrationEvidenceSha256!==modernSchemaMigrationEvidenceDigest(context)
  ||evidence.capturedAt!==audit.checked_at||!Number.isFinite(Date.parse(audit.checked_at))||!blockers.every(key=>audit[key]===0)
  ||evidence.verifiedTestScope!==false||evidence.releaseAuthorized!==false)fail('AUDIT_BINDING_OR_STRUCTURAL_HOLD');
 if(context.originalConclusion==='GO'){
  if(audit.overposted_grade_groups!==0||!Array.isArray(audit.overposted_grades)||audit.overposted_grades.length!==0||evidence.disposition!=='ORIGINAL_AUDIT_GO'||evidence.reason!==null
   ||evidence.groups!==null||evidence.referenceCoverage!==null||evidence.manifestSha256!==null||frozenManifest!==null)fail('ORIGINAL_AUDIT_GO_UNVERIFIED');
 }else{
  if(evidence.disposition!=='HOLD'||evidence.reason!=='MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW'
   ||!Number.isSafeInteger(audit.overposted_grade_groups)||audit.overposted_grade_groups<1
   ||!record(frozenManifest)||canonicalDigest(frozenManifest)!==context.testManifestSha256
   ||evidence.manifestSha256!==context.testManifestSha256||!Array.isArray(evidence.groups)||!evidence.groups.length
   ||!same(evidence.groups,frozenManifest.groups))fail('FROZEN_LEGACY_CLAIM_UNVERIFIED');
  let groups;try{groups=observedLegacyEggGroups(audit);}catch{fail('RAW_AUDIT_GROUPS_UNVERIFIED');}
  if(!groups||!same(groups,evidence.groups)||!same(groups,frozenManifest.groups))fail('RAW_AUDIT_GROUPS_UNVERIFIED');
  const coverage=evidence.referenceCoverage;
  if(!record(coverage)||!['missing','matches','uninspectedSources'].every(key=>Array.isArray(coverage[key])&&coverage[key].length===0)
   ||!Array.isArray(coverage.inspected)||!coverage.inspected.length||new Set(coverage.inspected).size!==coverage.inspected.length
   ||!['inv_batches.descendants','sal_order_items','sal_order_item_batch_allocations','store_sale_allocations','wms_transfer_items','pkg_source_batches','fin_ar_invoices','fin_ap_invoices','chanjet_voucher_drafts']
    .every(table=>coverage.inspected.includes(table)))fail('REFERENCE_COVERAGE_UNVERIFIED');
 }
 let exactFacts;try{exactFacts=losslessJsonFacts(value.originalAudit,{omitTopLevel:['checked_at']});}catch{fail('LOSSLESS_RAW_AUDIT_REQUIRED');}
 return {audit,evidence,exactFacts};
}
const ONLINE_AUDIT_MS=30_000;
const FENCED_AUDIT_MS=120_000;
const FENCE_OBSERVATION_SKEW_MS=20_000;
function fencedAuditEvidence(fences,context,start,finish){
 const {before,after}=fences??{};
 const valid=proof=>record(proof)&&proof.schema==='phoenix.modern-schema-fenced-audit-observation/v1'&&
  proof.owner===context.owner&&proof.contextDigest===canonicalDigest(context)&&['R_STOPPED','BACKUP_VERIFIED'].includes(proof.phase)&&
  Number.isSafeInteger(proof.generation)&&proof.generation>0&&HASH.test(proof.leaseSha256??'')&&
  HASH.test(proof.ingressIdentitySha256??'')&&HASH.test(proof.backgroundSha256??'');
 if(!valid(before)||!valid(after))fail('FENCED_AUDIT_BOUNDARY_UNVERIFIED');
 const {checkedAt:beforeTime,...initial}=before,{checkedAt:afterTime,...last}=after;
 const lower=Date.parse(beforeTime),upper=Date.parse(afterTime);
 if(!same(initial,last)||![lower,upper].every(Number.isFinite)||lower<Date.parse(context.window.start)||
  upper>=Date.parse(context.window.end)||lower>start||upper<finish||start-lower>FENCE_OBSERVATION_SKEW_MS||
  upper-finish>FENCE_OBSERVATION_SKEW_MS)fail('FENCED_AUDIT_BOUNDARY_UNVERIFIED');
 return {beforeSha256:canonicalDigest(before),afterSha256:canonicalDigest(after)};
}
export function compareStableLegacyAudit({context:input,reviewed,fresh,frozenManifest=null,sampleStartedAt,sampleFinishedAt,fences}){
 const context=validateModernSchemaContext(input),source=auditEnvelope(reviewed,context,frozenManifest),current=auditEnvelope(fresh,context,frozenManifest);
 if(source.evidence.originalAuditSha256!==context.originalAuditSha256||source.evidence.evidenceSha256!==context.auditEvidenceSha256)fail('REGISTERED_SOURCE_AUDIT_MISMATCH');
 const start=Date.parse(sampleStartedAt),finish=Date.parse(sampleFinishedAt),captured=Date.parse(current.evidence.capturedAt);
 const fenceEvidence=fences===undefined?null:fencedAuditEvidence(fences,context,start,finish);
 const timeLimit=fenceEvidence?FENCED_AUDIT_MS:ONLINE_AUDIT_MS;
 if(![start,finish,captured].every(Number.isFinite)||finish<start||finish-start>timeLimit||start<Date.parse(context.window.start)
  ||finish>=Date.parse(context.window.end)||captured<start-3000||captured>finish+3000)fail('FRESH_FENCED_AUDIT_TIME_UNVERIFIED');
 const stableEvidence=({capturedAt,originalAuditSha256,evidenceSha256,...facts})=>facts;
 if(!same(source.exactFacts,current.exactFacts)||!same(stableEvidence(source.evidence),stableEvidence(current.evidence)))fail('REVIEWED_AUDIT_FACTS_MOVED');
 return {schema:'phoenix.modern-schema-audit-recheck/v1',contextDigest:canonicalDigest(context),reviewedOriginalAuditSha256:source.evidence.originalAuditSha256,
  freshOriginalAuditSha256:current.evidence.originalAuditSha256,stableAuditSha256:canonicalDigest(current.exactFacts),
  stableEvidenceSha256:canonicalDigest(stableEvidence(current.evidence)),originalConclusion:context.originalConclusion,
  sampleStartedAt,sampleFinishedAt,...(fenceEvidence?{fenceEvidence}:{}),stable:true,observationOnly:true,releaseAuthorized:false};
}
