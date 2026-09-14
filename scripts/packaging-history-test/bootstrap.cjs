const fs=require('node:fs');const ts=require('../../apps/api/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,f);
const {DataSource}=require('../../apps/api/node_modules/typeorm');
const {GenericCrudService}=require('../../apps/api/src/modules/generic-crud/generic-crud.service.ts');
(async()=>{
 const ds=new DataSource({type:'postgres',host:'127.0.0.1',port:process.argv.includes('--baseline')?55434:55432,username:'postgres',database:'packaging_history_test',entities:[],logging:false});try{await ds.initialize();
 const [r]=await ds.query("SELECT current_database() db,current_setting('server_version_num') version");if(r.db!=='packaging_history_test'||Number(r.version)<180000)throw Error('ISOLATION_REQUIRED');
 // Legacy bootstrap logs arbitrary SQL errors: retain classifications without printing SQL/seed values.
 const output=console.log.bind(console);let errors=0;
 console.log=()=>{};console.warn=()=>{errors++;};console.error=()=>{errors++;};
 await new GenericCrudService(ds.manager).onModuleInit();
 console.log=output;output('LEGACY_BOOTSTRAP_DIAGNOSTICS',errors);
 const tables=await ds.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('brd_farms','brd_houses','pkg_label_print_logs','pkg_handover_records') ORDER BY tablename");output('TABLES',tables);
 }finally{if(ds.isInitialized)await ds.destroy();}
})().catch(e=>{process.stdout.write('BOOTSTRAP_FAILED '+(e.code||e.name)+'\n');process.exitCode=1;});
