/** Protected full schema baseline for pre-DDL recovery comparisons. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const fail=code=>{throw Error('MODERN_SCHEMA_CATALOG_HOLD='+code);};
export async function captureModernSchemaCatalog({owner,stage,databasePin,privateRuntime,directory,admit},dependencies={}){
 if(!['before','after','recovery-before','recovery-after','hold-observation'].includes(stage)||typeof admit!=='function'||!/^[a-f0-9]{64}$/.test(databasePin?.id??''))fail('EXACT_CATALOG_SCOPE_REQUIRED');
 const check=async()=>{privateRuntime.guard();if(await admit()!==true)fail('ORIGINAL_FENCED_LEASE_REQUIRED');};await check();
 const applicationName=`phoenix-schema-${owner}-schema-${stage}`;
 const dump=await privateRuntime.run({binary:'/usr/bin/docker',args:['exec','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=3000','-e','PGAPPNAME='+applicationName,databasePin.id,
  'sh','-c','exec env -i PATH=/usr/local/bin:/usr/bin:/bin PGHOST=/var/run/postgresql PGPORT=5432 PGOPTIONS="$PGOPTIONS" PGAPPNAME="$PGAPPNAME" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only --no-owner --no-acl'],
  directory,stem:'catalog-'+stage,timeoutMs:120000,onSpawn:dependencies.onDumpStarted?entry=>dependencies.onDumpStarted(entry,applicationName):null});
 await check();if(dependencies.onDumpStopped)await dependencies.onDumpStopped();
 const raw=await privateRuntime.digest(dump.stdout);if(raw.bytes>16*1024*1024)fail('BOUNDED_SCHEMA_DUMP_REQUIRED');
 const text=fs.readFileSync(dump.stdout,'utf8').replace(/^\\(?:un)?restrict [^\n]*\n/gm,'');
 const receipt={schema:'phoenix.modern-schema-catalog-facts/v1',owner,stage,databasePin,schemaSha256:createHash('sha256').update(text).digest('hex'),raw,
  randomPsqlRestrictTokenExcluded:true,readOnly:true,releaseAuthorized:false};
 const file=path.join(privateRuntime.directory,`schema-release-${stage}-schema-${owner}.json`);privateRuntime.publishJson(file,receipt);await check();return {file,receipt};
}
