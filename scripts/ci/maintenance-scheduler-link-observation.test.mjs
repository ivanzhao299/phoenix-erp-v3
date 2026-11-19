import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {safeObservationUnit,safeObservationPath,requireSchedulerObservationContext,parseObservationUnits,parseObservationDefinitions,safeObservationPackages,collectSchedulerLinkObservation} from './maintenance-scheduler-link-observation.mjs';

const SHA='a'.repeat(40),REDACTED='REDACTED_INVALID_METADATA';
const env={CI:'true',GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'ivanzhao299/phoenix-erp-v3',GITHUB_JOB:'full-first-switch',GITHUB_SHA:SHA,GITHUB_RUN_ID:'123',RUNNER_TEMP:'/home/runner/work/_temp',NATIVE_FIXTURE_MAJOR:'16',NATIVE_SCHEDULER_FAILURE_EXIT:'1',NATIVE_FIXTURE_OUTPUT:'/home/runner/work/_temp/phoenix-full-first-switch-16'};
const stat=(kind='file',changes={})=>({isFile:()=>kind==='file',isSymbolicLink:()=>kind==='link',isDirectory:()=>kind==='directory',uid:0,mode:0o100600,nlink:1,size:100,dev:1,ino:1,mtimeMs:1,ctimeMs:1,...changes});
const context=()=>({uid:0,container:false,intent:{fixtureOnly:true,productionReceipt:false,sourceSha:SHA,major:16,disposition:'CREATE_ONLY_IN_EXCLUSIVE_DISPOSABLE_VM'},intentStat:stat(),head:SHA});

test('only the exact failed hosted first-switch fixture and sealed original intent are admitted',()=>{
 assert.doesNotThrow(()=>requireSchedulerObservationContext(env,context()));
 for(const update of [{CI:'false'},{GITHUB_ACTIONS:'false'},{RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_REPOSITORY:'foreign/repo'},{GITHUB_JOB:'other'},{GITHUB_SHA:'invalid'},{GITHUB_RUN_ID:'bad'},{NATIVE_FIXTURE_MAJOR:'17'},{NATIVE_SCHEDULER_FAILURE_EXIT:'0'},{NATIVE_FIXTURE_OUTPUT:'/data/production'}])assert.throws(()=>requireSchedulerObservationContext({...env,...update},context()),/CONTEXT_REQUIRED/);
 for(const update of [{uid:1000},{container:true},{head:'b'.repeat(40)},{intent:{...context().intent,productionReceipt:true}},{intentStat:stat('link')},{intentStat:stat('file',{uid:1000})},{intentStat:stat('file',{mode:0o100644})},{intentStat:stat('file',{nlink:2})},{intentStat:stat('file',{size:4097})}])assert.throws(()=>requireSchedulerObservationContext(env,{...context(),...update}),/REQUIRED/);
});
test('unit and ordinary path output is normalized, bounded and rejects control, secret and option shapes',()=>{
 assert.equal(safeObservationUnit('vendor@instance.service'),'vendor@instance.service');
 for(const value of ['--property=Environment.service','a\nsecret.service','a\0.service','a/b.service','x'.repeat(260)+'.service','a.socket'])assert.equal(safeObservationUnit(value),REDACTED);
 assert.equal(safeObservationPath('/usr/local/lib/systemd/../systemd/system/a.service'),'/usr/local/lib/systemd/system/a.service');
 for(const value of ['/private/a.service','/etc-evil/a.service','relative.service','/etc/a\nSECRET','/etc/a\0b','/opt/secret/unit.service','/usr/'+ 'x'.repeat(513)])assert.equal(safeObservationPath(value),REDACTED);
});
test('query inventory omits uninstantiated templates while preserving ordinary and dot-prefixed instances',()=>{
 assert.deepEqual(parseObservationUnits('template@.service static -\na.timer enabled -\nvendor@instance.service enabled -\nvendor@.bar.service enabled -\n'),['a.timer','vendor@.bar.service','vendor@instance.service']);
 assert.throws(()=>parseObservationUnits(Array.from({length:1025},(_,i)=>`a${i}.service enabled`).join('\n')),/UNIT_LIMIT/);
});
test('only the three requested systemd properties and filtered package names are consumed',()=>{
 const valid='Id=a.service\nLoadState=loaded\nFragmentPath=/etc/systemd/system/a.service';
 assert.equal(parseObservationDefinitions(valid).length,1);
 assert.equal(parseObservationDefinitions(valid+'\nEnvironment=PRIVATE').length,0);
 assert.equal(parseObservationDefinitions(valid+'\nId=other.service').length,0);
 assert.deepEqual(safeObservationPackages('systemd:amd64: /opt/unit.service','/opt/unit.service'),['systemd:amd64']);
 for(const value of ['PRIVATE stderr','vendor: /other/path','bad package: /opt/unit.service'])assert.deepEqual(safeObservationPackages(value,'/opt/unit.service'),['UNVERIFIED']);
});
function fixture(count=1){
 const units=Array.from({length:count},(_,i)=>`a${i}.service`),lookups=[];
 return {lookups,ops:{now:()=> '2026-11-17T00:00:00.000Z',list:()=>['template@.service static',...units.map(x=>x+' enabled')].join('\n'),
  show:names=>{lookups.push(...names);return names.map(name=>`Id=${name}\nLoadState=loaded\nFragmentPath=/etc/systemd/system/${name}`).join('\n\n');},
  stat:name=>stat(name.startsWith('/etc/')?'link':'file'),readlink:name=>'/opt/vendor/'+name.split('/').pop(),packages:()=>['vendor-package']}};
}
test('mixed template inventory still observes normal loaded links without falsely identifying the failure',()=>{
 const f=fixture(2),result=collectSchedulerLinkObservation(f.ops);
 assert.deepEqual(f.lookups,['a0.service','a1.service']);assert.equal(result.rows.length,2);assert.equal(result.failedObjectIdentified,false);
 assert.equal(result.productionReceipt,false);assert.equal(result.rows[0].directTarget,'/opt/vendor/a0.service');assert.equal(result.rows[0].targetType,'REGULAR');assert.equal(result.rows[0].stable,'STABLE');
});
test('non-loaded and ordinary regular fragments are omitted, row count and bytes remain bounded',()=>{
 const f=fixture(80),result=collectSchedulerLinkObservation(f.ops);assert.equal(result.rows.length,32);assert.equal(result.truncated,true);assert.ok(Buffer.byteLength(JSON.stringify(result))<=32768);
 const unloaded=fixture();unloaded.ops.show=()=> 'Id=a0.service\nLoadState=masked\nFragmentPath=/etc/systemd/system/a0.service';assert.equal(collectSchedulerLinkObservation(unloaded.ops).rows.length,0);
 const regular=fixture();regular.ops.stat=()=>stat('file');assert.equal(collectSchedulerLinkObservation(regular.ops).rows.length,0);
});
test('link replacement and filesystem failures become observations without raw private errors',()=>{
 const changed=fixture();let calls=0;changed.ops.readlink=()=> ++calls===1?'/opt/vendor/a0.service':'/opt/vendor/changed.service';assert.equal(collectSchedulerLinkObservation(changed.ops).rows[0].stable,'CHANGED');
 const failing=fixture();failing.ops.stat=name=>{if(name.startsWith('/opt/'))throw Object.assign(Error('PRIVATE STDERR'),{code:'EACCES'});return stat('link');};const result=collectSchedulerLinkObservation(failing.ops);assert.equal(result.rows[0].targetType,'UNREADABLE');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|STDERR/);
 const unsafe=fixture();unsafe.ops.readlink=()=>'/opt/secret/PRIVATE.service';const row=collectSchedulerLinkObservation(unsafe.ops).rows[0];assert.equal(row.directTarget,REDACTED);assert.equal(row.stable,'UNVERIFIED');assert.doesNotMatch(JSON.stringify(row),/PRIVATE/);
});
test('workflow invokes only post-failure metadata in env-i and preserves the original exit',()=>{
 const workflow=fs.readFileSync('.github/workflows/legacy-maintenance-fixture.yml','utf8'),section=workflow.split('  full-first-switch:')[1].split('  isolated-maintenance:')[0];
 const call=section.indexOf('maintenance-scheduler-link-observation.mjs');assert.ok(call>section.indexOf('if [ "$native_result" -ne 0 ]; then'));
 assert.match(section.slice(call,call+100),/\|\| true/);assert.match(section.slice(call),/exit "\$native_result"/);
 const script=fs.readFileSync(new URL('./maintenance-scheduler-link-observation.mjs',import.meta.url),'utf8');
 assert.match(script,/'--property=Id,LoadState,FragmentPath'/);assert.doesNotMatch(script,/--property=[^'\n]*(ExecStart|Environment)/);
 assert.match(script,/stdio:\['ignore','pipe','ignore'\]/);assert.match(section,/sudo \/usr\/bin\/env -i/);
});

test('a local or production invocation refuses before observations and emits no raw error',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['scripts/ci/maintenance-scheduler-link-observation.mjs'],{env:{PATH:'/usr/bin:/bin',CI:'false'},encoding:'utf8'});
 assert.equal(result.status,1);assert.equal(result.stderr,'');
 assert.deepEqual(JSON.parse(result.stdout),{schema:'phoenix.ci-scheduler-link-observation/v1',fixtureOnly:true,productionReceipt:false,status:'UNVERIFIED'});
});
