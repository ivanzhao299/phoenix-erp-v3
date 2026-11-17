const {createRequire}=require('node:module');const {resolve}=require('node:path');const {mkdirSync,writeFileSync}=require('node:fs');
const {chromium}=createRequire(resolve('apps/web/package.json'))('@playwright/test');
(async()=>{
 const base='http://127.0.0.1:3333',api='http://127.0.0.1:3311';const out=resolve('artifacts/flock-lifecycle-20261117/browser');mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true});const evidence=[];let activePage;
 try{
  async function actor(name,mobile=false){
   const r=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name,password:'owned-fixture'})});const auth=await r.json();if(!auth.token)throw Error('Fixture login failed');
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
   await context.addCookies([{name:'phoenix_access_token',value:auth.token,url:base}]);
   await context.addInitScript(({user,token})=>{sessionStorage.setItem('phoenix_session_version','v6');localStorage.setItem('phoenix_token',token);localStorage.setItem('phoenix_user',JSON.stringify(user));sessionStorage.setItem('phoenix_token',token);sessionStorage.setItem('phoenix_user',JSON.stringify(user));}, {user:auth.user_info,token:auth.token});
   const page=await context.newPage();activePage=page;page.on('response',async r=>{if(r.url().endsWith('/flock-lifecycle/houses'))try{console.log('HOUSE VIEW',name,JSON.stringify((await r.json()).data));}catch{}});page.setDefaultTimeout(20000);
   await page.goto(base+(mobile?'/mobile/flock-lifecycle':'/breeding/flock-lifecycle'),{waitUntil:'domcontentloaded',timeout:90000});
   try{await page.locator('h1').filter({hasText:'鸡群生命周期'}).waitFor();}catch(e){await page.screenshot({path:out+'/'+name+'-failure.png',fullPage:true});console.error('Page failure:',page.url(),(await page.locator('body').innerText()).slice(0,1800));throw e;}await page.getByRole('button',{name:'选择此舍'}).first().waitFor();return {context,page};
  }
  const keeper=await actor('keeper');const page=keeper.page;
  await page.getByRole('button',{name:'选择此舍'}).first().click();await page.getByLabel('业务类型',{exact:true}).selectOption('BASELINE');
  await page.getByLabel('业务日期',{exact:true}).fill('2026-11-10');await page.getByLabel('实际数量（羽）',{exact:true}).fill('100');
  await page.getByLabel('责任人',{exact:true}).selectOption('keeper');await page.getByLabel('业务原因及交接说明',{exact:true}).fill('浏览器实盘接续验收，合成测试样本');
  await page.getByLabel('差异处理回执',{exact:true}).fill('BROWSER-COUNT-RECEIPT');
  await page.locator('input[type=file]').first().setInputFiles({name:'count.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nBrowser owned fixture count\n%%EOF')});
  await page.getByText(/FILE-LEGACY/).first().waitFor();await page.getByRole('button',{name:'保存草稿',exact:true}).click();
  await page.getByText('单据已保存，请提交并由另一人审核后过账。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'提交',exact:true}).first().click();await page.getByText('已提交审核。',{exact:true}).waitFor();
  await page.screenshot({path:out+'/pc-submitted.png',fullPage:true});evidence.push({case:'PC real protected evidence -> baseline draft -> submit',result:'passed'});
  const reviewer=await actor('reviewer');await reviewer.page.getByRole('button',{name:'原单与事件'}).first().click();await reviewer.page.getByRole('heading',{name:'业务证据',exact:true}).waitFor();
  await reviewer.page.getByText('实盘数量',{exact:true}).waitFor();await reviewer.page.getByRole('button',{name:'审核',exact:true}).first().click();await reviewer.page.getByText('已审核。',{exact:true}).waitFor();
  await reviewer.page.screenshot({path:out+'/pc-reviewed.png',fullPage:true});evidence.push({case:'Independent reviewer reads structured business fields/evidence and approves',result:'passed'});
  const poster=await actor('poster',true);await poster.page.getByRole('button',{name:'过账',exact:true}).first().click();await poster.page.getByText('已原子过账。',{exact:true}).waitFor();
  await poster.page.getByText(/在栏 · 存栏 100/).waitFor();await poster.page.screenshot({path:out+'/mobile-posted.png',fullPage:true});
  const overflow=await poster.page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);if(overflow)throw Error('Mobile page overflows viewport');
  evidence.push({case:'Mobile independent poster -> atomic posting -> live quantity 100 without horizontal overflow',result:'passed'});
  await poster.page.reload({waitUntil:'domcontentloaded'});await poster.page.getByText(/在栏 · 存栏 100/).waitFor();evidence.push({case:'Browser reload preserves posted stock projection',result:'passed'});
  const denied=await actor('other_farm',true);const leaked=await denied.page.getByText(/house A（HA）/).count();if(leaked)throw Error('Foreign farm visible in mobile');evidence.push({case:'Other farm cannot see HA lifecycle documents',result:'passed'});
  activePage=keeper.page;await keeper.page.reload({waitUntil:'domcontentloaded'});await keeper.page.getByRole('button',{name:'选择此舍'}).first().click();await keeper.page.getByLabel('业务类型',{exact:true}).selectOption('REPORT_CORRECTION');
  await keeper.page.getByLabel('业务日期',{exact:true}).fill('2026-11-11');await keeper.page.getByLabel('增加实际等级',{exact:true}).selectOption('GRADE_1');await keeper.page.getByLabel('更正分级 GRADE_1',{exact:true}).fill('55');
  await keeper.page.getByLabel('责任人',{exact:true}).selectOption('keeper');await keeper.page.getByLabel('业务原因及交接说明',{exact:true}).fill('独立批准补录测试，真实占栏身份保留');await keeper.page.getByLabel('差异处理回执',{exact:true}).fill('BROWSER-REPORT-RECEIPT');
  await keeper.page.locator('input[type=file]').first().setInputFiles({name:'report.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSynthetic approved report supplement\n%%EOF')});await keeper.page.getByText(/FILE-LEGACY/).first().waitFor();await keeper.page.getByRole('button',{name:'保存草稿',exact:true}).click();await keeper.page.getByText('单据已保存，请提交并由另一人审核后过账。',{exact:true}).waitFor();await keeper.page.getByRole('button',{name:'提交',exact:true}).first().click();await keeper.page.getByText('已提交审核。',{exact:true}).waitFor();
  activePage=reviewer.page;await reviewer.page.reload({waitUntil:'domcontentloaded'});await reviewer.page.getByRole('button',{name:'审核',exact:true}).first().click();await reviewer.page.getByText('已审核。',{exact:true}).waitFor();
  activePage=poster.page;await poster.page.reload({waitUntil:'domcontentloaded'});await poster.page.getByRole('button',{name:'过账',exact:true}).first().click();await poster.page.getByText('已原子过账。',{exact:true}).waitFor();await poster.page.getByRole('button',{name:'原单与事件',exact:true}).first().click();await poster.page.getByRole('heading',{name:'日报原值与批准更正',exact:true}).waitFor();
  const facts=await poster.page.evaluate(async()=>{const r=await fetch('/api/v3/farm/flock-lifecycle/reports',{headers:{Authorization:'Bearer '+sessionStorage.getItem('phoenix_token')}});return (await r.json()).data;});if(facts.length!==1||facts[0].eggs_produced!==55||facts[0].feed_consumed!==null||facts[0].water_consumed!==null||facts[0].log_date!=='2026-11-11')throw Error('Report supplement or unknown consumption changed incorrectly');
  await poster.page.screenshot({path:out+'/mobile-report-supplement.png',fullPage:true});evidence.push({case:'Independent approved report supplement preserves original occupancy, business day and unknown feed/water',result:'passed'});
  const admin=await actor('admin');await admin.page.goto(base+'/breeding/flock');await admin.page.getByRole('button',{name:'编辑鸡群 FA',exact:true}).click();await admin.page.getByLabel('计划淘汰日期',{exact:true}).fill('2027-05-30');await admin.page.getByRole('button',{name:'保存修改',exact:true}).click();await admin.page.getByText('更新成功',{exact:true}).first().waitFor();await admin.page.reload({waitUntil:'domcontentloaded'});await admin.page.getByRole('button',{name:'编辑鸡群 FA',exact:true}).click();if(await admin.page.getByLabel('计划淘汰日期',{exact:true}).inputValue()!=='2027-05-30')throw Error('Planned calendar date shifted after reload');await admin.page.screenshot({path:out+'/pc-planned-date.png',fullPage:true});evidence.push({case:'Flock planned date edit and reload retains exact YYYY-MM-DD in Singapore browser',result:'passed'});
  await admin.context.close();
  await Promise.all([keeper.context.close(),reviewer.context.close(),poster.context.close(),denied.context.close()]);
 }catch(e){if(activePage){await activePage.screenshot({path:out+'/failure.png',fullPage:true});console.error('Failure page:',activePage.url(),(await activePage.locator('body').innerText()).slice(0,1800));}throw e;}finally{writeFileSync(out+'/receipt.json',JSON.stringify({cases:evidence,complete:evidence.length===7},null,2));await browser.close();}
 console.log('Browser PC/mobile cases passed:',evidence.length);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
