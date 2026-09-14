// Read-only TypeORM schema comparison against the explicit disposable local database.
const fs=require('node:fs'),path=require('node:path');const ts=require('../../apps/api/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,f);
require('../../apps/api/node_modules/reflect-metadata');
const {DataSource}=require('../../apps/api/node_modules/typeorm');
(async()=>{const ds=new DataSource({type:'postgres',host:'127.0.0.1',port:process.argv.includes('--baseline')?55434:55432,username:'postgres',database:'packaging_history_test',entities:[path.resolve('apps/api/src/**/*.entity.ts')],logging:false});
 try{await ds.initialize();const [r]=await ds.query("SELECT current_database() db,current_setting('server_version_num') version");if(r.db!=='packaging_history_test'||Number(r.version)<180000)throw Error('ISOLATION_REQUIRED');
 const diff=await ds.driver.createSchemaBuilder().log();
 fs.writeFileSync('artifacts/packaging-history-local/entity-diff'+(process.argv.includes('--baseline')?'-baseline':'')+'.ts','// Generated read-only comparison. Never executed.\npublic async up(queryRunner) {\n'+diff.upQueries.map(q=>'await queryRunner.query('+JSON.stringify(q.query)+');').join('\n')+'\n}\npublic async down(queryRunner) {}\n');
 console.log('ENTITY_DIFF_READONLY',diff.upQueries.length);
 }finally{if(ds.isInitialized)await ds.destroy();}
})().catch(e=>{console.log('ENTITY_DIFF_FAILED',e.code||e.name);process.exitCode=1;});
