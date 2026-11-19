import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareCutoverRuntimeBundle,verifyCutoverRuntimeBundle,pinnedCutoverTreeHelper} from './production-cutover-runtime-bundle.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const artifacts=path.join(root,'artifacts/production-inbound-installments-20261118/runtime-bundle-fixtures');
const treeScript=path.join(root,'scripts/ops/production-cutover-runtime-tree.py');
const imageId='sha256:'+'c'.repeat(64),revision='a'.repeat(40),container='d'.repeat(64);
const apiPin=(imageId,revision)=>({containerId:'e'.repeat(64),imageId,revision,running:true,pid:1234,startedAt:'2026-11-19T00:00:00.000000001Z',restartCount:0,status:'running'});
const py=(source,args=[])=>{
  const result=spawnSync('/usr/bin/python3',['-I','-S','-c',source,...args],{encoding:'utf8',maxBuffer:64*1024*1024,timeout:120000});
  assert.equal(result.status,0,result.stderr);return result.stdout;
};
const treeCall=(directory,action,helper=treeScript)=>JSON.parse(py(`import importlib.util,json,os,pathlib,sys
spec=importlib.util.spec_from_file_location('tree',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
base=pathlib.Path(sys.argv[2]);uid=os.getuid()
result=m.materialize({key:base/(key+'.tar') for key in m.ROOTS},base/'tree',uid,json.loads((base/'workspace-target.json').read_text())) if sys.argv[3]=='materialize' else m.collect_tree(base/'tree',uid)
print(json.dumps(result,separators=(',',':')))
`,[helper,directory,action]));
function ownedDirectory(){fs.mkdirSync(artifacts,{recursive:true,mode:0o700});return fs.mkdtempSync(path.join(artifacts,'owned-'));}
function inspect(directory){const s=fs.lstatSync(directory);assert(s.isDirectory()&&!s.isSymbolicLink());assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o7777,0o700);return [s.dev,s.ino,s.uid,s.mode];}
function readPinned(file){const s=fs.lstatSync(file);assert(s.isFile()&&!s.isSymbolicLink());assert.equal(s.uid,process.getuid());assert.equal(s.mode&0o7777,0o600);assert.equal(s.nlink,1);return fs.readFileSync(file);}
function createArchives(directory){
  py(`import io,pathlib,tarfile,sys
root=pathlib.Path(sys.argv[1])
members={'dist':[('dist',None),('dist/scripts',None),('dist/scripts/production-cutover-apply.js',b'module.exports={owned:true};')],
'node_modules':[('node_modules',None),('node_modules/owned.js',b'module.exports=42;')], 'package.json':[('package.json',b'{"private":true}')]}
for key,rows in members.items():
 with tarfile.open(root/(key+'.tar'),'w') as archive:
  for name,body in rows:
   row=tarfile.TarInfo(name);row.type=tarfile.DIRTYPE if body is None else tarfile.REGTYPE;row.size=len(body or b'');archive.addfile(row,io.BytesIO(body) if body is not None else None)
 (root/(key+'.tar')).chmod(0o600)
`,[directory]);
}
function fixture({onCommand,onPin}={}){
  const stateDirectory=ownedDirectory(),templates=path.join(stateDirectory,'templates');fs.mkdirSync(templates,{mode:0o700});createArchives(templates);
  const binding={bundleId:randomUUID(),imageId,revision},calls=[];
  const dependencies={stateDirectory,uid:process.getuid(),guard(){},inspect,readPinned,helperBytes:()=>fs.readFileSync(treeScript),
    observeApi(){return onPin?.(calls)??apiPin(imageId,revision);},
    materialize:(directory,helper)=>treeCall(directory,'materialize',helper),scan:(directory,helper)=>treeCall(directory,'verify',helper),
    command(program,args,options){
      calls.push([program,args]);const override=onCommand?.(program,args,options,calls);if(override!==undefined)return override;
      if(program==='/usr/bin/docker'){
        if(args[0]==='image')return [imageId,revision,'linux',{x64:'amd64',arm64:'arm64'}[process.arch],null].map(JSON.stringify).join('\t');
        if(args[0]==='create')return container;
        if(args[0]==='inspect')return [container,imageId,'created',false,0,[],'none',true,binding.bundleId,['/bin/false']].map(JSON.stringify).join('\t');
        if(args[0]==='rm')return container;
      }
      if(program==='/usr/bin/python3'&&args[4]==='cp'){
        const match=args[5].match(/:\/app\/(dist|node_modules|package.json)$/);assert(match);
        fs.writeSync(options.stdout,fs.readFileSync(path.join(templates,match[1]+'.tar')));return '';
      }
      if(program==='/usr/bin/python3'&&args[4]===container)return '[200,404]';
      throw Error('OWNED_UNEXPECTED_COMMAND');
    }};
  return {binding,dependencies,calls,stateDirectory};
}

test('rejects unknown fields and noncanonical image/source/bundle bindings before any effects',()=>{
  let calls=0;
  for(const binding of [{}, {bundleId:'../../outside',imageId,revision}, {bundleId:randomUUID(),imageId:'mutable:tag',revision},
    {bundleId:randomUUID(),imageId,revision,command:'OWNED_PRIVATE_CANARY'}]){
    assert.throws(()=>prepareCutoverRuntimeBundle(binding,{guard(){calls++;}}),/EXACT_IMAGE_REVISION_BUNDLE_REQUIRED/);
  }
  assert.equal(calls,0);
});
test('prepares exactly three never-started exports and verifies the actual materialized tree without granting authority',()=>{
  const f=fixture(),receipt=prepareCutoverRuntimeBundle(f.binding,f.dependencies);
  assert.equal(receipt.containerNeverStarted,true);assert.equal(receipt.sourceArtifactVerified,false);assert.equal(receipt.abiVerified,false);
  assert.equal(receipt.databaseInitialized,false);assert.equal(receipt.activationAuthorized,false);assert.equal(receipt.archives.length,3);
  assert.equal(f.calls.filter(([p,a])=>p==='/usr/bin/python3'&&a[4]==='cp').length,3);
  assert(!f.calls.some(([,a])=>['start','run','exec','kill','stop'].includes(a[0])));
  assert.deepEqual(f.calls.at(-1),['/usr/bin/docker',['rm',container]]);
  const verified=verifyCutoverRuntimeBundle(f.binding,f.dependencies);
  assert.equal(verified.receipt.treeSha256,receipt.treeSha256);
  assert.equal(fs.readFileSync(path.join(verified.tree,'node_modules/owned.js'),'utf8'),'module.exports=42;');
  assert.equal(verifyCutoverRuntimeBundle({revision:f.binding.revision,imageId:f.binding.imageId,bundleId:f.binding.bundleId},f.dependencies).receipt.treeSha256,receipt.treeSha256);
});
test('retains a prepared bundle and refuses a second export into the same identity',()=>{
  const f=fixture();prepareCutoverRuntimeBundle(f.binding,f.dependencies);f.calls.length=0;
  assert.throws(()=>prepareCutoverRuntimeBundle(f.binding,f.dependencies),/EXISTING_BUNDLE_RETAINED/);assert.equal(f.calls.length,0);
});
test('requires image identity, host architecture and no image-declared volumes before creating a container',()=>{
  const f=fixture({onCommand(program,args){if(args[0]==='image')return [imageId,revision,'linux','other',{bad:{}}].map(JSON.stringify).join('\t');}});
  assert.throws(()=>prepareCutoverRuntimeBundle(f.binding,f.dependencies),/IMAGE_IDENTITY_ARCH_OR_VOLUMES/);
  assert(!f.calls.some(([,args])=>args[0]==='create'));
});
test('a running, mounted or otherwise changed container is retained and never copied or forcibly removed',()=>{
  const f=fixture({onCommand(program,args){if(args[0]==='inspect')return [container,imageId,'running',true,123,[],'none',true,'wrong',['/bin/false']].map(JSON.stringify).join('\t');}});
  assert.throws(()=>prepareCutoverRuntimeBundle(f.binding,f.dependencies),/NEVER_STARTED_PRIVATE_CONTAINER_REQUIRED/);
  assert(!f.calls.some(([,args])=>args[0]==='rm'||args[4]==='cp'));
  assert(!fs.existsSync(path.join(f.stateDirectory,'cutover-runtime-'+f.binding.bundleId,'prepared.json')));
});
test('a changed running API pin after copying cannot produce a ready receipt',()=>{
  const f=fixture({onPin(calls){if(calls.some(([,args])=>args[4]==='cp'))return apiPin('sha256:'+'f'.repeat(64),revision);}});
  assert.throws(()=>prepareCutoverRuntimeBundle(f.binding,f.dependencies),/RUNNING_API_IMAGE_CHANGED/);
  assert(!fs.existsSync(path.join(f.stateDirectory,'cutover-runtime-'+f.binding.bundleId,'prepared.json')));
});
test('full revalidation rejects changed module bytes and added dependencies',()=>{
  for(const mutation of ['bytes','extra']){
    const f=fixture();prepareCutoverRuntimeBundle(f.binding,f.dependencies);
    const tree=path.join(f.stateDirectory,'cutover-runtime-'+f.binding.bundleId,'tree');
    const file=path.join(tree,'node_modules',mutation==='bytes'?'owned.js':'unexpected.js');
    fs.writeFileSync(file,'module.exports="OWNED_CHANGED";',{mode:0o600});
    assert.throws(()=>verifyCutoverRuntimeBundle(f.binding,f.dependencies),/TREE_CHANGED/);
  }
});
test('private tree manifest bytes are bound before scanning or using the module',()=>{
  const f=fixture();prepareCutoverRuntimeBundle(f.binding,f.dependencies);
  fs.appendFileSync(path.join(f.stateDirectory,'cutover-runtime-'+f.binding.bundleId,'runtime-tree.json'),' ');
  assert.throws(()=>verifyCutoverRuntimeBundle(f.binding,f.dependencies),/BUNDLE_BINDING/);
});
test('revalidation rejects stopped or replaced API processes before and after the full tree scan',()=>{
  for(const change of ['stopped','paused','restart','image','after-scan']){
    const f=fixture();prepareCutoverRuntimeBundle(f.binding,f.dependencies);let changed=change!=='after-scan';
    f.dependencies.observeApi=()=>({...apiPin(imageId,revision),...(changed?(change==='image'?{imageId:'sha256:'+'f'.repeat(64)}:change==='restart'?{restartCount:1,pid:4321}:change==='paused'?{status:'paused'}:{running:false,pid:0}):{})});
    if(change==='after-scan')f.dependencies.scan=(directory,helper)=>{const result=treeCall(directory,'verify',helper);changed=true;return result;};
    assert.throws(()=>verifyCutoverRuntimeBundle(f.binding,f.dependencies),/RUNNING_API_IMAGE_CHANGED/);
  }
});
test('preparation receipts cannot be relabeled as artifact or ABI admission and have one fixed entry',()=>{
  for(const patch of [{sourceArtifactVerified:true},{abiVerified:true},{entry:'dist/main.js'},{sourceArtifactVerified:null}]){
    const f=fixture();prepareCutoverRuntimeBundle(f.binding,f.dependencies);
    const file=path.join(f.stateDirectory,'cutover-runtime-'+f.binding.bundleId,'prepared.json'),receipt=JSON.parse(readPinned(file));
    fs.writeFileSync(file,JSON.stringify({...receipt,...patch}));assert.throws(()=>verifyCutoverRuntimeBundle(f.binding,f.dependencies),/BUNDLE_BINDING/);
  }
});
test('the Python helper comes from hash-verified Git objects and ignores a replaced checkout file',()=>{
  const repository=ownedDirectory(),directory=path.join(repository,'scripts/ops');fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const helper=path.join(directory,'production-cutover-runtime-tree.py'),original=Buffer.from('print("OWNED_PINNED_SOURCE")\n');fs.writeFileSync(helper,original);
  const git=args=>{const result=spawnSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','user.name=Owned Fixture','-c','user.email=owned@example.invalid',...args],
    {cwd:repository,env:{PATH:'/usr/bin:/bin'},encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
  git(['init','-q']);git(['add','scripts/ops/production-cutover-runtime-tree.py']);git(['commit','-qm','Owned helper fixture']);const revision=git(['rev-parse','HEAD']);
  assert.deepEqual(pinnedCutoverTreeHelper(revision,repository),original);
  fs.writeFileSync(helper,'raise Exception("OWNED_UNTRUSTED_CHECKOUT")\n');assert.deepEqual(pinnedCutoverTreeHelper(revision,repository),original);
});
test('the workspace observation must distinguish a real target from an absent target and a failed read',()=>{
  for(const statuses of [[200,500],[404,404],[500,404]]){
    const f=fixture({onCommand(program,args){if(program==='/usr/bin/python3'&&args[4]===container)return JSON.stringify(statuses);}});
    assert.throws(()=>prepareCutoverRuntimeBundle(f.binding,f.dependencies),/WORKSPACE_TARGET_OBSERVATION_FAILED/);
    assert(!f.calls.some(([,args])=>args[4]==='cp'));
  }
  const f=fixture({onCommand(program,args){if(program==='/usr/bin/python3'&&args[4]===container)return '[200,200]';}});
  const receipt=prepareCutoverRuntimeBundle(f.binding,f.dependencies);
  assert.deepEqual(receipt.sourceTransformations,[]);assert(verifyCutoverRuntimeBundle(f.binding,f.dependencies));
});
test('source projection and original archive evidence cannot be changed independently of the bound source envelope',()=>{
  for(const change of ['projection','archive']){
    const f=fixture();prepareCutoverRuntimeBundle(f.binding,f.dependencies);
    const directory=path.join(f.stateDirectory,'cutover-runtime-'+f.binding.bundleId);
    if(change==='archive')fs.appendFileSync(path.join(directory,'dist.tar'),'OWNED_CHANGED');
    else{
      const file=path.join(directory,'prepared.json'),receipt=JSON.parse(readPinned(file));
      receipt.sourceTransformations=[{kind:'DROP_UNRESOLVABLE_BUILD_WORKSPACE_SELF_LINK',path:'node_modules/.pnpm/node_modules/phoenix-erp-v3-nest',target:'../../../../workspace/apps/api'}];
      fs.writeFileSync(file,JSON.stringify(receipt));
    }
    assert.throws(()=>verifyCutoverRuntimeBundle(f.binding,f.dependencies),/SOURCE_(?:EVIDENCE_BINDING|ARCHIVE_CHANGED)/);
  }
});

test('owned local image exports through an actual never-started Docker container and validates the full pnpm tree',{
  skip:!process.env.CUTOVER_RUNTIME_OWNED_IMAGE,timeout:180000},()=>{
  const imageId=process.env.CUTOVER_RUNTIME_OWNED_IMAGE,revision=process.env.CUTOVER_RUNTIME_OWNED_REVISION;
  assert.match(imageId,/^sha256:[a-f0-9]{64}$/);assert.match(revision,/^[a-f0-9]{40}$/);
  const inspected=spawnSync('/usr/bin/docker',['image','inspect',imageId,'--format','{{index .Config.Labels "phoenix.fixture"}}'],{encoding:'utf8'});
  assert.equal(inspected.status,0);
  if(process.env.CUTOVER_RUNTIME_OWNED_IMAGE_TAG){
    const tag=process.env.CUTOVER_RUNTIME_OWNED_IMAGE_TAG;assert.match(tag,/^phoenix-installments-local-api:[a-f0-9]{8,40}$/);
    const local=spawnSync('/usr/bin/docker',['image','inspect',tag,'--format','{{.Id}}\t{{index .Config.Labels "org.opencontainers.image.revision"}}'],{encoding:'utf8'});
    assert.equal(local.status,0);assert.equal(local.stdout.trim(),imageId+'\t'+revision);
  }else assert.equal(inspected.stdout.trim(),'cutover-runtime-module-only');
  const stateDirectory=ownedDirectory(),binding={imageId,revision,bundleId:randomUUID()};
  const dependencies={stateDirectory,uid:process.getuid(),guard(){},inspect,readPinned,helperBytes:()=>fs.readFileSync(treeScript),
    observeApi:()=>apiPin(imageId,revision),materialize:(directory,helper)=>treeCall(directory,'materialize',helper),scan:(directory,helper)=>treeCall(directory,'verify',helper)};
  const receipt=prepareCutoverRuntimeBundle(binding,dependencies),verified=verifyCutoverRuntimeBundle(binding,dependencies);
  assert(verified.receipt.containerNeverStarted);assert.equal(receipt.activationAuthorized,false);
  fs.writeFileSync(path.join(artifacts,'actual-image-export-receipt.json'),JSON.stringify({owned:true,production:false,binding,directory:verified.directory,receipt},null,2)+'\n',{mode:0o600});
});
