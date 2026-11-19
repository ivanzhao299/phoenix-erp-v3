/** Synthetic protected preparations and server observations. No production grant. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {ModernSchemaRegistry,registerModernSchemaRelease,validateModernSchemaPreparation} from './production-modern-schema-registration.mjs';
import {modernSchemaFixture,fixedScopeFixture} from '../ci/modern-schema-release.fixture.mjs';
import {reviewConfirmedLegacyScope,CONFIRMED_MODERN_SCHEMA_DIRECTIVE} from './production-modern-schema-confirmed-scope.mjs';
import {modernSchemaMigrationEvidenceDigest} from './production-modern-schema-audit-recheck.mjs';
import {canonicalDigest} from './production-maintenance-receipts.mjs';
import {readRegisteredModernSchemaApproval} from './production-modern-schema-authority.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),now=Date.UTC(2026,10,19,0,5);
function fixture(){
 const context=modernSchemaFixture().context,input=fixedScopeFixture(),fixed=reviewConfirmedLegacyScope(input),databaseIdentity={name:'owned-fixture',schema:'public',systemIdentifier:'1234567890123456789'};
 context.databaseIdentitySha256=canonicalDigest(databaseIdentity);context.testManifestSha256=canonicalDigest(fixed.manifest);
 const originalAuditSha256=createHash('sha256').update(input.originalAudit).digest('hex');
 const evidence={schema:'phoenix.legacy-egg-audit-evidence/v1',targetSha:context.targetSha,floorSha:context.floorSha,runningApiSha:context.runtimeSha,
  ledgerSha256:context.beforeLedgerSha256,observedLedgerSha256:context.beforeLedgerSha256,migrationEvidenceSha256:modernSchemaMigrationEvidenceDigest(context),databaseIdentity,
  capturedAt:JSON.parse(input.originalAudit).checked_at,originalAuditSha256,originalConclusion:'HOLD',disposition:'HOLD',reason:'MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW',
  groups:fixed.manifest.groups,referenceCoverage:{inspected:['inv_batches.descendants','sal_order_items','sal_order_item_batch_allocations','store_sale_allocations','wms_transfer_items','pkg_source_batches','fin_ar_invoices','fin_ap_invoices','chanjet_voucher_drafts'],missing:[],matches:[],uninspectedSources:[]},manifestSha256:context.testManifestSha256,verifiedTestScope:false,releaseAuthorized:false};
 const reviewedAudit={originalAudit:input.originalAudit,evidence:{...evidence,evidenceSha256:canonicalDigest(evidence)}};
 context.originalAuditSha256=originalAuditSha256;context.auditEvidenceSha256=reviewedAudit.evidence.evidenceSha256;
 const oldRuntimeCompatibility={schema:'phoenix.modern-schema-isolated-rehearsal/v1',runtimeSha:context.runtimeSha,targetSha:context.targetSha,candidateImageId:context.candidateImageId,beforeLedgerSha256:context.beforeLedgerSha256,
  pendingPlanSha256:canonicalDigest(context.pendingMigrations),outcome:'PASS',originalRuntimeReady:true,candidateReady:true,businessFactsUnchanged:true,backgroundWrites:0,isolatedRestore:true,productionMutation:false};
 const defaultOffEvidence={schema:'phoenix.modern-schema-default-off-evidence/v1',targetSha:context.targetSha,featureRollout:'OFF',scopeRows:0,qualificationRows:0,admissionRows:0,cutoverResultRows:0,chanjetPolicy:'HOLD',verified:true};
 const ingressScope={fixtureOnly:true};context.oldRuntimeCompatibilitySha256=canonicalDigest(oldRuntimeCompatibility);context.defaultOffEvidenceSha256=canonicalDigest(defaultOffEvidence);context.ingressScopeSha256=canonicalDigest(ingressScope);
 const content={schema:'phoenix.modern-schema-preparation/v1',context,confirmedScopeInput:input,manifest:fixed.manifest,reviewedAudit,sourceDirectiveSha256:canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE),oldRuntimeCompatibility,defaultOffEvidence,ingressScope};
 const record={...content,preparationSha256:canonicalDigest(content)},directory=fs.mkdtempSync(path.join(root,'artifacts/modern-schema-registration-'));
 const dependencies={directory,guard(){},expectedUid:process.getuid(),inspectDirectory:()=>{const stat=fs.statSync(directory);return {dev:stat.dev,ino:stat.ino,uid:stat.uid,mode:stat.mode};},now:()=>now};
 const store=new ModernSchemaRegistry(dependencies);dependencies.store=store;dependencies.verifySources=()=>input.sourceDirectiveSha256;
 dependencies.collectIdentity=async()=>({kind:'IDENTITY_ONLY'});
 dependencies.collectLiveJob=async()=>({owner:context.owner,targetSha:context.targetSha,preparationSha256:record.preparationSha256,triggeringActorVerified:true,actor:'emvia',actorId:'7245339',productionAuthorized:false,requiredReviewersUsed:false,expiresAt:context.window.end});
 const request={owner:context.owner,preparationSha256:record.preparationSha256,identityToken:'synthetic-no-real-jwt'};
 const persist=()=>store.immutable(`schema-release-preparation-${context.owner}.json`,record);
 return {context,input,record,directory,store,dependencies,request,persist};
}
test('fixed root producer registers once from protected observations and the existing actual directive, not environment approvals',async()=>{
 const f=fixture();f.persist();const result=await registerModernSchemaRelease(f.request,f.dependencies);assert.equal(result.requiredReviewersUsed,false);
 const registered=readRegisteredModernSchemaApproval(f.context,f.dependencies);assert.equal(result.approvalSha256,registered.approvalSha256);
 assert.equal(registered.frozen.manifest.classification,'USER_CONFIRMED_TEST_OR_MISENTRY');assert.equal(registered.grant.scope.businessCutover,false);
 assert.equal(registered.grant.technicalReview.reviewer,'FIXED_READONLY_CUSTODY_REVIEW_V1');assert.equal(registered.grant.scope.automaticRollback,false);
 await assert.rejects(registerModernSchemaRelease({...f.request,identityToken:'a-new-synthetic-jwt'},f.dependencies),/CREATE_ONLY_REGISTRATION_FAILED/);
});
test('a supplied object cannot replace root preparation or real production context',async()=>{
 const f=fixture();await assert.rejects(registerModernSchemaRelease({...f.request,record:f.record},f.dependencies));
 await assert.rejects(registerModernSchemaRelease(f.request));
 assert.equal(f.store.exists(`schema-release-approval-${f.context.owner}.json`),false);
});
for(const [name,change]of [
 ['expired',f=>f.dependencies.now=()=>Date.parse(f.context.window.end)],['wrong digest',f=>f.request.preparationSha256='f'.repeat(64)],
 ['default ON',f=>f.record.defaultOffEvidence.featureRollout='ON'],['no actual rehearsal',f=>f.record.oldRuntimeCompatibility.isolatedRestore=false],
 ['drifted report',f=>f.record.confirmedScopeInput.dailyRowsRaw=f.record.confirmedScopeInput.dailyRowsRaw.replace('540','541')],['different identity',f=>f.dependencies.collectLiveJob=async()=>({triggeringActorVerified:false})]
])test('preparation refuses '+name,async()=>{const f=fixture();change(f);f.persist();await assert.rejects(registerModernSchemaRelease(f.request,f.dependencies));assert.equal(f.store.exists(`schema-release-approval-${f.context.owner}.json`),false);});
test('late revoke or preparation replacement while reading server facts cannot mint a grant',async()=>{
 for(const kind of ['revoke','replace']){const f=fixture();f.persist();const original=f.dependencies.collectLiveJob;
  f.dependencies.collectLiveJob=async(...args)=>{if(kind==='revoke')fs.symlinkSync(path.join(f.directory,'missing'),f.store.file(`schema-release-revoked-${f.context.owner}.json`));
   else {const changed={...f.record,sourceDirectiveSha256:'f'.repeat(64)};fs.writeFileSync(f.store.file(`schema-release-preparation-${f.context.owner}.json`),JSON.stringify(changed),{mode:0o600});}return original(...args);};
  await assert.rejects(registerModernSchemaRelease(f.request,f.dependencies));assert.equal(f.store.exists(`schema-release-approval-${f.context.owner}.json`),false);
 }
});
test('failed registration consumes once and never cleans the evidence or allows a second JWT replay',async()=>{
 const f=fixture();f.persist();const write=f.store.immutable.bind(f.store);
 f.store.immutable=(name,value)=>{if(name.startsWith('schema-release-identity-'))throw Error('synthetic interrupted registration');return write(name,value);};
 await assert.rejects(registerModernSchemaRelease(f.request,f.dependencies));assert.equal(f.store.exists(`schema-release-consumed-${f.context.owner}.json`),true);
 f.store.immutable=write;await assert.rejects(registerModernSchemaRelease(f.request,f.dependencies),/CREATE_ONLY/);assert.equal(f.store.exists(`schema-release-approval-${f.context.owner}.json`),false);
});
test('a new owner may register unchanged historical facts without colliding with an older frozen scope',async()=>{
 const first=fixture();first.persist();await registerModernSchemaRelease(first.request,first.dependencies);
 const second=fixture();second.context.owner='1234-2';const {preparationSha256,...content}=second.record;second.record.preparationSha256=canonicalDigest(content);
 second.request.owner=second.context.owner;second.request.preparationSha256=second.record.preparationSha256;second.dependencies.store=first.store;
 first.store.immutable(`schema-release-preparation-${second.context.owner}.json`,second.record);
 await registerModernSchemaRelease(second.request,second.dependencies);
 assert.equal(first.context.testManifestSha256,second.context.testManifestSha256);
 for(const f of [first,second])assert.equal(first.store.exists(`schema-release-frozen-test-${f.context.owner}-${f.context.testManifestSha256}.json`),true);
});
test('the preparation validator never repairs or discards the original HOLD',()=>{const f=fixture();assert.equal(validateModernSchemaPreparation(f.record,now).fixed.businessEvidence.originalConclusion,'HOLD');});
