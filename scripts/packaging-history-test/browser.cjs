const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');process.env.NODE_ENV='test';
const ts=require(root+'/apps/api/node_modules/typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText,f);
const {DataSource}=require(root+'/apps/api/node_modules/typeorm');
// Optional local transport adapter for Docker daemon and CLI in separate network namespaces.
// It forwards real requests to the real isolated API, never fabricates a response.
function localFetchOptions(route){const u=new URL(route.request().url());if(process.env.PACKAGING_BROWSER_API_PROXY==='1'&&u.port==='3000'&&u.pathname.startsWith('/api/')){u.port='3100';return {url:u.href};}return {};}
async function localRoute(route){const u=new URL(route.request().url());try{if(!['127.0.0.1','localhost'].includes(u.hostname))return await route.abort();const options=localFetchOptions(route);if(options.url){if(u.pathname==='/api/notifications/stream')return await route.abort();return await route.fulfill({response:await route.fetch(options)});}return await route.continue();}catch(e){console.log('LOCAL_TRANSPORT_FAILED',u.pathname,e.name);try{await route.abort();}catch{}}}

const {chromium,expect}=require(root+'/apps/web/node_modules/@playwright/test');
const bcrypt=require(root+'/apps/api/node_modules/bcrypt');
let activeDs;
(async()=>{
 const sourceFingerprintBefore=require('./revision.cjs').capture().sourceFingerprint;
 let p4TraceCounts=null;
 const ds=new DataSource({type:'postgres',host:'127.0.0.1',port:55432,username:'postgres',database:'packaging_history_test',entities:[],logging:false});activeDs=ds;await ds.initialize();
 const fixtureFactory=require(root+'/apps/api/src/modules/bff/packaging-history.fixture.ts').packingHistoryFixture;
 const createFixture=async()=>{
  const originalRandomUUID=crypto.randomUUID;
  for(let attempt=0;attempt<20;attempt++){
   const uuid=originalRandomUUID(),company=`TEST-${uuid.slice(0,6)}-C`;
   const [collision]=await ds.query('SELECT EXISTS(SELECT 1 FROM sys_organizations WHERE org_code=$1) AS present',[company]);
   if(collision.present)continue;
   crypto.randomUUID=()=>uuid;
   try{return await fixtureFactory(ds);}finally{crypto.randomUUID=originalRandomUUID;}
  }
  throw Error('UNIQUE_ISOLATED_FIXTURE_PREFIX_UNAVAILABLE');
 };
 const fixture=await createFixture();
 const password=crypto.randomBytes(18).toString('hex');await ds.query('UPDATE sys_user SET password_hash=$2 WHERE user_id=$1',[fixture.actor,await bcrypt.hash(password,4)]);
 const [role]=await ds.query(`INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id`,[fixture.prefix]);
 await ds.query('INSERT INTO sys_user_role(user_id,role_id,is_primary) VALUES($1,$2,true)',[fixture.actor,role.role_id]);
 await ds.query(`INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,$2 FROM sys_menu WHERE menu_code=ANY($3::text[])`,[role.role_id,'V,E',['MENU_PKG_OP','MENU_TRACEABILITY_VIEW']]);
 const [org]=await ds.query("SELECT id FROM sys_organizations WHERE org_type='COMPANY' AND company_code=$1 LIMIT 1",[fixture.company]);
 await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2)',[fixture.actor,org.id]);await ds.query('INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES($1,$2)',[fixture.actor,fixture.farm]);await ds.query('INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES($1,$2) ON CONFLICT DO NOTHING',[fixture.actor,fixture.warehouse]);
 const login=await fetch('http://127.0.0.1:3100/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fixture.prefix,password})});
 const session=await login.json();if(!session.token)throw Error('ISOLATED_LOGIN_FAILED '+login.status);
 const browser=await chromium.launch({executablePath:process.env.PACKAGING_BROWSER_EXECUTABLE||path.join(root,'artifacts/packaging-history-local/browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell'),headless:true,args:['--no-sandbox']});
 let passed=0,currentPage;const checks=[];
 const check=async(name,fn)=>{try{await fn();}catch(e){let alerts=[];try{if(currentPage)alerts=await currentPage.locator('[role=alert]').allTextContents();}catch{}console.log('FAILED_CHECK',name,'PAGE',currentPage?.url(),'ALERTS',alerts,'CAUSE',String(e.message).replace(/eyJ[A-Za-z0-9_.-]+/g,'[REDACTED]').slice(0,1000));throw e;}passed++;checks.push(name);console.log('PASS',name);};
 try{
 const context=await browser.newContext({timezoneId:'Asia/Vientiane',viewport:{width:1400,height:1000}});
 await context.route('**/*',localRoute);
 await context.addCookies([{name:'phoenix_access_token',value:session.cookie_token,url:'http://127.0.0.1:3000'}]);
 await context.addInitScript(s=>{sessionStorage.setItem('phoenix_session_version','v6');sessionStorage.setItem('phoenix_token',s.token);sessionStorage.setItem('phoenix_user',JSON.stringify(s.user_info));localStorage.setItem('phoenix_token',s.token);localStorage.setItem('phoenix_user',JSON.stringify(s.user_info));window.print=()=>{};},session);
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000);
 const enterTerminal=async()=>{if(process.env.PACKAGING_BROWSER_API_PROXY!=='1')return;await page.waitForFunction(()=>!!document.fullscreenElement||/点击屏幕继续|点击开始/.test(document.body.innerText));const start=page.getByText(/^(点击屏幕继续|点击开始)$/);if(await start.isVisible())await start.click();};
 const getDetail=async()=>{const r=await fetch('http://127.0.0.1:3100/api/packaging/terminal/history/'+fixture.prefix,{headers:{Authorization:'Bearer '+session.token}});const j=await r.json();if(r.status!==200)throw Error('DETAIL_HTTP_'+r.status);return j.data;};
 await check('history exact original -> CLOSED detail',async()=>{await page.goto('http://127.0.0.1:3000/packaging/history');await page.getByLabel('完整原单号').fill(fixture.prefix);await page.getByRole('button',{name:'查询',exact:true}).click();await page.getByRole('link',{name:fixture.prefix,exact:true}).click();await expect(page.getByRole('heading',{name:fixture.prefix,exact:true})).toBeVisible();await expect(page.getByText('原班次已关闭；此原单可在证据满足时继续标签与交接。')).toBeVisible();});
 await check('hard refresh and new tab recover same original date',async()=>{await page.reload();await expect(page.getByRole('heading',{name:fixture.prefix,exact:true})).toBeVisible();const second=await context.newPage();await second.goto(page.url());await expect(second.getByText(/原生产日 2026-01-02/)).toBeVisible();await second.close();});
 await check('TEST box identity registration',async()=>{await page.getByLabel('登记事实、补打原因或实物核实说明').fill('TEST fixture physically unlabelled in software simulation');await page.getByRole('button',{name:'确认未贴标事实并登记'}).click();await expect(page.getByRole('button',{name:'请求打印 / 同码补打'})).toHaveCount(2);});
 await check('print request and unknown physical result are recorded separately',async()=>{for(let i=0;i<2;i++){const button=page.getByRole('button',{name:'请求打印 / 同码补打'}).nth(i);await expect(button).toBeEnabled();await button.click();}await expect.poll(async()=>{const d=await getDetail();return d.events.filter(e=>e.event_type==='PRINT_RESULT'&&e.payload.type==='UNKNOWN').length;}).toBe(2);const d=await getDetail();expect(d.events.filter(e=>e.event_type==='PRINT_REQUEST').length).toBe(2);expect(d.events.some(e=>e.event_type==='DEVICE_PRINTED')).toBe(false);});
 const post=async(route,body,token=session.token)=>{const r=await fetch('http://127.0.0.1:3100/api/packaging/terminal/'+route,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const commandCases=d=>{const box=d.boxes[0],label=box.labels.find(l=>l.kind==='CANONICAL'&&l.status==='ACTIVE').code,id=crypto.randomUUID(),revision=d.revision;return [
  ['REGISTER',`history/${fixture.prefix}/box-registration`,{expectedRevision:revision,registrationKind:'FIRST_LABEL_CONFIRMED',reason:'TEST',items:[{outputOrdinal:0,boxOrdinal:1,declaration:'TEST'}]}],
  ['SESSION',`history/${fixture.prefix}/verification-sessions`,{expectedRevision:revision,purpose:'LABEL_CHECK'}],
  ['SCAN',`history/${fixture.prefix}/box-verifications`,{expectedRevision:revision,boxId:box.boxId,labelCode:label,purpose:'LABEL_CHECK',method:'MANUAL',sessionId:id}],
  ['PRINT','labels/print-requests',{expectedRevision:revision,packingCode:fixture.prefix,boxId:box.boxId,labelCode:label,printType:'REPRINT',reason:'TEST',copies:1,templateVersion:'TEST'}],
  ['PRINT_RESULT',`labels/print-requests/${d.events.find(e=>e.event_type==='PRINT_REQUEST').id}/events`,{packingCode:fixture.prefix,type:'DISPATCHED'}],
  ['VOID',`history/${fixture.prefix}/labels/${label}/void`,{expectedRevision:revision,reason:'TEST',dispositionDeclaration:'TEST destroyed'}],
  ['CONFIRM','warehouse/confirm',{contractVersion:2,packingCode:fixture.prefix,expectedRevision:revision,productionDate:d.record.productionDate,shiftId:d.shift.id,boxIds:d.boxes.map(b=>b.boxId),verificationIds:[id],warehouseCode:fixture.warehouse,locationCode:fixture.location,receiverUserId:fixture.actor}]
 ];};
 const matrixAccounts=[];
 for(const [name,menu,perms,owned] of [['OP_V','MENU_PKG_OP','V',true],['MGR_V','MENU_PKG_MGR','V',true],['MGR_E','MENU_PKG_MGR','E',true],['NO_SCOPE_E','MENU_PKG_OP','V,E',false],['FOREIGN_E','MENU_PKG_OP','V,E','FOREIGN']]){
  const username=fixture.prefix+'-'+name,pw=crypto.randomBytes(18).toString('hex');
  const [u]=await ds.query(`INSERT INTO sys_user(username,real_name,password_hash,status) VALUES($1,$1,$2,1) RETURNING user_id`,[username,await bcrypt.hash(pw,4)]);
  const [r]=await ds.query(`INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id`,[username]);
  await ds.query('INSERT INTO sys_user_role(user_id,role_id,is_primary) VALUES($1,$2,true)',[u.user_id,r.role_id]);
  await ds.query(`INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,$2 FROM sys_menu WHERE menu_code=$3`,[r.role_id,perms,menu]);
  if(owned){let ownerOrg=org.id,farm=fixture.farm;if(owned==='FOREIGN'){const other=await createFixture();const [o]=await ds.query("SELECT id FROM sys_organizations WHERE company_code=$1 AND org_type='COMPANY' LIMIT 1",[other.company]);ownerOrg=o.id;farm=other.farm;}await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2)',[u.user_id,ownerOrg]);await ds.query('INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES($1,$2)',[u.user_id,farm]);}
  const response=await fetch('http://127.0.0.1:3100/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:pw})});const auth=await response.json();if(!auth.token)throw Error('MATRIX_LOGIN_FAILED');matrixAccounts.push({name,id:String(u.user_id),token:auth.token,status:owned===false||owned==='FOREIGN'?404:403});
 }
 matrixAccounts.push({name:'UNAUTHENTICATED',token:'',status:401});
 for(const [action,route,body] of commandCases(await getDetail()))await check('real HTTP '+action+' ordinary role/scope matrix',async()=>{for(const account of matrixAccounts){const r=await post(route,body,account.token);expect(r.status,account.name+' '+action).toBe(account.status);}});
 await check('all write policy gates closed; recorded print results cannot be replaced',async()=>{
  await ds.query(`INSERT INTO sys_dict(dict_type,dict_code,config_json) VALUES('PKG_HISTORY_TEST_POLICY',$1,'{}')`,[fixture.company+':'+fixture.farm]);
  try{for(const [action,route,body] of commandCases(await getDetail())){const r=await post(route,body);expect(r.status,action).toBe(409);}}
  finally{await ds.query(`DELETE FROM sys_dict WHERE dict_type='PKG_HISTORY_TEST_POLICY' AND dict_code=$1`,[fixture.company+':'+fixture.farm]);}
 });
 await check('UNKNOWN blocks reprint until an operator reconciles physical absence',async()=>{
  const d=await getDetail(),request=d.events.find(e=>e.event_type==='PRINT_REQUEST'),unknown=d.events.find(e=>e.event_type==='PRINT_RESULT'&&e.payload.requestId===request.id);
  expect(unknown.payload.type).toBe('UNKNOWN');
  await page.reload();await expect(page.getByRole('button',{name:'请求打印 / 同码补打'}).nth(0)).toBeDisabled();
  const [,route,body]=commandCases(await getDetail()).find(x=>x[0]==='PRINT');expect((await post(route,body)).status).toBe(409);
  const resultRoute=`labels/print-requests/${request.id}/events`;
  expect((await post(resultRoute,{packingCode:fixture.prefix,type:'FAILED'})).status).toBe(409);
  expect((await post(resultRoute,{packingCode:fixture.prefix,type:'FAILED',physicalVerification:'CONFIRMED_ABSENT',
   reconciliationReason:'TEST operator verified no label left the printer'})).status).toBe(201);
  await page.reload();await expect(page.getByRole('button',{name:'请求打印 / 同码补打'}).nth(0)).toBeEnabled();
 });
 await check('real HTTP VOID retires alias and preserves box before fresh printing',async()=>{
  const d=await getDetail(),[,route,body]=commandCases(d).find(x=>x[0]==='VOID');expect((await post(route,body)).status).toBe(201);
  const next=await getDetail();expect(next.boxes[0].boxId).toBe(d.boxes[0].boxId);await page.reload();
  await page.getByLabel('登记事实、补打原因或实物核实说明').fill('TEST replacement after retirement');
  const previousRequests=next.events.filter(e=>e.event_type==='PRINT_REQUEST').length;
  await page.getByRole('button',{name:'请求打印 / 同码补打'}).nth(0).click();
  await expect.poll(async()=>{const current=await getDetail();return current.events.filter(e=>e.event_type==='PRINT_REQUEST').length;}).toBe(previousRequests+1);
  const afterPrint=await getDetail(),newRequest=afterPrint.events.filter(e=>e.event_type==='PRINT_REQUEST').at(-1);
  await expect.poll(async()=>{const current=await getDetail();return current.events.some(e=>e.event_type==='PRINT_RESULT'&&e.payload.requestId===newRequest.id&&e.payload.type==='UNKNOWN');}).toBe(true);
  await expect(page.getByRole('button',{name:'请求打印 / 同码补打'}).nth(0)).toBeDisabled();
 });
 await check('receiver and location from restricted master candidates',async()=>{await page.getByLabel('选择仓库',{exact:true}).selectOption(fixture.warehouse);await page.getByLabel('选择库位',{exact:true}).selectOption(fixture.location);await page.getByLabel('搜索接收人',{exact:true}).fill(fixture.prefix);await page.getByLabel('选择接收人',{exact:true}).selectOption(fixture.actor);});
 await check('separate LABEL_CHECK and HANDOVER per-box evidence',async()=>{const d=await getDetail();for(const purpose of ['开始标签核验','开始交接核验']){await page.getByRole('button',{name:purpose,exact:true}).click();await expect(page.getByRole('button',{name:purpose,exact:true})).toBeEnabled();for(const box of d.boxes){await page.getByLabel('逐箱输入标签码（手工采集）').fill(box.labels.find(l=>l.kind==='CANONICAL'&&l.status==='ACTIVE').code);await page.getByRole('button',{name:'核验本箱',exact:true}).click();await expect(page.getByLabel('逐箱输入标签码（手工采集）')).toHaveValue('');}}});
 await check('same-role receiver revocation bypasses no stale scope cache',async()=>{
  const receiver=matrixAccounts.find(a=>a.name==='OP_V');
  const warm=await fetch('http://127.0.0.1:3100/api/packaging/terminal/history/'+fixture.prefix,{headers:{Authorization:'Bearer '+receiver.token}});expect(warm.status).toBe(200);
  await ds.query('DELETE FROM sys_user_orgs WHERE user_id=$1 AND org_id=$2',[receiver.id,org.id]);await ds.query('UPDATE sys_user SET perms_version=perms_version+1 WHERE user_id=$1',[receiver.id]);
  try{const d=await getDetail(),[,route,body]=commandCases(d).find(x=>x[0]==='CONFIRM');body.receiverUserId=receiver.id;body.verificationIds=d.events.filter(e=>e.event_type==='BOX_VERIFIED'&&e.payload.purpose==='HANDOVER').map(e=>e.id);
   const r=await post(route,body);expect(r.status).toBe(409);expect(r.body.message).toBe('RECEIVER_INELIGIBLE');
   expect((await getDetail()).events.filter(e=>e.event_type==='COMMIT_RECEIPT')).toHaveLength(0);
  }finally{await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2)',[receiver.id,org.id]);await ds.query('UPDATE sys_user SET perms_version=perms_version+1 WHERE user_id=$1',[receiver.id]);}
 });
 await check('D1-C unknown commit survives refresh and resolves without replay',async()=>{
   let completed;const committedResponse=new Promise(resolve=>{completed=resolve;});
   await page.route('**/warehouse/confirm',async route=>{const response=await route.fetch(localFetchOptions(route));const body=await response.json();await route.abort('failed');completed({status:response.status(),code:body.code,message:body.message});});
   page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'确认本单交接入库',exact:true}).click();
   const response=await committedResponse;if(response.status<200||response.status>=300)throw Error('CONFIRM_FAILED '+JSON.stringify(response));
   await expect(page.getByRole('button',{name:'查询未知提交结果'})).toBeVisible();await page.reload();
   await expect(page.getByRole('button',{name:'查询未知提交结果'})).toBeVisible();await page.getByRole('button',{name:'查询未知提交结果'}).click();
   await expect(page.getByRole('button',{name:'查询未知提交结果'})).toHaveCount(0);await expect(page.getByText(/交接：COMMITTED/)).toBeVisible({timeout:30000});
   const d=await getDetail();expect(d.receipt.state).toBe('RECORDED');expect(d.record.totalEggs).toBe(50);expect(d.shift.status).toBe('CLOSED');expect(d.events.filter(e=>e.event_type==='COMMIT_RECEIPT').length).toBe(1);
 });
 await check('unified label trace UI shows committed batch evidence and hides retired/missing codes consistently',async()=>{
   const d=await getDetail(),box=d.boxes[0],currentCode=box.labels.find(l=>l.kind==='CANONICAL'&&l.status==='ACTIVE'&&l.resolution==='BOUND')?.code;
   const voidEvent=d.events.find(e=>e.event_type==='LABEL_VOID');const retiredCode=voidEvent?.payload.oldCodes?.[0];
   if(!currentCode||!retiredCode)throw Error('CANONICAL_AND_RETIRED_LABEL_FIXTURE_REQUIRED');
   const [receiptEvent]=await ds.query(`SELECT payload FROM pkg_packing_events WHERE packing_id=$1 AND event_type='COMMIT_RECEIPT' ORDER BY server_at DESC LIMIT 1`,[fixture.packingId]);
   const group=receiptEvent?.payload?.groups?.find(g=>Array.isArray(g.outputOrdinals)&&g.outputOrdinals.includes(Number(box.outputOrdinal)));
   if(!group?.batchNo||!group?.ledgerId)throw Error('COMMITTED_OUTPUT_BATCH_LEDGER_MAPPING_REQUIRED');
   await page.goto('http://127.0.0.1:3000/traceability');
   await page.locator('select').filter({has:page.locator('option[value="label"]')}).selectOption('label');
   await page.getByPlaceholder('标签号 label_no').fill(currentCode);
   await page.getByRole('button',{name:'追溯',exact:true}).click();
   await expect(page.locator('main').getByText(fixture.prefix,{exact:true})).toBeVisible();
   await expect(page.locator('main').getByText(group.batchNo,{exact:true}).first()).toBeVisible();
   await expect(page.locator('main').getByText(group.ledgerId,{exact:true}).first()).toBeVisible();
   await expect(page.getByText('按批次出库分配追溯',{exact:true})).toBeVisible();
   p4TraceCounts={outputOrdinals:group.outputOrdinals.length,receiptGroups:1,batches:1,ledgers:1,quantity:Number(group.qty)};
   await page.getByPlaceholder('标签号 label_no').fill(retiredCode);
   await page.getByRole('button',{name:'追溯',exact:true}).click();
   await expect(page.getByText('箱码已作废',{exact:true})).toBeVisible();
   const missingCode='PBX-TEST-NO-RECORD-'+crypto.randomUUID();
   await page.getByPlaceholder('标签号 label_no').fill(missingCode);
   await page.getByRole('button',{name:'追溯',exact:true}).click();
   await expect(page.getByText('未找到追溯记录',{exact:true})).toBeVisible();
 });
 await check('daily and mobile share original-record summary',async()=>{for(const path of ['/packaging/daily-report','/mobile/packaging']){await page.goto('http://127.0.0.1:3000'+path);await page.getByLabel('原生产日',{exact:true}).fill('2026-01-02');await page.getByRole('button',{name:'查询',exact:true}).click();const eggs=page.getByText('包装原单枚数',{exact:true}).locator('..').first(),boxes=page.getByText('包装箱数',{exact:true}).locator('..').first();await expect(eggs).toContainText('50');await expect(boxes).toContainText('2');}});
 await check('old print URL resolves to truthful selection',async()=>{await page.goto('http://127.0.0.1:3000/packaging/label-print?qty=999');await expect(page.getByText(/旧分级参数不会生成箱码/)).toBeVisible();});
 await check('terminal original detail works without a current shift selection',async()=>{
   await page.goto('http://127.0.0.1:3000/terminal/packaging/history/'+fixture.prefix);await enterTerminal();await expect(page.getByRole('heading',{name:fixture.prefix,exact:true})).toBeVisible();
 });
 await check('legacy terminal print URL recovers original code after CLOSED',async()=>{
   await page.goto('http://127.0.0.1:3000/terminal/packaging/label-print?packingCode='+fixture.prefix);await enterTerminal();await expect(page.getByRole('heading',{name:fixture.prefix,exact:true})).toBeVisible();
 });
 await check('missing original URL leads to history selection without fabricated record',async()=>{
   await page.goto('http://127.0.0.1:3000/terminal/packaging/warehouse-handover');await enterTerminal();await expect(page.getByRole('heading',{name:'包装历史',exact:true})).toBeVisible();
 });
 for(const timezoneId of ['Asia/Vientiane','Asia/Singapore','UTC','America/Los_Angeles'])await check('original DATE invariant in '+timezoneId,async()=>{
   const zone=await browser.newContext({timezoneId});await zone.route('**/*',localRoute);
   await zone.addCookies([{name:'phoenix_access_token',value:session.cookie_token,url:'http://127.0.0.1:3000'}]);
   await zone.addInitScript(s=>{sessionStorage.setItem('phoenix_session_version','v6');sessionStorage.setItem('phoenix_token',s.token);sessionStorage.setItem('phoenix_user',JSON.stringify(s.user_info));},session);
   const tab=await zone.newPage();await tab.goto('http://127.0.0.1:3000/packaging/history/'+fixture.prefix);await expect(tab.getByText(/原生产日 2026-01-02/)).toBeVisible();await zone.close();
 });
 await context.close();
 const sourceFingerprintAfter=require('./revision.cjs').capture().sourceFingerprint;
 console.log('BROWSER_RESULT',JSON.stringify({passed,failed:0,skipped:0,checks,sourceFingerprintBefore,sourceFingerprintAfter,p4TraceCounts,transport:process.env.PACKAGING_BROWSER_API_PROXY==='1'?'real HTTP proxy 3000/api to localhost3100 (container namespace adapter)':'normal rewrites',backgroundAdmission:'LOCAL_TEST_PASS_THROUGH',physicalDevice:'NOT_EXECUTED',production:'NOT_ACCESSED'}));
 }finally{await browser.close();await ds.destroy();}
})().catch(async e=>{if(activeDs?.isInitialized)await activeDs.destroy();console.log('BROWSER_FAILED',e.name,String(e.message).replace(/eyJ[A-Za-z0-9_.-]+/g,'[REDACTED]').slice(0,1500));process.exitCode=1;});
