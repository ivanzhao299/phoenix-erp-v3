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
 const check=async(name,fn)=>{try{await fn();}catch(e){let alerts=[];try{if(currentPage)alerts=await currentPage.locator('[role=alert]').allTextContents();}catch{}console.log('FAILED_CHECK',name,'PAGE',currentPage?.url(),'ALERTS',alerts,'CAUSE',String(e.message).replace(/eyJ[A-Za-z0-9_.-]+/g,'[REDACTED]').slice(0,1000));throw e;}passed++;checks.push(name);console.log('PASS',name);};
 try{
 const context=await browser.newContext({timezoneId:'Asia/Vientiane',viewport:{width:1400,height:1000}});
 await context.route('**/*',localRoute);
 await context.addCookies([{name:'phoenix_access_token',value:session.cookie_token,url:'http://127.0.0.1:3000'}]);
 await context.addInitScript(s=>{sessionStorage.setItem('phoenix_session_version','v6');sessionStorage.setItem('phoenix_token',s.token);sessionStorage.setItem('phoenix_user',JSON.stringify(s.user_info));localStorage.setItem('phoenix_token',s.token);localStorage.setItem('phoenix_user',JSON.stringify(s.user_info));window.print=()=>{};},session);
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000);
 const enterTerminal=async()=>{if(process.env.PACKAGING_BROWSER_API_PROXY!=='1')return;await page.waitForFunction(()=>!!document.fullscreenElement||document.body.innerText.includes('点击屏幕继续'));const start=page.getByText('点击屏幕继续',{exact:true});if(await start.isVisible())await start.click();};
 const getDetail=async()=>{const r=await fetch('http://127.0.0.1:3100/api/packaging/terminal/history/'+fixture.prefix,{headers:{Authorization:'Bearer '+session.token}});const j=await r.json();if(r.status!==200)throw Error('DETAIL_HTTP_'+r.status);return j.data;};

 const errors=[];page.on('pageerror',e=>errors.push(String(e.message).replace(/eyJ[A-Za-z0-9_.-]+/g,'[REDACTED]').slice(0,500)));
 await page.goto('http://127.0.0.1:3000/terminal/packaging/history/'+fixture.prefix);await page.waitForTimeout(7000);
 console.log('TERMINAL_PROBE',JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,3000),errors}));
 }finally{await browser.close();await ds.destroy();}
})().catch(async e=>{if(activeDs?.isInitialized)await activeDs.destroy();console.log('BROWSER_FAILED',e.name,String(e.message).replace(/eyJ[A-Za-z0-9_.-]+/g,'[REDACTED]').slice(0,1500));process.exitCode=1;});
