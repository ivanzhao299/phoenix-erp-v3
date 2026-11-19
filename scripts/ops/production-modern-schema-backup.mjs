/** Actual snapshot-bound protected backup. Restore/parse is never directed at
 * the production database; no automatic production restore or cleanup exists. */
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {executionEnv} from './capture-production-runtime.mjs';import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {LEDGER_SQL,digest} from './chanjet-admission-schema-receipt.mjs';import {captureModernSchemaFacts} from './production-modern-schema-facts.mjs';
const fail=code=>{throw Error('MODERN_SCHEMA_BACKUP_HOLD='+code);};
function inspectDatabase(pin,dependencies={}){
 const run=dependencies.inspect??((id)=>execFileSync('/usr/bin/docker',['inspect',id,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State.StartedAt}}\t{{json .State.Running}}\t{{json .State.Health.Status}}\t{{json .RestartCount}}'],{env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim());
 let actual;try{actual=run(pin.id).split('\t').map(JSON.parse);}catch{fail('DATABASE_RUNTIME_UNOBSERVABLE');}
 if(!same(actual,[pin.id,pin.image,pin.startedAt,true,'healthy',pin.restartCount]))fail('DATABASE_RUNTIME_CHANGED');
}
export async function createModernSchemaBackup({owner,stage,client,databasePin,privateRuntime},dependencies={}){
 if(!['prepare','fenced'].includes(stage)||!/^[1-9][0-9]*-[1-9][0-9]*$/.test(owner??'')||!/^[a-f0-9]{64}$/.test(databasePin?.id??''))fail('EXACT_BACKUP_CONTEXT_REQUIRED');
 if(stage==='fenced'&&typeof dependencies.assertFenced!=='function')fail('NATIVE_FENCED_ADMISSION_REQUIRED');
 const verify=async()=>{privateRuntime.guard();inspectDatabase(databasePin,dependencies);if(stage==='fenced')await dependencies.assertFenced();privateRuntime.guard();};await verify();
 const applicationName=`phoenix-schema-${owner}-${stage}-backup`;
 const remoteStopped=async()=>{
  const {rows:[{count}]}=await client.query('SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name=$1',[applicationName]);
  const read=dependencies.remoteProcesses??(()=>execFileSync('/usr/bin/docker',['exec',databasePin.id,'sh','-c',
   'for item in /proc/[0-9]*/environ; do [ -r "$item" ] || continue; if tr "\\000" "\\n" < "$item" 2>/dev/null | grep -Fqx -- "$1"; then case "$(readlink "${item%/environ}/exe" 2>/dev/null)" in */pg_dump) printf "%s\\n" "${item%/environ}";; esac; fi; done','--','PGAPPNAME='+applicationName],
   {env:executionEnv(),encoding:'utf8',timeout:10000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim());
  if(count!==0||read()!=='')fail('REMOTE_BACKUP_EXECUTOR_STILL_UNRESOLVED');
 };
 const directory=privateRuntime.createDirectory(owner,stage+'-backup');
 let keepalive=null,keepaliveWork=Promise.resolve(),keepaliveError=null,snapshotOpen=false,result,source;
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');snapshotOpen=true;
  await client.query('SET LOCAL search_path=pg_catalog');
  const {rows:[database]}=await client.query(`SELECT current_database() AS name,current_user AS username,
   (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",NOT pg_is_in_recovery() AS primary,
   current_setting('server_version_num')::integer AS "serverVersionNum",current_setting('TimeZone') AS timezone,
   pg_encoding_to_char(d.encoding) AS encoding,d.datcollate AS collate,d.datctype AS ctype,d.datlocprovider AS provider,
   to_jsonb(d)->>'datlocale' AS locale,pg_database_size(current_database())::text AS bytes FROM pg_database d WHERE d.datname=current_database()`);
  if(database.primary!==true||database.serverVersionNum<180000||database.serverVersionNum>=190000||database.encoding!=='UTF8'
    ||!['c','i','b'].includes(database.provider)||!/^[1-9][0-9]*$/.test(database.bytes??''))fail('SUPPORTED_PRIMARY_DATABASE_REQUIRED');
  const disk=fs.statfsSync(directory,{bigint:true});if(disk.bavail*disk.bsize<BigInt(database.bytes)*4n+2147483648n)fail('SPACE_FOR_PROTECTED_BACKUP_AND_REHEARSAL_REQUIRED');
  const facts=await captureModernSchemaFacts(client,{withinSnapshot:true});
  await client.query('SET LOCAL search_path=public');
  const {rows:[{jsonb_build_object:ledgerRaw}]}=await client.query(LEDGER_SQL),ledger=JSON.parse(ledgerRaw);
  const {rows:[{snapshot}]}=await client.query('SELECT pg_export_snapshot() AS snapshot');
  if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9A-Fa-f]{1,8}$/.test(snapshot??''))fail('EXPORTED_NATIVE_SNAPSHOT_REQUIRED');
  source={database,facts,ledger,ledgerSha256:digest(JSON.stringify(ledger)),snapshotSha256:createHash('sha256').update(snapshot).digest('hex')};
  keepalive=setInterval(()=>{keepaliveWork=keepaliveWork.then(async()=>{try{await verify();await client.query('SELECT 1 AS snapshot_keepalive');}catch{keepaliveError=true;}});},5000);
  result=await privateRuntime.run({binary:'/usr/bin/docker',args:['exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=3000',
   '-e',`PGAPPNAME=${applicationName}`,databasePin.id,'sh','-c','exec env -i PATH=/usr/local/bin:/usr/bin:/bin PGHOST=/var/run/postgresql PGPORT=5432 PGOPTIONS="$PGOPTIONS" PGAPPNAME="$PGAPPNAME" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl --snapshot="$1"','--',snapshot],directory,stem:'database-dump',timeoutMs:600000});
  clearInterval(keepalive);keepalive=null;await keepaliveWork;if(keepaliveError)fail('EXPORTED_SNAPSHOT_LOST');
  await client.query('ROLLBACK');snapshotOpen=false;
 }finally{
  if(keepalive)clearInterval(keepalive);await keepaliveWork;
  if(snapshotOpen)await client.query('ROLLBACK');
  // SIGTERM of the host Docker CLI does not prove its remote exec exited.
  // Failure here retains HOLD; it never terminates a backend or authorizes R.
  await remoteStopped();
 }
 await verify();const backup=await privateRuntime.digest(result.stdout);if(backup.bytes<64)fail('NONEMPTY_CUSTOM_BACKUP_REQUIRED');
 const toc=await privateRuntime.run({binary:'/usr/bin/docker',args:['exec','-i',databasePin.id,'pg_restore','--list'],directory,stem:'backup-toc',inputFile:backup.path,timeoutMs:300000});
 const full=await privateRuntime.run({binary:'/usr/bin/docker',args:['exec','-i',databasePin.id,'pg_restore','--no-owner','--no-acl','--file=/dev/null'],directory,stem:'backup-full-parse',inputFile:backup.path,timeoutMs:600000});
 const after=await privateRuntime.digest(backup.path);if(!same(backup,after))fail('BACKUP_CHANGED_DURING_VERIFICATION');await verify();
 const receipt={schema:'phoenix.modern-schema-protected-backup/v1',owner,stage,databasePin,sourceDatabase:source.database,
  backup,toc:await privateRuntime.digest(toc.stdout),fullParseExitCode:full.exitCode,sourceLedgerSha256:source.ledgerSha256,
  sourceTableFactsSha256:canonicalDigest(source.facts.tables),sourceBusinessFactsSha256:source.facts.businessDataSha256,
  snapshotSha256:source.snapshotSha256,format:'POSTGRES_CUSTOM',tocVerified:true,fullParseVerified:true,productionRestore:false,createdAt:new Date().toISOString()};
 const file=path.join(directory,'backup-receipt.json');privateRuntime.publishJson(file,receipt);
 return {receipt,source,receiptPath:file,directory};
}
