/** Exact immutable TypeORM CLI, with a root permit before its first usable
 * native pg connection. All output, credentials and creation pins are private. */
import fs from 'node:fs';import path from 'node:path';import {randomBytes,createHash} from 'node:crypto';
import {executionEnv} from './capture-production-runtime.mjs';import {same,canonicalDigest} from './production-maintenance-receipts.mjs';
import {pinModernSchemaChild} from './production-modern-schema-processes.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_GATED_CLI_HOLD='+code);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const MARKER='MODERN_SCHEMA_MIGRATION_BACKEND=';
export function validateModernSchemaCliBackend(proof,{owner,contextDigest,nonce,mode}){
 if(!proof||!same(Object.keys(proof).sort(),['backend','contextDigest','mode','nonce','owner','schema'])||proof.schema!=='phoenix.modern-schema-migration-backend/v1'
  ||proof.owner!==owner||proof.contextDigest!==contextDigest||proof.nonce!==nonce||proof.mode!==mode)fail('EXACT_NATIVE_BACKEND_PROOF_REQUIRED');
 const b=proof.backend;
 if(!b||!same(Object.keys(b).sort(),['applicationName','backendStartMicros','database','databaseOid','pid','postmasterStartMicros','primary','readonly','systemIdentifier'])
  ||!Number.isSafeInteger(b.pid)||b.pid<2||!Number.isSafeInteger(b.databaseOid)||b.databaseOid<1||b.primary!==true||b.readonly!==(mode==='show')||b.applicationName!==`phoenix-schema-${owner}-${mode}`
  ||typeof b.database!=='string'||!b.database||!['systemIdentifier','postmasterStartMicros','backendStartMicros'].every(key=>typeof b[key]==='string'&&/^[1-9][0-9]{0,19}$/.test(b[key])))fail('EXACT_NATIVE_BACKEND_IDENTITY_REQUIRED');return proof;
}
export async function observeModernSchemaCliBackend(client,proof,resource){
 validateModernSchemaCliBackend(proof,proof);
 const endpoints=Object.values(resource?.runtime?.networks??{});
 if(endpoints.length!==1||endpoints[0].NetworkID!==resource.networkId||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(endpoints[0].IPAddress??'')||resource.runtime.state?.Running!==true)fail('EXACT_RUNNING_CLI_ENDPOINT_REQUIRED');
 const {rows}=await client.query(`SELECT pid,datid::integer AS "databaseOid",datname AS database,
 (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",trunc(EXTRACT(epoch FROM pg_postmaster_start_time())*1000000)::text AS "postmasterStartMicros",
 trunc(EXTRACT(epoch FROM backend_start)*1000000)::text AS "backendStartMicros",application_name AS "applicationName",NOT pg_is_in_recovery() AS primary,
 host(client_addr) AS "clientAddress",xact_start IS NULL AS idle,backend_type AS type FROM pg_stat_activity WHERE pid=$1`,[proof.backend.pid]);
 const row=rows[0],{readonly,...expected}=proof.backend;
 if(rows.length!==1||!row||Object.entries(expected).some(([key,value])=>row[key]!==value)||row.clientAddress!==endpoints[0].IPAddress||row.idle!==true||row.type!=='client backend')fail('EXACT_ORIGINAL_NATIVE_CLI_BACKEND_REQUIRED');
 return {backend:proof.backend,containerId:resource.containerId,networkId:resource.networkId,clientAddress:row.clientAddress,nativeObservationSha256:canonicalDigest(row)};
}
function readProof(file,binding,uid){
 const before=fs.lstatSync(file);if(!before.isFile()||before.isSymbolicLink()||before.uid!==uid||(before.mode&0o777)!==0o600||before.nlink!==1||before.size>65536)fail('BOUNDED_PRIVATE_GATE_OUTPUT_REQUIRED');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let text;
 try{const opened=fs.fstatSync(fd);if(opened.dev!==before.dev||opened.ino!==before.ino)fail('PRIVATE_GATE_OUTPUT_CHANGED');const bytes=Buffer.alloc(65536);text=bytes.subarray(0,fs.readSync(fd,bytes,0,bytes.length,0)).toString('utf8');}finally{fs.closeSync(fd);}
 const lines=text.split('\n').slice(0,-1).filter(line=>line.startsWith(MARKER));if(!lines.length)return null;if(lines.length!==1)fail('SINGLE_ORIGINAL_BACKEND_REQUIRED');
 let value;try{value=JSON.parse(lines[0].slice(MARKER.length));}catch{fail('NATIVE_BACKEND_JSON_REQUIRED');}return validateModernSchemaCliBackend(value,binding);
}
export async function runModernSchemaGatedAdmission({serialize, start, admit, afterAdmission}){
 const {completion}=await serialize(async()=>{
  let release,admission;
  const admitted=new Promise(resolve=>{release=resolve;});
  const completion=start((entry,{signal})=>{
   admission=(async()=>{
    const deadline=performance.now()+30000;
    const assertWaiting=()=>{
     if(signal.aborted||entry.child.exitCode!==null||entry.child.signalCode!==null||performance.now()>=deadline)fail('FIRST_BACKEND_GATE_UNRESOLVED');
    };
    const assertOriginalAttach=()=>{
     assertWaiting();
     let current;
     try{current=pinModernSchemaChild(entry.child).pin;}catch{fail('ORIGINAL_GATED_ATTACH_CHANGED');}
     if(!entry.pin||!same(current,entry.pin))fail('ORIGINAL_GATED_ATTACH_CHANGED');
     assertWaiting();
    };
    assertWaiting();
    await admit(assertWaiting,assertOriginalAttach);
    release();
   })();
   return admission;
  });
  try{
   await Promise.race([admitted,completion.then(()=>fail('FIRST_BACKEND_GATE_UNRESOLVED'))]);
   // The durable permit ends onSpawn. A fast, successful CLI exit can now
   // be consumed normally while the mandatory post-check is still running.
   await afterAdmission?.();
  }
  catch(error){
   // An attach can exit before the in-flight admission callback returns.
   // Keep that callback in its original queue until it has stopped.
   await admission?.catch(()=>{});throw error;
  }
  return {completion};
 });
 return completion;
}
export async function runModernSchemaGatedCli({owner,contextDigest,mode,imageId,networkId,environment,privateRuntime,directory,originalLease,admit,verifyNativeBackend},dependencies={}){
 if(!/^[1-9][0-9]*-[1-9][0-9]*$/.test(owner??'')||!/^[a-f0-9]{64}$/.test(contextDigest??'')||!['run','show'].includes(mode)||!/^sha256:[a-f0-9]{64}$/.test(imageId??'')
  ||!/^[a-f0-9]{64}$/.test(networkId??'')||!Number.isSafeInteger(originalLease?.sessionPid)||!originalLease.database||typeof admit!=='function'||typeof verifyNativeBackend!=='function'
  ||!same(Object.keys(environment??{}).sort(),['DB_HOST','DB_NAME','DB_PASSWORD','DB_PORT','DB_USER'])||!['db','schema-db'].includes(environment.DB_HOST)||environment.DB_PORT!=='5432'
  ||!['DB_USER','DB_NAME'].every(key=>/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(environment[key]??''))||typeof environment.DB_PASSWORD!=='string'||environment.DB_PASSWORD.length>2048||/[\0\r\n]/.test(environment.DB_PASSWORD))fail('FIXED_GATED_CLI_SCOPE_REQUIRED');
 const binding={owner,contextDigest,nonce:randomBytes(32).toString('hex'),mode},role='controlled-migration-'+mode;
 const check=async stage=>{privateRuntime.guard();if(await admit({stage,mode})!==true)fail('ORIGINAL_NATIVE_ADMISSION_REQUIRED');privateRuntime.guard();};await check('BEFORE_CREATE');
 const gateDirectory=path.join(directory,'gate-'+mode);fs.mkdirSync(gateDirectory,{mode:0o755});fs.chmodSync(gateDirectory,0o755);
 const source=dependencies.preloadSource??new URL('./production-modern-schema-migration-gate.cjs',import.meta.url).pathname,preload=fs.readFileSync(source);
 const preloadFile=path.join(gateDirectory,'preload.cjs');fs.writeFileSync(preloadFile,preload,{flag:'wx',mode:0o444});fs.chmodSync(preloadFile,0o444);
 const launcherSource=dependencies.launcherSource??new URL('./production-modern-schema-migration-launch.cjs',import.meta.url).pathname,launcher=fs.readFileSync(launcherSource),launcherFile=path.join(gateDirectory,'launch.cjs');
 fs.writeFileSync(launcherFile,launcher,{flag:'wx',mode:0o444});fs.chmodSync(launcherFile,0o444);
 if(dependencies.prepareGateFiles)await dependencies.prepareGateFiles(gateDirectory);
 const gateStat=fs.lstatSync(gateDirectory),fileStat=fs.lstatSync(preloadFile);
 if(gateStat.uid!==0||!gateStat.isDirectory()||gateStat.isSymbolicLink()||(gateStat.mode&0o022)!==0||fileStat.uid!==0||!fileStat.isFile()||fileStat.isSymbolicLink()||fileStat.nlink!==1||(fileStat.mode&0o222)!==0)fail('ROOT_READONLY_GATE_REQUIRED');
 const {DB_PASSWORD:password,...nonsecretEnvironment}=environment;
 const env={...nonsecretEnvironment,NODE_ENV:'production',PGAPPNAME:`phoenix-schema-${owner}-${mode}`,PGOPTIONS:(mode==='show'?'-c default_transaction_read_only=on ':'')+'-c lock_timeout=5s -c statement_timeout=120s',
  NODE_OPTIONS:'--require=/run/phoenix-modern-schema-gate/preload.cjs',PHOENIX_SCHEMA_GATE_OWNER:owner,PHOENIX_SCHEMA_GATE_CONTEXT:contextDigest,PHOENIX_SCHEMA_GATE_NONCE:binding.nonce,PHOENIX_SCHEMA_GATE_MODE:mode};
 const command=async(args,stem,options={})=>{await check('COMMAND');const value=await privateRuntime.run({binary:'/usr/bin/docker',args,directory,stem:'cli-'+mode+'-'+stem,env:executionEnv(),...options});await check('COMMAND_COMPLETE');return value;};
 const create=async()=>{const created=await command(['create','-i','--pull=never','--label',`phoenix.schema.owner=${owner}`,'--label',`phoenix.schema.role=${role}`,'--network',networkId,'--restart=no','--read-only','--user','phoenix',
  '--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=16777216,mode=1777','--mount',`type=bind,source=${gateDirectory},target=/run/phoenix-modern-schema-gate,readonly`,
  ...Object.keys(env).flatMap(key=>['--env',key]),'--entrypoint','/sbin/tini',imageId,'--','node','/run/phoenix-modern-schema-gate/launch.cjs','-d','dist/database/data-source.js','migration:'+mode,...(mode==='run'?['--transaction','all']:[])],'create',{env:{...executionEnv(),...env}});
 const containerId=fs.readFileSync(created.stdout,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(containerId))fail('NATIVE_NEW_CLI_CID_REQUIRED');
 const nativeCreated=await command(['inspect',containerId,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State.Status}}\t{{json .State.Running}}\t{{json .Config.Labels}}\t{{json .HostConfig.NetworkMode}}\t{{json .HostConfig.ReadonlyRootfs}}\t{{json .HostConfig.Privileged}}\t{{json .Mounts}}'],'created-identity');
 const [createdId,createdImage,createdStatus,createdRunning,createdLabels,createdNetwork,createdReadonly,createdPrivileged,createdMounts]=fs.readFileSync(nativeCreated.stdout,'utf8').trim().split('\t').map(JSON.parse);
 if(createdId!==containerId||createdImage!==imageId||createdStatus!=='created'||createdRunning!==false||createdLabels?.['phoenix.schema.owner']!==owner||createdLabels?.['phoenix.schema.role']!==role
  ||createdNetwork!==networkId||createdReadonly!==true||createdPrivileged!==false||createdMounts.length!==1||createdMounts[0].Source!==gateDirectory||createdMounts[0].RW!==false)fail('NEW_NATIVE_CLI_CREATION_NOT_PROVED');
 const resource={schema:'phoenix.modern-schema-owned-cli/v1',...binding,containerId,imageId,networkId,role,gateDirectory,preloadSha256:digest(preload),launcherSha256:digest(launcher),createdAt:new Date().toISOString()};
 privateRuntime.publishJson(path.join(directory,'created-cli-'+mode+'.json'),resource);if(dependencies.onCreated)await dependencies.onCreated(resource);return {containerId,resource};};
 const {containerId,resource}=await (dependencies.withNativeCreate?dependencies.withNativeCreate(create):create());
 const inspect=async stem=>{
  const result=await command(['inspect',containerId,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .Config.Labels}}\t{{json .HostConfig}}\t{{json .NetworkSettings.Networks}}\t{{json .Mounts}}'],stem);
  const [id,image,state,restarts,labels,host,networks,mounts]=fs.readFileSync(result.stdout,'utf8').trim().split('\t').map(JSON.parse);
  if(id!==containerId||image!==imageId||restarts!==0||labels?.['phoenix.schema.owner']!==owner||labels?.['phoenix.schema.role']!==role||host.Privileged!==false||host.PidMode==='host'
   ||host.NetworkMode!==networkId||host.RestartPolicy?.Name!=='no'||host.ReadonlyRootfs!==true||!same(host.CapDrop,['ALL'])||Object.keys(host.PortBindings??{}).length
   ||Object.keys(networks??{}).length!==1||mounts.length!==1||mounts[0].Type!=='bind'||mounts[0].Source!==gateDirectory||mounts[0].Destination!=='/run/phoenix-modern-schema-gate'||mounts[0].RW!==false||state.OOMKilled!==false)fail('NATIVE_CLI_CONTAINER_CHANGED');
  return {id,image,state,restarts,networks};
 };
 await inspect('created-pin');
 const keys=await command(['inspect',containerId,'--format','{{range .Config.Env}}{{println (index (split . "=") 0)}}{{end}}'],'creation-environment-keys');
 if(fs.readFileSync(keys.stdout,'utf8').split('\n').includes('DB_PASSWORD'))fail('CREDENTIAL_IN_CONTAINER_CREATION_CONFIGURATION');
 const stdout=path.join(directory,'cli-'+mode+'-execute.stdout');let backendProof,nativeBackend,permit;
 const privateInput=Buffer.from(JSON.stringify({schema:'phoenix.modern-schema-cli-private-input/v1',owner,nonce:binding.nonce,password})+'\n');
 const serialize=dependencies.serializeAdmission??(async work=>work());
 let execution;
 try {
  execution=await runModernSchemaGatedAdmission({
   serialize,
   start:async onSpawn=>{
    await check('COMMAND');
    return privateRuntime.run({binary:'/usr/bin/docker',args:['start','-a','-i',containerId],directory,stem:'cli-'+mode+'-execute',
     env:executionEnv(),timeoutMs:300000,privateInput,onSpawn});
   },
   admit:async (assertWaiting,assertOriginalAttach)=>{
    while(!backendProof){
     await check('WAIT_NATIVE_BACKEND');assertWaiting();
     backendProof=readProof(stdout,binding,privateRuntime.uid);if(!backendProof)await pause(50);
    }
    const actual=await inspect('gated-pin');
    if(actual.state.Running!==true)fail('ORIGINAL_GATED_CLI_NOT_RUNNING');
    assertWaiting();
    nativeBackend=await verifyNativeBackend(backendProof,{...resource,runtime:actual});
    if(!nativeBackend||!same(nativeBackend.backend,backendProof.backend)||nativeBackend.containerId!==containerId||nativeBackend.networkId!==networkId||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(nativeBackend.clientAddress??''))fail('NATIVE_CATALOG_AND_CID_BINDING_REQUIRED');
    await check('PERMIT_ORIGINAL_BACKEND');
    assertWaiting();
    permit={schema:'phoenix.modern-schema-migration-permit/v1',...binding,backendSha256:digest(JSON.stringify(backendProof)),originalLease};
    privateRuntime.publishJson(path.join(directory,'cli-'+mode+'-permit.json'),permit);
    if(dependencies.publishPermit){
     assertOriginalAttach();
     await dependencies.publishPermit(gateDirectory,permit);
    }
    else {
     const temporary=path.join(gateDirectory,'.permit-'+randomBytes(8).toString('hex'));
     const fd=fs.openSync(temporary,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o444);
     try{
      try{fs.writeFileSync(fd,JSON.stringify(permit)+'\n');fs.fchmodSync(fd,0o444);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      assertOriginalAttach();fs.linkSync(temporary,path.join(gateDirectory,'permit.json'));
     }finally{fs.unlinkSync(temporary);}
     privateRuntime.syncDirectory(gateDirectory);
    }
   },
   afterAdmission:()=>check('PERMIT_PUBLISHED'),
  });
  await check('COMMAND_COMPLETE');
 }finally{privateInput.fill(0);}
 const after=await inspect('exit-pin');if(after.state.Running!==false||after.state.Pid!==0||after.state.ExitCode!==0)fail('ACTUAL_CLI_EXIT_UNVERIFIED');
 await check('AFTER_EXIT');
 const receipt={schema:'phoenix.modern-schema-gated-cli-result/v1',...resource,outcome:'SUCCESS',backendProof,nativeBackend,originalLease,
  permitReceiptFile:path.join(directory,'cli-'+mode+'-permit.json'),permitSha256:canonicalDigest(permit),
  stdout:await privateRuntime.digest(execution.stdout),stderr:await privateRuntime.digest(execution.stderr),exitCode:0,oomKilled:false,restartCount:0};
 privateRuntime.publishJson(path.join(directory,'cli-'+mode+'-receipt.json'),receipt);return receipt;
}
