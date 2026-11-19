/** Complete readonly source/image/ledger planning. No migration, registry
 * writes, authority, baseline insertion, database initialization or replay. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {CONTRACT,secureJson,verifyContext} from './production-config-guard.mjs';
import {readPinnedFile} from './production-trusted-paths.mjs';
import {executionEnv} from './capture-production-runtime.mjs';
import {evaluateLedger,validateRetiredRegistry} from '../ledger-preflight.mjs';
import {LEDGER_SQL,validateRegistryReceipt,RECEIPT_DIRECTORY} from './chanjet-admission-schema-receipt.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {isFailedModernSchemaPreparation} from './production-modern-schema-public-preparation.mjs';
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
function completeLedger(ledger,canonicalLegacy,source,retired){
 if(!ledger||!Array.isArray(ledger.legacy)||!Array.isArray(ledger.typeorm)||!Array.isArray(canonicalLegacy)||!canonicalLegacy.length
  ||new Set(ledger.legacy.map(row=>row.filename)).size!==ledger.legacy.length)hold('LEDGER_SHAPE');
 const rows=ledger.legacy.map(row=>{
  if(typeof row.filename!=='string'||typeof row.applied_at!=='number'||!Number.isFinite(row.applied_at)||row.applied_at<0||row.applied_at>Number.MAX_SAFE_INTEGER)hold('LEGACY_LEDGER_IDENTITY');
  // SQL bridge creation casts positive numeric milliseconds to bigint, rounding
  // rather than truncating the submillisecond value. Preserve original bytes.
  return {...row,applied_at:new Date(Math.round(row.applied_at)).toISOString()};
 });
 const result=evaluateLedger({schemaRows:rows,typeormRows:ledger.typeorm,canonicalLegacy,
  canonicalTypeorm:source.map(unit=>({effective_name:unit.effectiveName,timestamp:unit.timestamp})),retiredTypeorm:validateRetiredRegistry(retired),mode:'pre-migration'});
 if(!result.pass||result.diagnostics.bridge_timestamp_mismatch.length||result.diagnostics.bridge_state==='PARTIAL')hold('STRUCTURAL_LEDGER_DRIFT');
 for(const row of ledger.typeorm){
  if(typeof row.name!=='string'||!/^\d{13}$/.test(String(row.timestamp))||!Number.isSafeInteger(Number(row.timestamp)))hold('EXACT_LEDGER_TUPLE_REQUIRED');
 }
 return result;
}
/** The caller is the fixed collector below. Prior provenance is re-read from
 * the protected registry, never accepted as a boolean in release JSON. */
export function deriveModernSchemaPlan({targetSha,runtimeSha,candidateImageId,source,runtimeSource,compiled,ledger,canonicalLegacy,retired,changedMigrationPaths},dependencies={}){
 if(!match(SHA,targetSha)||!match(SHA,runtimeSha)||targetSha===runtimeSha||!match(/^sha256:[a-f0-9]{64}$/,candidateImageId))hold('EXACT_PLAN_BINDING');
 const bound=bindCompiledSchemaInventory(source,compiled),runtimeByPath=new Map(runtimeSource.map(unit=>[unit.path,unit]));
 for(const prior of runtimeSource){const next=source.find(unit=>unit.path===prior.path);if(!next||!same(prior,next))hold('RUNTIME_SOURCE_CHANGED_OR_REMOVED');}
 const validation=completeLedger(ledger,canonicalLegacy,source,retired),byName=new Map(ledger.typeorm.map(row=>[row.name,row]));
 const pendingMigrations=[];
 for(const unit of bound){
  const applied=byName.get(unit.effectiveName);
  if(!applied){pendingMigrations.push({path:unit.path,sourceBlob:unit.sourceBlob,timestamp:unit.timestamp,effectiveName:unit.effectiveName,compiledSha256:unit.compiledSha256});continue;}
  if(String(applied.timestamp)!==String(unit.timestamp))hold('APPLIED_TIMESTAMP_MISMATCH');
  if(!runtimeByPath.has(unit.path)&&(dependencies.verifyPriorProvenance??(()=>false))(unit)!==true)hold('PRIOR_APPLY_PROVENANCE_REQUIRED');
 }
 const expectedChanged=source.filter(unit=>!runtimeByPath.has(unit.path)).map(unit=>unit.path).sort();
 const changed=[...changedMigrationPaths].sort();
 if(new Set(changed).size!==changed.length||!same(changed,expectedChanged))hold('EXACT_ADDITIVE_MIGRATION_SCOPE_REQUIRED');
 return {schema:'phoenix.modern-schema-migration-plan/v1',targetSha,runtimeSha,candidateImageId,sourceInventorySha256:canonicalDigest(source),runtimeInventorySha256:canonicalDigest(runtimeSource),
  candidateInventorySha256:canonicalDigest(compiled),beforeLedgerSha256:hash(JSON.stringify(ledger)),pendingMigrations,changedMigrationPaths:changed,
  sourceUnits:source.length,runtimeUnits:runtimeSource.length,pendingCount:pendingMigrations.length,ledgerValidation:validation,readOnly:true,releaseAuthorized:false};
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

export const RETAINED_INVENTORY_CLASSIFICATION='RETAINED_FAILED_PREPARATION_READONLY_INVENTORY';
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
function readProtectedFailedPrepareReceipt(file){
 const {bytes,completedAtMs}=readProtectedPreparationFile(file,8192);
 return {value:JSON.parse(bytes.toString('utf8')),completedAtMs};
}
function readProtectedCandidatePull(file){
 return readProtectedPreparationFile(file,256*1024);
}
function failedInventoryPreparation(owner,revision,{directory=CONTRACT.stateDirectory,readReceipt=readProtectedFailedPrepareReceipt,absent=protectedAbsent}={}){
 const observed=readReceipt(path.join(directory,`.transport-${owner}-prepare.receipt`));
 const {value:receipt,completedAtMs}=observed;
 if(!isFailedModernSchemaPreparation(receipt,{owner,targetSha:revision})||
  !Number.isFinite(completedAtMs)||completedAtMs<=0||
  !/^(?:PLAN|HOST_SURFACE(?:_[A-Z0-9_]+)?|BACKUP|REHEARSAL|HISTORICAL_AUDIT)$/.test(receipt.failure)||
  ![ `.transport-${owner}-run.receipt`, `schema-release-preparation-${owner}.json`, `schema-release-consumed-${owner}.json` ]
   .every(name=>absent(path.join(directory,name))))hold('RETAINED_FAILED_PREPARATION_REQUIRED');
 return observed;
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

/** Recognize a stopped, isolated probe of the image pulled by a prior failed
 * prepare. The old failure receipt identifies the owner and target. This
 * observation pins the currently retained CID. */
export function collectRetainedModernSchemaInventory(container,{owner,targetSha},dependencies={}){
 const formerOwner=container.labels?.['phoenix.schema.owner'],revision=container.labels?.['org.opencontainers.image.revision'];
 if(container.labels?.['phoenix.schema.role']!=='readonly-inventory'||formerOwner===owner||
  !match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,formerOwner)||!match(SHA,revision)||!match(SHA,targetSha))hold('RETAINED_INVENTORY_BINDING_REQUIRED');
 const receipt=failedInventoryPreparation(formerOwner,revision,dependencies);
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
 return {id:container.id,classification:RETAINED_INVENTORY_CLASSIFICATION,revision,formerOwner,
  identitySha256:canonicalDigest(container),nativePinSha256:native.sha256,failedPreparationSha256:canonicalDigest(receipt),
  candidatePullSha256:canonicalDigest(pull),inventorySha256:canonicalDigest(log.records)};
}

export function verifyRetainedModernSchemaInventoryPin(container,pin,dependencies={}){
 if(pin.classification!==RETAINED_INVENTORY_CLASSIFICATION||pin.id!==container.id||pin.identitySha256!==canonicalDigest(container)||
  !match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,pin.formerOwner)||!match(SHA,pin.revision)||
  pin.formerOwner!==container.labels?.['phoenix.schema.owner']||pin.revision!==container.labels?.['org.opencontainers.image.revision']||
  pin.nativePinSha256!==readRetainedInventoryNativePin(container,dependencies.docker??defaultDocker).sha256||
  pin.failedPreparationSha256!==canonicalDigest(failedInventoryPreparation(pin.formerOwner,pin.revision,dependencies))||
  pin.candidatePullSha256!==canonicalDigest(previousInventoryImage(pin.formerOwner,pin.revision,dependencies)))hold('RETAINED_INVENTORY_PIN_CHANGED');
}

export async function collectModernSchemaPlan(client,{targetSha,runtimeSha,candidateImageId,owner},dependencies={}){
 const root=dependencies.root??CONTRACT.repository,guard=dependencies.guard??(()=>verifyContext(root,CONTRACT.stateDirectory));
 if(!match(SHA,targetSha)||!match(SHA,runtimeSha)||targetSha===runtimeSha||!match(/^sha256:[a-f0-9]{64}$/,candidateImageId)||!match(/^[1-9][0-9]{0,19}-[1-9][0-9]{0,9}$/,owner))hold('EXACT_PLAN_BINDING');
 guard();git(root,['merge-base','--is-ancestor',runtimeSha,targetSha]);
 const source=readCommittedSchemaInventory(root,targetSha),runtimeSource=readCommittedSchemaInventory(root,runtimeSha);
 const canonicalLegacy=git(root,['ls-tree','-r','--name-only',targetSha,'--','apps/api/migrations']).split('\n')
  .filter(file=>/^apps\/api\/migrations\/2026[A-Za-z0-9_.-]+\.sql$/.test(file)).map(file=>path.posix.basename(file)).sort();
 const retired=JSON.parse(git(root,['show',`${targetSha}:scripts/ci/retired-typeorm-migrations.json`]));
 const changedMigrationPaths=git(root,['diff','--name-only','--no-renames',runtimeSha,targetSha,'--','migrations','apps/api/ddl','apps/api/migrations',SOURCE,'scripts/db-migrate.sh','scripts/deploy-schema-first.sh']).trim().split('\n').filter(Boolean).sort();
 const probe=(dependencies.inspectImage??inspectModernSchemaImage)(candidateImageId,owner);if(probe.proof.revision!==targetSha)hold('CANDIDATE_REVISION_MISMATCH');
 guard();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  await client.query("SET LOCAL search_path=public; SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL row_security=off");
  const {rows:[database]}=await client.query(`SELECT pg_catalog.current_database() AS name,'public'::text AS schema,
    (SELECT oid::bigint FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) AS "databaseOid",
    (SELECT oid::bigint FROM pg_catalog.pg_namespace WHERE nspname='public') AS "schemaOid",
    (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS "systemIdentifier",
    trunc(extract(epoch FROM pg_catalog.pg_postmaster_start_time())*1000000)::text AS "postmasterStartMicros",
    current_setting('server_version_num')::integer AS "serverVersionNum",NOT pg_catalog.pg_is_in_recovery() AS primary,
    current_setting('transaction_read_only')='on' AS "readOnly",current_setting('transaction_isolation') AS isolation`);
  if(!database?.primary||database.readOnly!==true||database.isolation!=='repeatable read')hold('PRIMARY_READ_ONLY_SNAPSHOT_REQUIRED');
  const {rows:[row]}=await client.query(LEDGER_SQL),ledger=JSON.parse(row.jsonb_build_object);
  const verifyPriorProvenance=unit=>{
   try{
    const receipt=(dependencies.readRegistry??secureJson)(path.join(dependencies.directory??CONTRACT.stateDirectory,RECEIPT_DIRECTORY,path.posix.basename(unit.path,'.ts')+'.json'));
    validateRegistryReceipt(receipt,{migrationPath:unit.path,sourceBlob:unit.sourceBlob});
    git(root,['merge-base','--is-ancestor',receipt.sourceSha,targetSha]);
    return git(root,['rev-parse',`${receipt.sourceSha}:${unit.path}`]).trim()===unit.sourceBlob;
   }catch{return false;}
  };
  const plan=deriveModernSchemaPlan({targetSha,runtimeSha,candidateImageId,source,runtimeSource,compiled:probe.records,ledger,canonicalLegacy,retired,changedMigrationPaths},{verifyPriorProvenance});
  guard();return {plan,database,imageProof:probe.proof,sourceInventory:source,runtimeSourceInventory:runtimeSource,compiledInventory:probe.records,ledger};
 }finally{await client.query('ROLLBACK');}
}
