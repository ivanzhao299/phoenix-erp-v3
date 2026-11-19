const {createRequire}=require('node:module');const {resolve}=require('node:path');const {mkdirSync,writeFileSync,readFileSync}=require('node:fs');const assert=require('node:assert/strict');
const {chromium,expect}=createRequire(resolve('apps/web/package.json'))('@playwright/test');
const {PDFDocument}=createRequire(resolve('apps/api/package.json'))('pdf-lib');
const base=process.env.INSTALLMENT_WEB_URL||'http://127.0.0.1:3088',api=process.env.INSTALLMENT_HTTP_URL||'http://127.0.0.1:3188';
if(![base,api].every(x=>new URL(x).hostname==='127.0.0.1'))throw Error('Owned loopback fixture required');
const out=resolve('artifacts/production-inbound-installments-20261118/browser-conversions');mkdirSync(out,{recursive:true});
const dict=Object.fromEntries(['zh','en','lo'].map(lang=>[lang,JSON.parse(readFileSync(`apps/web/src/locales/${lang}.json`))]));
(async()=>{const browser=await chromium.launch({headless:true});let active;const checks=[],contexts=[];let receipt;
try{
 async function actor(username,lang,mobile=false){const r=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'owned-fixture'})}),auth=await r.json();assert.ok(auth.token);
  const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});contexts.push(c);
  await c.addCookies([{name:'phoenix_access_token',value:auth.token,url:base}]);await c.addInitScript(({user,token,lang})=>{
   sessionStorage.setItem('phoenix_session_version','v6');for(const storage of [sessionStorage,localStorage]){storage.setItem('phoenix_token',token);storage.setItem('phoenix_user',JSON.stringify(user));}localStorage.setItem('phoenix_lang',lang);
  },{user:auth.user_info,token:auth.token,lang});const page=await c.newPage();active=page;page.setDefaultTimeout(30000);
  await page.goto(base+(mobile?'/mobile/production-inbound':'/breeding/production-inbound'),{waitUntil:'domcontentloaded',timeout:90000});
  const t=key=>{assert.ok(dict[lang][key],key);return dict[lang][key];};await page.getByRole('heading',{name:t('productionInstallments.title'),exact:true,level:1}).waitFor();return {page,t,lang};
 }
 async function choose(a){active=a.page;await a.page.getByLabel(a.t('productionInstallments.house'),{exact:true}).selectOption('HOUSE-A');
  await a.page.getByLabel(a.t('productionInstallments.productionDate'),{exact:true}).fill('2026-11-18');await a.page.getByLabel(a.t('productionInstallments.warehouse'),{exact:true}).selectOption('WH-A');}
 const panel=a=>a.page.getByRole('region',{name:a.t('productionConversion.title'),exact:true});
 const button=(a,key)=>panel(a).getByRole('button',{name:a.t('productionConversion.'+key),exact:true});
 const field=(a,key)=>panel(a).getByLabel(a.t('productionConversion.'+key)+(['inputQuantity','outputQuantity'].includes(key)?' 1':''),{exact:true});
 async function product(a){await field(a,'product').selectOption('PRD-EGG-RAW');await panel(a).locator('select option[value^="RAW:"]').waitFor({state:'attached'});}
 const maker=await actor('maker','zh');await choose(maker);await product(maker);const ref=`SYNTHETIC-CVT-BROWSER-${Date.now()}`;
 await field(maker,'kind').selectOption('GRADING');await field(maker,'group').fill(ref);
 await panel(maker).getByLabel(maker.t('productionConversion.source')+' 1',{exact:true}).selectOption({index:1});
 assert.equal(await field(maker,'inputQuantity').inputValue(),'');assert.equal(await field(maker,'outputQuantity').inputValue(),'');
 await button(maker,'save').click();await panel(maker).getByRole('alert').waitFor();checks.push('No quantities are invented: blank measured input and output cannot be saved');
 await field(maker,'inputQuantity').fill('100');await panel(maker).locator('label').filter({hasText:maker.t('productionConversion.outputKind')}).locator('select').selectOption('WIP');
 await panel(maker).getByLabel(maker.t('productionConversion.sku')+' 1',{exact:true}).selectOption('SKU-GRADE_1');await field(maker,'location').selectOption('LOC-A');await field(maker,'outputQuantity').fill('100');
 const pdf=await PDFDocument.create();pdf.addPage([300,200]).drawText('Synthetic owned physical measurement, 100 eggs');
 await panel(maker).locator('input[type=file]').first().setInputFiles({name:'actual-measurement.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await panel(maker).getByText(/FILE-LEGACY/).first().waitFor();
 await button(maker,'save').click();await button(maker,'freeze').waitFor({state:'visible'});await maker.page.reload({waitUntil:'domcontentloaded'});
 await panel(maker).waitFor();assert.equal(await field(maker,'group').inputValue(),ref);assert.equal(await field(maker,'inputQuantity').inputValue(),'100');await button(maker,'recoverGroup').click();
 await button(maker,'freeze').waitFor();await expect(button(maker,'freeze')).toBeEnabled();checks.push('Chinese PC preserves the actual draft and recovers its original work order after refresh');
 await button(maker,'freeze').click();await button(maker,'approve').waitFor();assert.equal(await button(maker,'approve').isEnabled(),false);
 const reviewer=await actor('reviewer','lo',true);await choose(reviewer);await product(reviewer);
 await panel(reviewer).getByRole('row').filter({hasText:ref}).getByRole('button').click();await button(reviewer,'approve').click();await button(reviewer,'post').waitFor();
 assert.ok(await reviewer.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Lao mobile overflow');await reviewer.page.screenshot({path:out+'/lo-mobile-approved.png',fullPage:true});checks.push('Lao mobile independently reviews frozen measured inputs, physical WIP and evidence');
 active=maker.page;await panel(maker).getByRole('button',{name:maker.t('common.refresh'),exact:true}).click();await panel(maker).getByRole('row').filter({hasText:ref}).getByRole('button').click();await button(maker,'post').waitFor();
 let dropped=false;await maker.page.route('**/conversions/*/post',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 await button(maker,'post').click();await button(maker,'replay').waitFor();const replay=maker.page.waitForResponse(r=>/conversions\/[^/]+\/post$/.test(r.url()));await button(maker,'replay').click();receipt=await(await replay).json();
 assert.equal(receipt.inputQuantity,100);assert.equal(receipt.outputQuantity,100);assert.equal(receipt.lossQuantity,0);assert.equal(receipt.costStatus,'PENDING_ALLOCATION');assert.equal(receipt.batches[0].outputKind,'WIP');assert.ok(dropped);
 await maker.page.screenshot({path:out+'/zh-pc-posted.png',fullPage:true});checks.push('Lost commit response recovers the original 100-unit physical WIP receipt with costs pending');
 const viewer=await actor('view_only','en',true);await choose(viewer);await field(viewer,'product').selectOption('PRD-EGG-RAW');await panel(viewer).getByRole('row').filter({hasText:ref}).getByRole('button').click();
 const original=viewer.page.waitForResponse(r=>/conversions\/[^/]+\/post$/.test(r.url()));await button(viewer,'replay').click();assert.deepEqual(await(await original).json(),receipt);
 assert.equal(await field(viewer,'inputQuantity').isEditable(),false);assert.ok(await viewer.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'English mobile overflow');await viewer.page.screenshot({path:out+'/en-mobile-original.png',fullPage:true});checks.push('Fresh English V-only mobile session reads the original immutable conversion receipt');
 await viewer.page.evaluate(()=>{const native=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.__conversionEvidenceBlob=blob;const url=native(blob);window.__conversionEvidenceBlobUrl=url;return url;};});
 const popup=viewer.page.waitForEvent('popup'),evidence=viewer.page.waitForResponse(r=>/conversions\/[^/]+\/evidence\//.test(r.url()));await button(viewer,'viewProof').click();const protectedFile=await evidence;assert.equal(protectedFile.status(),200);assert.match(protectedFile.headers()['content-type'],/application\/pdf/);const proof=await popup;
 await viewer.page.waitForFunction(()=>window.__conversionEvidenceBlob instanceof Blob);const actual=await viewer.page.evaluate(async()=>({url:window.__conversionEvidenceBlobUrl,bytes:Array.from(new Uint8Array(await window.__conversionEvidenceBlob.arrayBuffer()))}));assert.ok(actual.url.startsWith('blob:'));assert.equal((await PDFDocument.load(Buffer.from(actual.bytes))).getPageCount(),1);await proof.close();checks.push('Protected original evidence opens from an authenticated response without a public file URL');
}catch(e){if(active){await active.screenshot({path:out+'/failure.png',fullPage:true});console.error((await active.locator('body').innerText()).slice(-6500));}throw e;}
finally{writeFileSync(out+'/receipt.json',JSON.stringify({complete:checks.length===6,checks,receipt},null,2));await Promise.all(contexts.map(c=>c.close()));await browser.close();}
console.log('Owned conversion browser scenarios passed:',checks.length);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
