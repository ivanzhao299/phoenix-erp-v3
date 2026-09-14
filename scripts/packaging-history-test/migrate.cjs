// Disposable, newly-created local PG18 only. Never loads .env or CLI data-source.
const {Client}=require('../../apps/api/node_modules/pg');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const db=new Client({host:'127.0.0.1',port:process.argv.includes('--baseline')?55434:55432,user:'postgres',database:'packaging_history_test'});
 let passed=0,total=0;
 try {await db.connect();
 const {rows:[r]}=await db.query("SELECT current_database() db,current_setting('server_version_num') version,(SELECT count(*) FROM pg_tables WHERE schemaname='public') n");
 if(r.db!=='packaging_history_test'||Number(r.version)<180000||Number(r.n)!==0)throw Error('Fresh isolated PG18 required');
 console.log('ISOLATION',r);
 const root='apps/api';
 const files=[...fs.readdirSync(root+'/ddl').filter(x=>x.endsWith('.sql')).sort().map(x=>root+'/ddl/'+x),root+'/migrations/v3_schema_complete.sql',...fs.readdirSync(root+'/migrations').filter(x=>/^2026.*\.sql$/.test(x)).sort().map(x=>root+'/migrations/'+x)];
 total=files.length;
 for(const f of files){
  try {await db.query(fs.readFileSync(f,'utf8'));passed++;console.log('APPLIED',path.basename(f));}
  catch(e){console.log('FAIL',path.basename(f),'SQLSTATE',e.code,'position',e.position,'completed',passed,'total',files.length);process.exitCode=1;break;}
 }
 }catch(e){process.exitCode=1;throw e;}finally{console.log('BASELINE_RESULT',JSON.stringify({passed,total,failed:total-passed,exit:process.exitCode||0}));await db.end();}
})().catch(e=>{console.log('RUNNER_FAILED',e.code||e.name);process.exitCode=1;});
