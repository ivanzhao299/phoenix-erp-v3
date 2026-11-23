/** Protected, independently registered approval for modern schema-before-API
 * releases. No registration CLI, environment approval or business activation.
 * A matching legacy-evidence claim is never an approval. */
import fs from 'node:fs';
import path from 'node:path';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {inspectTrustedDirectory,assertSameDirectory,readPinnedFile} from './production-trusted-paths.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {LEGACY_EGG_SCOPE_CLASSIFICATIONS} from './production-legacy-egg-audit-evidence.mjs';
import {INITIAL_MODERN_SCHEMA_PROFILE} from './production-modern-schema-facts.mjs';
import {successorBinding,successorPlan,successorRuntime,successorTransportCeilingMs} from './production-modern-schema-successor.mjs';
const SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/,OWNER=/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/;
const token=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,199}$/.test(value);
const record=value=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value'));
const exact=(value,fields)=>record(value)&&same(Object.keys(value).sort(),[...fields].sort());
const match=(pattern,value)=>typeof value==='string'&&pattern.test(value);
const iso=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString()===value;
const fail=code=>{throw Error('MODERN_SCHEMA_HOLD='+code);};
const pathPattern=/^apps\/api\/src\/database\/migrations\/(\d{13})-([A-Za-z][A-Za-z0-9]*)\.ts$/;
export const MODERN_SCHEMA_SCOPE=Object.freeze({schemaMigration:true,deployMode:'api',buildApi:true,buildWeb:false,runDeployMigration:false,
  featureRollout:'OFF',chanjetPolicy:'HOLD',legacyFirstSwitch:false,automaticRollback:false,businessCutover:false});
export const MODERN_SCHEMA_CONTEXT='phoenix.modern-schema-release-context/v1';
// The frozen initial profile needs the measured backup and rehearsal time,
// plus the separate original-recovery or DDL completion reserve.
export const INITIAL_MODERN_SCHEMA_WINDOW_MS=180*60*1000;
const INITIAL_HISTORICAL_WINDOWS_MS=[55,80].map(minutes=>minutes*60*1000);
const contextFields=['schema','owner','floorSha','runtimeSha','targetSha','window','databaseIdentitySha256','runtimeSnapshotSha256',
  'candidateImageId','candidateInventorySha256','sourceInventorySha256','runtimeInventorySha256','beforeLedgerSha256','pendingMigrations','changedMigrationPaths',
  'originalAuditSha256','originalConclusion','auditEvidenceSha256','testManifestSha256','oldRuntimeCompatibilitySha256','defaultOffEvidenceSha256','ingressScopeSha256'];
export function validateModernSchemaContext(value){
 if(!exact(value,contextFields)||value.schema!==MODERN_SCHEMA_CONTEXT||!match(OWNER,value.owner)
  ||![value.floorSha,value.runtimeSha,value.targetSha].every(sha=>match(SHA,sha))||value.runtimeSha===value.targetSha||value.floorSha===value.targetSha
  ||!exact(value.window,['start','end'])||![value.window.start,value.window.end].every(iso)
  ||Date.parse(value.window.end)<=Date.parse(value.window.start)
  ||!match(/^sha256:[a-f0-9]{64}$/,value.candidateImageId))fail('EXACT_CONTEXT_REQUIRED');
 const hashes=['databaseIdentitySha256','runtimeSnapshotSha256','candidateInventorySha256','sourceInventorySha256','runtimeInventorySha256','beforeLedgerSha256',
  'originalAuditSha256','auditEvidenceSha256','oldRuntimeCompatibilitySha256','defaultOffEvidenceSha256','ingressScopeSha256'];
 if(!hashes.every(key=>match(HASH,value[key]))||!['GO','HOLD'].includes(value.originalConclusion)
  ||(value.originalConclusion==='HOLD'?!match(HASH,value.testManifestSha256):value.testManifestSha256!==null))fail('EXACT_REVIEW_EVIDENCE_REQUIRED');
 validateModernSchemaMigrationPlan(Object.fromEntries(modernSchemaMigrationPlanFields.map(key=>[key,value[key]])));
 const duration=Date.parse(value.window.end)-Date.parse(value.window.start),profile=INITIAL_MODERN_SCHEMA_PROFILE;
 if(value.runtimeSha===successorRuntime)successorBinding(value.floorSha,value);
 if(value.runtimeSha===successorRuntime && (!successorPlan(value)||value.originalConclusion!=='HOLD'||duration>successorTransportCeilingMs))fail('EXACT_SUCCESSOR_REQUIRED');
 if(value.runtimeSha!==successorRuntime&&duration>30*60*1000&&(![INITIAL_MODERN_SCHEMA_WINDOW_MS,...INITIAL_HISTORICAL_WINDOWS_MS].includes(duration)||value.originalConclusion!=='HOLD'||
  value.floorSha!==profile.floorSha||value.runtimeSha!==profile.runtimeSha||value.pendingMigrations.length!==profile.pendingCount||
  value.sourceInventorySha256!==profile.sourceInventorySha256||value.runtimeInventorySha256!==profile.runtimeInventorySha256||
  !same(value.pendingMigrations.map(unit=>unit.path).sort(),value.changedMigrationPaths)))fail('EXACT_CONTEXT_REQUIRED');
 return structuredClone(value);
}
export const modernSchemaMigrationPlanFields=Object.freeze(['targetSha','runtimeSha','beforeLedgerSha256','candidateImageId','candidateInventorySha256','sourceInventorySha256','runtimeInventorySha256','pendingMigrations','changedMigrationPaths']);
export function validateModernSchemaMigrationPlan(value){
 if(!exact(value,modernSchemaMigrationPlanFields)||![value.targetSha,value.runtimeSha].every(sha=>match(SHA,sha))||value.targetSha===value.runtimeSha
  ||!match(/^sha256:[a-f0-9]{64}$/,value.candidateImageId)||!['beforeLedgerSha256','candidateInventorySha256','sourceInventorySha256','runtimeInventorySha256'].every(key=>match(HASH,value[key])))fail('EXACT_MIGRATION_PLAN_REQUIRED');
 if(!Array.isArray(value.pendingMigrations)||!value.pendingMigrations.length||value.pendingMigrations.length>256)fail('COMPLETE_PENDING_SET_REQUIRED');
 const timestamps=new Set(),names=new Set(),paths=new Set();let previous=0;
 for(const unit of value.pendingMigrations){
  if(!exact(unit,['path','sourceBlob','timestamp','effectiveName','compiledSha256']))fail('EXACT_PENDING_UNIT_REQUIRED');
  const parsed=typeof unit.path==='string'&&pathPattern.exec(unit.path);
  if(!parsed||!match(SHA,unit.sourceBlob)||!match(HASH,unit.compiledSha256)
   ||!Number.isSafeInteger(unit.timestamp)||unit.timestamp!==Number(parsed[1])||unit.timestamp<=previous
   ||unit.effectiveName!==parsed[2]+parsed[1]||timestamps.has(unit.timestamp)||names.has(unit.effectiveName)||paths.has(unit.path))fail('EXACT_PENDING_UNIT_REQUIRED');
  previous=unit.timestamp;timestamps.add(unit.timestamp);names.add(unit.effectiveName);paths.add(unit.path);
 }
 const changed=value.changedMigrationPaths;
 if(!Array.isArray(changed)||!changed.length||changed.length>258||new Set(changed).size!==changed.length
  ||!same([...changed].sort(),changed)||!changed.every(file=>typeof file==='string'&&(pathPattern.test(file)||['scripts/db-migrate.sh','scripts/deploy-schema-first.sh'].includes(file))))fail('EXACT_CHANGED_MIGRATION_SCOPE_REQUIRED');
 return structuredClone(value);
}
function checkWindow(context,now){
 if(!Number.isSafeInteger(now)||now<Date.parse(context.window.start)||now>=Date.parse(context.window.end))fail('APPROVAL_WINDOW_CLOSED');
}
/** Called only on a protected registration, never on a dispatch-supplied JSON. */
export function validateRegisteredModernSchemaApproval(grant,input,now=Date.now()){
 const context=validateModernSchemaContext(input);checkWindow(context,now);
 const fields=['schema','repository','authorizationOrigin','authorizationRef','authorizationDigest','context','contextDigest','scope','sourceReviewSha256',
  'frozenRegistrationSha256','technicalReview','registeredAt','expiresAt'];
 if(!exact(grant,fields)||grant.schema!=='phoenix.modern-schema-release-approval/v1'||grant.repository!=='ivanzhao299/phoenix-erp-v3'
  ||grant.authorizationOrigin!==(context.runtimeSha===successorRuntime?'DELEGATED_WORKFLOW_DISPATCH':'TRUSTED_INTERACTIVE_USER')||grant.authorizationRef!==(context.runtimeSha===successorRuntime?'REMEDIATION_1123_USER_WINDOW':'MODERN_DEFAULT_OFF_SCHEMA_RELEASE')
  ||!match(HASH,grant.authorizationDigest)||!match(HASH,grant.sourceReviewSha256)||!same(grant.context,context)
  ||grant.contextDigest!==canonicalDigest(context)||!same(grant.scope,MODERN_SCHEMA_SCOPE)
  ||!iso(grant.registeredAt)||Date.parse(grant.registeredAt)>now||grant.expiresAt!==context.window.end
  ||(context.originalConclusion==='HOLD'?!match(HASH,grant.frozenRegistrationSha256):grant.frozenRegistrationSha256!==null))fail('REGISTERED_APPROVAL_REQUIRED');
 const review=grant.technicalReview;
 if(!exact(review,['reviewer','kind','humanApproval','reviewedAt','decision','originalAuditSha256','auditEvidenceSha256','testManifestSha256','custodyEvidenceSha256'])
  ||!token(review.reviewer)||review.kind!=='TECHNICAL_CHECK'||review.humanApproval!==false||!iso(review.reviewedAt)||Date.parse(review.reviewedAt)>Date.parse(grant.registeredAt)
  ||review.decision!==(context.originalConclusion==='HOLD'?'PASS_ONLY_FROZEN_LEGACY_DIFFERENCE':'PASS_ORIGINAL_GO')
  ||review.originalAuditSha256!==context.originalAuditSha256||review.auditEvidenceSha256!==context.auditEvidenceSha256
  ||review.testManifestSha256!==context.testManifestSha256||!match(HASH,review.custodyEvidenceSha256))fail('INDEPENDENT_REVIEW_REQUIRED');
 return true;
}
function frozenManifest(value){
 if(!exact(value,['schema','classification','businessEvidenceSha256','groups'])||value.schema!=='phoenix.legacy-egg-test-manifest/v1'
  ||!LEGACY_EGG_SCOPE_CLASSIFICATIONS.includes(value.classification)||!match(HASH,value.businessEvidenceSha256)||!Array.isArray(value.groups)||!value.groups.length||value.groups.length>256)return false;
 const seenGroups=new Set(),seenBatches=new Set();
 for(const group of value.groups){
  if(!exact(group,['date','houseCode','gradeCode','quantity','batches'])||!match(/^\d{4}-\d\d-\d\d$/,group.date)
   ||!Number.isFinite(Date.parse(group.date+'T00:00:00.000Z'))||new Date(group.date+'T00:00:00.000Z').toISOString().slice(0,10)!==group.date
   ||![group.houseCode,group.gradeCode].every(token)||!Number.isSafeInteger(group.quantity)||group.quantity<1
   ||!Array.isArray(group.batches)||!group.batches.length||group.batches.length>256)return false;
  const key=JSON.stringify([group.date,group.houseCode,group.gradeCode]);if(seenGroups.has(key))return false;seenGroups.add(key);
  let quantity=0;
  for(const batch of group.batches){
   if(!exact(batch,['batchNo','companyCode','warehouseCode','productCode','skuCode','sourceNo','quantity','batchSha256','ledgerSha256'])
    ||![batch.batchNo,batch.companyCode,batch.warehouseCode,batch.productCode,batch.skuCode,batch.sourceNo].every(token)||batch.companyCode==='ALL'
    ||!Number.isSafeInteger(batch.quantity)||batch.quantity<1||![batch.batchSha256,batch.ledgerSha256].every(hash=>match(HASH,hash))||seenBatches.has(batch.batchNo))return false;
   seenBatches.add(batch.batchNo);quantity+=batch.quantity;
  }
  if(!Number.isSafeInteger(quantity)||quantity!==group.quantity)return false;
 }
 return true;
}
export function validateRegisteredFrozenLegacyScope(registration,grant,context){
 if(context.originalConclusion!=='HOLD'){if(registration!==null)fail('UNEXPECTED_FROZEN_SCOPE');return true;}
 if(!exact(registration,['schema','owner','authorizationOrigin','authorizationDigest','manifest','manifestSha256','businessEvidenceSha256','frozenAt','custodian','technicalReviewer'])
  ||registration.owner!==context.owner||registration.schema!=='phoenix.registered-frozen-legacy-test-scope/v1'||registration.authorizationOrigin!=='TRUSTED_INTERACTIVE_USER'
  ||!match(HASH,registration.authorizationDigest)||!frozenManifest(registration.manifest)||canonicalDigest(registration.manifest)!==context.testManifestSha256
  ||registration.manifestSha256!==context.testManifestSha256||canonicalDigest(registration)!==grant.frozenRegistrationSha256
  ||registration.businessEvidenceSha256!==registration.manifest.businessEvidenceSha256||!match(HASH,registration.businessEvidenceSha256)
  ||!iso(registration.frozenAt)||Date.parse(registration.frozenAt)>Date.parse(grant.technicalReview.reviewedAt)
  ||!token(registration.custodian)||registration.technicalReviewer!==grant.technicalReview.reviewer
  ||registration.custodian===registration.technicalReviewer)fail('TRUSTED_FROZEN_SCOPE_REQUIRED');
 return true;
}
/** Every effect re-reads the exact run-bound protected registration and
 * revocation. Runtime code cannot mint either registration or its user source. */
export function readRegisteredModernSchemaApproval(input,dependencies={}){
 const context=validateModernSchemaContext(input),directory=dependencies.directory??CONTRACT.stateDirectory;
 const guard=dependencies.guard??(()=>verifyContext(CONTRACT.repository,directory)),inspect=dependencies.inspectDirectory??(file=>inspectTrustedDirectory(file,CONTRACT));
 const io=dependencies.fs??fs,now=dependencies.now??Date.now,uid=dependencies.expectedUid??0;
 const read=dependencies.readPinned??(file=>JSON.parse(readPinnedFile(file,{contract:CONTRACT,uid},{fs:io,inspectDirectory:inspect})));
 const absent=file=>{try{io.lstatSync(file);return false;}catch(error){if(error.code==='ENOENT')return true;fail('APPROVAL_PATH_UNREADABLE');}};
 const grantFile=path.join(directory,`schema-release-approval-${context.owner}.json`),revoked=path.join(directory,`schema-release-revoked-${context.owner}.json`);
 const frozenFile=context.testManifestSha256&&path.join(directory,`schema-release-frozen-test-${context.owner}-${context.testManifestSha256}.json`);
 guard();const before=inspect(directory);
 if(!absent(revoked))fail('APPROVAL_REVOKED');
 let grant,frozen;
 try{grant=read(grantFile);frozen=frozenFile?read(frozenFile):null;}catch{fail('PROTECTED_APPROVAL_UNAVAILABLE');}
 validateRegisteredModernSchemaApproval(grant,context,now());validateRegisteredFrozenLegacyScope(frozen,grant,context);
 guard();let second,secondFrozen;
 try{second=read(grantFile);secondFrozen=frozenFile?read(frozenFile):null;}catch{fail('PROTECTED_APPROVAL_UNAVAILABLE');}
 if(!same(grant,second)||!same(frozen,secondFrozen)||!absent(revoked))fail('APPROVAL_CHANGED_OR_REVOKED');
 validateRegisteredModernSchemaApproval(second,context,now());validateRegisteredFrozenLegacyScope(secondFrozen,second,context);
 assertSameDirectory(before,inspect(directory));guard();
 // This is a read proof, not a bearer permit. The effect owner repeats this
 // validation under the same FD9 at every effect boundary and observes revoke.
 checkWindow(context,now());if(!absent(revoked))fail('APPROVAL_CHANGED_OR_REVOKED');
 return {grant:structuredClone(second),frozen:structuredClone(secondFrozen),contextDigest:canonicalDigest(context),approvalSha256:canonicalDigest(second)};
}
