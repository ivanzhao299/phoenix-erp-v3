// Dedicated local test process: no inherited application credentials, no outbound network.
const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),net=require('node:net');
const root=path.resolve(__dirname,'../..');
fs.writeFileSync(path.join(root,'artifacts/packaging-history-local/api-start-revision-'+Date.now()+'.json'),JSON.stringify(require('./revision.cjs').capture(),null,2));
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
// Scope audit uses isolated TEST fixtures only; no inherited login artifacts.
const dir=path.join(root,'artifacts/scope-validity-'+Date.now());fs.mkdirSync(dir);
const ownHash=()=>crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
const result={command:['node','scripts/packaging-history-test/scope-validity.cjs'],startedAt:new Date().toISOString(),before:require('./revision.cjs').capture(),harnessBefore:ownHash(),checks:[],fixture:{},original:'2 printed PASS / 28 FAIL / 1 SKIP; F06 invalid'};
const assert=require('node:assert/strict');
// Explicit local HTTP socket arguments are compatible with the isolation guard.
const fetch=(url,options={})=>new Promise((resolve,reject)=>{
 const u=new URL(url);if(u.origin!=='http://127.0.0.1:3100')return reject(Error('LOCAL_HTTP_ONLY'));
 const req=require('node:http').request({hostname:'127.0.0.1',port:3100,path:u.pathname+u.search,method:options.method||'GET',headers:options.headers,agent:false},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(text)}));});
 req.setTimeout(10000,()=>req.destroy(Error('LOCAL_HTTP_TIMEOUT')));req.on('error',reject);req.end(options.body);
});

const record=async(name,fn)=>{try{await fn();result.checks.push({name,status:'PASS'});}catch(e){result.checks.push({name,status:'FAIL',error:e.code||e.name,message:String(e.message).slice(0,250),cause:e.cause?.code||e.cause?.message});}output(name+' '+result.checks.at(-1).status);};
(async()=>{let app;
try{
 const {NestFactory}=require(root+'/apps/api/node_modules/@nestjs/core');
 const {ConfigModule}=require(root+'/apps/api/node_modules/@nestjs/config'),cfg=ConfigModule.forRoot;ConfigModule.forRoot=function(o){return cfg.call(this,{...o,ignoreEnvFile:true});};
 const {ScheduleModule}=require(root+'/apps/api/node_modules/@nestjs/schedule'),sch=ScheduleModule.forRoot;ScheduleModule.forRoot=function(o){return sch.call(this,{...o,cronJobs:false,intervals:false,timeouts:false});};
 const {DataSource}=require(root+'/apps/api/node_modules/typeorm');
 // Verify the database identity before bootstrapping any application provider.
 const probe=new DataSource({type:'postgres',host:'127.0.0.1',port:55432,username:'postgres',database:'packaging_history_test',entities:[]});await probe.initialize();
 result.identity=(await probe.query("SELECT current_database() db,current_setting('server_version_num') version"))[0];assert.equal(result.identity.db,'packaging_history_test');assert.equal(result.identity.version,'180006');await probe.destroy();
 app=await NestFactory.create(require(root+'/apps/api/src/app.module.ts').AppModule,{logger:false,abortOnError:false});
 const ds=app.get(DataSource);await require(root+'/apps/api/src/common/guards/menu-registry.service.ts').hydrateMenuRegistry(ds.manager);
 const tag='TEST-SCOPE-'+crypto.randomBytes(5).toString('hex'),a=tag+'-A',b=tag+'-B',p=tag+'-P',q=tag+'-Q';
 const insert=async(table,row)=>{const keys=Object.keys(row);return (await ds.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(row)))[0];};
 const org=await insert('sys_organizations',{org_code:a,org_name:a,org_type:'COMPANY',company_code:a});await insert('sys_organizations',{org_code:b,org_name:b,org_type:'COMPANY',company_code:b});
 const menus=['ORDER','PAYMENT','FUND','DASHBOARD','INIT','REQUEST','SHIPMENT'].map(x=>'MENU_PRC2_'+x);
 const users={};
 for(const [name,scope,allowed] of [['admin','GROUP',menus],['ceo','GROUP',menus],['buyer','COMPANY',menus.filter(x=>!['MENU_PRC2_FUND','MENU_PRC2_INIT'].includes(x))],['project','PROJECT',['MENU_PRC2_ORDER']],['factory','COMPANY',['MENU_PRC2_ORDER']],['shareholder','SELF',['MENU_PRC2_FUND']],['fundCompany','COMPANY',['MENU_PRC2_FUND']],['fundProject','PROJECT',['MENU_PRC2_FUND']],['empty','COMPANY',['MENU_PRC2_FUND']]]){
  const username=tag+'-'+name,password=crypto.randomBytes(20).toString('hex');
  const u=await insert('sys_user',{username,real_name:username,password_hash:await require(root+'/apps/api/node_modules/bcrypt').hash(password,4)});
  const role=await insert('sys_role',{role_code:username,role_name_zh:username,role_type:'BUSINESS'});
  await insert('sys_user_role',{user_id:u.user_id,role_id:role.role_id});
  if(name!=='empty')await insert('sys_user_orgs',{user_id:u.user_id,org_id:org.id,data_scope_level:scope});
  for(const menu of allowed){const rows=await ds.query("INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,'V' FROM sys_menu WHERE menu_code=$2 RETURNING menu_id",[role.role_id,menu]);assert.equal(rows.length,1,'fixture menu missing '+menu);await insert('sys_data_scopes',{role_code:username,module_code:menu,scope_type:scope});}
  if(scope==='PROJECT')await insert('sys_user_project_scopes',{user_id:u.user_id,project_code:p});
  users[name]={id:u.user_id,username,password};
 }
 const fixture={tag,companies:[a,b],orders:[],payments:[],aps:[],funds:[],shipments:[],requests:[]};
 for(const [n,cc,pc] of [[1,a,p],[2,a,q],[3,b,q]]){
  fixture.orders.push(await insert('prc2_purchase_orders',{po_no:tag+'-PO'+n,subject:tag,company_code:cc,project_code:pc,total_amount:n*10}));
  fixture.payments.push(await insert('prc2_payments',{pay_no:tag+'-PAY'+n,payer_type:'COMPANY',payer_name:tag,currency_code:'CNY',company_code:cc,project_code:pc}));
  fixture.aps.push(await insert('prc2_ap_ledger',{ap_no:tag+'-AP'+n,company_code:cc,project_code:pc,amount_original:n*10,balance_amount_original:n*10}));
  fixture.funds.push(await insert('prc2_shareholder_funds',{fund_no:tag+'-F'+n,shareholder_name:tag,shareholder_id:users.admin.id,company_code:cc,project_code:pc,currency_code:'CNY',amount_original:n*100,amount_base:n*100}));
  fixture.shipments.push(await insert('prc2_shipments',{shipment_no:tag+'-S'+n,company_code:cc,project_code:pc}));
  fixture.requests.push(await insert('prc2_purchase_requests',{req_no:tag+'-R'+n,subject:tag,company_code:cc,project_code:pc}));
 }
 result.fixture={tag,companies:[a,b],rows:Object.fromEntries(Object.entries(fixture).filter(([k])=>Array.isArray(fixture[k])).map(([k,v])=>[k,v.map(x=>x.id||x)])),users:Object.fromEntries(Object.entries(users).map(([k,v])=>[k,{id:v.id,username:v.username}]))};
 await app.listen(3100,'127.0.0.1');const base='http://127.0.0.1:3100';
 for(const [name,u] of Object.entries(users))await record('LOGIN '+name,async()=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u.username,password:u.password})});const body=await r.json();assert.equal(r.status,200);assert.equal(body.code,200);assert.ok(body.token);u.token=body.token;delete u.password;});
 const get=async(name,url,status=200)=>{if(name)assert.ok(users[name].token,'missing login');const r=await fetch(base+url,{headers:name?{Authorization:'Bearer '+users[name].token}:{}});const body=await r.json();assert.equal(r.status,status,'HTTP '+url);if(status===200){if(body.code!==undefined)assert.equal(body.code,200);assert.ok(body && typeof body==='object');}return body.data??body;};
 const same=(rows,expected)=>{assert.ok(Array.isArray(rows),'not an array');assert.deepEqual(rows.map(x=>String(x.id)).sort(),expected.map(x=>String(x.id)).sort());};
 const list='/api/v2/procurement/orders?keyword='+tag+'&pageSize=100';
 await record('T01 buyer exact company nonempty PO',async()=>{const r=await get('buyer',list);same(r.items,fixture.orders.slice(0,2));assert.equal(r.total,2);assert.ok(r.items.every(x=>x.companyCode===a));});
 await record('T02 foreign PO forbidden',()=>get('buyer','/api/v2/procurement/orders/'+fixture.orders[2].id,403));
 await record('T03 own PO',async()=>assert.equal(String((await get('buyer','/api/v2/procurement/orders/'+fixture.orders[0].id)).id),String(fixture.orders[0].id)));
 const funds='/api/v2/procurement/shareholder-funds?companyCode='+a+'&pageSize=100';
 await record('T04 factory fund menu denied',()=>get('factory',funds,403));
 await record('T05 global ordinary role fund exact company filter',async()=>same((await get('admin',funds)).items,fixture.funds.slice(0,2)));
 await record('T06 buyer dashboard exact company count',async()=>assert.equal((await get('buyer','/api/v2/procurement/dashboard/summary')).poCount,2));
 await record('T07 global dashboard compares DB count',async()=>{const [{n}]=await ds.query("SELECT count(*) n FROM prc2_purchase_orders WHERE status<>'CANCELLED'");assert.equal((await get('ceo','/api/v2/procurement/dashboard/summary')).poCount,Number(n));});
 await record('T08 payment exact company membership',async()=>same((await get('buyer','/api/v2/procurement/payments?pageSize=100')).items,fixture.payments.slice(0,2)));
 await record('T09 F05 SELF funds zero against other-owner sentinel',async()=>{const r=await get('shareholder',funds);same(r.items,[]);assert.equal(r.total,0);result.selfEvidence={items:r.items.length,total:r.total,summaryPresent:Array.isArray(r.summary),summaryOriginal:(r.summary||[]).reduce((n,x)=>n+Number(x.totalOriginal),0),expected:0};if(r.summary)assert.ok(r.summary.every(x=>Number(x.totalOriginal)===0),'SELF summary leaks other owner amounts');});
 await record('F05 foreign company summary must also be empty',async()=>{const r=await get('shareholder','/api/v2/procurement/shareholder-funds?companyCode='+b);same(r.items,[]);assert.equal(r.total,0);result.foreignEvidence={items:r.items.length,total:r.total,summaryOriginal:(r.summary||[]).reduce((n,x)=>n+Number(x.totalOriginal),0),expected:0};assert.ok(!r.summary||r.summary.every(x=>Number(x.totalOriginal)===0),'foreign company summary leak');});
 await record('T10 global init',()=>get('admin','/api/v2/procurement/init/batches'));
 await record('T10 T16 buyer init denied',()=>get('buyer','/api/v2/procurement/init/batches',403));
 await record('T11 unauthenticated rejection',()=>get(null,'/api/v2/procurement/orders/'+fixture.orders[0].id,401));
 await record('T12 exact PROJECT excludes same-company foreign project',async()=>{const r=await get('project',list);same(r.items,fixture.orders.slice(0,1));assert.equal(r.total,1);assert.equal(r.items[0].projectCode,p);});
 await record('T13 PR nonempty company membership',async()=>same((await get('buyer','/api/v2/procurement/requests?pageSize=100')).items,fixture.requests.slice(0,2)));
 await record('T14 GROUP exact both companies',async()=>same((await get('admin',list)).items,fixture.orders));
 await record('T15 foreign TEST shipment denied (no platform psql)',()=>get('buyer','/api/v2/procurement/shipments/'+fixture.shipments[2].id,403));
 await record('F06 AP requires 200 and exact nonempty membership',async()=>same(await get('buyer','/api/v2/procurement/ap-ledger/open?keyword='+tag),fixture.aps.slice(0,2)));
 for(const [id,name,url] of [['F01',null,'summary'],['F02','buyer','summary'],['F03','admin','summary'],['F04','buyer','ar-aging'],['F07','factory','accounts'],['F08','admin','accounts']])await record(id+' retired route explicit404 (not old functionality)',()=>get(name,'/api/finance/'+url,404));
 // Additional review30 rows are inserted AFTER the unchanged original30 assertions.
 const own=[];
 for(const [n,pc,cur,amount,day,status] of [[1,p,'CNY',11,'2026-09-01','CONFIRMED'],[2,p,'LAK',7,'2026-09-02','CONFIRMED'],[3,q,'CNY',19,'2026-09-03','CANCELLED']])own.push(await insert('prc2_shareholder_funds',{fund_no:tag+'-OWN'+n,shareholder_name:tag,shareholder_id:users.shareholder.id,company_code:a,project_code:pc,currency_code:cur,fund_nature:'TEST',occurred_date:day,status,amount_original:amount,amount_base:amount*2}));
 result.fixture.review30OwnIds=own.map(x=>x.id);
 const normalized=rows=>rows.map(x=>({fundNature:x.fundNature,currencyCode:x.currencyCode,totalOriginal:Number(x.totalOriginal),totalBase:Number(x.totalBase)})).sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)));
 const expectedSummary=rows=>{const groups=new Map();for(const row of rows){const key=JSON.stringify([row.fund_nature,row.currency_code]);const x=groups.get(key)||{fundNature:row.fund_nature,currencyCode:row.currency_code,totalOriginal:0,totalBase:0};x.totalOriginal+=Number(row.amount_original);x.totalBase+=Number(row.amount_base);groups.set(key,x);}return normalized([...groups.values()]);};
 const checkFunds=async(user,params,expected,pageRows=expected)=>{const r=await get(user,'/api/v2/procurement/shareholder-funds?'+new URLSearchParams(params));same(r.items,pageRows);assert.equal(r.total,expected.length);assert.ok(Array.isArray(r.summary));assert.deepEqual(normalized(r.summary),expectedSummary(expected));return r;};
 const companyRows=[...fixture.funds.slice(0,2),...own],projectRows=[fixture.funds[0],...own.slice(0,2)];
 await record('R30 SELF authorized nonempty exact mixed currency/base sums',()=>checkFunds('shareholder',{companyCode:a},own));
 await record('R30 SELF foreign company after owned positive fixture',()=>checkFunds('shareholder',{companyCode:b},[]));
 await record('R30 SELF cannot choose another shareholder',()=>checkFunds('shareholder',{shareholderId:users.admin.id},[]));
 await record('R30 company exact visible rows and sums',()=>checkFunds('fundCompany',{},companyRows));
 await record('R30 company query cannot enlarge to foreign',()=>checkFunds('fundCompany',{companyCode:b},[]));
 await record('R30 PROJECT excludes same-company other project',()=>checkFunds('fundProject',{},projectRows));
 await record('R30 PROJECT explicit foreign project cannot enlarge',()=>checkFunds('fundProject',{projectCode:q},[]));
 await record('R30 GROUP both companies by explicit owner query',()=>checkFunds('admin',{shareholderId:users.admin.id},fixture.funds));
 await record('R30 no company scope empty rows count summary',()=>checkFunds('empty',{},[]));
 await record('R30 no permission rejects funds',()=>get('factory',funds,403));
 await record('R30 no session rejects funds',()=>get(null,funds,401));
 await record('R30 page1 count and summary cover all visible rows',()=>checkFunds('fundCompany',{page:'1',pageSize:'2'},companyRows,companyRows.slice(-2).reverse()));
 await record('R30 page2 same count and unpaged summary',()=>checkFunds('fundCompany',{page:'2',pageSize:'2'},companyRows,[own[0],fixture.funds[1]]));
 await record('R30 empty page retains visible count and sums',()=>checkFunds('fundCompany',{page:'10',pageSize:'2'},companyRows,[]));
 await record('R30 date currency nature owner filters same for all outputs',()=>checkFunds('fundCompany',{shareholderId:users.shareholder.id,dateFrom:'2026-09-02',dateTo:'2026-09-03',currencyCode:'CNY',fundNature:'TEST'},own.slice(2)));
 await record('R30 existing status semantics include cancelled (no status filter DTO)',()=>checkFunds('shareholder',{status:'CONFIRMED'},own));
}catch(e){result.setupError={code:e.code||e.name,message:String(e.message).slice(0,250),cause:e.cause?.code||e.cause?.message};output('SETUP_FAIL '+result.setupError.code);}
finally{if(app)await app.close();result.finishedAt=new Date().toISOString();result.after=require('./revision.cjs').capture();result.harnessAfter=ownHash();result.exit=result.setupError||result.checks.some(x=>x.status==='FAIL')?1:0;result.sourceUnchanged=result.before.sourceFingerprint===result.after.sourceFingerprint&&result.harnessBefore===result.harnessAfter;fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(result,null,2));output('RESULT '+path.relative(root,dir)+'/results.json exit='+result.exit);process.exitCode=result.exit;}
})();
