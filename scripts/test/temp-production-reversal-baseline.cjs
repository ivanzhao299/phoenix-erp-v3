/* Disposable local fixture only. Build apps/api first; never reads .env/AppModule. */
const {createRequire}=require('node:module');
const {readFileSync,readdirSync}=require('node:fs');
const {resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const root=resolve(__dirname,'../..');process.chdir(root);
const apiRequire=createRequire(resolve('apps/api/package.json'));
const {DataSource}=apiRequire('typeorm');
const container='phoenix-temp-reversal-20261118';
const baseline=process.env.TEMP_REVERSAL_BASELINE_DB||'phoenix_temp_reversal_baseline_v2';
const docker=(args,input)=>spawnSync('docker',args,{input,encoding:'utf8',timeout:30000});
const sha=value=>createHash('sha256').update(value).digest('hex');
(async()=>{
 if(!/^phoenix_temp_reversal_baseline(?:_v\d+)?$/.test(baseline))throw Error('Owned baseline name required');
 const inspectFormat='{"labels":{{json .Config.Labels}},"ports":{{json .NetworkSettings.Ports}}}';
 let inspection=docker(['inspect','--format',inspectFormat,container]);
 if(inspection.status!==0){
  const made=docker(['run','--rm','-d','--name',container,'--label','phoenix.fixture=temp-reversal','-p','127.0.0.1:44889:5432',
   '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=phoenix_temp_reversal_fixture','postgres:18-alpine']);
  if(made.status!==0)throw Error('Owned fixture container unavailable');
  inspection=docker(['inspect','--format',inspectFormat,container]);
 }
 const info=JSON.parse(inspection.stdout||'null'),binding=info?.ports?.['5432/tcp'];
 if(info?.labels?.['phoenix.fixture']!=='temp-reversal'||binding?.length!==1||binding[0].HostIp!=='127.0.0.1'||binding[0].HostPort!=='44889')throw Error('Owned Docker loopback binding required');
 const deadline=Date.now()+30000;let ready=false;
 while(Date.now()<deadline){if(docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}
 if(!ready)throw Error('Owned PG TCP readiness timeout');
 const admin=await new DataSource({type:'postgres',url:'postgres://postgres@127.0.0.1:44889/phoenix_temp_reversal_fixture',entities:[],synchronize:false,migrationsRun:false,installExtensions:false}).initialize();
 let db;
 try{
  if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[baseline])).length)await admin.query(`CREATE DATABASE "${baseline}"`);
  db=await new DataSource({type:'postgres',url:`postgres://postgres@127.0.0.1:44889/${baseline}`,entities:[],synchronize:false,migrationsRun:false,installExtensions:false}).initialize();
  if(Number((await db.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='public'"))[0].n)!==0)throw Error('Empty owned baseline required; no reset or overwrite is performed');
  const base=[...readdirSync('apps/api/ddl').filter(x=>x.endsWith('.sql')).sort().map(x=>'apps/api/ddl/'+x),'apps/api/migrations/v3_schema_complete.sql'];
  const incremental=readdirSync('apps/api/migrations').filter(x=>/^2026.*\.sql$/.test(x)).sort().map(x=>'apps/api/migrations/'+x);
  const sources=readdirSync('apps/api/src/database/migrations').filter(x=>/^\d.*\.ts$/.test(x)).sort();
  const compiled=readdirSync('apps/api/dist/database/migrations').filter(x=>/^\d.*\.js$/.test(x)).sort();
  if(JSON.stringify(sources.map(x=>x.slice(0,-3)))!==JSON.stringify(compiled.map(x=>x.slice(0,-3))))throw Error('Compiled migration inventory stale; build API first');
  const schemaPaths=[...base,...incremental,...sources.map(x=>'apps/api/src/database/migrations/'+x)].sort();
  const schemaSourceFingerprint=sha(schemaPaths.map(file=>file+'\0'+sha(readFileSync(file))+'\n').join(''));
  await db.query('CREATE TABLE schema_migrations(filename text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const file of [...base,...incremental]){
   const applied=docker(['exec','-i',container,'psql','-U','postgres','-d',baseline,'-v','ON_ERROR_STOP=1'],readFileSync(file));
   if(applied.status!==0)throw Error('Frozen SQL failed: '+file);
   if(incremental.includes(file))await db.query('INSERT INTO schema_migrations(filename) VALUES($1)',[file.split('/').pop()]);
  }
  await db.query(`CREATE TABLE migrations(id serial PRIMARY KEY,timestamp bigint NOT NULL,name varchar NOT NULL);
   INSERT INTO migrations(timestamp,name) SELECT (extract(epoch from applied_at)*1000)::bigint,regexp_replace(filename,'\\.sql$','') FROM schema_migrations`);
  const migrations=compiled.map(file=>Object.values(require(resolve('apps/api/dist/database/migrations',file))).find(x=>typeof x==='function'));
  db.setOptions({migrations});await db.buildMetadatas();const applied=await db.runMigrations({transaction:'all'});
  const [{n}]=await db.query('SELECT COUNT(*)::int AS n FROM migrations');
  console.log(JSON.stringify({owned:true,production:false,baseline,sqlBaseline:base.length+incremental.length,
   bridgedLegacy:incremental.length,typeormApplied:applied.length,typeormLedgerRows:n,pending:await db.showMigrations(),schemaSourceFingerprint}));
 }finally{if(db?.isInitialized)await db.destroy();await admin.destroy();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
