const {createRequire}=require('node:module');const {resolve}=require('node:path');const {mkdirSync,writeFileSync,readFileSync}=require('node:fs');const assert=require('node:assert/strict');
const {chromium}=createRequire(resolve('apps/web/package.json'))('@playwright/test');
const base=process.env.INSTALLMENT_WEB_URL||'http://127.0.0.1:3088',api=process.env.INSTALLMENT_HTTP_URL||'http://127.0.0.1:3188';
if(![base,api].every(x=>new URL(x).hostname==='127.0.0.1'))throw Error('Owned loopback fixture required');
const out=resolve('artifacts/production-inbound-installments-20261118/browser-raw');mkdirSync(out,{recursive:true});
const dict=Object.fromEntries(['zh','en','lo'].map(lang=>[lang,JSON.parse(readFileSync(`apps/web/src/locales/${lang}.json`))]));
(async()=>{const browser=await chromium.launch({headless:true});let active;const checks=[],contexts=[];
try{
 async function actor(username,lang,mobile=false){const r=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'owned-fixture'})}),auth=await r.json();assert.ok(auth.token);
  const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});contexts.push(c);
  await c.addCookies([{name:'phoenix_access_token',value:auth.token,url:base}]);await c.addInitScript(({user,token,lang})=>{
   sessionStorage.setItem('phoenix_session_version','v6');for(const storage of [sessionStorage,localStorage]){storage.setItem('phoenix_token',token);storage.setItem('phoenix_user',JSON.stringify(user));}localStorage.setItem('phoenix_lang',lang);
  },{user:auth.user_info,token:auth.token,lang});const page=await c.newPage();active=page;page.setDefaultTimeout(30000);
  await page.goto(base+(mobile?'/mobile/production-inbound':'/breeding/production-inbound'),{waitUntil:'domcontentloaded',timeout:90000});
  const t=(key,fallback)=>dict[lang][key]||fallback;await page.getByRole('heading',{name:t('productionInstallments.title'),exact:true,level:1}).waitFor();return {page,t,lang};
 }
 const button=(a,key,fallback)=>a.page.getByRole('button',{name:a.t(key,fallback),exact:true});
 async function choose(a){active=a.page;await a.page.getByLabel(a.t('productionInstallments.house'),{exact:true}).selectOption('HOUSE-A');
  await a.page.getByLabel(a.t('productionInstallments.productionDate'),{exact:true}).fill('2026-11-18');await a.page.getByLabel(a.t('productionInstallments.warehouse'),{exact:true}).selectOption('WH-A');}
 const panel=a=>a.page.getByRole('region',{name:a.t('productionRaw.title'),exact:true});
 const maker=await actor('maker','zh'),receiver=await actor('receiver','en',true);await choose(maker);
 await maker.page.getByLabel(maker.t('productionRaw.source'),{exact:true}).selectOption('1');
 const ref=`RAW-BROWSER-${Date.now()}`;await maker.page.getByLabel(maker.t('productionInstallments.handoverRef'),{exact:true}).fill(ref);
 await button(maker,'productionInstallments.addLine').click();await maker.page.getByLabel(maker.t('productionInstallments.grade'),{exact:true}).selectOption('GRADE_1');
 await maker.page.getByLabel(maker.t('productionInstallments.quantity'),{exact:true}).fill('100');await maker.page.getByLabel(maker.t('productionInstallments.source'),{exact:true}).selectOption({index:1});
 await maker.page.locator('input[type=file]').first().setInputFiles({name:'raw-evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nOwned RAW browser evidence\n%%EOF')});await maker.page.getByText(/FILE-LEGACY/).first().waitFor();
 await maker.page.reload({waitUntil:'domcontentloaded'});await maker.page.getByLabel(maker.t('productionRaw.source'),{exact:true}).locator('option[value="1"]').waitFor({state:'attached'});assert.equal(await maker.page.getByLabel(maker.t('productionRaw.source'),{exact:true}).inputValue(),'1');checks.push('Chinese PC preserves the actual collection selection and physical draft on refresh');
 await button(maker,'productionInstallments.registerPhysical').click();await maker.page.getByText(maker.t('productionInstallments.receiverNeeded'),{exact:true}).waitFor();
 await choose(receiver);const handover=receiver.page.locator('article').filter({hasText:ref});await handover.getByText(/SYNTHETIC-HTTP-RAW/).waitFor();await handover.getByRole('button',{name:receiver.t('productionInstallments.receive'),exact:true}).click();
 await receiver.page.getByText(receiver.t('productionInstallments.parties'),{exact:false}).first().waitFor();await receiver.page.screenshot({path:out+'/en-mobile-receiver.png',fullPage:true});checks.push('English mobile receiver sees the exact original row and shift before signing');
 active=maker.page;await button(maker,'common.refresh','刷新').first().click();await panel(maker).getByRole('button',{name:maker.t('productionRaw.create'),exact:true}).click();
 await panel(maker).getByRole('button',{name:maker.t('productionRaw.ready'),exact:true}).click();await panel(maker).getByRole('button',{name:maker.t('productionRaw.approve'),exact:true}).waitFor();
 assert.equal(await panel(maker).getByRole('button',{name:maker.t('productionRaw.approve'),exact:true}).isEnabled(),false);checks.push('Maker can freeze but cannot self-approve the collection');
 const reviewer=await actor('reviewer','lo',true);await choose(reviewer);await panel(reviewer).getByRole('button',{name:reviewer.t('common.view','查看'),exact:true}).first().click();
 await panel(reviewer).getByRole('button',{name:reviewer.t('productionRaw.approve'),exact:true}).click();await panel(reviewer).getByRole('button',{name:reviewer.t('productionRaw.post'),exact:true}).waitFor();
 assert.ok(await reviewer.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Lao mobile overflow');await reviewer.page.screenshot({path:out+'/lo-mobile-approved.png',fullPage:true});checks.push('Lao mobile independent reviewer checks the frozen source segments and approves');
 active=maker.page;await button(maker,'common.refresh','刷新').first().click();await panel(maker).getByRole('button',{name:maker.t('common.view','查看'),exact:true}).first().click();
 let dropped=false;await maker.page.route('**/raw-collection-receipts/*/post',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await panel(maker).getByRole('button',{name:maker.t('productionRaw.post'),exact:true}).click();await maker.page.getByRole('alert').first().waitFor();
 await panel(maker).getByRole('button',{name:maker.t('common.view','查看'),exact:true}).first().click();await panel(maker).getByRole('button',{name:maker.t('productionRaw.replay'),exact:true}).waitFor();
 const replay=maker.page.waitForResponse(r=>/raw-collection-receipts\/[^/]+\/post$/.test(r.url()));await panel(maker).getByRole('button',{name:maker.t('productionRaw.replay'),exact:true}).click();const receipt=await(await replay).json();
 assert.equal(receipt.quantity,100);assert.equal(receipt.inventoryCreated,false);assert.ok(dropped);await maker.page.screenshot({path:out+'/zh-pc-posted.png',fullPage:true});checks.push('Lost commit response recovers the original 100-unit receipt and creates no inventory');
 const viewer=await actor('view_only','en',true);await choose(viewer);await panel(viewer).getByRole('button',{name:viewer.t('common.view','查看'),exact:true}).first().click();
 const recovered=viewer.page.waitForResponse(r=>/raw-collection-receipts\/[^/]+\/post$/.test(r.url()));await panel(viewer).getByRole('button',{name:viewer.t('productionRaw.replay'),exact:true}).click();assert.deepEqual(await(await recovered).json(),receipt);
 assert.ok(await viewer.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'English mobile overflow');checks.push('Fresh V-only mobile session recovers the immutable original receipt');
}catch(e){if(active){await active.screenshot({path:out+'/failure.png',fullPage:true});console.error((await active.locator('body').innerText()).slice(-5500));}throw e;}
finally{writeFileSync(out+'/receipt.json',JSON.stringify({complete:checks.length===6,checks},null,2));await Promise.all(contexts.map(c=>c.close()));await browser.close();}
console.log('Owned RAW browser scenarios passed:',checks.length);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
