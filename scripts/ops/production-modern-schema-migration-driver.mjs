/** Runs the exact committed schema-first script once. Its Docker calls travel
 * on a private NUL/stdin/SO_PEERCRED channel, never credentials in proxy argv.
 * The real CLI is gated on its exact native backend before the first DDL. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {CONTRACT,git,secureJson} from './production-config-guard.mjs';import {executionEnv} from './capture-production-runtime.mjs';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';import {validateModernSchemaContext} from './production-modern-schema-authority.mjs';
import {ModernSchemaBodyChannel} from './production-modern-schema-body-channel.mjs';import {runModernSchemaGatedCli} from './production-modern-schema-gated-cli.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_MIGRATION_DRIVER_HOLD='+code);};
const quote=value=>"'"+value.replaceAll("'","'\"'\"'")+"'";
const schemaScript='scripts/deploy-schema-first.sh',networkFormat='{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}';
function read(args){try{return execFileSync('/usr/bin/docker',args,{env:executionEnv(),encoding:'utf8',timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim();}catch{fail('ORIGINAL_DATABASE_NETWORK_UNOBSERVABLE');}}
export function parseModernSchemaMigrationRun(args,{imageId,networkName,mode,expectedName}){
 const prefix=['run','--name'],fixed=['--user','phoenix','--network',networkName];
 if(!Array.isArray(args)||!same(args.slice(0,2),prefix)||!/^[a-z0-9-]{1,100}$/.test(args[2]??'')||!same(args.slice(3,7),fixed)
  ||(expectedName&&args[2]!==expectedName)||(mode==='run'&&!/^phoenix-migrate-schema-first-[a-z0-9]{8}$/.test(args[2])))fail('EXACT_SINGLE_SHOT_CLI_ARGUMENTS_REQUIRED');
 let index=7;const environment={};
 for(const key of ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME',...(mode==='run'?['PGOPTIONS']:[])]){
  if(args[index++]!=='-e'||typeof args[index]!=='string'||!args[index].startsWith(key+'='))fail('EXACT_CLI_ENVIRONMENT_KEYS_REQUIRED');
  environment[key]=args[index++].slice(key.length+1);
 }
 const suffix=['--entrypoint','./node_modules/.bin/typeorm',imageId,'-d','dist/database/data-source.js','migration:'+mode,...(mode==='run'?['--transaction','all']:[])];
 if(!same(args.slice(index),suffix)||environment.DB_HOST!=='db'||environment.DB_PORT!=='5432'||(mode==='run'&&environment.PGOPTIONS!=='-c lock_timeout=5s -c statement_timeout=120s'))fail('EXACT_REVIEWED_CLI_REQUIRED');
 delete environment.PGOPTIONS;return {name:args[2],environment};
}
export async function runModernSchemaMigrationDriver({context:input,originalSnapshot,privateRuntime,directory,originalLease,admit,verifyNativeBackend,onCreated},dependencies={}){
 const context=validateModernSchemaContext(input),root=dependencies.root??CONTRACT.repository;
 if(typeof admit!=='function'||typeof verifyNativeBackend!=='function')fail('ORIGINAL_SUPERVISOR_ADMISSION_REQUIRED');
 const script=dependencies.script??new URL('../deploy-schema-first.sh',import.meta.url).pathname;
 const source=Buffer.from(git(root,['show',context.targetSha+':'+schemaScript])+'\n');
 if(!fs.readFileSync(script).equals(source))fail('EXACT_COMMITTED_SCHEMA_SCRIPT_REQUIRED');
 const check=async stage=>{privateRuntime.guard();if(await admit({stage})!==true)fail('ORIGINAL_DDL_INTENT_AND_LEASE_REQUIRED');privateRuntime.guard();};await check('BEFORE_DRIVER');
 const step=secureJson(path.join(privateRuntime.directory,`schema-release-step-${context.owner}-6-backup-verified.json`)),reference=step.payload?.evidence;
 const backupReceiptFile=path.join(privateRuntime.directory,`schema-release-fenced-backup-${context.owner}`,'backup-receipt.json');
 if(step.sequence!==6||step.to!=='BACKUP_VERIFIED'||step.payload?.schema!=='phoenix.modern-schema-step-evidence/v1'||step.payload.contextDigest!==canonicalDigest(context)
  ||!reference||step.payload.evidenceSha256!==canonicalDigest(reference)||reference.backupReceiptFile!==backupReceiptFile)fail('ACTUAL_FENCED_BACKUP_STEP_REQUIRED');
 const backup=secureJson(backupReceiptFile);
 if(canonicalDigest(backup)!==reference.backupReceiptSha256||backup.schema!=='phoenix.modern-schema-protected-backup/v1'||backup.owner!==context.owner||backup.stage!=='fenced'
  ||backup.sourceLedgerSha256!==context.beforeLedgerSha256||backup.tocVerified!==true||backup.fullParseVerified!==true)fail('ACTUAL_FENCED_BACKUP_RECEIPT_REQUIRED');
 if(!same(await privateRuntime.digest(backup.backup.path),backup.backup))fail('ACTUAL_FENCED_BACKUP_BYTES_CHANGED');await check('BACKUP_RECHECKED');
 const db=originalSnapshot.containers.db,networkName=read(['inspect',db.id,'--format',networkFormat]);
 const networks=JSON.parse(read(['inspect',db.id,'--format','{{json .NetworkSettings.Networks}}'])),endpoint=Object.values(networks);
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(networkName)||endpoint.length!==1||!endpoint[0].Aliases?.includes('db')||!/^[a-f0-9]{64}$/.test(endpoint[0].NetworkID??''))fail('EXACT_ORIGINAL_DATABASE_NETWORK_REQUIRED');
 const networkId=endpoint[0].NetworkID;if(networkId!==dependencies.expectedNetworkId)fail('APPROVED_DATABASE_NETWORK_REQUIRED');
 let channel,index=0,name=null,poisoned=false;const cli=[];
 const output=(stem,text)=>{const file=path.join(directory,stem+'.stdout'),fd=privateRuntime.openOutput(file);try{fs.writeFileSync(fd,text+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return {stdoutFile:file};};
 const onRequest=async({operation,args})=>{
  try{
   if(poisoned||operation!=='docker'||index>3)fail('SINGLE_SCHEMA_SCRIPT_SEQUENCE_REQUIRED');channel.assertActivePeer();await check('PROXY_CALL');
   if(index===0){
    if(!same(args,['image','inspect',context.candidateImageId,'--format','{{.Id}}']))fail('EXACT_CANDIDATE_INSPECT_REQUIRED');
    if(read(args)!==context.candidateImageId)fail('ORIGINAL_CANDIDATE_IMAGE_CHANGED');index++;return output('migration-image',context.candidateImageId);
   }
   if(index===1){
    if(!same(args,['inspect','phoenix-v3-db','--format',networkFormat])||read(args)!==networkName)fail('ORIGINAL_DATABASE_NETWORK_CHANGED');index++;return output('migration-network',networkName);
   }
   const mode=index===2?'run':'show',parsed=parseModernSchemaMigrationRun(args,{imageId:context.candidateImageId,networkName,mode,expectedName:mode==='show'?name+'-show':null});
   name??=parsed.name;
   const receipt=await runModernSchemaGatedCli({owner:context.owner,contextDigest:canonicalDigest(context),mode,imageId:context.candidateImageId,networkId,
    environment:parsed.environment,privateRuntime,directory,originalLease,admit:async request=>{channel.assertActivePeer();await check(request.stage);channel.assertActivePeer();return true;},
    verifyNativeBackend}, {onCreated,withNativeCreate:dependencies.withNativeCreate});
   channel.assertActivePeer();await check('CLI_PROOF_COMPLETE');cli.push(receipt);index++;return {stdoutFile:receipt.stdout.path};
  }catch(error){poisoned=true;throw error;}
 };
 channel=new ModernSchemaBodyChannel({owner:context.owner,privateRuntime,directory,onRequest},{operationProfile:'CONTROLLED_MIGRATION'});
 const pidFile=path.join(directory,'migration-channel-pid'),body=path.join(directory,'controlled-script.sh');
 const bootstrap=`set -Eeuo pipefail\nset +x\numask 077\nserver_pid="$(< ${quote(pidFile)})"\n`+
  `docker() { builtin printf '%s\\0' "$@" | /usr/bin/python3 -I -S ${quote(channel.script)} request-docker "/proc/$server_pid/fd/10/${channel.socketName}" "$server_pid"; }\n`+
  `. ${quote(script)} ${quote(directory)} ${quote(context.candidateImageId)}\n`;
 const fd=privateRuntime.openOutput(body);try{fs.writeFileSync(fd,bootstrap);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 let result,driverComplete=false;
 try{
  result=await privateRuntime.run({binary:'/bin/bash',args:['--noprofile','--norc','-Eeuo','pipefail'],directory,stem:'original-schema-script',inputFile:body,deferInput:true,inheritFd9:true,
   env:{...executionEnv(),PRESERVE_ARTIFACTS:'true'},timeoutMs:600000,onSpawn:async entry=>{
    await check('ORIGINAL_DRIVER_STARTED');if(dependencies.onOriginalDriver)await dependencies.onOriginalDriver(entry);await channel.start(entry);const pidFd=privateRuntime.openOutput(pidFile);try{fs.writeFileSync(pidFd,String(channel.entry.child.pid));fs.fsyncSync(pidFd);}finally{fs.closeSync(pidFd);}
   }});
  if(index!==4||poisoned||cli.length!==2)fail('EXACT_SCHEMA_SCRIPT_INCOMPLETE');await check('ORIGINAL_DRIVER_COMPLETED');
  if(!fs.readFileSync(script).equals(source))fail('COMMITTED_SCHEMA_SCRIPT_CHANGED');
  driverComplete=true;
 }finally{if(channel.entry){
  const options={expectedGraceful:driverComplete};
  if(dependencies.closeChannel)await dependencies.closeChannel(channel,options);else await channel.close(options);
 }}
 const receipt={schema:'phoenix.modern-schema-original-schema-driver/v1',owner:context.owner,contextDigest:canonicalDigest(context),script:schemaScript,scriptSourceBlob:git(root,['rev-parse',context.targetSha+':'+schemaScript]),
  imageId:context.candidateImageId,networkId,backupSha256:backup.backup.sha256,outcome:'SUCCESS',run:cli[0],show:cli[1],stdout:await privateRuntime.digest(result.stdout),stderr:await privateRuntime.digest(result.stderr),automaticRetry:false};
 privateRuntime.publishJson(path.join(directory,'schema-driver-receipt.json'),receipt);return receipt;
}
