/** Root/FD9 create-only registration for the existing user directive. No
 * dispatch-supplied grant, reviewer signature, environment-reviewer claim or
 * stock activation. OIDC authenticates only the bounded publishing job. */
import fs from 'node:fs';import path from 'node:path';
import {CONTRACT,verifyContext} from './production-config-guard.mjs';
import {inspectTrustedDirectory,assertSameDirectory,readPinnedFile,assertRegularFile} from './production-trusted-paths.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {MODERN_SCHEMA_SCOPE,validateModernSchemaContext,validateRegisteredModernSchemaApproval,validateRegisteredFrozenLegacyScope} from './production-modern-schema-authority.mjs';
import {collectModernSchemaIdentity,collectModernSchemaLiveJob} from './production-modern-schema-identity.mjs';
import {CONFIRMED_MODERN_SCHEMA_DIRECTIVE,verifyConfirmedModernSchemaSources,reviewConfirmedLegacyScope} from './production-modern-schema-confirmed-scope.mjs';
import {compareStableLegacyAudit} from './production-modern-schema-audit-recheck.mjs';
import {losslessJsonFacts} from './production-lossless-json.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_REGISTRATION_HOLD='+code);};
const REVIEWER='FIXED_READONLY_CUSTODY_REVIEW_V1';
/** A protected preparation is produced by host observations, never accepted
 * from a runner file. It binds a technical invariant review, not a human signoff. */
export function validateModernSchemaPreparation(record,now=Date.now()){
 if(!record||record.schema!=='phoenix.modern-schema-preparation/v1')fail('PROTECTED_PREPARATION_REQUIRED');
 const {preparationSha256,...content}=record;
 if(canonicalDigest(content)!==preparationSha256)fail('PREPARATION_DIGEST_MISMATCH');
 const context=validateModernSchemaContext(record.context);
 if(now<Date.parse(context.window.start)||now>=Date.parse(context.window.end))fail('PREPARATION_EXPIRED');
 if(record.sourceDirectiveSha256!==canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE)||context.originalConclusion!=='HOLD')fail('EXACT_CONFIRMED_EXCEPTION_REQUIRED');
 const fixed=reviewConfirmedLegacyScope(record.confirmedScopeInput);
 if(!same(fixed.manifest,record.manifest)||context.testManifestSha256!==canonicalDigest(fixed.manifest)
  ||!same(losslessJsonFacts(fixed.originalAudit,{omitTopLevel:['checked_at']}),losslessJsonFacts(record.reviewedAudit.originalAudit,{omitTopLevel:['checked_at']})))fail('FIXED_SOURCE_SCOPE_MISMATCH');
 const capturedAt=record.reviewedAudit.evidence.capturedAt;
 compareStableLegacyAudit({context,reviewed:record.reviewedAudit,fresh:record.reviewedAudit,frozenManifest:fixed.manifest,sampleStartedAt:capturedAt,sampleFinishedAt:capturedAt});
 if(canonicalDigest(record.oldRuntimeCompatibility)!==context.oldRuntimeCompatibilitySha256
  ||canonicalDigest(record.defaultOffEvidence)!==context.defaultOffEvidenceSha256||canonicalDigest(record.ingressScope)!==context.ingressScopeSha256)fail('PREPARATION_EVIDENCE_MISMATCH');
 const compatibility=record.oldRuntimeCompatibility,off=record.defaultOffEvidence;
 if(compatibility?.schema!=='phoenix.modern-schema-isolated-rehearsal/v1'||compatibility.runtimeSha!==context.runtimeSha||compatibility.targetSha!==context.targetSha
  ||compatibility.candidateImageId!==context.candidateImageId||compatibility.beforeLedgerSha256!==context.beforeLedgerSha256
  ||compatibility.pendingPlanSha256!==canonicalDigest(context.pendingMigrations)||compatibility.outcome!=='PASS'
  ||compatibility.originalRuntimeReady!==true||compatibility.candidateReady!==true||compatibility.businessFactsUnchanged!==true
  ||compatibility.backgroundWrites!==0||compatibility.isolatedRestore!==true||compatibility.productionMutation!==false)fail('ACTUAL_ISOLATED_REHEARSAL_REQUIRED');
 if(off?.schema!=='phoenix.modern-schema-default-off-evidence/v1'||off.targetSha!==context.targetSha||off.featureRollout!=='OFF'||off.scopeRows!==0
  ||off.qualificationRows!==0||off.admissionRows!==0||off.cutoverResultRows!==0||off.chanjetPolicy!=='HOLD'||off.verified!==true)fail('ACTUAL_DEFAULT_OFF_REQUIRED');
 return {context,fixed,preparationSha256};
}
export class ModernSchemaRegistry {
 constructor(dependencies={}){
  this.directory=dependencies.directory??CONTRACT.stateDirectory;this.io=dependencies.fs??fs;this.uid=dependencies.expectedUid??0;
  this.guard=dependencies.guard??(()=>verifyContext(CONTRACT.repository,this.directory));
  this.inspect=dependencies.inspectDirectory??(directory=>inspectTrustedDirectory(directory,CONTRACT));
 }
 file(name){if(!/^[a-z0-9-]+\.json$/.test(name))fail('REGISTRY_NAME');return path.join(this.directory,name);}
 exists(name){try{this.io.lstatSync(this.file(name));return true;}catch(error){if(error.code==='ENOENT')return false;fail('REGISTRY_UNREADABLE');}}
 read(name){this.guard();return JSON.parse(readPinnedFile(this.file(name),{contract:CONTRACT,uid:this.uid},{fs:this.io,inspectDirectory:this.inspect}));}
 immutable(name,value){
  this.guard();const before=this.inspect(this.directory),file=this.file(name);let fd;
  try{
   fd=this.io.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
   assertRegularFile(this.io.fstatSync(fd),{uid:this.uid});this.io.writeFileSync(fd,JSON.stringify(value)+'\n');this.io.fsyncSync(fd);
  }catch{fail('CREATE_ONLY_REGISTRATION_FAILED');}finally{if(fd!==undefined)this.io.closeSync(fd);}
  const parent=this.io.openSync(this.directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try{this.io.fsyncSync(parent);}finally{this.io.closeSync(parent);}
  assertSameDirectory(before,this.inspect(this.directory));this.guard();if(!same(this.read(name),value))fail('REGISTRATION_CHANGED');
 }
}
export async function registerModernSchemaRelease({owner,preparationSha256,identityToken},dependencies={}){
 if(!/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(owner??'')||!/^[a-f0-9]{64}$/.test(preparationSha256??''))fail('EXACT_PREPARATION_REQUIRED');
 const store=dependencies.store??new ModernSchemaRegistry(dependencies),now=dependencies.now??Date.now;
 const check=()=>{
  store.guard();if(store.exists(`schema-release-revoked-${owner}.json`))fail('REVOKED');
  const record=store.read(`schema-release-preparation-${owner}.json`),validated=validateModernSchemaPreparation(record,now());
  if(record.context.owner!==owner||validated.preparationSha256!==preparationSha256)fail('PREPARATION_BINDING_MISMATCH');return {record,...validated};
 };
 const before=check();(dependencies.verifySources??verifyConfirmedModernSchemaSources)();
 const expected={owner,targetSha:before.context.targetSha,preparationSha256};
 // The production default always verifies the actual JWT against fixed issuer
 // keys then reads the actual attempt/jobs. An identity JSON is never an input.
 const signed=await (dependencies.collectIdentity??collectModernSchemaIdentity)(identityToken,expected,dependencies.identityDependencies);
 const live=await (dependencies.collectLiveJob??collectModernSchemaLiveJob)(signed,dependencies.identityDependencies);
 const after=check();if(!same(before.record,after.record)||live.triggeringActorVerified!==true||live.actor!=='emvia'||live.actorId!=='7245339'
  ||live.owner!==owner||live.targetSha!==expected.targetSha||live.preparationSha256!==preparationSha256||live.productionAuthorized!==false
  ||live.requiredReviewersUsed!==false||now()>=Date.parse(live.expiresAt))fail('LIVE_IDENTITY_OR_PREPARATION_CHANGED');
 const registeredAt=new Date(now()).toISOString(),authorizationDigest=canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE);
 const frozen={schema:'phoenix.registered-frozen-legacy-test-scope/v1',owner,authorizationOrigin:'TRUSTED_INTERACTIVE_USER',authorizationDigest,
  manifest:after.fixed.manifest,manifestSha256:after.context.testManifestSha256,businessEvidenceSha256:after.fixed.manifest.businessEvidenceSha256,
  frozenAt:registeredAt,custodian:'emvia:7245339',technicalReviewer:REVIEWER};
 const grant={schema:'phoenix.modern-schema-release-approval/v1',repository:'ivanzhao299/phoenix-erp-v3',authorizationOrigin:'TRUSTED_INTERACTIVE_USER',
  authorizationRef:'MODERN_DEFAULT_OFF_SCHEMA_RELEASE',authorizationDigest,context:after.context,contextDigest:canonicalDigest(after.context),scope:structuredClone(MODERN_SCHEMA_SCOPE),
  sourceReviewSha256:canonicalDigest(after.fixed.businessEvidence),frozenRegistrationSha256:canonicalDigest(frozen),
  technicalReview:{reviewer:REVIEWER,kind:'TECHNICAL_CHECK',humanApproval:false,reviewedAt:registeredAt,decision:'PASS_ONLY_FROZEN_LEGACY_DIFFERENCE',originalAuditSha256:after.context.originalAuditSha256,
   auditEvidenceSha256:after.context.auditEvidenceSha256,testManifestSha256:after.context.testManifestSha256,custodyEvidenceSha256:canonicalDigest(after.fixed.businessEvidence)},registeredAt,expiresAt:after.context.window.end};
 validateRegisteredModernSchemaApproval(grant,after.context,now());validateRegisteredFrozenLegacyScope(frozen,grant,after.context);
 // Consume the preparation+owner+target before any grant. A newly minted JWT
 // for the same run cannot replay it. Interrupted registration remains HOLD.
 store.immutable(`schema-release-consumed-${owner}.json`,{schema:'phoenix.modern-schema-preparation-consumption/v1',...expected,identitySha256:canonicalDigest(live),consumedAt:registeredAt});
 check();store.immutable(`schema-release-identity-${owner}.json`,live);
 store.immutable(`schema-release-frozen-test-${owner}-${after.context.testManifestSha256}.json`,frozen);
 check();store.immutable(`schema-release-approval-${owner}.json`,grant);
 check();return {schema:'phoenix.modern-schema-registration/v1',owner,preparationSha256,approvalSha256:canonicalDigest(grant),contextDigest:canonicalDigest(after.context),requiredReviewersUsed:false,source:'EXISTING_USER_DIRECTIVE_AND_FIXED_READONLY_REVIEW',registeredAt};
}
