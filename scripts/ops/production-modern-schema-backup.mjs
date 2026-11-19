/** Actual snapshot-bound protected backup. Restore/parse is never directed at
 * the production database; no automatic production restore or cleanup exists. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {executionEnv} from './capture-production-runtime.mjs';import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {LEDGER_SQL,digest} from './chanjet-admission-schema-receipt.mjs';import {captureModernSchemaFacts} from './production-modern-schema-facts.mjs';
import {modernSchemaPostgresProfile,nativePostgresToolMajor} from './production-modern-schema-postgres.mjs';
import {publicModernSchemaPreparationFailure} from './production-modern-schema-public-preparation.mjs';
const PREFIX='MODERN_SCHEMA_BACKUP_HOLD=';
const fail=code=>{throw Error(PREFIX+code);};
function backupHold(reason,cleanup){
 const cause=reason?Error(PREFIX+reason):undefined;
 if(!cleanup.length)return cause;
 return Object.assign(Error(PREFIX+'CLEANUP_UNRESOLVED',{cause}),{cleanup});
}
export async function closeModernSchemaPreparationReadClient(client,stage,primary,recordHold){
 try{await client.close();}
 catch{
  if(stage==='BACKUP'){
   const cleanup=primary?.message===PREFIX+'CLEANUP_UNRESOLVED';
   const original=cleanup?primary.cause:primary;
   const reason=original?publicModernSchemaPreparationFailure('BACKUP',original).slice('BACKUP_'.length):null;
   const prior=['ROLLBACK','REMOTE_CLOSE'].filter(step=>cleanup&&Array.isArray(primary.cleanup)&&primary.cleanup.includes(step));
   const pending=[...prior,'READ_CHANNEL_CLOSE'];
   try{recordHold?.({schema:'phoenix.modern-schema-private-backup-hold/v1',failure:reason,cleanup:pending});}catch{}
   throw backupHold(reason,pending);
  }
  if(!primary)throw Error('MODERN_SCHEMA_PREPARATION_HOLD=READ_CHANNEL_CLOSE_UNVERIFIED');
 }
}
function inspectDatabase(pin,dependencies={}){
 const run=dependencies.inspect??((id)=>execFileSync('/usr/bin/docker',['inspect',id,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json .State.Running}}\t{{json .State.Health.Status}}\t{{json .RestartCount}}'],{env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim());
 let actual;try{actual=run(pin.id).split('\t').map(JSON.parse);}catch{fail('DATABASE_RUNTIME_UNOBSERVABLE');}
 if(!same(actual,[pin.id,pin.image,pin.startedAt,true,'healthy',pin.restartCount]))fail('DATABASE_RUNTIME_CHANGED');
}
export async function createModernSchemaBackup({owner,stage,client,databasePin,privateRuntime},dependencies={}){
 const verify=async()=>{privateRuntime.guard();inspectDatabase(databasePin,dependencies);if(stage==='fenced')await dependencies.assertFenced();privateRuntime.guard();};
 const applicationName=`phoenix-schema-${owner}-${stage}-backup`;
 const remoteStopped=async()=>{
  const read=dependencies.remoteProcesses??(()=>execFileSync('/usr/bin/docker',['exec',databasePin.id,'sh','-c',
   'for item in /proc/[0-9]*/environ; do [ -r "$item" ] || continue; if tr "\\000" "\\n" < "$item" 2>/dev/null | grep -Fqx -- "$1"; then case "$(readlink "${item%/environ}/exe" 2>/dev/null)" in */pg_dump) printf "%s\\n" "${item%/environ}";; esac; fi; done','--','PGAPPNAME='+applicationName],
   {env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim());
  let count,native;
  try{const {rows:[row]}=await client.query('SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name=$1',[applicationName]);count=row.count;}catch{}
  try{native=read();}catch{}
  if(count!==0||native!=='')fail('REMOTE_BACKUP_EXECUTOR_STILL_UNRESOLVED');
 };
 let directory,reason='SOURCE_GUARD',primary=null;
 let keepalive=null,keepaliveWork=Promise.resolve(),keepaliveError=null,snapshotOpen=false,dumpAttempted=false,result,source;
 const cleanup=[];
 const recordHold=()=>{
  if(stage==='prepare'&&directory){
   try{privateRuntime.publishJson(path.join(directory,'backup-hold.json'),{
    schema:'phoenix.modern-schema-private-backup-hold/v1',failure:primary,cleanup,
   });}catch{/* The protected write has its own guard; its failure cannot replace the backup reason. */}
  }
  return backupHold(primary,cleanup);
 };
 try{
  if(!['prepare','fenced'].includes(stage)||!/^[1-9][0-9]*-[1-9][0-9]*$/.test(owner??'')||!/^[a-f0-9]{64}$/.test(databasePin?.id??''))fail('EXACT_BACKUP_CONTEXT_REQUIRED');
  if(stage==='fenced'&&typeof dependencies.assertFenced!=='function')fail('NATIVE_FENCED_ADMISSION_REQUIRED');
  await verify();directory=privateRuntime.createDirectory(owner,stage+'-backup');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');snapshotOpen=true;
  await client.query('SET LOCAL search_path=pg_catalog');
  const {rows:[database]}=await client.query(`SELECT current_database() AS name,current_user AS username,
   (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",NOT pg_is_in_recovery() AS primary,
   current_setting('server_version_num')::integer AS "serverVersionNum",current_setting('TimeZone') AS timezone,
   pg_encoding_to_char(d.encoding) AS encoding,d.datcollate AS collate,d.datctype AS ctype,d.datlocprovider AS provider,
   d.datcollversion AS "collationVersion",pg_database_collation_actual_version(d.oid) AS "actualCollationVersion",
   pg_database_size(current_database())::text AS bytes FROM pg_database d WHERE d.datname=current_database()`);
  if(database?.primary!==true||database.encoding!=='UTF8'||database.provider!=='c'
    ||database.collationVersion!==database.actualCollationVersion||!/^[1-9][0-9]*$/.test(database.bytes??''))fail('SUPPORTED_PRIMARY_DATABASE_REQUIRED');
  reason='VERSION';
  const profile=modernSchemaPostgresProfile(database.serverVersionNum);
  if(!profile)fail('POSTGRES_BACKUP_TOOL_VERSION_REQUIRED');
  const tools=await privateRuntime.run({binary:'/usr/bin/docker',args:['exec',databasePin.id,'sh','-c','pg_dump --version && exec pg_restore --version'],
   directory,stem:'backup-tool-versions',timeoutMs:10000});
  const toolStat=fs.lstatSync(tools.stdout);
  if(!toolStat.isFile()||toolStat.isSymbolicLink()||toolStat.nlink!==1||toolStat.size>1024)fail('POSTGRES_BACKUP_TOOL_VERSION_REQUIRED');
  const versions=fs.readFileSync(tools.stdout,'utf8').trim().split('\n');
  if(versions.length!==2||nativePostgresToolMajor('pg_dump',versions[0])!==profile.major||
   nativePostgresToolMajor('pg_restore',versions[1])!==profile.major)fail('POSTGRES_BACKUP_TOOL_VERSION_REQUIRED');
  reason='SOURCE_GUARD';await verify();
  reason='DISK';
  const disk=fs.statfsSync(directory,{bigint:true});if(disk.bavail*disk.bsize<BigInt(database.bytes)*4n+2147483648n)fail('SPACE_FOR_PROTECTED_BACKUP_AND_REHEARSAL_REQUIRED');
  reason='FACTS';
  const facts=await captureModernSchemaFacts(client,{withinSnapshot:true});
  reason='LEDGER';
  await client.query('SET LOCAL search_path=public');
  const {rows:[{jsonb_build_object:ledgerRaw}]}=await client.query(LEDGER_SQL),ledger=JSON.parse(ledgerRaw);
  reason='EXPORT_SNAPSHOT';
  const {rows:[{snapshot}]}=await client.query('SELECT pg_export_snapshot() AS snapshot');
  if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9A-Fa-f]{1,8}$/.test(snapshot??''))fail('EXPORTED_NATIVE_SNAPSHOT_REQUIRED');
  source={database:{...database,backupToolMajor:profile.major},facts,ledger,ledgerSha256:digest(JSON.stringify(ledger)),snapshotSha256:createHash('sha256').update(snapshot).digest('hex')};
  reason='EXECUTION';
  keepalive=setInterval(()=>{keepaliveWork=keepaliveWork.then(async()=>{try{await verify();await client.query('SELECT 1 AS snapshot_keepalive');}catch{keepaliveError=true;}});},5000);
  dumpAttempted=true;
  result=await privateRuntime.run({binary:'/usr/bin/docker',args:['exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=3000',
   '-e',`PGAPPNAME=${applicationName}`,databasePin.id,'sh','-c','exec env -i PATH=/usr/local/bin:/usr/bin:/bin PGHOST=/var/run/postgresql PGPORT=5432 PGOPTIONS="$PGOPTIONS" PGAPPNAME="$PGAPPNAME" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl --snapshot="$1"','--',snapshot],directory,stem:'database-dump',timeoutMs:600000,
   onSpawn:dependencies.onDumpStarted?entry=>dependencies.onDumpStarted(entry,applicationName):null});
  reason='SNAPSHOT_CONTINUITY';
  clearInterval(keepalive);keepalive=null;await keepaliveWork;if(keepaliveError)fail('EXPORTED_SNAPSHOT_LOST');
 }catch{primary=reason;}
 finally{
  if(keepalive)clearInterval(keepalive);await keepaliveWork;
  if(snapshotOpen){try{await client.query('ROLLBACK');}catch{cleanup.push('ROLLBACK');}}
  // SIGTERM of the host Docker CLI does not prove its remote exec exited.
  // Failure here retains HOLD; it never terminates a backend or authorizes R.
  if(dumpAttempted){
   try{
    await remoteStopped();
    if(dependencies.onDumpStopped)await dependencies.onDumpStopped();
   }catch{cleanup.push('REMOTE_CLOSE');}
  }
 }
 if(primary||cleanup.length)throw recordHold();
 try{
  reason='SOURCE_GUARD';await verify();
  reason='VERIFICATION';
  const backup=await privateRuntime.digest(result.stdout);if(backup.bytes<64)fail('NONEMPTY_CUSTOM_BACKUP_REQUIRED');
  const toc=await privateRuntime.run({binary:'/usr/bin/docker',args:['exec','-i',databasePin.id,'pg_restore','--list'],directory,stem:'backup-toc',inputFile:backup.path,timeoutMs:300000});
  const full=await privateRuntime.run({binary:'/usr/bin/docker',args:['exec','-i',databasePin.id,'pg_restore','--no-owner','--no-acl','--file=/dev/null'],directory,stem:'backup-full-parse',inputFile:backup.path,timeoutMs:600000});
  const after=await privateRuntime.digest(backup.path);if(!same(backup,after))fail('BACKUP_CHANGED_DURING_VERIFICATION');
  reason='SOURCE_GUARD';await verify();
  reason='VERIFICATION';
  const receipt={schema:'phoenix.modern-schema-protected-backup/v1',owner,stage,databasePin,sourceDatabase:source.database,
   backup,toc:await privateRuntime.digest(toc.stdout),fullParseExitCode:full.exitCode,sourceLedgerSha256:source.ledgerSha256,
   sourceTableFactsSha256:canonicalDigest(source.facts.tables),sourceBusinessFactsSha256:source.facts.businessDataSha256,
   snapshotSha256:source.snapshotSha256,format:'POSTGRES_CUSTOM',tocVerified:true,fullParseVerified:true,productionRestore:false,createdAt:new Date().toISOString()};
  const file=path.join(directory,'backup-receipt.json');privateRuntime.publishJson(file,receipt);
  return {receipt,source,receiptPath:file,directory};
 }catch{primary=reason;throw recordHold();}
}
