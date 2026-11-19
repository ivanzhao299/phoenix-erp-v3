/** Fixed migration-only preload. The real TypeORM CLI cannot receive its
 * first connected pg Client until the native supervisor permits that exact
 * backend. No AppModule, production credential output, or retry. */
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),pg=require('/app/node_modules/pg');
const directory='/run/phoenix-modern-schema-gate',file=directory+'/permit.json';
const hold=()=>Error('MODERN_SCHEMA_MIGRATION_GATE_HOLD');
const owner=process.env.PHOENIX_SCHEMA_GATE_OWNER,nonce=process.env.PHOENIX_SCHEMA_GATE_NONCE,contextDigest=process.env.PHOENIX_SCHEMA_GATE_CONTEXT;
const mode=process.env.PHOENIX_SCHEMA_GATE_MODE;
if(process.getuid()===0||Number(process.versions.node.split('.')[0])!==20||!/^\d+-\d+$/.test(owner??'')||!/^[a-f0-9]{64}$/.test(nonce??'')
 ||!/^[a-f0-9]{64}$/.test(contextDigest??'')||!['run','show'].includes(mode)||process.env.PGAPPNAME!==`phoenix-schema-${owner}-${mode}`)throw hold();
const parent=fs.lstatSync(directory),self=fs.lstatSync(directory+'/preload.cjs');
if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==0||(parent.mode&0o022)!==0||!self.isFile()||self.isSymbolicLink()||self.uid!==0||self.nlink!==1||(self.mode&0o222)!==0)throw hold();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let connections=0;
const query=pg.Client.prototype.query;
const raw=(client,...args)=>new Promise((resolve,reject)=>query.call(client,...args,(error,value)=>error?reject(error):resolve(value)));
function validateLease(lease,backend){
 if(!lease||!Number.isSafeInteger(lease.sessionPid)||lease.sessionPid<2||lease.sessionPid===backend.pid||typeof lease.backendStartMicros!=='string'||!/^[1-9][0-9]{0,19}$/.test(lease.backendStartMicros)
  ||lease.database?.name!==backend.database||lease.database.schema!=='public'||lease.database.databaseOid!==backend.databaseOid||lease.database.systemIdentifier!==backend.systemIdentifier||lease.database.postmasterStartMicros!==backend.postmasterStartMicros)throw hold();
}
async function verifyLease(client,lease,backend){
 validateLease(lease,backend);
 const {rows:[row]}=await raw(client,`SELECT NOT pg_catalog.pg_is_in_recovery() AND pg_catalog.pg_backend_pid()=$1::int
  AND (SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())=$2::oid
  AND (SELECT system_identifier::text FROM pg_catalog.pg_control_system())=$3
  AND trunc(EXTRACT(epoch FROM pg_catalog.pg_postmaster_start_time())*1000000)::text=$4
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_stat_activity WHERE pid=$5::int AND datid=$2::oid AND trunc(EXTRACT(epoch FROM backend_start)*1000000)::text=$6)
  AND (SELECT count(*)=2 AND count(DISTINCT objid)=2 AND coalesce(bool_and(mode='ExclusiveLock' AND granted),false)
   FROM pg_catalog.pg_locks WHERE locktype='advisory' AND pid=$5::int AND database=$2::oid AND classid=17455 AND objid IN(1,2) AND objsubid=2) AS original`,
  [backend.pid,backend.databaseOid,backend.systemIdentifier,backend.postmasterStartMicros,lease.sessionPid,lease.backendStartMicros]);
 if(row?.original!==true)throw hold();
}
function bindQueries(client,lease,backend){
 client.query=function(...args){
  const callback=typeof args.at(-1)==='function'?args.pop():null;
  if(typeof args[0]!=='string'||args.length>2){const rejected=Promise.reject(hold());if(callback){rejected.catch(callback);return;}return rejected;}
  // ROLLBACK remains available after lost authority. It cannot authorize any
  // forward statement or turn an unknown result into a successful release.
  const rollback=/^\s*ROLLBACK\s*;?\s*$/i.test(args[0]);
  const result=(rollback?Promise.resolve():verifyLease(client,lease,backend)).then(()=>raw(client,...args));
  if(callback){result.then(value=>callback(null,value),error=>callback(error));return;}return result;
 };
}
async function admit(client){
 const {rows:[backend]}=await client.query(`SELECT pg_backend_pid() AS pid,(SELECT oid::integer FROM pg_database WHERE datname=current_database()) AS "databaseOid",
 current_database() AS database,(SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",
 trunc(EXTRACT(epoch FROM pg_postmaster_start_time())*1000000)::text AS "postmasterStartMicros",
 trunc(EXTRACT(epoch FROM backend_start)*1000000)::text AS "backendStartMicros",application_name AS "applicationName",
 current_setting('default_transaction_read_only')='on' AS readonly,NOT pg_is_in_recovery() AS primary
 FROM pg_stat_activity WHERE pid=pg_backend_pid()`);
 if(!Number.isSafeInteger(backend?.pid)||backend.pid<2||!Number.isSafeInteger(backend.databaseOid)||backend.databaseOid<1||backend.primary!==true
  ||backend.readonly!==(mode==='show')||backend.applicationName!==process.env.PGAPPNAME||!['systemIdentifier','postmasterStartMicros','backendStartMicros'].every(key=>/^[1-9][0-9]{0,19}$/.test(backend[key]??'')))throw hold();
 const proof={schema:'phoenix.modern-schema-migration-backend/v1',owner,contextDigest,nonce,mode,backend},backendSha256=hash(JSON.stringify(proof));
 await new Promise((resolve,reject)=>process.stdout.write('MODERN_SCHEMA_MIGRATION_BACKEND='+JSON.stringify(proof)+'\n',error=>error?reject(hold()):resolve()));
 const deadline=performance.now()+30000;
 while(performance.now()<deadline){
  let stat;try{stat=fs.lstatSync(file);}catch(error){if(error.code!=='ENOENT')throw hold();await sleep(50);continue;}
  if(stat.nlink===2){await sleep(20);continue;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==0||stat.nlink!==1||(stat.mode&0o222)!==0||stat.size>4096)throw hold();
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let permit;
  try{const opened=fs.fstatSync(fd);if(opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)throw hold();permit=JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
  const expected={schema:'phoenix.modern-schema-migration-permit/v1',owner,contextDigest,nonce,mode,backendSha256,originalLease:permit.originalLease};
  if(JSON.stringify(Object.keys(permit).sort())!==JSON.stringify(Object.keys(expected).sort())||Object.entries(expected).some(([key,value])=>permit[key]!==value))throw hold();
  const after=fs.lstatSync(file);if(after.dev!==stat.dev||after.ino!==stat.ino||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw hold();
  await verifyLease(client,permit.originalLease,backend);bindQueries(client,permit.originalLease,backend);return;
 }
 throw hold();
}
const connect=pg.Client.prototype.connect;
pg.Client.prototype.connect=function(callback){
 if(++connections!==1){const error=hold();if(typeof callback==='function'){queueMicrotask(()=>callback(error));return;}return Promise.reject(error);}
 const client=this;
 const connected=new Promise((resolve,reject)=>connect.call(client,error=>{
  if(error){reject(error);return;}
  admit(client).then(resolve,async()=>{try{await client.end();}catch{}reject(hold());});
 }));
 if(typeof callback==='function'){connected.then(()=>callback(null),error=>callback(error));return;}
 return connected;
};
