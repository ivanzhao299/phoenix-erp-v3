/** Preparation only: export a never-started container from the exact running API
 * image, then verify the complete private tree. No application import, DB,
 * role/issuer bootstrap, fencing, activation, or arbitrary command/CLI input. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CONTRACT, verifyContext, requireCleanMain} from './production-config-guard.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {inspectTrustedDirectory, assertSameDirectory, assertRegularFile, readPinnedFile} from './production-trusted-paths.mjs';

const hold=code=>{throw Error('CUTOVER_RUNTIME_HOLD='+code);};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/,ID=/^[a-f0-9]{64}$/;
const ROOTS=['dist','node_modules','package.json'];
const SELF_TRANSFORM={kind:'DROP_UNRESOLVABLE_BUILD_WORKSPACE_SELF_LINK',path:'node_modules/.pnpm/node_modules/phoenix-erp-v3-nest',target:'../../../../workspace/apps/api'};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const IMAGE_FORMAT='{{json .Id}}\t{{json (index .Config.Labels "org.opencontainers.image.revision")}}\t{{json .Os}}\t{{json .Architecture}}\t{{json (index .Config "Volumes")}}';
const CONTAINER_FORMAT='{{json .Id}}\t{{json .Image}}\t{{json .State.Status}}\t{{json .State.Running}}\t{{json .State.Pid}}\t{{json .Mounts}}\t{{json .HostConfig.NetworkMode}}\t{{json .HostConfig.ReadonlyRootfs}}\t{{json (index .Config.Labels "phoenix.cutover.runtime-bundle")}}\t{{json .Config.Entrypoint}}';
const API_FORMAT='{{json .Id}}\t{{json .Image}}\t{{json .State.Running}}\t{{json .State.Pid}}\t{{json .State.StartedAt}}\t{{json .RestartCount}}\t{{json .State.Status}}';
const LIMITED_DOCKER_COPY="import os,resource,sys\nresource.setrlimit(resource.RLIMIT_FSIZE,(536870912,536870912))\nos.execve('/usr/bin/docker',['/usr/bin/docker',*sys.argv[1:]],dict(os.environ))\n";
const WORKSPACE_HEAD=`import http.client,json,re,socket,sys
if not re.fullmatch('[a-f0-9]{64}',sys.argv[1]):sys.exit(2)
class Unix(http.client.HTTPConnection):
 def connect(self):
  self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.settimeout(3);self.sock.connect('/var/run/docker.sock')
statuses=[]
for encoded in ('%2Fapp%2Fpackage.json','%2Fworkspace%2Fapps%2Fapi'):
 connection=Unix('localhost',timeout=3)
 try:
  connection.request('HEAD','/containers/'+sys.argv[1]+'/archive?path='+encoded);statuses.append(connection.getresponse().status)
 finally:connection.close()
print(json.dumps(statuses))
`;

function requestBinding(request){
  if(!request||Object.getPrototypeOf(request)!==Object.prototype||!same(Object.keys(request).sort(),['bundleId','imageId','revision'])
    ||!UUID.test(request.bundleId)||!IMAGE.test(request.imageId)||!SHA.test(request.revision))hold('EXACT_IMAGE_REVISION_BUNDLE_REQUIRED');
  return {bundleId:request.bundleId,imageId:request.imageId,revision:request.revision};
}
function command(program,args,{stdout,limit=65536,timeout=10000}={}){
  const result=spawnSync(program,args,{env:executionEnv(),stdio:['ignore',stdout??'pipe','pipe'],encoding:'utf8',timeout,maxBuffer:limit});
  if(result.error||result.signal||result.status!==0)hold('BOUNDED_COMMAND_FAILED');
  return stdout===undefined?result.stdout.trim():'';
}
function fsyncDirectory(directory){
  const fd=fs.openSync(directory,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
  try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function immutableBytes(file,bytes,uid){
  const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  try{fs.fchmodSync(fd,0o600);assertRegularFile(fs.fstatSync(fd),{uid});fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}
  finally{fs.closeSync(fd);}
  fsyncDirectory(path.dirname(file));
}
const immutableJson=(file,value,uid)=>immutableBytes(file,JSON.stringify(value)+'\n',uid);
function rows(value){try{return value.split('\t').map(JSON.parse);}catch{hold('INSPECTION_FORMAT');}}
function validateApiPin(pin,binding){
  if(!pin||!same(Object.keys(pin).sort(),['containerId','imageId','pid','restartCount','revision','running','startedAt','status'])
    ||!ID.test(pin.containerId)||pin.imageId!==binding.imageId||pin.revision!==binding.revision||pin.running!==true||pin.status!=='running'
    ||!Number.isSafeInteger(pin.pid)||pin.pid<2||!Number.isSafeInteger(pin.restartCount)||pin.restartCount<0
    ||typeof pin.startedAt!=='string'||!Number.isFinite(Date.parse(pin.startedAt))||Date.parse(pin.startedAt)<=0)hold('RUNNING_API_IMAGE_CHANGED');
}
function observeApi(run){
  const [containerId,imageId,running,pid,startedAt,restartCount,status]=rows(run('/usr/bin/docker',['inspect','phoenix-v3-api','--format',API_FORMAT]));
  if(!IMAGE.test(imageId??''))hold('RUNNING_API_IMAGE_CHANGED');
  const value=rows(run('/usr/bin/docker',['image','inspect',imageId,'--format',IMAGE_FORMAT]));
  return {containerId,imageId,running,pid,startedAt,restartCount,status,revision:value[1]};
}
/** Verify each Git object's actual SHA-1, including the commit and every tree,
 * rather than executing a mutable checkout file after a clean-status check. */
export function pinnedCutoverTreeHelper(revision,repository=CONTRACT.repository){
  if(!SHA.test(revision))hold('EXACT_HELPER_REVISION');
  const object=(type,id)=>{
    const result=spawnSync('/usr/bin/git',['-c',`safe.directory=${repository}`,'-c','core.hooksPath=/dev/null','-C',repository,'cat-file',type,id],
      {env:executionEnv(),encoding:null,stdio:['ignore','pipe','pipe'],timeout:10000,maxBuffer:8*1024*1024});
    if(result.error||result.signal||result.status!==0||createHash('sha1').update(`${type} ${result.stdout.length}\0`).update(result.stdout).digest('hex')!==id)hold('HELPER_GIT_OBJECT');
    return result.stdout;
  };
  const commit=object('commit',revision),match=/^tree ([a-f0-9]{40})\n/.exec(commit.toString('utf8'));
  if(!match)hold('HELPER_COMMIT_TREE');let id=match[1];
  for(const [i,segment] of ['scripts','ops','production-cutover-runtime-tree.py'].entries()){
    const tree=object('tree',id);let offset=0,found;
    while(offset<tree.length){
      const end=tree.indexOf(0,offset);if(end<0||end+21>tree.length)hold('HELPER_TREE_FORMAT');
      const header=tree.subarray(offset,end).toString('utf8'),space=header.indexOf(' ');
      if(space<0)hold('HELPER_TREE_FORMAT');
      if(header.slice(space+1)===segment){if(found)hold('HELPER_TREE_DUPLICATE');found={mode:header.slice(0,space),id:tree.subarray(end+1,end+21).toString('hex')};}
      offset=end+21;
    }
    if(!found||(i<2?found.mode!=='40000':!['100644','100755'].includes(found.mode)))hold('HELPER_REGULAR_GIT_SOURCE_REQUIRED');id=found.id;
  }
  return object('blob',id);
}

/** Dependencies exist for owned read-only-image fixture transport, never CLI
 * flags. Production callers use the defaults, including UID 0/FD9/clean main.
 * This receipt alone is not source-artifact, ABI, or execution admission. */
export function prepareCutoverRuntimeBundle(request,dependencies={}){
  const binding=requestBinding(request),state=dependencies.stateDirectory??CONTRACT.stateDirectory;
  const directory=path.join(state,'cutover-runtime-'+binding.bundleId),tree=path.join(directory,'tree');
  const guard=dependencies.guard??(()=>{verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);requireCleanMain(CONTRACT.repository,binding.revision);});
  const inspect=dependencies.inspect??(directory=>inspectTrustedDirectory(directory,CONTRACT));
  const run=dependencies.command??command,uid=dependencies.uid??0;
  const pins=dependencies.observeApi??(()=>observeApi(run));
  const read=dependencies.readPinned??(file=>readPinnedFile(file,{contract:CONTRACT,uid},{inspectDirectory:inspect}));
  const script=path.join(directory,'runtime-tree-helper.py');let apiPin;
  const check=()=>{guard();const actual=pins();validateApiPin(actual,binding);if(apiPin&&!same(actual,apiPin))hold('RUNNING_API_IMAGE_CHANGED');apiPin=structuredClone(actual);};
  check();const parent=inspect(state);
  if(fs.existsSync(directory)||fs.lstatSync(directory,{throwIfNoEntry:false}))hold('EXISTING_BUNDLE_RETAINED');
  fs.mkdirSync(directory,{mode:0o700});fs.mkdirSync(tree,{mode:0o700});fsyncDirectory(directory);fsyncDirectory(state);
  assertSameDirectory(parent,inspect(state));inspect(directory);inspect(tree);
  const helper=(dependencies.helperBytes??pinnedCutoverTreeHelper)(binding.revision);
  if(!Buffer.isBuffer(helper)||!helper.length||helper.length>1024*1024)hold('HELPER_BYTES_REQUIRED');
  immutableBytes(script,helper,uid);const helperSha256=hash(read(script));if(helperSha256!==hash(helper))hold('HELPER_STAGING_CHANGED');
  const image=()=>{
    const value=rows(run('/usr/bin/docker',['image','inspect',binding.imageId,'--format',IMAGE_FORMAT]));
    const arch={x64:'amd64',arm64:'arm64'}[process.arch];
    if(!arch||!same(value,[binding.imageId,binding.revision,'linux',arch,null]))hold('IMAGE_IDENTITY_ARCH_OR_VOLUMES');
  };
  check();image();
  const container=run('/usr/bin/docker',['create','--pull=never','--network=none','--read-only',
    '--entrypoint','/bin/false','--label','phoenix.cutover.runtime-bundle='+binding.bundleId,binding.imageId]);
  if(!ID.test(container))hold('CREATED_CONTAINER_ID');
  immutableJson(path.join(directory,'created-container.json'),{schema:'phoenix.cutover-runtime-container/1',...binding,containerId:container},uid);
  const containerPin=()=>{
    const value=rows(run('/usr/bin/docker',['inspect',container,'--format',CONTAINER_FORMAT]));
    if(!same(value,[container,binding.imageId,'created',false,0,[],'none',true,binding.bundleId,['/bin/false']]))hold('NEVER_STARTED_PRIVATE_CONTAINER_REQUIRED');
  };
  check();containerPin();
  let statuses;try{statuses=JSON.parse(run('/usr/bin/python3',['-I','-S','-c',WORKSPACE_HEAD,container]));}catch{hold('WORKSPACE_TARGET_OBSERVATION_FAILED');}
  if(!Array.isArray(statuses)||statuses.length!==2||statuses[0]!==200||![200,404].includes(statuses[1]))hold('WORKSPACE_TARGET_OBSERVATION_FAILED');
  check();containerPin();
  const workspaceObservation={schema:'phoenix.cutover-runtime-workspace-target/1',containerId:container,imageId:binding.imageId,
    targetPath:'/workspace/apps/api',referencePath:'/app/package.json',targetStatus:statuses[1],referenceStatus:statuses[0]};
  immutableJson(path.join(directory,'workspace-target.json'),workspaceObservation,uid);
  const archives=[];
  for(const root of ROOTS){
    check();image();containerPin();const before=inspect(directory),file=path.join(directory,root+'.tar');
    const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    try{
      fs.fchmodSync(fd,0o600);assertRegularFile(fs.fstatSync(fd),{uid});
      run('/usr/bin/python3',['-I','-S','-c',LIMITED_DOCKER_COPY,'cp',container+':/app/'+root,'-'],{stdout:fd,timeout:90000});
      fs.fsyncSync(fd);assertRegularFile(fs.fstatSync(fd),{uid});
    }finally{fs.closeSync(fd);}
    assertSameDirectory(before,inspect(directory));check();containerPin();
    const bytes=read(file);if(!bytes.length||bytes.length>536870912)hold('ARCHIVE_BYTES_LIMIT');
    archives.push({root,bytes:bytes.length,sha256:hash(bytes)});
  }
  check();containerPin();
  const materialize=dependencies.materialize??(base=>{
    let result;try{result=JSON.parse(run('/usr/bin/python3',['-I','-S',script,'materialize',base],{limit:64*1024*1024,timeout:120000}));}
    catch{hold('TREE_MATERIALIZATION_FAILED');}return result;
  });
  const {sourceTransformations,...treeManifest}=materialize(directory,script);
  if(!same(sourceTransformations,[])&&!same(sourceTransformations,[SELF_TRANSFORM]))hold('SOURCE_TRANSFORMATION_REQUIRED');
  if(treeManifest?.schema!=='phoenix.production-cutover-runtime-tree/1'||!Array.isArray(treeManifest.entries)
    ||!/^[a-f0-9]{64}$/.test(treeManifest.treeSha256??''))hold('TREE_MANIFEST_REQUIRED');
  immutableJson(path.join(directory,'runtime-tree.json'),treeManifest,uid);
  const sourceEvidence={schema:'phoenix.production-cutover-runtime-source/1',...binding,containerId:container,archives,sourceTransformations,workspaceObservation};
  immutableJson(path.join(directory,'source-evidence.json'),sourceEvidence,uid);
  check();image();containerPin();
  const receipt={schema:'phoenix.production-cutover-runtime-preparation/1',...binding,containerId:container,apiPin,helperSha256,
    entry:'dist/scripts/production-cutover-apply.js',treeSha256:treeManifest.treeSha256,
    treeManifestSha256:hash(read(path.join(directory,'runtime-tree.json'))),sourceEvidenceSha256:hash(read(path.join(directory,'source-evidence.json'))),
    archives,sourceTransformations,containerNeverStarted:true,
    sourceArtifactVerified:false,abiVerified:false,databaseInitialized:false,activationAuthorized:false};
  // No --force: a container that someone started between checks cannot be killed here.
  run('/usr/bin/docker',['rm',container]);check();
  immutableJson(path.join(directory,'prepared.json'),receipt,uid);
  return receipt;
}

/** Fresh complete scan before every future load. This does not import the module
 * or decide whether the host, ABI, source artifact or cutover is admitted. */
export function verifyCutoverRuntimeBundle(binding,dependencies={}){
  binding=requestBinding(binding);
  const state=dependencies.stateDirectory??CONTRACT.stateDirectory,directory=path.join(state,'cutover-runtime-'+binding.bundleId);
  const guard=dependencies.guard??(()=>{verifyContext(CONTRACT.repository,CONTRACT.stateDirectory);requireCleanMain(CONTRACT.repository,binding.revision);});
  const inspect=dependencies.inspect??(directory=>inspectTrustedDirectory(directory,CONTRACT));
  const read=dependencies.readPinned??(file=>readPinnedFile(file,{contract:CONTRACT},{inspectDirectory:inspect}));
  const run=dependencies.command??command,script=path.join(directory,'runtime-tree-helper.py');
  const pins=dependencies.observeApi??(()=>observeApi(run));
  guard();const before=inspect(directory);let receipt,original,source;
  try{receipt=JSON.parse(read(path.join(directory,'prepared.json')));original=JSON.parse(read(path.join(directory,'runtime-tree.json')));source=JSON.parse(read(path.join(directory,'source-evidence.json')));}
  catch{hold('PRIVATE_BUNDLE_RECEIPT_REQUIRED');}
  if(receipt.schema!=='phoenix.production-cutover-runtime-preparation/1'||!same(requestBinding({bundleId:receipt.bundleId,imageId:receipt.imageId,revision:receipt.revision}),binding)
    ||receipt.treeManifestSha256!==hash(read(path.join(directory,'runtime-tree.json')))||receipt.treeSha256!==original.treeSha256
    ||receipt.activationAuthorized!==false||receipt.databaseInitialized!==false||receipt.containerNeverStarted!==true
    ||receipt.sourceArtifactVerified!==false||receipt.abiVerified!==false||receipt.entry!=='dist/scripts/production-cutover-apply.js'
    ||(!same(receipt.sourceTransformations,[])&&!same(receipt.sourceTransformations,[SELF_TRANSFORM]))
    ||receipt.helperSha256!==hash(read(script))||receipt.helperSha256!==hash((dependencies.helperBytes??pinnedCutoverTreeHelper)(binding.revision)))hold('BUNDLE_BINDING');
  if(receipt.sourceEvidenceSha256!==hash(read(path.join(directory,'source-evidence.json')))
    ||source.schema!=='phoenix.production-cutover-runtime-source/1'||source.containerId!==receipt.containerId
    ||!same(requestBinding({bundleId:source.bundleId,imageId:source.imageId,revision:source.revision}),binding)
    ||!same(source.sourceTransformations,receipt.sourceTransformations)||!same(source.archives,receipt.archives)
    ||!same(source.workspaceObservation,JSON.parse(read(path.join(directory,'workspace-target.json'))))
    ||!same(source.archives?.map(row=>row.root),ROOTS))hold('SOURCE_EVIDENCE_BINDING');
  for(const archive of source.archives){
    const bytes=read(path.join(directory,archive.root+'.tar'));
    if(bytes.length!==archive.bytes||hash(bytes)!==archive.sha256)hold('SOURCE_ARCHIVE_CHANGED');
  }
  validateApiPin(receipt.apiPin,binding);if(!same(pins(),receipt.apiPin))hold('RUNNING_API_IMAGE_CHANGED');
  let current;
  try{current=dependencies.scan?dependencies.scan(directory,script):JSON.parse(run('/usr/bin/python3',['-I','-S',script,'verify',directory],{limit:64*1024*1024,timeout:120000}));}
  catch{hold('TREE_REVALIDATION_FAILED');}
  if(!same(current,original))hold('TREE_CHANGED');
  guard();if(!same(pins(),receipt.apiPin))hold('RUNNING_API_IMAGE_CHANGED');assertSameDirectory(before,inspect(directory));return {directory,tree:path.join(directory,'tree'),receipt};
}
