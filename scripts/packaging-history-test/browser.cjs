const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');process.env.NODE_ENV='test';
const ts=require(root+'/apps/api/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,f);
const {DataSource}=require(root+'/apps/api/node_modules/typeorm');
const {chromium,expect}=require(root+'/apps/web/node_modules/@playwright/test');
const bcrypt=require(root+'/apps/api/node_modules/bcrypt');
let activeDs;
(async()=>{
 const ds=new DataSource({type:'postgres',host:'127.0.0.1',port:55432,username:'postgres',database:'packaging_history_test',entities:[],logging:false});activeDs=ds;await ds.initialize();
 const fixture=await require(root+'/apps/api/src/modules/bff/packaging-history.fixture.ts').packingHistoryFixture(ds);
 const password=crypto.randomBytes(18).toString('hex');await ds.query('UPDATE sys_user SET password_hash=$2 WHERE user_id=$1',[fixture.actor,await bcrypt.hash(password,4)]);
 const [role]=await ds.query(`INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id`,[fixture.prefix]);
 await ds.query('INSERT INTO sys_user_role(user_id,role_id,is_primary) VALUES($1,$2,true)',[fixture.actor,role.role_id]);
 await ds.query(`INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,'V,E' FROM sys_menu WHERE menu_code='MENU_PKG_OP'`,[role.role_id]);
 const [org]=await ds.query(`INSERT INTO sys_organizations(org_code,org_name,org_type,company_code) VALUES($1,$1,'COMPANY',$1) RETURNING id`,[fixture.company]);
 await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2)',[fixture.actor,org.id]);await ds.query('INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES($1,$2)',[fixture.actor,fixture.farm]);
 const login=await fetch('http://127.0.0.1:3100/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fixture.prefix,password})});
 const session=await login.json();if(!session.token)throw Error('ISOLATED_LOGIN_FAILED '+login.status);
 const browser=await chromium.launch({executablePath:path.join(root,'artifacts/packaging-history-local/browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell'),headless:true,args:['--no-sandbox']});
 let passed=0,currentPage;const checks=[];
 const check=async(name,fn)=>{try{await fn();}catch(e){console.log('FAILED_CHECK',name,'PAGE',currentPage?.url(),'ALERTS',currentPage?await currentPage.locator('[role=alert]').allTextContents():[]);throw e;}passed++;checks.push(name);console.log('PASS',name);};
 try{
 const context=await browser.newContext({timezoneId:'Asia/Vientiane',viewport:{width:1400,height:1000}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
 await context.addCookies([{name:'phoenix_access_token',value:session.cookie_token,url:'http://127.0.0.1:3000'}]);
 await context.addInitScript(s=>{sessionStorage.setItem('phoenix_session_version','v6');sessionStorage.setItem('phoenix_token',s.token);sessionStorage.setItem('phoenix_user',JSON.stringify(s.user_info));localStorage.setItem('phoenix_token',s.token);localStorage.setItem('phoenix_user',JSON.stringify(s.user_info));window.print=()=>{};},session);
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000);
 const getDetail=async()=>{const r=await fetch('http://127.0.0.1:3100/api/packaging/terminal/history/'+fixture.prefix,{headers:{Authorization:'Bearer '+session.token}});const j=await r.json();if(r.status!==200)throw Error('DETAIL_HTTP_'+r.status);return j.data;};
 await check('history exact original -> CLOSED detail',async()=>{await page.goto('http://127.0.0.1:3000/packaging/history');await page.getByLabel('完整原单号').fill(fixture.prefix);await page.getByRole('button',{name:'查询',exact:true}).click();await page.getByRole('link',{name:fixture.prefix,exact:true}).click();await expect(page.getByRole('heading',{name:fixture.prefix,exact:true})).toBeVisible();await expect(page.getByText('原班次已关闭；此原单可在证据满足时继续标签与交接。')).toBeVisible();});
 await check('hard refresh and new tab recover same original date',async()=>{await page.reload();await expect(page.getByRole('heading',{name:fixture.prefix,exact:true})).toBeVisible();const second=await context.newPage();await second.goto(page.url());await expect(second.getByText(/原生产日 2026-01-02/)).toBeVisible();await second.close();});
 await check('TEST box identity registration',async()=>{await page.getByLabel('登记事实 / 补打原因').fill('TEST fixture physically unlabelled in software simulation');await page.getByRole('button',{name:'确认未贴标事实并登记'}).click();await expect(page.getByRole('button',{name:'请求打印 / 同码补打'})).toHaveCount(2);});
 await check('print request dispatch is distinct from physical evidence',async()=>{for(let i=0;i<2;i++){await page.getByRole('button',{name:'请求打印 / 同码补打'}).nth(i).click();await expect(page.getByRole('button',{name:'请求打印 / 同码补打'}).nth(i)).toBeEnabled();}const d=await getDetail();expect(d.events.filter(e=>e.event_type==='PRINT_REQUEST').length).toBe(2);expect(d.events.some(e=>e.event_type==='DEVICE_PRINTED')).toBe(false);});
 await check('receiver and location from restricted master candidates',async()=>{await page.getByRole('group',{name:'仓库',exact:true}).getByRole('radio').check();await page.getByRole('group',{name:'库位',exact:true}).getByRole('radio').check();await page.getByRole('group',{name:'接收人',exact:true}).getByRole('radio',{name:new RegExp(fixture.prefix)}).check();});
 await check('separate LABEL_CHECK and HANDOVER per-box evidence',async()=>{const d=await getDetail();for(const purpose of ['开始标签核验','开始交接核验']){await page.getByRole('button',{name:purpose,exact:true}).click();await expect(page.getByRole('button',{name:purpose,exact:true})).toBeEnabled();for(const box of d.boxes){await page.getByLabel('逐箱输入标签码（手工采集）').fill(box.labels.find(l=>l.kind==='CANONICAL').code);await page.getByRole('button',{name:'核验本箱',exact:true}).click();await expect(page.getByLabel('逐箱输入标签码（手工采集）')).toHaveValue('');}}});
 await check('D1-C unknown commit survives refresh and resolves without replay',async()=>{
   let completed;const committedResponse=new Promise(resolve=>{completed=resolve;});
   await page.route('**/warehouse/confirm',async route=>{const response=await route.fetch();const body=await response.json();await route.abort('failed');completed({status:response.status(),code:body.code,message:body.message});});
   page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'确认本单交接入库',exact:true}).click();
   const response=await committedResponse;if(response.status<200||response.status>=300)throw Error('CONFIRM_FAILED '+JSON.stringify(response));
   await expect(page.getByRole('button',{name:'查询未知提交结果'})).toBeVisible();await page.reload();
   await expect(page.getByRole('button',{name:'查询未知提交结果'})).toBeVisible();await page.getByRole('button',{name:'查询未知提交结果'}).click();
   await expect(page.getByRole('button',{name:'查询未知提交结果'})).toHaveCount(0);await expect(page.getByText(/交接：COMMITTED/)).toBeVisible({timeout:30000});
   const d=await getDetail();expect(d.receipt.state).toBe('RECORDED');expect(d.record.totalEggs).toBe(50);expect(d.shift.status).toBe('CLOSED');expect(d.events.filter(e=>e.event_type==='COMMIT_RECEIPT').length).toBe(1);
 });
 await check('daily and mobile share original-record summary',async()=>{for(const path of ['/packaging/daily-report','/mobile/packaging']){await page.goto('http://127.0.0.1:3000'+path);await page.getByLabel('原生产日',{exact:true}).fill('2026-01-02');await page.getByRole('button',{name:'查询',exact:true}).click();await expect(page.getByText(/50 枚 \/ 2 盒，作废单 0/)).toBeVisible();}});
 await check('old print URL resolves to truthful selection',async()=>{await page.goto('http://127.0.0.1:3000/packaging/label-print?qty=999');await expect(page.getByText(/旧分级参数不会生成箱码/)).toBeVisible();});
 await check('terminal original detail works without a current shift selection',async()=>{
   await page.goto('http://127.0.0.1:3000/terminal/packaging/history/'+fixture.prefix);await expect(page.getByRole('heading',{name:fixture.prefix,exact:true})).toBeVisible();
 });
 await check('legacy terminal print URL recovers original code after CLOSED',async()=>{
   await page.goto('http://127.0.0.1:3000/terminal/packaging/label-print?packingCode='+fixture.prefix);await expect(page.getByRole('heading',{name:fixture.prefix,exact:true})).toBeVisible();
 });
 await check('missing original URL leads to history selection without fabricated record',async()=>{
   await page.goto('http://127.0.0.1:3000/terminal/packaging/warehouse-handover');await expect(page.getByRole('heading',{name:'包装历史',exact:true})).toBeVisible();
 });
 for(const timezoneId of ['Asia/Vientiane','Asia/Singapore','UTC','America/Los_Angeles'])await check('original DATE invariant in '+timezoneId,async()=>{
   const zone=await browser.newContext({timezoneId});await zone.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
   await zone.addCookies([{name:'phoenix_access_token',value:session.cookie_token,url:'http://127.0.0.1:3000'}]);
   await zone.addInitScript(s=>{sessionStorage.setItem('phoenix_session_version','v6');sessionStorage.setItem('phoenix_token',s.token);sessionStorage.setItem('phoenix_user',JSON.stringify(s.user_info));},session);
   const tab=await zone.newPage();await tab.goto('http://127.0.0.1:3000/packaging/history/'+fixture.prefix);await expect(tab.getByText(/原生产日 2026-01-02/)).toBeVisible();await zone.close();
 });
 await context.close();
 console.log('BROWSER_RESULT',JSON.stringify({passed,failed:0,skipped:0,checks,physicalDevice:'NOT_EXECUTED',production:'NOT_ACCESSED'}));
 }finally{await browser.close();await ds.destroy();}
})().catch(async e=>{if(activeDs?.isInitialized)await activeDs.destroy();console.log('BROWSER_FAILED',e.name,String(e.message).replace(/eyJ[A-Za-z0-9_.-]+/g,'[REDACTED]').slice(0,1500));process.exitCode=1;});
