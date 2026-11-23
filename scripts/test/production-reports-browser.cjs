const {createRequire}=require('node:module');const {resolve}=require('node:path');const {mkdirSync,readFileSync,writeFileSync}=require('node:fs');const assert=require('node:assert/strict');
const {chromium}=createRequire(resolve('apps/web/package.json'))('@playwright/test');
const base=process.env.INSTALLMENT_WEB_URL||'http://127.0.0.1:3088',api=process.env.INSTALLMENT_HTTP_URL||'http://127.0.0.1:3188';
if(![base,api].every(x=>new URL(x).hostname==='127.0.0.1'))throw Error('Owned loopback browser fixture required');
const out=resolve('artifacts/production-inbound-installments-20261118/browser-reports');mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true});const checks=[];let active;
try{
  for(const [lang,shift,quantity] of [['zh','AM',100],['en','PM',200],['lo','AM',100]]){
    const dict=JSON.parse(readFileSync(resolve(`apps/web/src/locales/${lang}.json`),'utf8'));
    const label=(key,fallback)=>dict[key]??fallback;
    const login=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'farm_only',password:'owned-fixture'})});
    const auth=await login.json();assert.ok(auth.token);
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await context.addCookies([{name:'phoenix_access_token',value:auth.token,url:base}]);
    await context.addInitScript(({user,token,lang})=>{sessionStorage.setItem('phoenix_session_version','v6');for(const storage of [sessionStorage,localStorage]){storage.setItem('phoenix_token',token);storage.setItem('phoenix_user',JSON.stringify(user));}localStorage.setItem('phoenix_lang',lang);},{user:auth.user_info,token:auth.token,lang});
    const page=await context.newPage();active=page;page.setDefaultTimeout(30000);
    await page.goto(base+'/mobile/production-reports',{waitUntil:'domcontentloaded',timeout:90000});
    await page.getByRole('heading',{name:label('productionReports.title','正式分级产蛋日报'),exact:true}).waitFor();
    async function choose(){await page.getByLabel(label('productionInstallments.house','鸡舍'),{exact:true}).selectOption('HOUSE-A');await page.locator('input[type=date]').fill('2026-11-18');
      await page.getByLabel(label('productionInstallments.shift','来源班次'),{exact:true}).selectOption(shift);}
    await choose();
    const save=page.getByRole('button',{name:label('productionReports.save','确认本班次日报'),exact:true});
    if(lang!=='lo'){
      await page.getByLabel('GRADE_1',{exact:true}).waitFor();assert.ok(await save.isDisabled(),'Unrecorded grades must not become zero');
      for(const grade of ['GRADE_0','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','BROKEN'])await page.getByLabel(grade,{exact:true}).fill(grade==='GRADE_1'?String(quantity):'0');
      if(lang==='zh'){await page.reload({waitUntil:'domcontentloaded'});await choose();assert.equal(await page.getByLabel('GRADE_1',{exact:true}).inputValue(),'100');assert.equal(await page.getByLabel('DIRTY',{exact:true}).inputValue(),'0');checks.push('Mobile refresh retains explicit grade quantities and zero without creating a report');}
      let dropped=false;
      if(lang==='zh')await page.route('**/api/v3/farm/daily-logs',async route=>{if(!dropped&&route.request().method()==='POST'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
      await save.click();await page.getByText(label('productionReports.existing','该班次已有原日报，以下为原始记录；更正请走审核单。'),{exact:true}).waitFor();
      if(lang==='zh')assert.ok(dropped);
      checks.push(`${lang}: actual Farm-only user confirms complete ${shift} report of ${quantity}; original is then read only`);
    }else{await page.getByText(label('productionReports.existing',''),{exact:true}).waitFor();checks.push('lo: original AM report is recovered with translated interface');}
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile report page overflows');
    await page.screenshot({path:`${out}/mobile-${lang}.png`,fullPage:true});await context.close();
  }
  const login=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'farm_only',password:'owned-fixture'})});const auth=await login.json();
  const original=await fetch(api+'/api/v3/farm/daily-logs/production-sources?date=2026-11-18&houseCode=HOUSE-A',{headers:{Authorization:`Bearer ${auth.token}`}});
  const rows=await original.json();assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>[r.shift,r.eggs_by_grade.GRADE_1]),[['AM',100],['PM',200]]);checks.push('Two original persisted reports remain after refresh, a committed response lost once, and three device sessions');
}catch(e){if(active&&!active.isClosed()){await active.screenshot({path:out+'/failure.png',fullPage:true});console.error((await active.locator('body').innerText()).slice(-5000));}throw e;
}finally{writeFileSync(out+'/receipt.json',JSON.stringify({complete:checks.length===5,cases:checks},null,2));await browser.close();}
console.log('Owned mobile source-report browser scenarios passed:',checks.length);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
