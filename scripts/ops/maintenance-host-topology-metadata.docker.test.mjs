/** Actual root metadata reads on an explicitly owned network-none container.
 * No host process inspection, production credentials or production operations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
test('owned root package FD/path checks, replacement and bounded proc reads',{skip:process.env.TOPOLOGY_LOCAL_METADATA_FIXTURE!=='1'},()=>{
 const owner=randomUUID(),name='phoenix-metadata-'+owner;
 const source=fileURLToPath(new URL('./maintenance-host-topology-diagnostic.mjs',import.meta.url));
 const run=args=>execFileSync('/usr/bin/docker',['--host','unix:///var/run/docker.sock',...args],{env:{PATH:'/usr/bin:/bin'},encoding:'utf8',timeout:15000,maxBuffer:32768,stdio:['ignore','pipe','pipe']}).trim();
 const image=run(['image','inspect','node:20-alpine','--format','{{.Id}}']);assert.match(image,/^sha256:[a-f0-9]{64}$/);
 const code=`import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
 import {readNodeCwdPackage,boundedProcCommandLine,projectNodeEntry} from '/fixture/topology.mjs';
 const secret='DO_NOT_EXPORT_SENSITIVE_SENTINEL',root='/root/owned',file=root+'/package.json',cases=[];
 fs.mkdirSync(root,{mode:0o755});
 const seed=()=>{fs.writeFileSync(file,JSON.stringify({name:'owned-fixture',version:'1.2.3',scripts:{start:secret},password:secret}),{mode:0o600});fs.chmodSync(file,0o600);};
 const read=()=>readNodeCwdPackage(root,()=>{});seed();
 assert.deepEqual(read(),{packageEvidenceClass:'CWD_PACKAGE_METADATA_ONLY',packageName:'owned-fixture',packageVersion:'1.2.3'});cases.push('ACTUAL_ROOT_FILE');
 fs.writeFileSync(file,JSON.stringify({name:'owned-fixture',version:secret}));assert.equal(read().packageEvidenceClass,'UNVERIFIED');cases.push('SENSITIVE_VALUE_REDACTED');seed();
 fs.renameSync(file,root+'/saved');fs.symlinkSync(root+'/saved',file);assert.throws(read);fs.unlinkSync(file);fs.renameSync(root+'/saved',file);cases.push('ACTUAL_SYMLINK_REFUSED');
 fs.linkSync(file,root+'/linked');assert.throws(read);fs.unlinkSync(root+'/linked');cases.push('ACTUAL_HARDLINK_REFUSED');
 fs.chmodSync(file,0o666);assert.throws(read);fs.chmodSync(file,0o600);cases.push('ACTUAL_WRITABLE_FILE_REFUSED');
 fs.chmodSync(root,0o777);assert.throws(read);fs.chmodSync(root,0o755);cases.push('ACTUAL_WRITABLE_DIRECTORY_REFUSED');
 const open=fs.openSync;let replaced=false;
 try{fs.openSync=function(path,...args){if(path===file&&!replaced){replaced=true;fs.renameSync(file,root+'/original');seed();}return open.call(fs,path,...args);};assert.throws(read);}finally{fs.openSync=open;}
 assert.equal(replaced,true);cases.push('ACTUAL_PATH_REPLACEMENT_REFUSED');
 fs.unlinkSync(file);seed();let fifo=false;
 try{fs.openSync=function(path,...args){if(path===file&&!fifo){fifo=true;fs.renameSync(file,root+'/before-fifo');execFileSync('/usr/bin/mkfifo',[file],{stdio:'ignore'});}return open.call(fs,path,...args);};assert.throws(read);}finally{fs.openSync=open;}
 assert.equal(fifo,true);fs.unlinkSync(file);seed();cases.push('ACTUAL_FIFO_REPLACEMENT_REFUSED_WITHOUT_BLOCK');
 for(const stage of ['lstat','open','read']){
  let expired=false,afterExpiry=0,fd=null,closed=false;
  const native={lstatSync:fs.lstatSync,openSync:fs.openSync,fstatSync:fs.fstatSync,readSync:fs.readSync,closeSync:fs.closeSync};
  try{
   fs.lstatSync=function(path,...args){if(expired)afterExpiry++;const value=native.lstatSync.call(fs,path,...args);if(stage==='lstat'&&path===file)expired=true;return value;};
   fs.openSync=function(path,...args){if(expired)afterExpiry++;const value=native.openSync.call(fs,path,...args);if(path===file){fd=value;if(stage==='open')expired=true;}return value;};
   fs.fstatSync=function(...args){if(expired)afterExpiry++;return native.fstatSync.apply(fs,args);};
   fs.readSync=function(...args){if(expired)afterExpiry++;const value=native.readSync.apply(fs,args);if(stage==='read')expired=true;return value;};
   fs.closeSync=function(value){if(value===fd)closed=true;return native.closeSync.call(fs,value);};
   assert.throws(()=>readNodeCwdPackage(root,()=>{if(expired)throw Error('BUDGET');}),/BUDGET/);
   assert.equal(afterExpiry,0);if(fd!==null)assert.equal(closed,true);
  }finally{Object.assign(fs,native);}
  cases.push('BUDGET_AFTER_'+stage.toUpperCase());
 }
 assert.throws(()=>readNodeCwdPackage(root,()=>{throw Error('BUDGET');}),/BUDGET/);cases.push('BUDGET_REFUSED');
 const argv=boundedProcCommandLine('/proc/'+process.pid+'/cmdline',()=>{});assert.equal(projectNodeEntry(argv).entryClass,'UNVERIFIED');cases.push('ACTUAL_PROC_EVAL_NOT_SCRIPT');
 assert.throws(()=>boundedProcCommandLine('/proc/'+process.pid+'/environ',()=>{}));cases.push('ENVIRONMENT_PATH_REFUSED');
 process.stdout.write(JSON.stringify({fixtureOnly:true,productionAuthority:false,uid:process.getuid(),cases}));`;
 let id;
 const verify=()=>{const pin=JSON.parse(run(['inspect',id,'--format','[{{json .Id}},{{json .Image}},{{json .Name}},{{json (index .Config.Labels "phoenix.fixture.owner")}},{{json .State.Running}}]']));assert.deepEqual(pin.slice(0,4),[id,image,'/'+name,owner]);return pin;};
 try{
  id=run(['create','--name',name,'--label','phoenix.fixture.owner='+owner,'--network','none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
   '--tmpfs','/root:rw,nosuid,nodev,size=1048576,mode=0700','--mount','type=bind,source='+source+',target=/fixture/topology.mjs,readonly',image,'node','--input-type=module','-e',code]);
  assert.match(id,/^[a-f0-9]{64}$/);assert.equal(verify()[4],false);
  const result=JSON.parse(run(['start','--attach',id]));assert.equal(result.uid,0);assert.equal(result.fixtureOnly,true);assert.equal(result.productionAuthority,false);assert.equal(result.cases.length,14);
  assert.equal(verify()[4],false);assert.equal(run(['inspect',id,'--format','{{.State.ExitCode}}']),'0');
 }finally{if(id){const pin=verify();if(pin[4]===false)run(['rm',id]);}}
});
