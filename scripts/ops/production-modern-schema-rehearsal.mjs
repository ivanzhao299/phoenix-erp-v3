/** Restore only to newly created, root-recorded, isolated Docker resources.
 * Readiness and zero-write evidence come from both actual immutable images,
 * native PostgreSQL statements and before/after original-column hashes. */
import {execFileSync} from 'node:child_process';
import {isIP} from 'node:net';
import {executionEnv} from './capture-production-runtime.mjs';
import fs from 'node:fs';import path from 'node:path';import {randomBytes} from 'node:crypto';
import {canonicalDigest,same} from './production-maintenance-receipts.mjs';
import {ModernSchemaReadClient} from './production-modern-schema-read-client.mjs';
import {captureModernSchemaFacts,captureModernSchemaFactsPair,assertModernSchemaBusinessUnchanged,defaultOffEvidenceFromFacts} from './production-modern-schema-facts.mjs';
import {LEDGER_SQL,digest} from './chanjet-admission-schema-receipt.mjs';
import {API_READINESS_PROGRAM} from './production-maintenance-candidate-health.mjs';
import {classifySql,capturedDatabaseStatements,parseBootControlIdentity,assertDefaultBackgroundHold} from '../ci/api-bootstrap-mutations.mjs';
import {runModernSchemaGatedCli,observeModernSchemaCliBackend} from './production-modern-schema-gated-cli.mjs';
import {MODERN_SCHEMA_LEASE_SQL,parseModernSchemaLease} from './production-modern-schema-session-lease.mjs';
import {modernSchemaPostgresProfile,nativePostgresToolMajor,matchesModernSchemaRehearsalVolume} from './production-modern-schema-postgres.mjs';
const ID=/^[a-f0-9]{64}$/,IMAGE=/^sha256:[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const fail=code=>{throw Error('MODERN_SCHEMA_REHEARSAL_HOLD='+code);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const OBSERVER='phoenix-modern-schema-read';
const LOCAL_PSQL=['/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','PGHOST=/var/run/postgresql','PGPORT=5432'];
const statusProgram=`(async()=>{const r=await fetch('http://127.0.0.1:3100/api/internal/background/status',{redirect:'manual',signal:AbortSignal.timeout(2000)});if(r.status!==200)throw 0;const t=await r.text();if(Buffer.byteLength(t)>16384)throw 0;const b=JSON.parse(t);process.stdout.write(JSON.stringify(Object.hasOwn(b,'code')?b.data:b));})().catch(()=>process.exit(64))`;
export function compareRestoredModernSchemaTables(source,restored,{fenced=false}={}){
 // An exported snapshot covers rows, not sequences. During live preparation a
 // legitimate concurrent nextval may be included by pg_dump. The restored
 // sequence is authoritative for the isolated before/after comparison.
 if(!same(source.tables,restored.tables))fail('SNAPSHOT_TABLE_RESTORE_MISMATCH');
 if(fenced&&!same(source.sequences,restored.sequences))fail('QUIESCENT_SEQUENCE_RESTORE_MISMATCH');
 return true;
}
export function modernSchemaRuntimeStatements(log,{observer,begin,end}){
 if(!Number.isSafeInteger(observer?.pid)||observer.pid<2||typeof observer.database!=='string'||observer.app!==OBSERVER)fail('NATIVE_OBSERVER_SESSION_REQUIRED');
 const records=capturedDatabaseStatements(log),normal=sql=>sql.trim().replace(/;$/,'').replaceAll('\n\t','\n');
 const own=record=>record.pid===observer.pid&&record.database===observer.database&&record.app===observer.app;
 const starts=records.map((record,index)=>own(record)&&normal(record.sql)===begin?index:-1).filter(index=>index>=0);
 const ends=records.map((record,index)=>own(record)&&normal(record.sql)===end?index:-1).filter(index=>index>=0);
 if(starts.length!==1||ends.length!==1||ends[0]<=starts[0])fail('UNIQUE_NATIVE_OBSERVER_BOUNDARIES_REQUIRED');
 // application_name is not ownership. A second client with the same name
 // remains an executor whose attempted SQL must be classified.
 return records.slice(starts[0]+1,ends[0]).filter(record=>!own(record));
}
function ipv4Range(value){
 const [ip,length='32',extra]=value.split('/');
 if(extra!==undefined||isIP(ip)!==4||!/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(length))fail('NATIVE_IPV4_PREFIX_REQUIRED');
 const addr=ip.split('.').reduce((value,octet)=>value*256+Number(octet),0);
 const size=2**(32-Number(length)),start=Math.floor(addr/size)*size;
 return [start,start+size-1];
}
export function selectRehearsalSubnet(routes,dockerSubnets){
 if(!Array.isArray(routes)||!Array.isArray(dockerSubnets)||!routes.length||!dockerSubnets.length)fail('COMPLETE_NETWORK_INVENTORY_REQUIRED');
 const reserved=[...routes.filter(route=>route!=='default'),...dockerSubnets.filter(subnet=>{
  const [ip,mask,extra]=String(subnet).split('/');
  return !(isIP(ip)===6&&extra===undefined&&/^(?:[0-9]{1,2}|1[01][0-9]|12[0-8])$/.test(mask));
 })].map(value=>{
  if(typeof value!=='string')fail('COMPLETE_NETWORK_INVENTORY_REQUIRED');
  return ipv4Range(value);
 });
 for(let offset=0;offset<256;offset+=16){
  const cidr='10.254.113.'+offset+'/28',[start,end]=ipv4Range(cidr);
  if(reserved.every(([first,last])=>end<first||start>last))return cidr;
 }
 fail('REHEARSAL_ADDRESS_RESERVE_EXHAUSTED');
}
export function readDockerRehearsalPrefixes(networks){
 if(!Array.isArray(networks)||!networks.length)fail('COMPLETE_NETWORK_INVENTORY_REQUIRED');
 return networks.flatMap(network=>{
  const config=network?.IPAM?.Config;
  if((network?.Driver==='host'||network?.Driver==='null')&&(config==null||Array.isArray(config)&&!config.length))return [];
  if(!Array.isArray(config)||!config.length||config.some(pool=>typeof pool?.Subnet!=='string')||
   network.EnableIPv4!==false&&!config.some(pool=>isIP(pool.Subnet.split('/')[0])===4))
   fail('COMPLETE_NETWORK_INVENTORY_REQUIRED');
  return config.map(pool=>pool.Subnet);
 });
}
export function readRehearsalSubnet(){
 const read=(binary,args)=>execFileSync(binary,args,{env:executionEnv(),encoding:'utf8',timeout:8000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
 const routes=JSON.parse(read('/usr/sbin/ip',['-4','-json','route','show','table','all']));
 const ids=read('/usr/bin/docker',['network','ls','--quiet','--no-trunc']).split('\n');
 if(!ids.length||ids.length>256||!ids.every(id=>ID.test(id)))fail('COMPLETE_NETWORK_INVENTORY_REQUIRED');
 const networks=JSON.parse(read('/usr/bin/docker',['network','inspect',...ids]));
 if(!Array.isArray(networks)||!same(networks.map(net=>net.Id).sort(),[...ids].sort())||!Array.isArray(routes))fail('COMPLETE_NETWORK_INVENTORY_REQUIRED');
 return selectRehearsalSubnet(routes.map(route=>route.dst),readDockerRehearsalPrefixes(networks));
}
function readSmall(file,max=16*1024*1024){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>max)fail('BOUNDED_PRIVATE_OUTPUT_REQUIRED');return fs.readFileSync(file,'utf8').trim();}
class Capsule {
 constructor(input,dependencies){Object.assign(this,input);this.dependencies=dependencies;this.resources=[];this.counter=0;this.client=null;this.apps=[];}
 async check(){this.privateRuntime.guard();if(this.stage==='fenced')await this.dependencies.assertFenced();this.privateRuntime.guard();}
 checkRecoveryWindow(inFlightMs){if(this.stage==='fenced')this.dependencies.assertRecoveryWindow?.(inFlightMs);}
 async readFacts(read){
  return this.stage==='fenced'&&this.dependencies.duringFencedFacts?this.dependencies.duringFencedFacts(read):read();
 }
 async command(args,stem='observe',options={}){
  await this.check();const value=await this.privateRuntime.run({binary:'/usr/bin/docker',args,directory:this.directory,stem:stem+'-'+(++this.counter),...options});
  await this.check();return value;
 }
 async text(args,stem,options){return readSmall((await this.command(args,stem,options)).stdout);}
 async inspect(id){
  if(!ID.test(id))fail('NATIVE_RESOURCE_ID_REQUIRED');
  const fields=(await this.text(['inspect',id,'--format','{{json .Id}}\t{{json .Image}}\t{{json .State}}\t{{json .RestartCount}}\t{{json .Config.Labels}}\t{{json .HostConfig}}\t{{json .NetworkSettings.Networks}}\t{{json .Mounts}}'],'inspect')).split('\t').map(JSON.parse);
  const [actual,image,state,restarts,labels,host,networks,mounts]=fields;
  const original=this.resources.find(resource=>resource.containerId===id);
  if(!original||actual!==id||image!==original.imageId||labels?.['phoenix.schema.owner']!==this.owner||labels?.['phoenix.schema.role']!==original.role
   ||host.Privileged!==false||host.RestartPolicy?.Name!=='no'||host.NetworkMode!==this.networkId||host.PortBindings&&Object.keys(host.PortBindings).length
   ||Object.keys(networks??{}).length!==1||(Object.values(networks)[0].NetworkID!==this.networkId&&(state.Running||Object.values(networks)[0].NetworkID!==''))||restarts!==0||state.OOMKilled!==false)fail('ISOLATED_CONTAINER_IDENTITY_CHANGED');
  if(original.role==='rehearsal-database'&&!matchesModernSchemaRehearsalVolume(mounts,original))fail('ONLY_NEW_CLONE_VOLUME_ALLOWED');
  return {id,image,state,restarts,labels,host,networks,mounts};
 }
 async create(role,image,args,command=[]){
  const work=()=>this.createNative(role,image,args,command);return this.dependencies.withNativeCreate?this.dependencies.withNativeCreate(work):work();
 }
 async createNative(role,image,args,command=[]){
  if(!IMAGE.test(image))fail('IMMUTABLE_IMAGE_REQUIRED');
  const id=await this.text(['create','--pull=never','--label',`phoenix.schema.owner=${this.owner}`,'--label',`phoenix.schema.role=${role}`,
   '--restart=no','--network',this.networkId,...args,image,...(role.includes('migration')?['-d','dist/database/data-source.js',role==='rehearsal-migration-run'?'migration:run':'migration:show',...(role==='rehearsal-migration-run'?['--transaction','all']:[])]:command)],'create');
  if(!ID.test(id)||id===this.backup.receipt.databasePin.id)fail('NEW_ISOLATED_CONTAINER_REQUIRED');
  const record={schema:'phoenix.modern-schema-owned-rehearsal-container/v1',owner:this.owner,stage:this.stage,role,containerId:id,imageId:image,networkId:this.networkId,volume:this.volume,createdAt:new Date().toISOString()};
  if(role==='rehearsal-database')record.databaseMajor=this.databaseProfile.major;
  this.resources.push(record);this.privateRuntime.publishJson(path.join(this.directory,'created-'+id+'.json'),record);await this.inspect(id);
  if(this.dependencies.onCreated)await this.dependencies.onCreated(record);return id;
 }
 async waitHealthy(id,timeout=60000){
  const deadline=Date.now()+timeout;for(;;){const actual=await this.inspect(id);if(actual.state.Running&&actual.state.Health?.Status==='healthy')return actual;
   if(!actual.state.Running||Date.now()>=deadline)fail('ACTUAL_HEALTHCHECK_REQUIRED');await pause(250);}
 }
 async stop(id){
  const before=await this.inspect(id);if(!before.state.Running)fail('OWNED_ORIGINAL_RUNNING_PROCESS_REQUIRED');
  await this.command(['kill','--signal=TERM',id],'term');const deadline=Date.now()+20000;
  for(;;){const after=await this.inspect(id);
   if(!after.state.Running){if(after.state.ExitCode!==0||after.state.Pid!==0||after.state.StartedAt!==before.state.StartedAt)fail('CLEAN_NATIVE_TERM_REQUIRED');return after;}
   if(Date.now()>=deadline)fail('OWNED_TERM_RESULT_UNRESOLVED');await pause(100);
  }
 }
 async setup(){
  const source=this.backup.source.database;
  this.databaseProfile=modernSchemaPostgresProfile(source.serverVersionNum);
  if(!this.databaseProfile||source.backupToolMajor!==this.databaseProfile.major||source.provider!=='c'||
   !['name','username','collate','ctype'].every(key=>typeof source[key]==='string'&&/^[A-Za-z0-9_.@-]{1,63}$/.test(source[key])))fail('SUPPORTED_RESTORE_LOCALE_AND_IDENTIFIERS_REQUIRED');
  const prefix=`phoenix-schema-${this.owner}-${this.stage}-${randomBytes(8).toString('hex')}`;
  await this.check();
  const subnet=this.dependencies.explicitRehearsalNetwork?readRehearsalSubnet():null;
  this.networkId=await this.text(['network','create','--internal','--driver=bridge',...(subnet?['--subnet',subnet]:[]),'--label',`phoenix.schema.owner=${this.owner}`,'--label','phoenix.schema.role=rehearsal-network',prefix],'network');
  const [network]=JSON.parse(await this.text(['network','inspect',this.networkId],'network-pin'));
  if(!ID.test(this.networkId)||network.Id!==this.networkId||network.Internal!==true||network.EnableIPv6!==false||network.Driver!=='bridge'||Object.keys(network.Containers??{}).length||
   subnet&&(network.Scope!=='local'||network.IPAM?.Driver!=='default'||network.IPAM.Config?.length!==1||network.IPAM.Config[0].Subnet!==subnet||
    network.Labels?.['phoenix.schema.owner']!==this.owner||network.Labels?.['phoenix.schema.role']!=='rehearsal-network'))
   fail('NEW_INTERNAL_NETWORK_REQUIRED');
  this.volume=await this.text(['volume','create','--label',`phoenix.schema.owner=${this.owner}`,'--label','phoenix.schema.role=rehearsal-data'],'volume');
  const [volume]=JSON.parse(await this.text(['volume','inspect',this.volume],'volume-pin'));
  if(!ID.test(this.volume)||volume.Name!==this.volume||volume.Driver!=='local'||volume.Labels?.['phoenix.schema.owner']!==this.owner||Object.keys(volume.Options??{}).length)fail('NEW_LOCAL_VOLUME_REQUIRED');
  this.privateRuntime.publishJson(path.join(this.directory,'network-volume.json'),{schema:'phoenix.modern-schema-isolated-resources/v1',owner:this.owner,network,volume});
  this.db=await this.create('rehearsal-database',this.backup.receipt.databasePin.image,['--network-alias','schema-db','--mount',`type=volume,source=${this.volume},target=${this.databaseProfile.volumeDestination}`,
   '-e',`PGDATA=${this.databaseProfile.dataDirectory}`,
   '-e',`POSTGRES_USER=${source.username}`,'-e',`POSTGRES_DB=${source.name}`,'-e','POSTGRES_HOST_AUTH_METHOD=trust',
   '-e',`POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale-provider=libc --lc-collate=${source.collate} --lc-ctype=${source.ctype}`,
   '--health-cmd','pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"','--health-interval=1s','--health-timeout=2s','--health-retries=30']);
  await this.command(['start',this.db],'db-start');await this.waitHealthy(this.db);
  // pg_isready can briefly succeed against initdb's temporary server. Do not
  // configure/restore until the official entrypoint has exec'd final PID 1.
  const finalServerDeadline=Date.now()+30000;for(;;){
   try{await this.command(['exec',this.db,'sh','-c','IFS= read -r name < /proc/1/comm; test "$name" = postgres'],'db-final-pid');break;}
   catch{if(Date.now()>=finalServerDeadline)fail('FINAL_POSTGRES_PID1_REQUIRED');await pause(200);}
  }
  await this.waitHealthy(this.db);
  await this.inspect(this.db);
  const identity=JSON.parse(await this.text(['exec',this.db,...LOCAL_PSQL,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',source.username,'-d',source.name,'-c',
   `SELECT json_build_object('systemIdentifier',system_identifier::text,'name',current_database(),'address',inet_server_addr(),'port',inet_server_port(),
    'serverVersionNum',current_setting('server_version_num')::integer,'dataDirectory',current_setting('data_directory'),
    'encoding',pg_encoding_to_char(d.encoding),'collate',d.datcollate,'ctype',d.datctype,'provider',d.datlocprovider,
    'collationVersion',d.datcollversion,'actualCollationVersion',pg_database_collation_actual_version(d.oid))::text
    FROM pg_control_system() CROSS JOIN pg_database d WHERE d.datname=current_database()`],'clone-native-identity'));
  if(!/^[1-9][0-9]{0,19}$/.test(identity.systemIdentifier??'')||identity.systemIdentifier===source.systemIdentifier||identity.name!==source.name||identity.address!==null||identity.port!==null)fail('DIFFERENT_NATIVE_LOCAL_CLONE_REQUIRED');
  if(identity.dataDirectory!==this.databaseProfile.dataDirectory||
   !['serverVersionNum','encoding','collate','ctype','provider','collationVersion','actualCollationVersion'].every(key=>identity[key]===source[key])||
   nativePostgresToolMajor('pg_restore',await this.text(['exec',this.db,'pg_restore','--version'],'clone-restore-tool-version'))!==this.databaseProfile.major)fail('CLONE_POSTGRES_LAYOUT_OR_VERSION_CHANGED');
  this.cloneDatabase=identity;
  await this.command(['exec',this.db,...LOCAL_PSQL,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U',source.username,'-d',source.name,'-c',
   "ALTER SYSTEM SET log_statement='all'"],'db-logging');
  await this.command(['exec',this.db,...LOCAL_PSQL,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U',source.username,'-d',source.name,'-c',
   "ALTER SYSTEM SET log_line_prefix='bootstrap-db=%d user=%u app=%a pid=%p '"],'db-log-prefix');
  await this.command(['exec',this.db,...LOCAL_PSQL,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U',source.username,'-d',source.name,'-c','SELECT pg_reload_conf()'],'db-reload');
  const backup=await this.privateRuntime.digest(this.backup.receipt.backup.path);if(!same(backup,this.backup.receipt.backup))fail('PROTECTED_BACKUP_CHANGED');
  const restoreTimeout=this.stage==='fenced'&&this.dependencies.assertRecoveryWindow?180000:600000;
  this.checkRecoveryWindow(restoreTimeout);
  await this.command(['exec','-i',this.db,...LOCAL_PSQL,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U',source.username,'-d',source.name],'isolated-restore',{inputFile:backup.path,timeoutMs:restoreTimeout});
  this.client=new ModernSchemaReadClient({guard:()=>{this.privateRuntime.guard();this.checkRecoveryWindow();},databaseContainer:this.db});
  if(this.dependencies.startFencedReader)await this.dependencies.startFencedReader(this.client,this.db,identity.systemIdentifier);
  else await this.client.start();
  const {rows:[config]}=await this.client.query("SELECT current_setting('log_statement') AS statement,current_setting('log_line_prefix') AS prefix");
  if(config.statement!=='all'||config.prefix!=='bootstrap-db=%d user=%u app=%a pid=%p ')fail('CLONE_NATIVE_STATEMENT_CAPTURE_REQUIRED');
  this.before=await this.readFacts(()=>captureModernSchemaFacts(this.client));compareRestoredModernSchemaTables(this.backup.source.facts,this.before,{fenced:this.stage==='fenced'});
  const {rows:[observer]}=await this.client.query("SELECT pg_backend_pid() AS pid,current_database() AS database,current_setting('application_name') AS app,(EXTRACT(epoch FROM backend_start)*1000000)::text AS started FROM pg_stat_activity WHERE pid=pg_backend_pid()");this.observer=observer;
  const {rows:[{jsonb_build_object:raw}]}=await this.client.query(LEDGER_SQL);
  if(digest(JSON.stringify(JSON.parse(raw)))!==this.plan.beforeLedgerSha256)fail('RESTORED_COMPLETE_LEDGER_MISMATCH');
 }
 migrationEnvironment(){const d=this.backup.source.database;return ['--read-only','--user','phoenix','--cap-drop=ALL','--security-opt=no-new-privileges','--tmpfs','/tmp:rw,nosuid,nodev,size=16777216,mode=1777',
  '-e','NODE_ENV=production','-e','DB_HOST=schema-db','-e','DB_PORT=5432','-e',`DB_USER=${d.username}`,'-e',`DB_NAME=${d.name}`,'-e','DB_PASSWORD=','-e','PGOPTIONS=-c lock_timeout=5s -c statement_timeout=120s','--entrypoint','./node_modules/.bin/typeorm'];}
 async migrate(){
  if(this.dependencies.gatedCli===true){
   const {rows:[locks]}=await this.client.query('SELECT pg_try_advisory_lock(17455,1) AS admission,pg_try_advisory_lock(17455,2) AS execution');
   if(locks.admission!==true||locks.execution!==true)fail('OWNED_CLONE_ORIGINAL_LEASE_REQUIRED');
   const {rows:[leaseRow]}=await this.client.query(MODERN_SCHEMA_LEASE_SQL),originalLease=parseModernSchemaLease(JSON.parse(leaseRow.jsonb_build_object));
   for(const mode of ['run','show']){
    this.checkRecoveryWindow(600000);
    const d=this.backup.source.database;
    const receipt=await runModernSchemaGatedCli({owner:this.owner,contextDigest:canonicalDigest(this.plan),mode,imageId:this.plan.candidateImageId,networkId:this.networkId,
     environment:{DB_HOST:'schema-db',DB_PORT:'5432',DB_USER:d.username,DB_PASSWORD:'',DB_NAME:d.name},privateRuntime:this.privateRuntime,directory:this.directory,originalLease,
     admit:async()=>{await this.check();await this.inspect(this.db);return true;},verifyNativeBackend:(proof,resource)=>observeModernSchemaCliBackend(this.client,proof,resource)},
     {prepareGateFiles:this.dependencies.prepareMigrationGate,publishPermit:this.dependencies.publishMigrationPermit,onCreated:resource=>{this.resources.push(resource);}});
    if(mode==='show'&&/^\s*\[ \]/m.test(readSmall(receipt.stdout.path)))fail('CLONE_PENDING_MIGRATIONS_REMAIN');
   }
  }else{
  for(const role of ['rehearsal-migration-run','rehearsal-migration-show']){
   const timeoutMs=this.stage==='fenced'&&this.dependencies.assertRecoveryWindow?180000:600000;
   this.checkRecoveryWindow(timeoutMs);
   const id=await this.create(role,this.plan.candidateImageId,this.migrationEnvironment());this.apps.push(id);
   const result=await this.command(['start','-a',id],role,{timeoutMs}),actual=await this.inspect(id);
   if(actual.state.Running||actual.state.ExitCode!==0||actual.state.Pid!==0)fail('ATOMIC_CLONE_MIGRATION_UNVERIFIED');
   if(role.endsWith('show')){const output=readSmall(result.stdout);if(/^\s*\[ \]/m.test(output))fail('CLONE_PENDING_MIGRATIONS_REMAIN');}
  }
  }
  let factsFailure='CAPTURE';
  try{
   const since=new Date(Date.now()-2000).toISOString(),start=await this.marker('migration','after-facts-start');
   const {projected,full}=await this.readFacts(()=>captureModernSchemaFactsPair(this.client,{projection:this.before}));
   this.after=projected;
   this.migrationAfter={facts:full,start,since};
   factsFailure='BUSINESS_MISMATCH';
   assertModernSchemaBusinessUnchanged(this.before,this.after);
  }catch(error){
   try{this.privateRuntime.publishJson(path.join(this.directory,'rehearsal-hold.json'),
    {schema:'phoenix.modern-schema-private-rehearsal-hold/v1',stage:'AFTER_FACTS',failure:factsFailure});}catch{}
   throw error;
  }
  const {rows:[{jsonb_build_object:raw}]}=await this.client.query(LEDGER_SQL),ledger=JSON.parse(raw);
  const old=this.backup.source.ledger;
  if(!same(ledger.legacy,old.legacy)||ledger.typeorm.length!==old.typeorm.length+this.plan.pendingMigrations.length
    ||!old.typeorm.every(row=>ledger.typeorm.some(next=>same(row,next)))||!this.plan.pendingMigrations.every(unit=>ledger.typeorm.filter(row=>row.name===unit.effectiveName&&String(row.timestamp)===String(unit.timestamp)).length===1))fail('EXACT_CLONE_AFTER_LEDGER_REQUIRED');
  this.afterLedgerSha256=digest(JSON.stringify(ledger));
  this.defaultOff=defaultOffEvidenceFromFacts(this.plan.targetSha,this.after,{plan:this.plan,floor:{chanjetPolicy:'HOLD',readonlyApproval:null}});
 }
 async marker(role,kind){const sql=`SELECT 'schema-${this.owner}-${role}-${kind}' AS boundary`;await this.client.query(sql);return `SELECT row_to_json(phoenix_read_row)::text FROM (${sql}\n) AS phoenix_read_row`;}
 async probe(id,program){return JSON.parse(await this.text(['exec',id,'/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/local/bin/node','-e',program],'probe'));}
 async runtime(role,imageId,revision){
  const prior=role==='candidate-api'?this.originalRuntimeAfter:this.migrationAfter;
  if(!prior)fail('REHEARSAL_RUNTIME_BASELINE_REQUIRED');
  if(prior.containerId){
   const previous=await this.inspect(prior.containerId);
   if(previous.state.Running||previous.state.Status!=='exited'||previous.state.ExitCode!==0||previous.state.Pid!==0)fail('UNOWNED_REHEARSAL_RUNTIME_GAP');
  }
  const [network]=JSON.parse(await this.text(['network','inspect',this.networkId],'runtime-gap-network'));
  if(network.Id!==this.networkId||network.Internal!==true||network.EnableIPv6!==false
   ||!same(Object.keys(network.Containers??{}),[this.db]))fail('UNOWNED_REHEARSAL_RUNTIME_GAP');
  const idleDeadline=Date.now()+1500;
  for(;;){
   const {rows:[idle]}=await this.client.query(`SELECT count(*)::integer AS clients,
    count(*) FILTER (WHERE pid=pg_backend_pid() AND application_name='phoenix-modern-schema-read')::integer AS observer,
    (SELECT count(*)::integer FROM pg_prepared_xacts) AS prepared
    FROM pg_stat_activity WHERE backend_type='client backend'`);
   if(idle?.observer!==1||idle.prepared!==0)fail('UNOWNED_REHEARSAL_RUNTIME_GAP');
   if(idle.clients===1)break;
   if(Date.now()>=idleDeadline)fail('UNOWNED_REHEARSAL_RUNTIME_GAP');
   await pause(50);
  }
  const before=prior.facts,begin=await this.marker(role,'begin');
  const control=path.join(this.directory,'control-'+role);fs.mkdirSync(control,{mode:0o755});fs.chmodSync(control,0o755);
  if(typeof this.dependencies.preparePublicDirectory==='function')await this.dependencies.preparePublicDirectory(control);
  const controlStat=fs.lstatSync(control);if(controlStat.uid!==0||(controlStat.mode&0o022)!==0||!controlStat.isDirectory()||controlStat.isSymbolicLink())fail('ROOT_OWNED_PUBLIC_CONTROL_REQUIRED');
  const manifest={protocolVersion:1,phase:'FENCED',owner:this.owner,generation:1,targetSha:revision,participants:[]},manifestFile=path.join(control,'manifest.json');
  // Fixture-only UID accommodation must still produce an actually root-owned
  // manifest; the production default never calls an injected helper.
  if(typeof this.dependencies.publishPublicManifest==='function')await this.dependencies.publishPublicManifest(manifestFile,manifest);
  else {const fd=fs.openSync(manifestFile,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o444);try{fs.writeFileSync(fd,JSON.stringify(manifest)+'\n');fs.fchmodSync(fd,0o444);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}this.privateRuntime.syncDirectory(control);}
  const ms=fs.lstatSync(manifestFile);if(ms.uid!==0||!ms.isFile()||ms.isSymbolicLink()||ms.nlink!==1||(ms.mode&0o022)!==0)fail('ROOT_OWNED_PUBLIC_MANIFEST_REQUIRED');
  const d=this.backup.source.database;
  const revisionObserved=await this.text(['image','inspect',imageId,'--format','{{index .Config.Labels "org.opencontainers.image.revision"}}'],'image-revision');if(revisionObserved!==revision)fail('IMMUTABLE_RUNTIME_SOURCE_REVISION_REQUIRED');
  const id=await this.create('rehearsal-'+role,imageId,['--user','phoenix','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--entrypoint','/sbin/tini',
   '--tmpfs','/tmp:rw,nosuid,nodev,size=16777216,mode=1777','--tmpfs','/app/uploads:rw,nosuid,nodev,size=16777216,mode=1777',
   '--mount',`type=bind,source=${control},target=/run/phoenix-background-control,readonly`,
   '-e','NODE_ENV=production','-e','APP_ENV=production','-e','PORT=3100','-e','DB_HOST=schema-db','-e','DB_PORT=5432','-e',`DB_USER=${d.username}`,'-e',`DB_NAME=${d.name}`,'-e','DB_PASSWORD=',
   '-e','JWT_SECRET=isolated-schema-rehearsal-only-at-least-32-characters','-e','CHANJET_SYNC_POLICY=HOLD','-e','CHANJET_READONLY_SYNC_ENABLED=false','-e','CHANJET_ERP_INBOUND_SYNC_ENABLED=false',
   '-e','CHANJET_APP_KEY=isolated-rehearsal','-e','CHANJET_APP_SECRET=isolated-rehearsal','-e','CHANJET_PROVIDER_BASE_URL=http://127.0.0.1:3099'],['--','node','dist/main']);
  this.apps.push(id);await this.command(['start',id],role+'-start');
  const deadline=Date.now()+60000;let readiness;
  for(;;){const actual=await this.inspect(id);if(!actual.state.Running)fail('ACTUAL_API_EXITED_BEFORE_READINESS');
   try{readiness=await this.probe(id,API_READINESS_PROGRAM);}catch{}if(readiness?.ready===true&&readiness.status===200&&readiness.dbConnected===true)break;
   if(Date.now()>=deadline)fail('ACTUAL_API_READINESS_REQUIRED');await pause(250);
  }
  const readyPin=await this.waitHealthy(id),status=await this.probe(id,statusProgram);
  if(status.phase!=='FENCED'||status.owner!==this.owner||status.generation!==1||status.inFlight!==0||status.pendingChildren!==0||status.taskGraphs!==0||status.poisoned!==false||status.stopping!==false)fail('ACTUAL_DEFAULT_BACKGROUND_FENCE_REQUIRED');
  const logs=await this.command(['logs',id],role+'-boot-log'),boot=parseBootControlIdentity(readSmall(logs.stdout)+'\n'+readSmall(logs.stderr));
  const core=assertDefaultBackgroundHold(status);
  if(boot.bootId!==status.bootId||!same(boot.controlSession,core.controlSession))fail('ACTUAL_ORIGINAL_BACKGROUND_BOOT_REQUIRED');
  const {rows:backends}=await this.client.query("SELECT pid,datid::integer AS oid,application_name AS app,(EXTRACT(epoch FROM backend_start)*1000000)::text AS started FROM pg_stat_activity WHERE application_name=$1",[boot.controlSession.applicationName]);
  if(backends.length!==1||backends[0].pid!==boot.controlSession.sessionPid||backends[0].oid!==boot.controlSession.databaseOid||Math.floor(Number(backends[0].started)/1000)!==Date.parse(boot.controlSession.backendStartedAt))fail('ACTUAL_NATIVE_BACKGROUND_BACKEND_REQUIRED');
  const nextMinute=Math.floor(Date.now()/60000+1)*60000+1800;while(Date.now()<nextMinute){await this.check();await pause(Math.min(500,nextMinute-Date.now()));}
  const lastStatus=await this.probe(id,statusProgram),lastPin=await this.inspect(id);
  if(!same(core,assertDefaultBackgroundHold(lastStatus,status))||lastStatus.phase!==status.phase||lastStatus.owner!==status.owner||lastStatus.generation!==status.generation||lastPin.state.StartedAt!==readyPin.state.StartedAt||lastPin.state.Health?.Status!=='healthy')fail('BACKGROUND_WINDOW_CHANGED');
  await this.stop(id);
  const {rows:[{remaining}]}=await this.client.query("SELECT count(*)::integer AS remaining FROM pg_stat_activity WHERE application_name=$1",[boot.controlSession.applicationName]);if(remaining!==0)fail('OWNED_API_BACKEND_NOT_GONE');
  const endSince=new Date(Date.now()-2000).toISOString(),end=await this.marker(role,'end');
  const dbLogs=await this.command(['logs','--since',prior.since,this.db],role+'-database-log'),log=readSmall(dbLogs.stdout)+'\n'+readSmall(dbLogs.stderr);
  const {rows:[observer]}=await this.client.query("SELECT pg_backend_pid() AS pid,current_database() AS database,current_setting('application_name') AS app,(EXTRACT(epoch FROM backend_start)*1000000)::text AS started FROM pg_stat_activity WHERE pid=pg_backend_pid()");
  if(!same(observer,this.observer))fail('ORIGINAL_NATIVE_OBSERVER_CHANGED');
  if(modernSchemaRuntimeStatements(log,{observer,begin:prior.start,end:begin}).length)fail('UNOWNED_REHEARSAL_RUNTIME_GAP');
  const runtimeStatements=modernSchemaRuntimeStatements(log,{observer,begin,end});
  const classifications=runtimeStatements.map(record=>({kind:classifySql(record.sql,record.controlParameters),sqlSha256:canonicalDigest(record.sql)}));
  if(!runtimeStatements.length||classifications.some(row=>!['READ','SESSION','CONTROL_SESSION'].includes(row.kind)))fail('ACTUAL_API_ATTEMPTED_BACKGROUND_OR_SCHEMA_WRITE');
  const after=await this.readFacts(()=>captureModernSchemaFacts(this.client));
  if(before.allDataSha256!==after.allDataSha256||before.businessDataSha256!==after.businessDataSha256)fail('API_STARTUP_CHANGED_CLONE_FACTS');
  if(role==='candidate-api'){
   const verified=await this.marker(role,'facts-verified');
   const tail=await this.command(['logs','--since',endSince,this.db],role+'-after-facts-log');
   if(modernSchemaRuntimeStatements(readSmall(tail.stdout)+'\n'+readSmall(tail.stderr),{observer,begin:end,end:verified}).length)fail('UNOWNED_REHEARSAL_RUNTIME_GAP');
  }
  const receipt={role,imageId,revision,containerId:id,startedAt:readyPin.state.StartedAt,readiness,boot,cleanTerm:true,
   observedThrough:new Date().toISOString(),crossedCronMinute:true,nativeStatementCount:runtimeStatements.length,statementClasses:classifications,
   statementsSha256:canonicalDigest(runtimeStatements),beforeFactsSha256:before.allDataSha256,afterFactsSha256:after.allDataSha256,backgroundWrites:0};
  this.privateRuntime.publishJson(path.join(this.directory,role+'-runtime-proof.json'),receipt);
  if(role==='original-api')this.originalRuntimeAfter={facts:after,start:end,since:endSince,containerId:id};
  return receipt;
 }
 async close(){
  // No force-kill, removal, production restart or retry. Retained native pins
  // distinguish an unresolved owned process from a cleanly stopped capsule.
  let failure;
  for(const id of [...this.apps].reverse())try{if((await this.inspect(id)).state.Running)await this.stop(id);}catch(error){failure??=error;}
  try{
   if(this.client){
    if(this.dependencies.closeFencedReader)await this.dependencies.closeFencedReader(this.client);
    else await this.client.close();
   }
  }catch(error){failure??=error;}
  if(this.db)try{if((await this.inspect(this.db)).state.Running)await this.stop(this.db);}catch(error){failure??=error;}
  if(failure)throw failure;
 }
}
export async function rehearseModernSchemaRelease(input,dependencies={}){
 const {owner,stage,backup,plan,runtimeImageId,privateRuntime}=input;
 if(!/^[1-9][0-9]*-[1-9][0-9]*$/.test(owner??'')||!['prepare','fenced'].includes(stage)||!SHA.test(plan?.targetSha??'')||!SHA.test(plan?.runtimeSha??'')
  ||!IMAGE.test(plan?.candidateImageId??'')||!IMAGE.test(runtimeImageId??'')||backup?.receipt?.owner!==owner||backup.receipt.stage!==stage||backup.receipt.sourceLedgerSha256!==plan.beforeLedgerSha256
  ||!backup.source?.database||!backup.receipt.sourceDatabase||!same(backup.source.database,backup.receipt.sourceDatabase)
  ||(stage==='fenced'&&typeof dependencies.assertFenced!=='function')||
   (dependencies.startFencedReader!==undefined||dependencies.closeFencedReader!==undefined)&&
   (stage!=='fenced'||typeof dependencies.startFencedReader!=='function'||typeof dependencies.closeFencedReader!=='function'))
  fail('EXACT_PROTECTED_REHEARSAL_REQUIRED');
 const directory=privateRuntime.createDirectory(owner,stage+'-rehearsal'),capsule=new Capsule({...input,directory},dependencies);let evidence;
 try{
  const started=performance.now();
  capsule.checkRecoveryWindow();await capsule.setup();
  const restoreMs=Math.max(1,Math.ceil(performance.now()-started));
  capsule.checkRecoveryWindow();await capsule.migrate();
  const originalStart=performance.now();
  capsule.checkRecoveryWindow();const original=await capsule.runtime('original-api',runtimeImageId,plan.runtimeSha);
  const originalReadyMs=Math.max(1,Math.ceil(performance.now()-originalStart));
  capsule.checkRecoveryWindow();const candidate=await capsule.runtime('candidate-api',plan.candidateImageId,plan.targetSha);
  const fullDigest=capsule.migrationAfter.facts.allDataSha256;
  if([original.beforeFactsSha256,original.afterFactsSha256,candidate.beforeFactsSha256,candidate.afterFactsSha256].some(digest=>digest!==fullDigest))fail('REHEARSAL_RUNTIME_FACTS_CHAIN_CHANGED');
  // The two baselines came from one snapshot. The verified full-data chain
  // proves every original column unchanged through the final capture.
  const final=capsule.after;assertModernSchemaBusinessUnchanged(capsule.before,final);
  evidence={schema:'phoenix.modern-schema-isolated-rehearsal/v1',owner,runtimeSha:plan.runtimeSha,targetSha:plan.targetSha,candidateImageId:plan.candidateImageId,
   restoreMs,originalReadyMs,rehearsalMs:Math.ceil(performance.now()-started),beforeLedgerSha256:plan.beforeLedgerSha256,pendingPlanSha256:canonicalDigest(plan.pendingMigrations),outcome:'PASS',originalRuntimeReady:true,candidateReady:true,
   businessFactsUnchanged:true,backgroundWrites:0,isolatedRestore:true,productionMutation:false,backupSha256:backup.receipt.backup.sha256,
   afterLedgerSha256:capsule.afterLedgerSha256,originalRuntimeProofSha256:canonicalDigest(original),candidateRuntimeProofSha256:canonicalDigest(candidate),
   cloneBusinessFactsSha256:final.businessDataSha256,defaultOffEvidence:capsule.defaultOff,resources:capsule.resources,
   cloneDatabaseMajor:capsule.databaseProfile.major,cloneDatabaseIdentitySha256:canonicalDigest(capsule.cloneDatabase)};
 }finally{await capsule.close();}
 privateRuntime.publishJson(path.join(directory,'rehearsal-receipt.json'),evidence);return {evidence,directory,resources:capsule.resources};
}
