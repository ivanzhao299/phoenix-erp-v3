// Executed through stdin inside the official API image against one isolated local PG18.
const crypto=require('crypto'),net=require('net');
for(const key of Object.keys(process.env))if(!['PATH','LANG','DB_HOST','DB_PORT','DB_USER','DB_NAME'].includes(key))delete process.env[key];
if(process.env.DB_HOST!=='127.0.0.1'||process.env.DB_PORT!=='55438'||process.env.DB_NAME!=='packaging_history_test')throw Error('ISOLATION_REQUIRED');
process.env.NODE_ENV='test';process.env.JWT_SECRET=crypto.randomBytes(32).toString('hex');process.env.ENABLE_DEV_LOGIN='false';
const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){let a=args[0];if(Array.isArray(a))a=a[0];const host=typeof a==='object'?a.host:typeof args[1]==='string'?args[1]:'localhost',port=typeof a==='object'?a.port:a;if(!['127.0.0.1','localhost','::1'].includes(host||'localhost')||![55438,3121].includes(Number(port)))throw Error('ISOLATED_OUTBOUND_BLOCKED');return connect.apply(this,args);};
const output=s=>process.stdout.write(JSON.stringify(s)+'\n');for(const m of ['log','warn','error','info','debug'])console[m]=()=>{};
require('reflect-metadata');const {ConfigModule}=require('@nestjs/config'),cfg=ConfigModule.forRoot;ConfigModule.forRoot=function(o){return cfg.call(this,{...o,ignoreEnvFile:true});};
const {ScheduleModule}=require('@nestjs/schedule'),schedule=ScheduleModule.forRoot;ScheduleModule.forRoot=function(o){return schedule.call(this,{...o,cronJobs:false,intervals:false,timeouts:false});};
(async()=>{let app;try{
 const {NestFactory}=require('@nestjs/core'),{DataSource}=require('typeorm');app=await NestFactory.create(require('/app/dist/app.module').AppModule,{logger:false,abortOnError:false});const ds=app.get(DataSource);
 const [identity]=await ds.query("SELECT current_database() db,current_setting('server_version_num') version");if(identity.db!=='packaging_history_test'||identity.version!=='180006')throw Error('ISOLATION_REQUIRED');
 await require('/app/dist/common/guards/menu-registry.service').hydrateMenuRegistry(ds.manager);
 const username='TEST-NODE20-'+crypto.randomBytes(5).toString('hex'),password=crypto.randomBytes(20).toString('hex');
 const [u]=await ds.query('INSERT INTO sys_user(username,real_name,password_hash) VALUES($1,$1,$2) RETURNING user_id',[username,await require('bcrypt').hash(password,4)]);
 const [role]=await ds.query("INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id",[username]);
 await ds.query('INSERT INTO sys_user_role(user_id,role_id) VALUES($1,$2)',[u.user_id,role.role_id]);
 await ds.query("INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,'V' FROM sys_menu WHERE menu_code='MENU_PKG_OP'",[role.role_id]);
 await app.listen(3121,'127.0.0.1');const base='http://127.0.0.1:3121';
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})}),session=await login.json();if(login.status!==200||!session.token)throw Error('LOGIN_FAILED');
 const checks=[{name:'real ordinary login',status:login.status}];
 for(const p of ['/api/health','/api/auth/me','/api/packaging/terminal/history']){const r=await fetch(base+p,{headers:{Authorization:'Bearer '+session.token}});const b=await r.json();if(r.status!==200)throw Error('HTTP_'+r.status+'_'+p);if(p.endsWith('/history')&&b.data.totalMatching!==0)throw Error('EMPTY_SCOPE_LEAK');checks.push({path:p,status:r.status});}
 await ds.query('UPDATE sys_user SET status=-1,archived_at=now() WHERE user_id=$1',[u.user_id]);const revoked=await fetch(base+'/api/packaging/terminal/history',{headers:{Authorization:'Bearer '+session.token}});if(revoked.status!==401)throw Error('ARCHIVE_NOT_ENFORCED');checks.push({name:'archived guarded session',status:revoked.status});
 output({node:process.version,identity,checks,exit:0});
 }catch(e){output({exit:1,error:e.code||e.name,message:String(e.message).slice(0,150)});process.exitCode=1;}finally{if(app)await app.close();}})();
