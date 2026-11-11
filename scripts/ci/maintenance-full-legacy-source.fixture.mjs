/** Disposable Git objects only. Never an exact-old226 success or production authority. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {MIGRATION_PATHS} from '../ops/production-config-guard.mjs';

export const LEGACY_APPLICATION_BASE='226878864f184d26f41a890e666ebed52547db14';
export const SYNTHETIC_LEGACY_PROVENANCE='SYNTHETIC_LEGACY_MIGRATION_ALIGNED';
const withinMigrationPath=name=>MIGRATION_PATHS.some(scope=>name===scope||name.startsWith(scope+'/'));
const sha=value=>assert.match(value,/^[a-f0-9]{40}$/);
const git=(root,args,{input,env={}}={})=>execFileSync('/usr/bin/git',['-c',`safe.directory=${root}`,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',...args],{
  cwd:root,input,env:{...process.env,...env},encoding:'utf8',timeout:10000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']});
const names=(root,from,to)=>git(root,['diff','--name-only','-z',from,to]).split('\0').filter(Boolean);
const inventory=(root,revision)=>git(root,['ls-tree','-r','-z',revision,'--',...MIGRATION_PATHS]);
const treeHashes=(root,revision)=>Object.fromEntries(MIGRATION_PATHS.map(scope=>{
  // ls-tree distinguishes an intentionally absent path without swallowing Git errors.
  const entries=git(root,['ls-tree',revision,'--',scope]).trim();
  return [scope,entries?entries.split(/\s+/)[2]:null];
}));
export function snapshotFixturePrivateState(directory) {
  const entries=[];
  const visit=(current,relative)=>{
    const stat=fs.lstatSync(current);assert.ok(!stat.isSymbolicLink(),'Private fixture state cannot contain symlinks');
    const entry={path:relative,mode:stat.mode,uid:stat.uid,gid:stat.gid,dev:stat.dev,ino:stat.ino,nlink:stat.nlink};
    if(stat.isDirectory()){entries.push(entry);for(const name of fs.readdirSync(current).sort())visit(path.join(current,name),relative?relative+'/'+name:name);}
    else{assert.ok(stat.isFile());entries.push({...entry,sha256:createHash('sha256').update(fs.readFileSync(current)).digest('hex')});}
  };
  visit(directory,'');return entries;
}
export function validateSyntheticLegacySource({root,sourceRevision,targetRevision,applicationBase=LEGACY_APPLICATION_BASE}) {
  [sourceRevision,targetRevision,applicationBase].forEach(sha);
  assert.equal(applicationBase,LEGACY_APPLICATION_BASE,'Only the reviewed legacy application base is supported');
  assert.deepEqual(git(root,['rev-list','--parents','-n','1',sourceRevision]).trim().split(' '),[sourceRevision,applicationBase],
    'Synthetic legacy must have exactly the actual226 commit as its direct parent');
  const changes=names(root,applicationBase,sourceRevision);
  assert.ok(changes.every(withinMigrationPath),'Synthetic legacy may change only the complete MIGRATION_PATHS');
  assert.equal(inventory(root,sourceRevision),inventory(root,targetRevision),'Synthetic legacy migration inventory must exactly match target');
  for(const file of ['pnpm-lock.yaml','apps/api/package.json'])assert.equal(git(root,['show',`${sourceRevision}:${file}`]),git(root,['show',`${applicationBase}:${file}`]),'Archived dependency inputs cannot change');
  git(root,['merge-base','--is-ancestor',sourceRevision,targetRevision]);
  return {kind:SYNTHETIC_LEGACY_PROVENANCE,fixtureOnly:true,productionReceipt:false,exactLegacySuccess:false,
    applicationBase,newOldSha:sourceRevision,targetSha:targetRevision,legacyTree:git(root,['rev-parse',`${sourceRevision}^{tree}`]).trim(),
    applicationBaseTree:git(root,['rev-parse',`${applicationBase}^{tree}`]).trim(),targetTree:git(root,['rev-parse',`${targetRevision}^{tree}`]).trim(),
    migrationPaths:[...MIGRATION_PATHS],migrationTreeHashes:treeHashes(root,sourceRevision),targetMigrationTreeHashes:treeHashes(root,targetRevision),
    nonMigrationSource:'BYTE_IDENTICAL_TO_ACTUAL226_GIT_TREE'};
}
export function createSyntheticLegacyChain({root,sourceHead,composeSource,temporaryDirectory}) {
  sha(sourceHead);assert.equal(fs.realpathSync(root),root);assert.equal(fs.realpathSync(temporaryDirectory),temporaryDirectory);
  git(root,['merge-base','--is-ancestor',LEGACY_APPLICATION_BASE,sourceHead]);
  assert.equal(typeof composeSource,'string');
  const directory=fs.mkdtempSync(path.join(temporaryDirectory,'synthetic-legacy-index-')),index=path.join(directory,'index');
  const env={GIT_INDEX_FILE:index,GIT_AUTHOR_NAME:'Owned isolated fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Owned isolated fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid'};
  const indexGit=(args,input)=>git(root,args,{env,input}).trim();
  // A private alternate index never checks out, resets or edits the caller's tree/index.
  indexGit(['read-tree',LEGACY_APPLICATION_BASE]);
  const oldEntries=inventory(root,LEGACY_APPLICATION_BASE).split('\0').filter(Boolean);
  const removals=oldEntries.map(entry=>'0 '+ '0'.repeat(40)+'\t'+entry.slice(entry.indexOf('\t')+1)+'\0').join('');
  indexGit(['update-index','-z','--index-info'],removals+inventory(root,sourceHead));
  const legacyTree=indexGit(['write-tree']);
  const newOldSha=indexGit(['commit-tree',legacyTree,'-p',LEGACY_APPLICATION_BASE,'-m','fixture: synthetic migration-aligned legacy app; not exact226']);
  indexGit(['read-tree',sourceHead]);
  const composeBlob=indexGit(['hash-object','-w','--stdin'],composeSource);
  indexGit(['update-index','--add','--cacheinfo',`100644,${composeBlob},docker-compose.yml`]);
  const targetTree=indexGit(['write-tree']);
  // Both the synthetic old floor and the real reviewed source remain ancestors.
  const targetSha=indexGit(['commit-tree',targetTree,'-p',newOldSha,'-p',sourceHead,'-m','fixture: synthetic no-migration first-switch target']);
  assert.ok(names(root,sourceHead,targetSha).every(name=>name==='docker-compose.yml'),'Target application source must remain the exact reviewed source');
  const provenance=validateSyntheticLegacySource({root,sourceRevision:newOldSha,targetRevision:targetSha});
  return {newOldSha,targetSha,provenance:{...provenance,sourceHead,sourceTree:git(root,['rev-parse',`${sourceHead}^{tree}`]).trim()}};
}
