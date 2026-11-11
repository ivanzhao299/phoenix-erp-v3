import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createSyntheticLegacyChain,validateSyntheticLegacySource,snapshotFixturePrivateState,fixtureSessionFailureDiagnostic,legacyComposeWithControlMount,validateLegacyComposeControlOverlay,LEGACY_APPLICATION_BASE,SYNTHETIC_LEGACY_PROVENANCE} from './maintenance-full-legacy-source.fixture.mjs';
import {MIGRATION_PATHS,migrationScope} from '../ops/production-config-guard.mjs';
const repository=path.resolve(new URL('../..',import.meta.url).pathname);
const run=(root,args,{input,env={}}={})=>execFileSync('/usr/bin/git',['-c',`safe.directory=${root}`,...args],{cwd:root,input,env:{...process.env,GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid',...env},encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-synthetic-legacy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));run(root,['init','-q']);
 // Read-only object borrowing; every newly constructed commit/index lives in
 // this independent repository, never in the developer checkout or its index.
 const objects=path.resolve(repository,run(repository,['rev-parse','--git-path','objects']));
 fs.mkdirSync(path.join(root,'.git/objects/info'),{recursive:true});fs.writeFileSync(path.join(root,'.git/objects/info/alternates'),objects+'\n');
 const sourceHead=run(repository,['rev-parse','HEAD']),composeSource=run(root,['show',`${sourceHead}:docker-compose.yml`])+'\n# synthetic fixture only\n';
 const chain=createSyntheticLegacyChain({root,sourceHead,composeSource,temporaryDirectory:root});
 const derived=(base,{file,content='UNAPPROVED_APPLICATION_MUTATION\n',mode='100644',remove=false,parents=[LEGACY_APPLICATION_BASE]}={})=>{
  const env={GIT_INDEX_FILE:path.join(root,'test-index-'+Math.random())};run(root,['read-tree',base],{env});
  if(remove)run(root,['update-index','--force-remove','--',file],{env});
  else if(file){const blob=run(root,['hash-object','-w','--stdin'],{input:content});run(root,['update-index','--add','--cacheinfo',`${mode},${blob},${file}`],{env});}
  const tree=run(root,['write-tree'],{env});return run(root,['commit-tree',tree,...parents.flatMap(parent=>['-p',parent]),'-m','fixture counterexample']);
 };
 return {root,sourceHead,chain,derived};
}
test('only the exact read-only control bind may extend actual226 Compose',()=>{
 const before=execFileSync('/usr/bin/git',['-C',repository,'show',`${LEGACY_APPLICATION_BASE}:docker-compose.yml`],{encoding:'utf8'}),after=legacyComposeWithControlMount(before);
 const overlay=validateLegacyComposeControlOverlay(before,after);
 assert.equal(overlay.kind,'COMPOSE_CONTROL_MOUNT_OVERLAY');assert.notEqual(overlay.beforeSha256,overlay.afterSha256);
 assert.deepEqual(overlay.structuralDiff,{added:[{path:'services.api.volumes',value:{type:'bind',source:'/var/lib/phoenix-background-control',target:'/run/phoenix-background-control',read_only:true,bind:{create_host_path:false}}}],removed:[],modified:[]});
 const changes=[
  ['wrong source',value=>value.replace('source: /var/lib/phoenix-background-control','source: /var/lib/private-control')],
  ['wrong target',value=>value.replace('target: /run/phoenix-background-control','target: /run/other-control')],
  ['read-write',value=>value.replace('read_only: true','read_only: false')],
  ['host creation',value=>value.replace('create_host_path: false','create_host_path: true')],
  ['extra mount',value=>value.replace('          create_host_path: false\n','          create_host_path: false\n      - /tmp/extra:/run/extra:ro\n')],
  ['existing upload source',value=>value.replace('PHOENIX_UPLOADS_DIR:-phoenix_uploads','PHOENIX_UPLOADS_DIR:-other_uploads')],
  ['environment',value=>value.replace('      NODE_ENV:', '      EXTRA_ENV: forbidden\n      NODE_ENV:')],
  ['ports',value=>value.replace('127.0.0.1:${API_PORT:-3100}:3100','0.0.0.0:${API_PORT:-3100}:3100')],
 ];
 for(const [name,mutate] of changes){const changed=mutate(after);assert.notEqual(changed,after,name+' must mutate the real fixture');assert.throws(()=>validateLegacyComposeControlOverlay(before,changed),/Only the exact readonly Compose control mount/,name);}
 assert.throws(()=>validateLegacyComposeControlOverlay(before,before),/Only the exact readonly Compose control mount/);
});
test('Git source admission also rejects a modified Compose overlay',t=>{
 const {root,chain,derived}=fixture(t),compose=execFileSync('/usr/bin/git',['-C',root,'show',`${chain.newOldSha}:docker-compose.yml`],{encoding:'utf8'});
 const bad=derived(chain.newOldSha,{file:'docker-compose.yml',content:compose.replace('read_only: true','read_only: false')}),target=derived(chain.targetSha,{parents:[bad]});
 assert.throws(()=>validateSyntheticLegacySource({root,sourceRevision:bad,targetRevision:target}),/Only the exact readonly Compose control mount/);
 const wrongMode=derived(chain.newOldSha,{file:'docker-compose.yml',content:compose,mode:'100755'}),modeTarget=derived(chain.targetSha,{parents:[wrongMode]});
 assert.throws(()=>validateSyntheticLegacySource({root,sourceRevision:wrongMode,targetRevision:modeTarget}),/Compose mode must remain/);
});
test('session incident retains the actual gate and stage without arbitrary error text',()=>{
 assert.deepEqual(fixtureSessionFailureDiagnostic({fatal:'CONFIG_HOLD=BACKGROUND_CONTROL_MOUNT',stage:'PREPARE_PROMOTION'}),{primaryFailureClass:'CONFIG_HOLD=BACKGROUND_CONTROL_MOUNT',primaryFailureStage:'PREPARE_PROMOTION'});
 assert.deepEqual(fixtureSessionFailureDiagnostic({fatal:'private exception details',stage:'/private/path'}),{primaryFailureClass:null,primaryFailureStage:null});
 assert.deepEqual(fixtureSessionFailureDiagnostic(undefined),{primaryFailureClass:null,primaryFailureStage:null});
});
test('negative prepare state snapshot detects content, metadata and added markers without reading secrets into receipts',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-negative-state-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'existing.json');fs.writeFileSync(file,'PRIVATE_FIXTURE_ONLY',{mode:0o600});const initial=snapshotFixturePrivateState(root);
 assert.equal(JSON.stringify(initial).includes('PRIVATE_FIXTURE_ONLY'),false);assert.deepEqual(snapshotFixturePrivateState(root),initial);
 fs.writeFileSync(file,'CHANGED_FIXTURE_ONLY');assert.notDeepEqual(snapshotFixturePrivateState(root),initial);
 const contentChanged=snapshotFixturePrivateState(root);fs.chmodSync(file,0o400);assert.notDeepEqual(snapshotFixturePrivateState(root),contentChanged);
 fs.writeFileSync(path.join(root,'maintenance-current.json'),'{}',{mode:0o600});assert.ok(snapshotFixturePrivateState(root).some(entry=>entry.path==='maintenance-current.json'));
 fs.symlinkSync(file,path.join(root,'alias'));assert.throws(()=>snapshotFixturePrivateState(root),/cannot contain symlinks/);
});
test('synthetic legacy is a separate SHA with exact226 application and complete target migration tree',t=>{
 const {root,sourceHead,chain}=fixture(t),p=chain.provenance;
 assert.notEqual(chain.newOldSha,LEGACY_APPLICATION_BASE);assert.equal(p.kind,SYNTHETIC_LEGACY_PROVENANCE);assert.equal(p.exactLegacySuccess,false);assert.equal(p.productionReceipt,false);
 assert.deepEqual(p.migrationPaths,MIGRATION_PATHS);assert.deepEqual(p.migrationTreeHashes,p.targetMigrationTreeHashes);
 assert.equal(p.applicationSource,'BYTE_IDENTICAL_TO_ACTUAL226_EXCLUDING_MIGRATION_PATHS');
 assert.equal(p.nonMigrationSource,'BYTE_IDENTICAL_TO_ACTUAL226_EXCEPT_VERIFIED_COMPOSE_CONTROL_MOUNT_OVERLAY');
 assert.equal(p.composeOverlay.kind,'COMPOSE_CONTROL_MOUNT_OVERLAY');assert.match(p.composeOverlay.beforeBlobHash,/^[a-f0-9]{40}$/);assert.match(p.composeOverlay.afterBlobHash,/^[a-f0-9]{40}$/);assert.notEqual(p.composeOverlay.beforeBlobHash,p.composeOverlay.afterBlobHash);
 assert.deepEqual(migrationScope(root,chain.newOldSha,chain.targetSha).changed,[]);
 assert.ok(migrationScope(root,LEGACY_APPLICATION_BASE,chain.targetSha).changed.length>0,'Actual226 must retain the real migration-path rejection condition');
 assert.deepEqual(run(root,['rev-list','--parents','-n','1',chain.newOldSha]).split(' '),[chain.newOldSha,LEGACY_APPLICATION_BASE]);
 run(root,['merge-base','--is-ancestor',sourceHead,chain.targetSha]);
 assert.equal(run(root,['diff','--name-only',sourceHead,chain.targetSha]),'docker-compose.yml');
 assert.equal(run(root,['status','--porcelain','--untracked-files=no']),'','Alternate index construction must not populate the real index/worktree');
});
test('synthetic capsule source refuses an application mutation even with matching migrations',t=>{
 const {root,chain,derived}=fixture(t),bad=derived(chain.newOldSha,{file:'apps/api/src/main.ts'});
 const target=derived(chain.targetSha,{parents:[bad]});
 assert.throws(()=>validateSyntheticLegacySource({root,sourceRevision:bad,targetRevision:target}),/only the complete MIGRATION_PATHS/);
});
test('synthetic capsule source refuses a missing migration from the target inventory',t=>{
 const {root,chain,derived}=fixture(t);const file=run(root,['ls-tree','-r','--name-only',chain.newOldSha,'--',...MIGRATION_PATHS]).split('\n')[0];assert.ok(file);
 const bad=derived(chain.newOldSha,{file,remove:true}),target=derived(chain.targetSha,{parents:[bad]});
 assert.throws(()=>validateSyntheticLegacySource({root,sourceRevision:bad,targetRevision:target}),/inventory must exactly match target/);
});
test('synthetic capsule source refuses a foreign base, extra parent and non-ancestor target',t=>{
 const {root,sourceHead,chain,derived}=fixture(t);
 assert.throws(()=>validateSyntheticLegacySource({root,sourceRevision:chain.newOldSha,targetRevision:chain.targetSha,applicationBase:sourceHead}),/reviewed legacy application base/);
 const bad=derived(chain.newOldSha,{parents:[LEGACY_APPLICATION_BASE,sourceHead]});
 assert.throws(()=>validateSyntheticLegacySource({root,sourceRevision:bad,targetRevision:chain.targetSha}),/direct parent/);
 assert.throws(()=>validateSyntheticLegacySource({root,sourceRevision:chain.newOldSha,targetRevision:sourceHead}));
 assert.throws(()=>validateSyntheticLegacySource({root,sourceRevision:chain.newOldSha,targetRevision:true}));
});
