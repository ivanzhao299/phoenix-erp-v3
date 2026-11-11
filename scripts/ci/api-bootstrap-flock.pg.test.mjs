import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

// Opt-in: creates its OWN empty database on a loopback, nonstandard test port.
// FLOCK_BOOTSTRAP_PG=1 PGHOST=127.0.0.1 PGPORT=54329 PGUSER=... PGPASSWORD=... \
//   node --test scripts/ci/api-bootstrap-flock.pg.test.mjs
// No running API, production connection, runtime DDL repair, or applied migration
// edits. All schema work is explicit isolated-test setup before writeFlock runs.
const apiRequire=createRequire(path.resolve('apps/api/package.json'));

function loadTs(file) {
 const ts=apiRequire('typescript');
 const filename=path.resolve(file);
 const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  experimentalDecorators:true,emitDecoratorMetadata:true,
 }}).outputText;
 const loaded=new Module(filename);
 loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));
 loaded._compile(compiled,filename);
 return loaded.exports;
}

function sqlFiles(directory,filter) {
 return fs.readdirSync(directory).filter(filter).sort().map(name=>path.join(directory,name));
}

test('empty full-chain bootstrap supplies flock domain columns after guarded migrations were applied',{
 skip:process.env.FLOCK_BOOTSTRAP_PG!=='1',timeout:180000,
},async t=>{
 assert.equal(process.env.NODE_ENV,'test','explicit isolated test context required');
 assert(['127.0.0.1','localhost'].includes(process.env.PGHOST),'loopback PGHOST required');
 const port=Number(process.env.PGPORT);
 assert(Number.isInteger(port)&&port>1024&&port!==5432,'dedicated nonstandard test PGPORT required');
 const {Client}=apiRequire('pg');
 const {DataSource}=apiRequire('typeorm');
 const connection={host:process.env.PGHOST,port,user:process.env.PGUSER,password:process.env.PGPASSWORD};
 const database=`sku_flock_bootstrap_${Date.now()}_${process.pid}`;
 assert.match(database,/^sku_flock_bootstrap_\d+_\d+$/);
 const admin=new Client({...connection,database:'postgres'});
 let ds,created=false;
 await admin.connect();
 try {
  await admin.query(`CREATE DATABASE "${database}"`);created=true;
  t.diagnostic(`isolated database: ${database}`);
  ds=new DataSource({type:'postgres',host:connection.host,port,username:connection.user,password:connection.password,
   database,synchronize:false,migrationsRun:false,installExtensions:false,entities:[],migrations:[]});
  await ds.initialize();
  await ds.query('CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const legacy=sqlFiles('apps/api/migrations',name=>/^2026.*\.sql$/.test(name));
  const base=[...sqlFiles('apps/api/ddl',name=>name.endsWith('.sql')),'apps/api/migrations/v3_schema_complete.sql'];
  for(const file of [...base,...legacy]) {
   try { await ds.query(fs.readFileSync(file,'utf8')); }
   catch(error) { throw new Error(`legacy migration failed: ${file} (${error.code})`,{cause:error}); }
   if(legacy.includes(file)) await ds.query('INSERT INTO schema_migrations(filename) VALUES ($1)',[path.basename(file)]);
  }
  // Same tracking bridge as bridge-schema-migrations-to-typeorm.sh, then the
  // real TypeORM migration runner (all source migrations, not only the SKU one).
  await ds.query('CREATE TABLE migrations (id SERIAL PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL)');
  await ds.query(`INSERT INTO migrations(timestamp,name)
   SELECT (EXTRACT(EPOCH FROM applied_at)*1000)::bigint, regexp_replace(filename,'\\.sql$','') FROM schema_migrations`);
  const migrations=sqlFiles('apps/api/src/database/migrations',name=>/^\d+.*\.ts$/.test(name)).map(file=>{
   const exported=Object.values(loadTs(file)).filter(value=>typeof value==='function');
   assert.equal(exported.length,1,`one migration class in ${file}`);return exported[0];
  });
  // Use the same already-connected database; configure the runner without
  // importing application entities/hooks or allowing automatic schema sync.
  ds.setOptions({migrations});await ds.buildMetadatas();
  const applied=await ds.runMigrations({transaction:'all'});
  assert.equal(applied.length,migrations.length);
  assert.equal(await ds.showMigrations(),false);
  assert.deepEqual(await ds.query("SELECT to_regclass('public.brd_flocks') AS table_name"),[{table_name:null}],
   'reproduce the missing table when hasTable-guarded TS migration is marked APPLIED');
  const skuMigration=await ds.query("SELECT name FROM migrations WHERE name LIKE 'SkuVarietyOrgScope%'");
  assert.equal(skuMigration.length,1);
  const [{server_version}]=await ds.query('SHOW server_version');
  t.diagnostic(`PostgreSQL=${server_version}, SQL baseline=${base.length+legacy.length} (${base.length} base + ${legacy.length} incremental), TypeORM=${applied.length}; SKU migration APPLIED while brd_flocks is absent`);
  const fixture=fs.readFileSync('scripts/ci/api-bootstrap-schema-fixture.sql','utf8');
  const {writeFlock}=loadTs('apps/api/src/modules/generic-crud/flock-write-policy.ts');
  const payload={flock_no:'FK-BOOTSTRAP-CONTRACT',farm_code:'F-BOOTSTRAP-CONTRACT',house_code:'H-BOOTSTRAP-CONTRACT',
   company_code:'COMP-LAO-AGRI',site_code:'SITE-MENGSAI-LAYER',breed_code:'HY_LINE_BROWN',
   placement_date:'2026-11-11',start_date:'2026-11-11',initial_qty:4800,current_qty:4800,status:'GROWING'};
  const seedOwnership=async manager=>{
   await manager.query(`INSERT INTO brd_farms(farm_code,status,company_code,mapped_site_code) VALUES ($1,'ACTIVE',$2,$3)`,
    [payload.farm_code,payload.company_code,payload.site_code]);
   await manager.query("INSERT INTO brd_houses(house_code,farm_code,status) VALUES ($1,$2,'ACTIVE')",[payload.house_code,payload.farm_code]);
  };
  // Counterexample: migrations are already APPLIED, but the old late-created
  // canonical table still raises the exact undefined_column code at writeFlock.
  const runner=ds.createQueryRunner();await runner.connect();
  try {
   await runner.startTransaction();
   await runner.query('CREATE SCHEMA old_flock_fixture_counterexample');
   await runner.query('SET LOCAL search_path TO old_flock_fixture_counterexample,public');
   const oldFixture=fixture.replace(/^  (?:breed_code|company_code|project_code|site_code) VARCHAR\(64\),\n/gm,'');
   // Restore farm ownership: only the flock additions were absent in round 2.
   const oldFlock=oldFixture.match(/CREATE TABLE IF NOT EXISTS brd_flocks\s*\([\s\S]*?\n\);/)[0];
   const farmAndHouse=fixture.slice(fixture.indexOf('CREATE TABLE IF NOT EXISTS brd_farms'),fixture.indexOf('CREATE TABLE IF NOT EXISTS brd_flocks'));
   await runner.query(farmAndHouse+'\n'+oldFlock);
   await seedOwnership(runner.manager);
   await assert.rejects(writeFlock(runner.manager,payload),error=>{
    assert.equal(error.code,'42703');assert.match(error.message,/company_code|site_code|breed_code/);
    t.diagnostic(`old late fixture rejected by real writeFlock: ${error.code} ${error.message}`);return true;
   });
   await runner.query('CREATE TEMP TABLE old_flock_contract_clone (LIKE brd_flocks INCLUDING ALL)');
   await assert.rejects(runner.query("INSERT INTO old_flock_contract_clone(flock_no,breed_code) VALUES ('OLD-CLONE','HY_LINE_BROWN')"),error=>{
    assert.equal(error.code,'42703');assert.match(error.message,/breed_code/);
    t.diagnostic(`old packaging-style clone rejected: ${error.code} ${error.message}`);return true;
   });
  } finally {await runner.rollbackTransaction();await runner.release();}
  await ds.query(fixture);
  // Reapplication is a no-op, not a runtime ALTER/repair.
  await ds.query(fixture);
  const columns=await ds.query(`SELECT column_name,data_type,character_maximum_length,is_nullable
   FROM information_schema.columns WHERE table_schema='public' AND table_name='brd_flocks'
   AND column_name IN ('breed_code','company_code','project_code','site_code') ORDER BY column_name`);
  assert.deepEqual(columns.map(row=>row.column_name),['breed_code','company_code','project_code','site_code']);
  for(const column of columns) {
   assert.equal(column.data_type,'character varying');assert.equal(column.character_maximum_length,64);assert.equal(column.is_nullable,'YES');
  }
  await seedOwnership(ds.manager);
  await assert.doesNotReject(writeFlock(ds.manager,payload));
  const [flock]=await ds.query('SELECT breed_code,company_code,site_code,initial_qty,current_qty FROM brd_flocks WHERE flock_no=$1',[payload.flock_no]);
  assert.deepEqual(flock,{breed_code:'HY_LINE_BROWN',company_code:'COMP-LAO-AGRI',site_code:'SITE-MENGSAI-LAYER',initial_qty:4800,current_qty:4800});
  // The API's SQL JSON wrapper preserves DATE before node-postgres JS conversion.
  const [serialized]=await ds.query('SELECT row_to_json(flock_rows) AS flock_fact FROM (SELECT * FROM brd_flocks WHERE flock_no=$1) flock_rows',[payload.flock_no]);
  assert.equal(serialized.flock_fact.start_date,'2026-11-11');
  assert.equal(serialized.flock_fact.placement_date,'2026-11-11');
  await ds.query('INSERT INTO brd_daily_logs(log_date,house_code,flock_no) VALUES ($1,$2,$3)',[payload.start_date,payload.house_code,payload.flock_no]);
  await assert.doesNotReject(writeFlock(ds.manager,{current_qty:4792,start_date:payload.start_date},{pkName:'flock_no',id:payload.flock_no}));
  await assert.rejects(writeFlock(ds.manager,{start_date:'2026-11-12'},{pkName:'flock_no',id:payload.flock_no}),/日期不一致|专项追溯/);
  assert.equal((await ds.query('SELECT current_qty FROM brd_flocks WHERE flock_no=$1',[payload.flock_no]))[0].current_qty,4792);
  // packaging-protection clones public.brd_flocks: this must inherit the same
  // complete domain shape, not a test-only substitute missing breed_code.
  const clone=ds.createQueryRunner();await clone.connect();
  try {
   await clone.query('CREATE TEMP TABLE flock_contract_clone (LIKE public.brd_flocks INCLUDING ALL)');
   await clone.query('INSERT INTO flock_contract_clone SELECT * FROM public.brd_flocks');
   const [copied]=await clone.query('SELECT breed_code,company_code,site_code FROM flock_contract_clone');
   assert.deepEqual(copied,{breed_code:payload.breed_code,company_code:payload.company_code,site_code:payload.site_code});
  } finally {await clone.release();}
  assert.equal(await ds.showMigrations(),false,'fixture must not edit/reapply migration history');
  t.diagnostic('canonical fixture: four nullable varchar(64) columns; real writeFlock and packaging-style clone PASS');
 } finally {
  if(ds?.isInitialized) await ds.destroy();
  // Only drop the exact unique database this test created, never a caller DB.
  if(created) {
   assert.match(database,/^sku_flock_bootstrap_\d+_\d+$/);
   await admin.query(`DROP DATABASE "${database}"`);
  }
  await admin.end();
 }
});
