/** Preparation performs readonly primary observations, a protected backup and
 * isolated restores only. It never claims pending, fences ingress or stops R. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {CONTRACT,verifyContext,secureJson,git,requireCleanMain,guardProduction} from './production-config-guard.mjs';
import {captureRuntime,executionEnv} from './capture-production-runtime.mjs';
import {captureSnapshot} from './production-deployment-evidence.mjs';
import {assertModernReleaseAdmission} from './production-maintenance-admission.mjs';
import {readBackgroundPrivate,readPublicManifest,validateParticipants} from './background-control-manifest.mjs';
import {inspectApiParticipant,verifyParticipantStatus} from './background-control-coordinator.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {ModernSchemaRegistry,validateModernSchemaPreparation} from './production-modern-schema-registration.mjs';
import {ModernSchemaPrivateRuntime} from './production-modern-schema-private.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {collectModernSchemaPlan} from './production-modern-schema-plan.mjs';
import {assertInitialModernSchemaProfile,captureModernSchemaFacts,defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {collectConfirmedLegacyScope,CONFIRMED_MODERN_SCHEMA_DIRECTIVE} from './production-modern-schema-confirmed-scope.mjs';
import {collectLegacyEggAuditEvidence} from './production-legacy-egg-audit-evidence.mjs';
import {modernSchemaMigrationEvidenceDigest,compareStableLegacyAudit} from './production-modern-schema-audit-recheck.mjs';
import {collectModernSchemaHostSurface,MODERN_SCHEMA_EXECUTOR_SQL,classifyModernSchemaDatabaseExecutors} from './production-modern-schema-executors.mjs';
import {createModernSchemaBackup} from './production-modern-schema-backup.mjs';
import {rehearseModernSchemaRelease} from './production-modern-schema-rehearsal.mjs';
import {readCommittedModernSchemaDeploymentBody} from './production-modern-schema-body-source.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';
import {observeModernSchemaDiskSpace} from './production-modern-schema-disk.mjs';
import {verifyModernSchemaStage} from './production-modern-schema-stage.mjs';
import {API_READINESS_PROGRAM} from './production-maintenance-candidate-health.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_PREPARATION_HOLD='+code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function modernSchemaDispatchFromEnvironment(env){
 const fixed={DEPLOY_MODE:'api',BUILD_API:'true',BUILD_WEB:'false',RUN_MIG:'false',APPROVE_PRODUCTION:'true',PRESERVE_ARTIFACTS:'true',ROTATE_CHANJET_CREDENTIALS:'false',ONE_TIME_CONFIG_FLOOR_TRANSITION:'false'};
 if(Object.entries(fixed).some(([key,value])=>env[key]!==value)||!/^([a-f0-9]{40})$/.test(env.TARGET_SHA??'')||env.APPROVED_CONFIG_FLOOR_SHA!==env.TARGET_SHA
  ||!/^([a-f0-9]{40})$/.test(env.APPROVED_PREVIOUS_FLOOR_SHA??'')||env.APPROVED_PREVIOUS_FLOOR_SHA===env.TARGET_SHA
  ||!/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/.test(env.DEPLOY_RUN_ID??'')||env.DEPLOY_RUN_ATTEMPT!==env.DEPLOY_RUN_ID.split('-')[1]
  ||env.API_IMAGE!==`ghcr.io/ivanzhao299/phoenix-erp-v3/api:sha-${env.TARGET_SHA}`
  ||['MAINTENANCE_RELEASE_INPUT','SKU_SOURCE_EFFECTIVE_DATE','SKU_SOURCE_PLAN_SHA256','GITHUB_TOKEN','GHCR_LOGIN_TOKEN'].some(key=>env[key]))fail('EXACT_DEFAULT_OFF_API_DISPATCH_REQUIRED');
 return Object.freeze({owner:env.DEPLOY_RUN_ID,targetSha:env.TARGET_SHA,floorSha:env.APPROVED_PREVIOUS_FLOOR_SHA,candidateRef:env.API_IMAGE});
}
function docker(args){try{return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}catch{fail('NATIVE_DOCKER_OBSERVATION_REQUIRED');}}
export function observeModernSchemaOriginalBackground(snapshot,floor){
 const record=readBackgroundPrivate(),manifest=readPublicManifest();validateParticipants(manifest.participants,{targetSha:snapshot.containers.api.ociRevision});
 if(record?.phase!=='OPEN'||manifest.phase!=='OPEN'||record.generation!==manifest.generation||record.owner!==manifest.owner||record.targetSha!==manifest.targetSha
  ||record.targetSha!==snapshot.containers.api.ociRevision||record.manifestDigest!==sha(JSON.stringify(manifest))||record.purpose||record.schemaRelease||record.cutover
  ||manifest.participants.length!==1||manifest.participants[0].containerId!==snapshot.containers.api.id)fail('ORIGINAL_MODERN_OPEN_REQUIRED');
 const participant=manifest.participants[0],actual=inspectApiParticipant(participant,floor.project);verifyParticipantStatus(actual,participant,manifest);
 if(actual.imageId!==snapshot.containers.api.image||actual.startedAt!==snapshot.containers.api.startedAt||actual.restartCount!==snapshot.containers.api.restartCount)fail('ORIGINAL_API_MOVED');
 const readiness=JSON.parse(docker(['exec',actual.containerId,'/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/local/bin/node','-e',API_READINESS_PROGRAM]));
 if(readiness.status!==200||readiness.ready!==true||readiness.dbConnected!==true)fail('ACTUAL_ORIGINAL_READINESS_REQUIRED');
 return {record,manifest,participant,actual,readiness};
}
function assertLatest(root,dispatch){
 requireCleanMain(root);if(git(root,['rev-parse','origin/main'])!==dispatch.targetSha||git(root,['ls-remote','origin','refs/heads/main']).split(/\s/)[0]!==dispatch.targetSha)fail('LATEST_MAIN_CHANGED');
 git(root,['merge-base','--is-ancestor',git(root,['rev-parse','HEAD']),dispatch.targetSha]);
}
export async function prepareModernSchemaRelease(env,dependencies={}){
 const stage=name=>dependencies.onStage?.(name);stage('BOOTSTRAP');
 const dispatch=modernSchemaDispatchFromEnvironment(env),root=dependencies.root??CONTRACT.repository,directory=dependencies.directory??CONTRACT.stateDirectory;
 const stagedSource=verifyModernSchemaStage(dispatch);
 const guard=dependencies.guard??(()=>verifyContext(root,directory)),runtime=dependencies.privateRuntime??new ModernSchemaPrivateRuntime(),store=dependencies.store??new ModernSchemaRegistry();
 guard();assertModernReleaseAdmission();assertLatest(root,dispatch);
 if(store.exists(`schema-release-preparation-${dispatch.owner}.json`)||store.exists(`schema-release-consumed-${dispatch.owner}.json`))fail('OWNER_ALREADY_PREPARED_OR_CONSUMED');
 stage('FLOOR');const active=secureJson(path.join(directory,'active.json')),runtimePins=captureRuntime(),rootHeadSha=git(root,['rev-parse','HEAD']);
 const floor=guardProduction(root,directory,runtimePins,undefined,{allowFloorReanchor:true,reanchorTarget:dispatch.targetSha,previousFloorSha:dispatch.floorSha});
 if(floor.floorSha!==dispatch.floorSha||floor.chanjetPolicy!=='HOLD'||floor.readonlyApproval!==null||active.outcome!=='SUCCESS'||active.floorSha!==dispatch.floorSha
  ||!same(active.active,runtimePins)||runtimePins.api.revision!==runtimePins.web.revision)fail('EXACT_FLOOR_AND_ORIGINAL_PINS_REQUIRED');
 const initial=captureSnapshot({phase:'PRE_SNAPSHOT',runId:dispatch.owner,runAttempt:dispatch.owner.split('-')[1],targetSha:dispatch.targetSha,floorSha:dispatch.targetSha,deployMode:'api'});
 const background=observeModernSchemaOriginalBackground(initial,floor),privateDirectory=runtime.createDirectory(dispatch.owner,'preparation');
 // This is the only preparation image pull. All subsequent runs use the
 // verified immutable image ID, never a mutable registry tag.
 await runtime.run({binary:'/usr/bin/docker',args:['pull',dispatch.candidateRef],directory:privateDirectory,stem:'candidate-pull',timeoutMs:600000});
 const candidateImageId=docker(['image','inspect',dispatch.candidateRef,'--format','{{.Id}}']);if(!/^sha256:[a-f0-9]{64}$/.test(candidateImageId))fail('IMMUTABLE_CANDIDATE_IMAGE_REQUIRED');
 const client=dependencies.client??new ModernSchemaReadClient();let started=false;
 try{
  if(!dependencies.client){await client.start();started=true;runtime.children.add({...pinModernSchemaChild(client.child),outcome:'ACTIVE_READ_CHANNEL'});}
  stage('PLAN');const observed=await collectModernSchemaPlan(client,{...dispatch,runtimeSha:runtimePins.api.revision,candidateImageId},{root,guard});
  const {plan,database,imageProof}=observed;assertInitialModernSchemaProfile(dispatch.floorSha,plan);
  const {rows:[size]}=await client.query('SELECT pg_database_size(current_database())::text AS bytes');
  const disk=observeModernSchemaDiskSpace({databaseBytes:size.bytes});
  stage('HOST_SURFACE');const ownedResources=[imageProof],surface=collectModernSchemaHostSurface(initial,{guard,ownedResources,getOwnedChildren:()=>runtime.registeredChildren()});
  const {rows:[{observation}]}=await client.query(MODERN_SCHEMA_EXECUTOR_SQL);
  const executors=classifyModernSchemaDatabaseExecutors(JSON.parse(observation),{runtimeAddress:surface.runtimeAddress});
  stage('BACKUP');const backup=await createModernSchemaBackup({owner:dispatch.owner,stage:'prepare',client,databasePin:initial.containers.db,privateRuntime:runtime});
  if(backup.receipt.sourceLedgerSha256!==plan.beforeLedgerSha256)fail('LEDGER_CHANGED_BEFORE_BACKUP');
  stage('REHEARSAL');const rehearsal=await rehearseModernSchemaRelease({owner:dispatch.owner,stage:'prepare',backup,plan,runtimeImageId:runtimePins.api.imageId,privateRuntime:runtime});
  ownedResources.push(...rehearsal.resources);
  // No comparison of all live business facts against earlier preparation:
  // ordinary orders may legitimately continue while R remains OPEN.
  guard();assertModernReleaseAdmission();assertLatest(root,dispatch);
  const after=captureSnapshot({phase:'PRE_SNAPSHOT',runId:dispatch.owner,runAttempt:dispatch.owner.split('-')[1],targetSha:dispatch.targetSha,floorSha:dispatch.targetSha,deployMode:'api'});
  if(!same(initial.containers,after.containers)||git(root,['rev-parse','HEAD'])!==rootHeadSha||!same(secureJson(path.join(directory,'floor.json')),floor)
   ||!same(secureJson(path.join(directory,'active.json')),active)||!same(observeModernSchemaOriginalBackground(after,floor).record,background.record))fail('PREPARATION_RUNTIME_OR_FLOOR_MOVED');
  const freshSurface=collectModernSchemaHostSurface(after,{guard,ownedResources,getOwnedChildren:()=>runtime.registeredChildren()});
  if(!same(surface,freshSurface))fail('PREPARATION_HOST_SURFACE_MOVED');
  const {rows:[latestExecutors]}=await client.query(MODERN_SCHEMA_EXECUTOR_SQL);classifyModernSchemaDatabaseExecutors(JSON.parse(latestExecutors.observation),{runtimeAddress:surface.runtimeAddress});
  const body=readCommittedModernSchemaDeploymentBody(root,dispatch.targetSha),start=Date.now(),window={start:new Date(start).toISOString(),end:new Date(start+1800000).toISOString()};
  stage('HISTORICAL_AUDIT');const source=await collectConfirmedLegacyScope(client,{targetSha:dispatch.targetSha}),facts=await captureModernSchemaFacts(client),off=defaultOffEvidenceFromFacts(dispatch.targetSha,facts,{stage:'BEFORE_SCHEMA',floor});
  const databaseIdentity={name:database.name,schema:database.schema,systemIdentifier:database.systemIdentifier};
  const context={schema:'phoenix.modern-schema-release-context/v1',owner:dispatch.owner,floorSha:dispatch.floorSha,runtimeSha:plan.runtimeSha,targetSha:dispatch.targetSha,window,
   databaseIdentitySha256:canonicalDigest(databaseIdentity),runtimeSnapshotSha256:canonicalDigest(initial.containers),candidateImageId,
   candidateInventorySha256:plan.candidateInventorySha256,sourceInventorySha256:plan.sourceInventorySha256,runtimeInventorySha256:plan.runtimeInventorySha256,
   beforeLedgerSha256:plan.beforeLedgerSha256,pendingMigrations:plan.pendingMigrations,changedMigrationPaths:plan.changedMigrationPaths,
   originalAuditSha256:'0'.repeat(64),originalConclusion:'HOLD',auditEvidenceSha256:'0'.repeat(64),testManifestSha256:canonicalDigest(source.manifest),
   oldRuntimeCompatibilitySha256:canonicalDigest(rehearsal.evidence),defaultOffEvidenceSha256:canonicalDigest(off),ingressScopeSha256:canonicalDigest(surface.ingressScope)};
  const reviewedAudit=await collectLegacyEggAuditEvidence(client,{targetSha:context.targetSha,floorSha:context.floorSha,runningApiSha:context.runtimeSha,
   ledgerSha256:context.beforeLedgerSha256,migrationEvidenceSha256:modernSchemaMigrationEvidenceDigest(context),databaseIdentity,manifest:source.manifest});
  context.originalAuditSha256=reviewedAudit.evidence.originalAuditSha256;context.auditEvidenceSha256=reviewedAudit.evidence.evidenceSha256;
  compareStableLegacyAudit({context,reviewed:reviewedAudit,fresh:reviewedAudit,frozenManifest:source.manifest,sampleStartedAt:reviewedAudit.evidence.capturedAt,sampleFinishedAt:reviewedAudit.evidence.capturedAt});
  const content={schema:'phoenix.modern-schema-preparation/v1',context,confirmedScopeInput:source.confirmedScopeInput,manifest:source.manifest,reviewedAudit,
   sourceDirectiveSha256:canonicalDigest(CONFIRMED_MODERN_SCHEMA_DIRECTIVE),oldRuntimeCompatibility:rehearsal.evidence,defaultOffEvidence:off,ingressScope:surface.ingressScope,
   hostSurface:surface,executors,disk,stagedSource,originalSnapshot:initial,originalBackground:background,rootHeadSha,floor,active,plan,ownedResources,
   backupReceiptPath:backup.receiptPath,backupReceiptSha256:canonicalDigest(backup.receipt),rehearsalDirectory:rehearsal.directory,
   bodySource:{bodySha256:body.bodySha256,workflowSha256:body.workflowSha256}};
  const record={...content,preparationSha256:canonicalDigest(content)};validateModernSchemaPreparation(record);
  guard();assertLatest(root,dispatch);store.immutable(`schema-release-preparation-${dispatch.owner}.json`,record);
  return {schema:'phoenix.modern-schema-public-preparation/v1',owner:dispatch.owner,targetSha:dispatch.targetSha,preparationSha256:record.preparationSha256,prepared:true};
 }finally{if(started)await client.close();}
}
