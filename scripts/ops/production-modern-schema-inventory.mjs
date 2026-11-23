/** Readonly Git and image inventories plus protected retained probe checks. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {CONTRACT} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {isFailedModernSchemaPreparation,isModernSchemaPlanFailure} from './production-modern-schema-public-preparation.mjs';
const HASH=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const SOURCE='apps/api/src/database/migrations/';
const unitPath=/^apps\/api\/src\/database\/migrations\/(\d{13})-([A-Za-z][A-Za-z0-9]*)\.ts$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
const hold=code=>{throw Error('MODERN_SCHEMA_PLAN_HOLD='+code);};
const match=(re,value)=>typeof value==='string'&&re.test(value);
function git(root,args,{binary=false}={}){
 try{return execFileSync('/usr/bin/git',['--no-replace-objects','--no-optional-locks','-c',`safe.directory=${root}`,'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',...args],{
  cwd:root,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'},
  ...(binary?{}:{encoding:'utf8'}),timeout:10000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});}catch{hold('SOURCE_GIT_READ_FAILED');}
}
export function readCommittedSchemaInventory(root,revision){
 if(fs.realpathSync(root)!==root||!match(SHA,revision))hold('EXACT_SOURCE_REQUIRED');
 const common=git(root,['rev-parse','--path-format=absolute','--git-common-dir']).trim();
 if(fs.realpathSync(common)!==common||['info/grafts','objects/info/alternates','objects/info/http-alternates'].some(file=>fs.existsSync(path.join(common,file))))hold('SOURCE_OBJECT_STORE_UNSUPPORTED');
 const entries=git(root,['ls-tree','-r','-z',revision,'--',SOURCE]).split('\0').filter(Boolean),inventory=[];
 for(const entry of entries){
  const row=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);if(!row)hold('SOURCE_REGULAR_BLOB_REQUIRED');
  const file=row[3];if(!file.endsWith('.ts'))continue;const name=unitPath.exec(file);if(!name)hold('SOURCE_MIGRATION_PATH');
  const bytes=git(root,['show',`${revision}:${file}`],{binary:true});
  if(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==row[2])hold('SOURCE_BLOB_CHANGED');
  const classes=[...bytes.toString().matchAll(/\bexport\s+class\s+([A-Za-z][A-Za-z0-9_]*)\s+implements\s+MigrationInterface\b/g)];
  const expected=name[2]+name[1];if(classes.length!==1||classes[0][1]!==expected)hold('SOURCE_CLASS_IDENTITY');
  inventory.push({path:file,sourceBlob:row[2],timestamp:Number(name[1]),className:expected,effectiveName:expected,sourceSha256:hash(bytes)});
 }
 inventory.sort((a,b)=>a.timestamp-b.timestamp);
 if(!inventory.length||new Set(inventory.map(unit=>unit.timestamp)).size!==inventory.length||new Set(inventory.map(unit=>unit.effectiveName)).size!==inventory.length)hold('SOURCE_INVENTORY_DUPLICATE_OR_EMPTY');
 return inventory;
}
export function bindCompiledSchemaInventory(source,compiled){
 if(!Array.isArray(compiled)||compiled.length!==source.length)hold('COMPLETE_COMPILED_INVENTORY_REQUIRED');
 const seenFiles=new Set(),seenNames=new Set(),seenTimes=new Set(),result=[];
 for(const unit of compiled){
  if(!unit||!match(HASH,unit.compiledSha256)||!Number.isSafeInteger(unit.timestamp)||typeof unit.file!=='string'
   ||typeof unit.className!=='string'||typeof unit.effectiveName!=='string'||unit.effectiveName!==unit.effectiveName.trim()
   ||seenFiles.has(unit.file)||seenNames.has(unit.effectiveName)||seenTimes.has(unit.timestamp))hold('COMPILED_UNIT_IDENTITY');
  seenFiles.add(unit.file);seenNames.add(unit.effectiveName);seenTimes.add(unit.timestamp);
  const expected=source.find(file=>path.posix.basename(file.path,'.ts')+'.js'===unit.file);
  if(!expected||unit.timestamp!==expected.timestamp||unit.className!==expected.className||unit.effectiveName!==expected.effectiveName)hold('SOURCE_COMPILED_IDENTITY_MISMATCH');
  result.push({...expected,compiledSha256:unit.compiledSha256});
 }
 return result.sort((a,b)=>a.timestamp-b.timestamp);
}
export const MODERN_SCHEMA_IMAGE_INVENTORY_PROGRAM=`const fs=require('fs'),path=require('path'),crypto=require('crypto');
if(Number(process.versions.node.split('.')[0])!==20||process.getuid()===0)throw Error('INVENTORY_RUNTIME_HOLD');
const dir='/app/dist/database/migrations',records=[],names=new Set(),times=new Set();
for(const file of fs.readdirSync(dir).filter(name=>name.endsWith('.js')).sort()){
 const filename=path.join(dir,file),stat=fs.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink())throw Error('INVENTORY_FILE_HOLD');
 const bytes=fs.readFileSync(filename),exports=require(filename),classes=Object.values(exports).filter(v=>typeof v==='function'&&v.prototype&&typeof v.prototype.up==='function'&&typeof v.prototype.down==='function');
 if(classes.length!==1)throw Error('INVENTORY_CLASS_HOLD');const Migration=classes[0],instance=new Migration(),effective=instance.name||Migration.name;
 if(typeof effective!=='string'||effective!==effective.trim())throw Error('INVENTORY_EFFECTIVE_NAME_HOLD');const match=/([0-9]{13})$/.exec(effective);
 if(!match||names.has(effective)||times.has(match[1]))throw Error('INVENTORY_DUPLICATE_HOLD');names.add(effective);times.add(match[1]);
 records.push({file,className:Migration.name,effectiveName:effective,timestamp:Number(match[1]),compiledSha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
process.stdout.write(JSON.stringify({major:20,uid:process.getuid(),records}));`;
function defaultDocker(args){try{return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}catch{hold('IMAGE_PROBE_UNVERIFIED');}}
export function inspectModernSchemaImage(imageId,owner,dependencies={}){
 if(!match(/^sha256:[a-f0-9]{64}$/,imageId)||!match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,owner))hold('IMAGE_PROBE_BINDING');
 const docker=dependencies.docker??defaultDocker;
 const id=docker(['create','--pull=never','--label',`phoenix.schema.owner=${owner}`,'--label','phoenix.schema.role=readonly-inventory',
  '--network=none','--restart=no','--read-only','--user','phoenix','--cap-drop=ALL','--security-opt=no-new-privileges','--entrypoint','node',imageId,'-e',MODERN_SCHEMA_IMAGE_INVENTORY_PROGRAM]);
 if(!match(HASH,id))hold('IMAGE_PROBE_CONTAINER_REQUIRED');
 let parsed;try{parsed=JSON.parse(docker(['start','-a',id]));}catch{hold('IMAGE_PROBE_EXECUTION_UNVERIFIED');}
 const meta=docker(['inspect',id,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State}}\t{{json .Config.Labels}}\t{{json .HostConfig.NetworkMode}}\t{{json .HostConfig.ReadonlyRootfs}}\t{{json .HostConfig.CapDrop}}\t{{json .Mounts}}']).split('\t').map(JSON.parse);
 const [actual,image,state,labels,network,readonly,caps,mounts]=meta;
 if(actual!==id||image!==imageId||state.Running!==false||state.ExitCode!==0||state.OOMKilled!==false||state.Pid!==0
  ||labels?.['phoenix.schema.owner']!==owner||labels?.['phoenix.schema.role']!=='readonly-inventory'||network!=='none'||readonly!==true
  ||!same(caps,['ALL'])||!same(mounts,[])||parsed.major!==20||!Number.isSafeInteger(parsed.uid)||parsed.uid<=0||!Array.isArray(parsed.records))hold('IMAGE_PROBE_PROTECTIONS_OR_EXIT');
 return {records:parsed.records,proof:{containerId:id,imageId,owner,role:'readonly-inventory',revision:labels['org.opencontainers.image.revision'],nodeMajor:20,uid:parsed.uid,
  network:'none',readonly:true,capabilities:[],mounts:[],running:false,exitCode:0,inventorySha256:canonicalDigest(parsed.records),productionAuthority:false}};
}

const PREDECESSOR_OWNER='44917766283-1',PREDECESSOR_SHA='eaeec067bbc5f0e9c70cefc50b665d988d55b153';
const ARCHIVED_INVENTORY='RETAINED_SEALED_1122_READONLY_INVENTORY';
export const RETAINED_INVENTORY_CLASSIFICATION='RETAINED_FAILED_PREPARATION_READONLY_INVENTORY';
export const RETAINED_UNCONSUMED_INVENTORY_CLASSIFICATION='RETAINED_UNCONSUMED_PREPARATION_READONLY_INVENTORY';
export const RETAINED_RECOVERED_INVENTORY_CLASSIFICATION='RETAINED_PRE_DDL_RECOVERED_READONLY_INVENTORY';
export const isRetainedModernSchemaInventoryPin=pin=>[ARCHIVED_INVENTORY,RETAINED_INVENTORY_CLASSIFICATION,RETAINED_UNCONSUMED_INVENTORY_CLASSIFICATION,
 RETAINED_RECOVERED_INVENTORY_CLASSIFICATION].includes(pin?.classification);
export const retainedModernSchemaInventorySlot=pin=>[ARCHIVED_INVENTORY,RETAINED_RECOVERED_INVENTORY_CLASSIFICATION].includes(pin.classification)
 ? pin.formerOwner+':'+pin.probeStage : pin.formerOwner;
const candidateRepository='ghcr.io/ivanzhao299/phoenix-erp-v3/api';
const protectedAbsent=file=>{
 try{fs.lstatSync(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}
};
function readProtectedPreparationFile(file,maxBytes){
 const identity=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs];
 const before=fs.lstatSync(file);
 if(before.size<1||before.size>maxBytes)hold('RETAINED_PREPARATION_FILE_SIZE');
 const bytes=readPinnedFile(file,{contract:CONTRACT});
 if(!same(identity(before),identity(fs.lstatSync(file))))hold('RETAINED_PREPARATION_FILE_CHANGED');
 return {bytes,completedAtMs:before.mtimeMs};
}
function readProtectedPrepareReceipt(file,maxBytes=8192){
 const {bytes,completedAtMs}=readProtectedPreparationFile(file,maxBytes);
 return {value:JSON.parse(bytes.toString('utf8')),completedAtMs};
}
function readProtectedCandidatePull(file){
 return readProtectedPreparationFile(file,256*1024);
}
function readOriginalLeaseRecoveryInventoryArchive(file,read,owner,revision,prep,preparationSha256){
 const anchor=read(file(`schema-release-original-recovery-forward-archive-${owner}.json`),65536);
 const {value:archive}=anchor,{pending,committed}=archive;
 const intent=read(file(`schema-release-original-recovery-open-commit-intent-${owner}.json`),16384).value;
 const proof=read(file(`schema-release-original-recovery-verified-${owner}.json`),16384).value;
 const closed=read(file(`schema-release-session-closed-${owner}.json`),8192).value;
 const contextDigest=canonicalDigest(prep.context),leaseSha256=canonicalDigest(pending?.lease??null);
 if(archive.schema!=='phoenix.modern-schema-recovered-forward-archive/v1'||archive.owner!==owner||archive.contextDigest!==contextDigest||
  archive.preparationSha256!==preparationSha256||archive.originalLedgerSha256!==prep.context.beforeLedgerSha256||
  archive.recoveredSha!==prep.context.runtimeSha||archive.attemptedTargetSha!==revision||archive.defaultOff!==true||
  archive.formalTargetSuccess!==false||archive.automaticRetry!==false||archive.originalSessionSha256!==leaseSha256||
  committed?.schema!=='phoenix.modern-schema-recovery-open-committed/v1'||committed.owner!==owner||
  committed.contextDigest!==contextDigest||committed.backgroundAdmissionCommitted!==true||committed.formalTargetSuccess!==false||
  committed.recoveredSha!==archive.recoveredSha||committed.attemptedTargetSha!==revision||committed.releaseAuthorized!==false||
  committed.commitIntentSha256!==canonicalDigest(intent)||committed.publicManifestSha256!==canonicalDigest(intent.publicManifest)||
  intent.schema!=='phoenix.modern-schema-recovery-open-commit-intent/v1'||intent.owner!==owner||
  intent.contextDigest!==contextDigest||intent.pendingStateDigest!==pending?.stateDigest||
  intent.leaseSha256!==leaseSha256||intent.recoveryProofSha256!==canonicalDigest(proof)||
  intent.publicManifest?.phase!=='OPEN'||intent.publicManifest.owner!==owner||intent.publicManifest.targetSha!==archive.recoveredSha||
  proof.schema!=='phoenix.modern-schema-original-recovery-proof/v1'||proof.owner!==owner||
  proof.contextDigest!==contextDigest||!same(intent.publicManifest.participants,[proof.originalRuntime])||proof.outcome!=='ABORTED_BEFORE_DDL_ORIGINAL_R_RECOVERED'||
  !same(proof.originalLease,pending?.lease)||proof.targetSha!==archive.recoveredSha||proof.attemptedTargetSha!==revision||
  proof.formalTargetSuccess!==false||proof.schemaChanged!==false||proof.businessActivation!==false||
  closed.schema!=='phoenix.modern-schema-original-session-closed/v1'||closed.outcome!=='ORIGINAL_SESSION_ABSENT'||
  closed.originalLeaseSha256!==leaseSha256||closed.nativeObservation?.originalSessionPresent!==false||
  closed.nativeObservation?.primary!==true||closed.nativeObservation.databaseOid!==pending.lease?.database?.databaseOid||
  closed.nativeObservation.systemIdentifier!==pending.lease?.database?.systemIdentifier||
  closed.nativeObservation.postmasterStartMicros!==pending.lease?.database?.postmasterStartMicros)
  hold('RECOVERED_INVENTORY_ARCHIVE_REQUIRED');
 return anchor;
}
/** A consumed release may retain its two specifically registered isolated probes
 * only after the original API has been reopened without schema changes. */
function recoveredInventoryPreparation(container,owner,revision,{directory,readRecovered}){
 const file=name=>path.join(directory,name);
 const evidence=readRecovered(file(`schema-release-operator-retained-inventory-${owner}.json`),8192).value;
 const {recoveryOwner,probes,proofKind='operatorLease'}=evidence;
 if(evidence.schema!=='phoenix.modern-operator-retained-inventory/v1'||evidence.owner!==owner||evidence.targetSha!==revision||
  !match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,recoveryOwner)||!['operatorLease','originalLease'].includes(proofKind)||
  (proofKind==='originalLease'?recoveryOwner!==owner:recoveryOwner===owner)||
  evidence.migrationAuthorized!==false||!Array.isArray(probes)||probes.length!==2||
  !same(probes.map(pin=>pin.stage),['prepare','supervise'])||!probes.every(pin=>match(HASH,pin.id)&&match(HASH,pin.identitySha256))||
  probes[0].id===probes[1].id)hold('RECOVERED_INVENTORY_REGISTRY_REQUIRED');
 const {value:{preparationSha256,...prep}}=readRecovered(file(`schema-release-preparation-${owner}.json`),8*1024*1024);
 if(prep.schema!=='phoenix.modern-schema-preparation/v1'||prep.context?.owner!==owner||prep.context.targetSha!==revision||
  prep.context.candidateImageId!==container.imageId||preparationSha256!==canonicalDigest(prep)||
  evidence.preparationSha256!==preparationSha256)hold('RECOVERED_INVENTORY_ARCHIVE_REQUIRED');
 let anchor;
 if(proofKind==='originalLease'){
  anchor=readOriginalLeaseRecoveryInventoryArchive(file,readRecovered,owner,revision,prep,preparationSha256);
 }else{
  anchor=readRecovered(file(`schema-release-operator-archive-${recoveryOwner}.json`),65536);
  const archive=anchor.value;
  const open=readRecovered(file(`schema-release-operator-public-open-verified-${recoveryOwner}.json`),8192).value;
  if(archive.schema!=='phoenix.modern-operator-pre-ddl-recovery-archive/v1'||archive.owner!==owner||archive.recoveryOwner!==recoveryOwner||
   archive.requestedTargetSha!==revision||archive.originalRuntimeSha!==prep.context.runtimeSha||archive.formalTargetSuccess!==false||
   archive.schemaChanged!==false||archive.markerArchived!==true||archive.publicOpenSha256!==canonicalDigest(open)||
   open?.schema!=='phoenix.modern-operator-original-open/v1'||open.owner!==owner||open.recoveryOwner!==recoveryOwner||
   open.formalTargetSuccess!==false||open.manifest?.phase!=='OPEN'||open.manifest.targetSha!==archive.originalRuntimeSha)
   hold('RECOVERED_INVENTORY_ARCHIVE_REQUIRED');
  if(archive.pending?.phase==='R_STOP_INTENT'){
   const stopped=readRecovered(file(`schema-release-operator-stopped-native-${recoveryOwner}.json`),65536).value;
   const verified=readRecovered(file(`schema-release-operator-original-verified-${recoveryOwner}.json`),65536).value;
   if(stopped?.schema!=='phoenix.modern-operator-stopped-native/v1'||stopped.owner!==owner||stopped.recoveryOwner!==recoveryOwner||
    stopped.originalBackendAbsent!==true||stopped.releaseAuthorized!==false||
    stopped.previousLeaseSha256!==canonicalDigest(archive.pending.lease)||!match(HASH,stopped.newLeaseSha256)||
    verified?.schema!=='phoenix.modern-operator-original-verified/v1'||verified.owner!==owner||verified.recoveryOwner!==recoveryOwner||
    verified.formalTargetSuccess!==false||verified.runtimeSha!==archive.originalRuntimeSha||verified.newLeaseSha256!==stopped.newLeaseSha256||
    verified.verification?.pendingSha256!==canonicalDigest(archive.pending)||
    verified.verification?.stoppedCheckpointSha256!==canonicalDigest(stopped.stopped))
    hold('RECOVERED_INVENTORY_ARCHIVE_REQUIRED');
  }
 }
 const archive=anchor.value,{stateDigest,...pending}=archive.pending??{};
 const recoveryPhases=proofKind==='originalLease'?{R_STOPPED:4,FRESH_RECHECKED:5,BACKUP_VERIFIED:6}:
  {R_STOP_INTENT:3,R_STOPPED:4,FRESH_RECHECKED:5};
 const former=prep.ownedResources?.filter(pin=>pin.role==='readonly-inventory');
 const planned=former?.[0];
 if(pending.owner!==owner||pending.status!=='HOLD'||pending.schema!=='phoenix.modern-schema-release-pending/v1'||
  !Object.hasOwn(recoveryPhases,pending.phase)||pending.sequence!==recoveryPhases[pending.phase]||pending.targetSha!==revision||
  pending.schemaRelease?.preparationSha256!==preparationSha256||pending.schemaRelease?.contextDigest!==canonicalDigest(prep.context)||
  stateDigest!==canonicalDigest(pending)||!Number.isFinite(anchor.completedAtMs)||anchor.completedAtMs<=0||
  evidence.archiveSha256!==canonicalDigest(archive)||
  former?.length!==1||planned.containerId!==probes[0].id||planned.imageId!==container.imageId||planned.owner!==owner||
  planned.network!=='none'||planned.readonly!==true||planned.running!==false||planned.exitCode!==0||
  planned.productionAuthority!==false||!match(HASH,planned.inventorySha256))hold('RECOVERED_INVENTORY_ARCHIVE_REQUIRED');
 const pin=probes.find(item=>item.id===container.id);
 if(!pin||pin.identitySha256!==canonicalDigest(container))hold('RECOVERED_INVENTORY_EXACT_NATIVE_PIN_REQUIRED');
 return {completedAtMs:anchor.completedAtMs,expectedInventorySha256:planned.inventorySha256,
  pin:{classification:RETAINED_RECOVERED_INVENTORY_CLASSIFICATION,probeStage:pin.stage,recoveryEvidenceSha256:canonicalDigest(evidence)}};
}
function retainedInventoryPreparation(container,owner,revision,{directory=CONTRACT.stateDirectory,readReceipt=readProtectedPrepareReceipt,readPrepared=readProtectedPrepareReceipt,readRecovered=readProtectedPrepareReceipt,absent=protectedAbsent}={}){
 if(owner===PREDECESSOR_OWNER&&revision===PREDECESSOR_SHA&&!absent(path.join(directory,'schema-release-forward-api-terminal-'+owner+'.json'))){
  const prior=name=>readRecovered(path.join(directory,'schema-release-'+name+'-'+owner+'.json'),8*1024*1024);
  const {value:terminal}=prior('forward-api-terminal'),{value:intent}=prior('forward-api-intent');
  const {value:record,completedAtMs}=prior('preparation'),{preparationSha256,...prepared}=record;
  const pins=prepared.ownedResources.filter(pin=>pin.role==='readonly-inventory');
  const started=Date.parse(container.state?.StartedAt),finished=Date.parse(container.state?.FinishedAt);
  const stop=readRecovered(path.join(directory,'schema-release-step-'+owner+'-3-r-stop-intent.json'),65536).value;
  const end=Date.parse(stop.recordedAt),early=pins.length===1&&container.id===pins[0].containerId;
  if(terminal.schema!=='phoenix.modern-forward-api-terminal/v1'||terminal.owner!==owner||terminal.targetSha!==revision||
   terminal.completionOwner!=='44974413964-1'||terminal.outcome!=='SUCCESS'||!terminal.defaultOff||terminal.intentSha256!==canonicalDigest(intent)||
   intent.pendingSha256!==canonicalDigest(intent.pending)||intent.pending.schemaRelease.preparationSha256!==preparationSha256||
   preparationSha256!==canonicalDigest(prepared)||record.context.candidateImageId!==container.imageId||
   pins.length!==1||pins[0].inventorySha256!==record.context.candidateInventorySha256||
   !(started>0&&finished>=started&&Number.isFinite(end))||(early?finished>completedAtMs:started<completedAtMs||finished>end))hold('RETAINED_ARCHIVED_INVENTORY_REQUIRED');
  return {completedAtMs:end,expectedInventorySha256:pins[0].inventorySha256,pin:{classification:ARCHIVED_INVENTORY,probeStage:early?'prepare':'supervise',
   terminalSha256:canonicalDigest(terminal)}};
 }
 if(!absent(path.join(directory,`schema-release-operator-retained-inventory-${owner}.json`)))
  return recoveredInventoryPreparation(container,owner,revision,{directory,readRecovered});
 const observed=readReceipt(path.join(directory,`.transport-${owner}-prepare.receipt`));
 const {value:receipt,completedAtMs}=observed;
 const preparedPath=path.join(directory,`schema-release-preparation-${owner}.json`);
 if(!Number.isFinite(completedAtMs)||completedAtMs<=0||
  ![`.transport-${owner}-run.receipt`,`schema-release-consumed-${owner}.json`,`schema-release-approval-${owner}.json`]
   .every(name=>absent(path.join(directory,name))))hold('RETAINED_FAILED_PREPARATION_REQUIRED');
 if(isFailedModernSchemaPreparation(receipt,{owner,targetSha:revision})){
  if(!(isModernSchemaPlanFailure(receipt.failure)||/^(?:HOST_SURFACE(?:_[A-Z0-9_]+)?|BACKUP(?:_[A-Z_]+)?|REHEARSAL|HISTORICAL_AUDIT)$/.test(receipt.failure))||
   !absent(preparedPath))hold('RETAINED_FAILED_PREPARATION_REQUIRED');
  return {completedAtMs,pin:{classification:RETAINED_INVENTORY_CLASSIFICATION,failedPreparationSha256:canonicalDigest(observed)}};
 }
 if(!receipt||Object.keys(receipt).sort().join(',')!=='owner,preparationSha256,prepared,schema,targetSha'||
  receipt.schema!=='phoenix.modern-schema-public-preparation/v1'||receipt.owner!==owner||receipt.targetSha!==revision||
  receipt.prepared!==true||!match(HASH,receipt.preparationSha256))hold('RETAINED_FAILED_PREPARATION_REQUIRED');
 const sealed=readPrepared(preparedPath,8*1024*1024),{preparationSha256,...prepared}=sealed.value;
 const resources=Array.isArray(prepared.ownedResources)?prepared.ownedResources.filter(resource=>resource?.role==='readonly-inventory'):[];
 const inventory=resources?.[0];
 if(prepared.schema!=='phoenix.modern-schema-preparation/v1'||prepared.context?.owner!==owner||prepared.context.targetSha!==revision||
  prepared.context.candidateImageId!==container.imageId||preparationSha256!==receipt.preparationSha256||preparationSha256!==canonicalDigest(prepared)||
  !Number.isFinite(sealed.completedAtMs)||sealed.completedAtMs<=0||sealed.completedAtMs>completedAtMs||resources?.length!==1||
  inventory.containerId!==container.id||inventory.imageId!==container.imageId||inventory.owner!==owner||inventory.revision!==revision||
  inventory.network!=='none'||inventory.readonly!==true||inventory.running!==false||inventory.exitCode!==0||inventory.productionAuthority!==false||
  !match(HASH,inventory.inventorySha256))hold('RETAINED_UNCONSUMED_PREPARATION_REQUIRED');
 return {completedAtMs,expectedInventorySha256:inventory.inventorySha256,pin:{classification:RETAINED_UNCONSUMED_INVENTORY_CLASSIFICATION,
  unconsumedPreparationSha256:canonicalDigest({observed,preparationSha256,completedAtMs:sealed.completedAtMs})}};
}
function previousInventoryImage(owner,revision,{directory=CONTRACT.stateDirectory,readPull=readProtectedCandidatePull}={}){
 const {bytes,completedAtMs}=readPull(path.join(directory,`schema-release-preparation-${owner}`,'candidate-pull.stdout'));
 const lines=bytes.toString('utf8').trimEnd().split('\n'),digestLines=lines.filter(line=>line.startsWith('Digest:'));
 const digest=/^Digest: (sha256:[a-f0-9]{64})$/.exec(digestLines[0]);
 if(!digest||digestLines.length!==1||lines.at(-1)!==`${candidateRepository}:sha-${revision}`||
  !Number.isFinite(completedAtMs)||completedAtMs<=0)hold('RETAINED_INVENTORY_PROTECTED_PULL_REQUIRED');
 return {repoDigest:`${candidateRepository}@${digest[1]}`,stdoutSha256:hash(bytes),completedAtMs};
}
function readRetainedInventoryNativePin(container,docker){
 const fields=['.Id','.Image','.State','.Created','.Config.Image','.Path','.Args',
  '.HostConfig.SecurityOpt','.HostConfig.CapAdd','.HostConfig.IpcMode','.HostConfig.UTSMode',
  '.HostConfig.Binds','.HostConfig.VolumesFrom','.HostConfig.Tmpfs','.HostConfig.PortBindings',
  '.HostConfig.Devices','.HostConfig.DeviceRequests','.HostConfig.DeviceCgroupRules','.HostConfig.AutoRemove',
  '.HostConfig.UsernsMode','.HostConfig.CgroupnsMode','.HostConfig.PublishAllPorts','.Config.Env','.Config.WorkingDir'];
 const format=fields.map(field=>field.startsWith('.HostConfig.')?
  `{{json (index .HostConfig "${field.slice('.HostConfig.'.length)}")}}`:`{{json ${field}}}`).join('\t');
 const settings=docker(['inspect',container.id,'--format',format]).split('\t').map(JSON.parse);
 const [id,image,state,created,requestedImage,binary,args,security,capAdd,ipc,uts,
  binds,volumesFrom,tmpfs,ports,devices,requests,rules,autoRemove,userns,cgroupns,publishAllPorts,env,workdir]=settings;
 const empty=value=>value===null||(Array.isArray(value)?value.length===0:same(value,{}));
 const extra=[capAdd,binds,volumesFrom,tmpfs,ports,container.ports,devices,requests,rules];
 const endpoint=container.networks?.none;
 if(settings.length!==fields.length||!match(HASH,id)||id!==container.id||!match(/^sha256:[a-f0-9]{64}$/,image)||image!==container.imageId||
  !same(state,container.state)||requestedImage!==image||binary!=='node'||!same(args,['-e',MODERN_SCHEMA_IMAGE_INVENTORY_PROGRAM])||
  !same(container.entrypoint,['node'])||!same(container.cmd,args)||!Number.isFinite(Date.parse(created))||
  state.Status!=='exited'||state.Running!==false||state.Pid!==0||state.ExitCode!==0||state.OOMKilled!==false||
  state.Restarting!==false||state.Paused!==false||state.Dead!==false||!Number.isFinite(Date.parse(state.StartedAt))||
  !Number.isFinite(Date.parse(state.FinishedAt))||Date.parse(state.StartedAt)<Date.parse(created)||Date.parse(state.FinishedAt)<Date.parse(state.StartedAt)||
  container.restarts!==0||container.restartPolicy?.Name!=='no'||container.restartPolicy?.MaximumRetryCount!==0||
  container.privileged!==false||!['','private'].includes(container.pidMode)||container.networkMode!=='none'||
  !endpoint||Object.keys(container.networks).length!==1||endpoint.IPAddress!==''||endpoint.GlobalIPv6Address!==''||
  container.user!=='phoenix'||container.readonly!==true||!same(container.mounts,[])||!same(container.capDrop,['ALL'])||
  ![ ['no-new-privileges'],['no-new-privileges=true'] ].some(expected=>same(expected,security))||
  ipc!=='private'||uts!==''||userns!==''||!['','private'].includes(cgroupns)||publishAllPorts!==false||autoRemove!==false||
  !extra.every(empty)||!Array.isArray(env)||typeof workdir!=='string')hold('RETAINED_INVENTORY_NATIVE_PIN_REQUIRED');
 return {sha256:canonicalDigest(settings),createdAtMs:Date.parse(created),env,workdir};
}

/** Recognize a stopped, isolated probe of an earlier failed or unconsumed
 * preparation. The sealed records bind the owner, target, and native CID. */
export function collectRetainedModernSchemaInventory(container,{owner,targetSha},dependencies={}){
 const formerOwner=container.labels?.['phoenix.schema.owner'],revision=container.labels?.['org.opencontainers.image.revision'];
 if(container.labels?.['phoenix.schema.role']!=='readonly-inventory'||formerOwner===owner||
  !match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,formerOwner)||!match(SHA,revision)||!match(SHA,targetSha))hold('RETAINED_INVENTORY_BINDING_REQUIRED');
 const receipt=retainedInventoryPreparation(container,formerOwner,revision,dependencies);
 if(Date.parse(container.state?.FinishedAt)>receipt.completedAtMs)hold('RETAINED_INVENTORY_POSTDATES_PREPARATION');
 const pull=previousInventoryImage(formerOwner,revision,dependencies);
 const docker=dependencies.docker??defaultDocker,root=dependencies.root??CONTRACT.repository;
 (dependencies.git??git)(root,['merge-base','--is-ancestor',revision,targetSha]);
 const native=readRetainedInventoryNativePin(container,docker);
 const image=docker(['image','inspect',container.imageId,'--format',
  '{{json .Id}}\t{{json (index .Config.Labels "org.opencontainers.image.revision")}}\t{{json .RepoDigests}}\t{{json .Config.Env}}\t{{json .Config.WorkingDir}}']).split('\t').map(JSON.parse);
 const [imageId,imageRevision,repoDigests,env,workdir]=image;
 if(imageId!==container.imageId||imageRevision!==revision||!Array.isArray(repoDigests)||!repoDigests.includes(pull.repoDigest)||
  pull.completedAtMs>native.createdAtMs||!same(env,native.env)||workdir!==native.workdir)hold('RETAINED_INVENTORY_IMAGE_PROVENANCE_REQUIRED');
 const log=JSON.parse(docker(['logs',container.id]));
 if(!log||Object.keys(log).sort().join(',')!=='major,records,uid'||log.major!==20||!Number.isSafeInteger(log.uid)||log.uid<=0||
  !Array.isArray(log.records)||log.records.some(record=>!record||Object.keys(record).sort().join(',')!=='className,compiledSha256,effectiveName,file,timestamp'))hold('RETAINED_INVENTORY_LOG_REQUIRED');
 const source=(dependencies.readSource??readCommittedSchemaInventory)(root,revision);
 bindCompiledSchemaInventory(source,log.records);
 const inventorySha256=canonicalDigest(log.records);
 if(receipt.expectedInventorySha256&&receipt.expectedInventorySha256!==inventorySha256)hold('RETAINED_UNCONSUMED_PREPARATION_INVENTORY_CHANGED');
 return {id:container.id,...receipt.pin,revision,formerOwner,identitySha256:canonicalDigest(container),nativePinSha256:native.sha256,
  candidatePullSha256:canonicalDigest(pull),inventorySha256};
}

export function verifyRetainedModernSchemaInventoryPin(container,pin,dependencies={}){
 if(!isRetainedModernSchemaInventoryPin(pin)||pin.id!==container.id||pin.identitySha256!==canonicalDigest(container)||
  !match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,pin.formerOwner)||!match(SHA,pin.revision)||
  pin.formerOwner!==container.labels?.['phoenix.schema.owner']||pin.revision!==container.labels?.['org.opencontainers.image.revision']||
  pin.nativePinSha256!==readRetainedInventoryNativePin(container,dependencies.docker??defaultDocker).sha256||
  pin.candidatePullSha256!==canonicalDigest(previousInventoryImage(pin.formerOwner,pin.revision,dependencies)))hold('RETAINED_INVENTORY_PIN_CHANGED');
 const receipt=retainedInventoryPreparation(container,pin.formerOwner,pin.revision,dependencies);
 if(Object.entries(receipt.pin).some(([key,value])=>pin[key]!==value)||
  (receipt.expectedInventorySha256&&receipt.expectedInventorySha256!==pin.inventorySha256))hold('RETAINED_INVENTORY_PIN_CHANGED');
}

export {git as readModernSchemaSourceGit,SOURCE as MODERN_SCHEMA_SOURCE_DIRECTORY};
