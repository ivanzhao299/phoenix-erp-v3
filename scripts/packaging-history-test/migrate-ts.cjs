const fs=require('node:fs');const path=require('node:path');const ts=require('../../apps/api/node_modules/typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,file);
const {DataSource}=require('../../apps/api/node_modules/typeorm');
(async()=>{
 const ds=new DataSource({type:'postgres',host:'127.0.0.1',port:process.argv.includes('--baseline')?55434:55432,username:'postgres',database:'packaging_history_test',entities:[],migrations:fs.readdirSync('apps/api/src/database/migrations').filter(f=>f.endsWith('.ts')&&(!process.argv.includes('--baseline')||!['1789353300496-PackagingHistoryD1cEvidence.ts','1789362000000-PackagingHistoryReadIndexes.ts'].includes(f))).map(f=>path.resolve('apps/api/src/database/migrations',f)),logging:false});
 try{await ds.initialize();const [r]=await ds.query("SELECT current_database() db,current_setting('server_version_num') version");
 if(r.db!=='packaging_history_test'||Number(r.version)<180000)throw Error('ISOLATION_REQUIRED');
 const done=await ds.runMigrations();for(const m of done)console.log('APPLIED',m.name);console.log('TS_MIGRATIONS_PASSED',done.length);}catch(e){console.log('TS_MIGRATION_FAILED',e.driverError?.code||e.name);process.exitCode=1;}finally{if(ds.isInitialized)await ds.destroy();}
})().catch(e=>{console.log('RUNNER_FAILED',e.code||e.name);process.exitCode=1;});
