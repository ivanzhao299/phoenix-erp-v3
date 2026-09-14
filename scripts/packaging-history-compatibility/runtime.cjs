// Full application in an isolated source copy; no dotenv, production network, scheduler or business write privilege.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
process.on('message',async input=>{
 if(input.stop){if(global.app)await global.app.close();process.exit(0);}
 if(!input.start)return;
 const {workspace,sourceRoot,dbPort,apiPort,claims}=input;
 if(![55432,55434,55435,55436].includes(dbPort)||![3118,3119,3120].includes(apiPort))throw Error('ISOLATION_REQUIRED');
 for(const k of Object.keys(process.env))if(!['PATH','LANG','LC_ALL','TZ'].includes(k))delete process.env[k];
 Object.assign(process.env,{NODE_ENV:'test',DB_HOST:'127.0.0.1',DB_PORT:String(dbPort),DB_USER:'packaging_compat_readonly',DB_PASSWORD:'',DB_NAME:'packaging_history_test',JWT_SECRET:crypto.randomBytes(32).toString('hex'),ENABLE_DEV_LOGIN:'false'});
 process.chdir(path.join(sourceRoot,'apps/api'));
 const connect=net.Socket.prototype.connect;
 net.Socket.prototype.connect=function(...args){let a=args[0];if(Array.isArray(a))a=a[0];const host=typeof a==='object'?a.host:typeof args[1]==='string'?args[1]:'localhost',port=typeof a==='object'?a.port:a;if(!['127.0.0.1','localhost','::1'].includes(host||'localhost')||Number(port)!==dbPort)throw Error('ISOLATED_OUTBOUND_BLOCKED');return connect.apply(this,args);};
 const sqlErrors=[];for(const m of ['log','warn','error','debug','info'])console[m]=()=>{};
 const req=s=>require(path.join(workspace,'apps/api/node_modules',s));const ts=req('typescript');
 require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true,esModuleInterop:true}}).outputText,f);
 req('reflect-metadata');
 const {ConfigModule}=req('@nestjs/config'),configRoot=ConfigModule.forRoot;ConfigModule.forRoot=function(options){return configRoot.call(this,{...options,ignoreEnvFile:true});};
 const {ScheduleModule}=req('@nestjs/schedule'),scheduleRoot=ScheduleModule.forRoot;ScheduleModule.forRoot=function(options){return scheduleRoot.call(this,{...options,cronJobs:false,intervals:false,timeouts:false});};
 const {PostgresQueryRunner}=req('typeorm/driver/postgres/PostgresQueryRunner');const query=PostgresQueryRunner.prototype.query;
 PostgresQueryRunner.prototype.query=async function(sql,...args){try{return await query.call(this,sql,...args);}catch(e){sqlErrors.push({code:e.code||e.driverError?.code,verb:String(sql).trim().split(/\s/)[0],message:String(e.message).replace(/\bTEST-[\w-]+/g,'TEST-REDACTED').slice(0,220)});throw e;}};
 try{
  const {NestFactory}=req('@nestjs/core'),{DataSource}=req('typeorm');const {AppModule}=require(path.join(sourceRoot,'apps/api/src/app.module.ts'));
  const app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});global.app=app;
  const ds=app.get(DataSource);const [identity]=await ds.query("SELECT current_database() db,current_user db_user,current_setting('server_version_num') version,current_setting('default_transaction_read_only') read_only");
  if(identity.db!=='packaging_history_test'||identity.db_user!=='packaging_compat_readonly'||identity.read_only!=='on'||+identity.version<180000||+identity.version>=190000)throw Error('ISOLATION_REQUIRED');
  await require(path.join(sourceRoot,'apps/api/src/common/guards/menu-registry.service.ts')).hydrateMenuRegistry(ds.manager);
  app.use((req,res,next)=>req.method==='GET'?next():res.status(405).json({message:'COMPATIBILITY_READ_ONLY'}));
  await app.listen(apiPort,'127.0.0.1');
  const token=req('jsonwebtoken').sign(claims,process.env.JWT_SECRET,{expiresIn:'15m'});
  process.send({ready:true,identity,token,sqlErrors});
  process.on('message',m=>{if(m.audit)process.send({audit:true,sqlErrors});});
 }catch(e){process.send({failed:true,name:e.name,message:String(e.message).slice(0,250),sqlErrors});process.exitCode=1;process.disconnect();}
});
