/** Actual owned local Git objects, synthetic package/lock/source contents.
 * No API compilation/container/startup/production version is proved here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { planPinnedLegacyApiSource, pinnedApiTreeHash } from './maintenance-pinned-api-source.fixture.mjs';
import { OwnedErpCandidateCapsule } from './maintenance-erp-candidate.fixture.mjs';
function fixture(change=()=>{}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'phoenix-owned-legacy-git-'));fs.chmodSync(root,0o700);
  const run=args=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null',...args],{cwd:root,env:{PATH:'/usr/bin:/bin',HOME:root},encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  run(['init','-q','-b','main']);run(['config','user.name','Isolated Fixture']);run(['config','user.email','fixture@example.invalid']);
  const put=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value)+'\n');};
  const lock={lockfileVersion:'9.0',importers:{'.':{},'apps/api':{dependencies:{sample:{specifier:'1.0.0',version:'1.0.0'}}}},packages:{'sample@1.0.0':{}},snapshots:{'sample@1.0.0':{}}};
  put('apps/api/package.json',{dependencies:{sample:'1.0.0'}});put('apps/api/tsconfig.json',{});put('apps/api/tsconfig.build.json',{});put('apps/api/src/main.ts','// actual synthetic old Git bytes\n');put('pnpm-lock.yaml',lock);
  const commit=message=>{run(['add','apps/api','pnpm-lock.yaml']);run(['commit','-qm',message]);return run(['rev-parse','HEAD']);};
  const old=commit('fixture initial source');put('apps/api/src/main.ts','// actual synthetic new Git bytes\n');change({put,lock,root,run});put('pnpm-lock.yaml',lock);const head=commit('fixture new source');
  return {root,old,head,put,lock,run,commit,read:()=>planPinnedLegacyApiSource({root,sourceSha:old,expectedHead:head})};
}
test('actual old objects remain selected despite changed current API source and root importer',()=>{
  const f=fixture(({lock})=>{lock.importers['.'].devDependencies={fixtureOnly:{specifier:'1',version:'1'}};});
  const value=f.read();assert.equal(value.sourceSha,f.old);assert.equal(value.builderHead,f.head);assert.equal(value.archiveSource,'EXACT_OLD_GIT_OBJECTS');
  assert.equal(value.fixtureOnly,true);assert.equal(value.productionAuthorized,false);assert.equal(value.buildExecuted,false);assert.equal(value.runtimeStartup,'NOT_RUN');
  assert.notEqual(value.sourceLockSha256,value.builderLockSha256);assert.match(value.lockedResolutionGraphSha256,/^[a-f0-9]{64}$/);
  const tree=f.run(['ls-tree','-r',f.old,'--','apps/api/src','apps/api/package.json','apps/api/tsconfig.json','apps/api/tsconfig.build.json']);
  assert.equal(value.sourceTreeHash,pinnedApiTreeHash(tree));assert.equal(value.sourceTreeHash,pinnedApiTreeHash(tree+'\n'));
  assert.equal(value.installedDependencyVerification,'NOT_RUN_EXISTING_MODULES_NOT_CERTIFIED');
});
for(const file of ['apps/api/package.json','apps/api/tsconfig.json','apps/api/tsconfig.build.json'])test('changed actual build control refuses '+file,()=>{
  const f=fixture(({put})=>put(file,{changed:true}));assert.throws(f.read,/API_BUILD_CONTROLS_CHANGED/);
});
for(const key of ['apiImporter','packages','snapshots'])test('changed resolution graph refuses '+key,()=>{
  const f=fixture(({lock})=>{if(key==='apiImporter')lock.importers['apps/api'].dependencies.sample.version='2.0.0';else lock[key]['extra@2.0.0']={};});
  assert.throws(f.read,/LOCKED_RESOLUTION_GRAPH_CHANGED/);
});
test('stale expected HEAD and nonancestor old object refuse',()=>{
  const f=fixture();assert.throws(()=>planPinnedLegacyApiSource({root:f.root,sourceSha:f.old,expectedHead:'d'.repeat(40)}),/BUILDER_HEAD_CHANGED/);
  assert.throws(()=>planPinnedLegacyApiSource({root:f.root,sourceSha:f.head,expectedHead:f.old}),/BUILDER_HEAD_CHANGED/);
  assert.throws(()=>planPinnedLegacyApiSource({root:f.root,sourceSha:'e'.repeat(40),expectedHead:f.head}),/SOURCE_UNAVAILABLE/);
  const unrelated=f.run(['commit-tree',f.run(['rev-parse','HEAD^{tree}']),'-m','fixture unrelated history']);
  assert.throws(()=>planPinnedLegacyApiSource({root:f.root,sourceSha:unrelated,expectedHead:f.head}),/SOURCE_UNAVAILABLE/);
});
test('replacement refs cannot change the actual archived source identity, and grafted history refuses',()=>{
  const f=fixture(),before=f.read();f.run(['replace',f.old,f.head]);assert.equal(f.read().sourceTreeHash,before.sourceTreeHash);
  const file=path.join(f.root,'.git/info/grafts');fs.writeFileSync(file,f.head+' '+f.old+'\n');assert.throws(f.read,/GRAFTED_SOURCE_HISTORY_UNSUPPORTED/);
});
test('ambiguous refs, same revision and unsupported lock shapes refuse before any build',()=>{
  const f=fixture();for(const sourceSha of ['main','HEAD','-c unsafe=true',f.head])assert.throws(()=>planPinnedLegacyApiSource({root:f.root,sourceSha,expectedHead:f.head}),/EXACT_OLD_NEW_SOURCE_REQUIRED/);
  const bad=fixture(({lock})=>{lock.lockfileVersion='8.0';});assert.throws(bad.read,/LOCKFILE_GRAPH_UNSUPPORTED/);
});
test('builder accepts no arbitrary ref, command or module option',async()=>{
  for(const value of [{ref:'main'},{command:'anything'},{modulePath:'other'},null,[]])await assert.rejects(OwnedErpCandidateCapsule.prototype.build.call({},value),/FIXED_BUILD_OPTIONS_REQUIRED/);
});

import { requireOldSourceCapsule } from './maintenance-legacy-api.fixture.mjs';
test('legacy startup only accepts exact old source plan and real image identity',()=>{
  const old='226878864f184d26f41a890e666ebed52547db14';
  const c={sourceSha:old,imageId:'sha256:'+'a'.repeat(64),legacySourcePlan:{sourceSha:old,productionAuthorized:false}};
  assert.equal(requireOldSourceCapsule(c),true);
  for(const change of [x=>x.sourceSha='b'.repeat(40),x=>x.legacySourcePlan.sourceSha='b'.repeat(40),x=>x.imageId='tag:legacy',x=>x.legacySourcePlan.productionAuthorized=true]){
    const bad=structuredClone(c);change(bad);assert.throws(()=>requireOldSourceCapsule(bad));
  }
});

test('an imported owned helper refuses changed source bytes instead of certifying new bytes',async()=>{
  const directory=fs.mkdtempSync(new URL('../../artifacts/legacy-helper-drift-',import.meta.url));
  const original=new URL('./maintenance-pinned-api-source.fixture.mjs',import.meta.url);
  const helper=path.join(directory,'owned-helper.mjs');
  const receiptModule=new URL('../ops/production-maintenance-receipts.mjs',import.meta.url).href;
  fs.writeFileSync(helper,fs.readFileSync(original,'utf8').replace('../ops/production-maintenance-receipts.mjs',receiptModule),{mode:0o600});
  const loaded=await import(new URL('file://'+helper));
  assert.match(loaded.pinnedApiSourceHelperIdentity(),/^[a-f0-9]{64}$/);
  fs.appendFileSync(helper,'\n// owned fault: changed after import\n');
  assert.throws(()=>loaded.pinnedApiSourceHelperIdentity(),/LOADED_HELPER_SOURCE_CHANGED/);
  assert.throws(()=>loaded.planPinnedLegacyApiSource({}),/LOADED_HELPER_SOURCE_CHANGED/);
});

import { legacyStopBudget } from './maintenance-legacy-api.fixture.mjs';
test('legacy stop acceptance budget only decreases and rejects deadline/clock failure',()=>{
  let now=100;const remaining=legacyStopBudget(1000,()=>now);assert.equal(remaining(),1000);
  now=225.2;assert.equal(remaining(),874);now=1100;assert.throws(remaining,/DEADLINE_HOLD/);
  now=100;const rollback=legacyStopBudget(1000,()=>now);now=90;assert.throws(rollback,/CLOCK_HOLD/);
  for(const bad of [NaN,Infinity]){const invalid=legacyStopBudget(1000,()=>bad);assert.throws(invalid,/CLOCK_HOLD/);}
});
