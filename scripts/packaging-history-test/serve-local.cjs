// Dedicated local test process: no inherited application credentials, no outbound network.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),net=require('node:net');
const root=path.resolve(__dirname,'../..');
for(const key of Object.keys(process.env))if(!['PATH','LANG','LC_ALL','TZ'].includes(key))delete process.env[key];
Object.assign(process.env,{NODE_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:'55432',DB_USER:'postgres',DB_NAME:'packaging_history_test',DB_PASSWORD:'',JWT_SECRET:crypto.randomBytes(32).toString('hex'),ENABLE_DEV_LOGIN:'false'});
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){let a=args[0];if(Array.isArray(a))a=a[0];
 const host=typeof a==='object'?a.host:typeof args[1]==='string'?args[1]:'localhost';
 const port=typeof a==='object'?a.port:a;
 if(!['127.0.0.1','localhost','::1'].includes(host||'localhost')||![55432,3100].includes(Number(port)))throw Error('ISOLATED_TEST_OUTBOUND_BLOCKED');
 return connect.apply(this,args);};
const output=s=>process.stdout.write(s+'\n');
for(const method of ['log','warn','error','info','debug'])console[method]=()=>{};
const ts=require(root+'/apps/api/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
require(root+'/apps/api/node_modules/reflect-metadata');
(async()=>{
 const {NestFactory}=require(root+'/apps/api/node_modules/@nestjs/core');
 const {AppModule}=require(root+'/apps/api/src/app.module.ts');
 const {DataSource}=require(root+'/apps/api/node_modules/typeorm');
 const app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});
 const ds=app.get(DataSource);const [r]=await ds.query("SELECT current_database() db,current_setting('server_version_num') version");
 if(r.db!=='packaging_history_test'||Number(r.version)<180000)throw Error('ISOLATION_REQUIRED');
 await require(root+'/apps/api/src/common/guards/menu-registry.service.ts').hydrateMenuRegistry(ds.manager);
 const {PackagingWorkflowPolicy}=require(root+'/apps/api/src/modules/bff/packaging-workflow-policy.ts');
 const policy=app.get(PackagingWorkflowPolicy);const disabled=policy.get.bind(policy);
 policy.get=(company,site)=>company.startsWith('TEST-')&&site.startsWith('TEST-')?{version:'ISOLATED-TEST',R:true,B:true,P:true,V:true,H:true,Q:true,encodingVersion:'TEST-NON-BUSINESS-v1',receiptMode:'C'}:disabled(company,site);
 await app.listen(3100,'127.0.0.1');output('ISOLATED_FULL_API_READY 127.0.0.1:3100 PG18 '+r.db);
})().catch(e=>{output('ISOLATED_API_FAILED '+e.name+' '+String(e.message).replace(/password|token|secret|credential/gi,'[REDACTED]').slice(0,400));process.exitCode=1;});
