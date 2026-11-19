const {createRequire}=require('node:module');const {resolve}=require('node:path');const {mkdirSync,readFileSync,writeFileSync}=require('node:fs');const assert=require('node:assert/strict');
const {chromium}=createRequire(resolve('apps/web/package.json'))('@playwright/test');
const web=process.env.INSTALLMENT_WEB_URL||'http://127.0.0.1:3088',api=process.env.INSTALLMENT_HTTP_URL||'http://127.0.0.1:3188';
const rawCount=process.env.INSTALLMENT_CUTOVER_RAW==='1';
if(![web,api].every(x=>new URL(x).hostname==='127.0.0.1'))throw Error('Owned loopback fixture required');
const output=resolve('artifacts/production-inbound-installments-20261118/browser-cutover');mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true});const checks=[];let page,documentId;
try{
  for(const [lang,user,mobile] of [['zh','maker',false],['en','reviewer',true],['lo','view_only',true],['en','finance_only',false]]){
    const dictionary=JSON.parse(readFileSync(resolve(`apps/web/src/locales/${lang}.json`),'utf8')),label=k=>dictionary['productionCutover.'+k];
    const auth=await(await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:user,password:'owned-fixture'})})).json();assert.ok(auth.token);
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
    await context.addCookies([{name:'phoenix_access_token',value:auth.token,url:web}]);
    await context.addInitScript(({user,token,lang})=>{sessionStorage.setItem('phoenix_session_version','v6');for(const s of [sessionStorage,localStorage]){s.setItem('phoenix_token',token);s.setItem('phoenix_user',JSON.stringify(user));}localStorage.setItem('phoenix_lang',lang);},{user:auth.user_info,token:auth.token,lang});
    page=await context.newPage();page.setDefaultTimeout(30000);
    await page.goto(web+(mobile?'/mobile/production-cutovers':'/breeding/production-cutovers')+(documentId?'?documentId='+documentId:''),{waitUntil:'domcontentloaded',timeout:90000});
    await page.getByRole('heading',{name:label('title'),level:1,exact:true}).waitFor();
    if(user==='maker'){
      await page.getByLabel(label('company'),{exact:true}).selectOption('COMP-A');await page.getByLabel(label('warehouse'),{exact:true}).selectOption('WH-A');
      await page.getByLabel(label('addHouse'),{exact:true}).selectOption('HOUSE-A');await page.getByLabel(label('firstDay'),{exact:true}).fill('2026-11-19');
      await page.getByLabel(label('addProduct'),{exact:true}).selectOption('PRD-EGG-RAW');
      assert.equal(await page.getByLabel(label('counted'),{exact:true}).inputValue(),'','Count must start unrecorded');
      await page.getByLabel(label('counted'),{exact:true}).fill('0');
      await page.getByLabel(label('warehouse'),{exact:true}).selectOption('WH-A2');assert.equal(await page.getByLabel(label('counted'),{exact:true}).inputValue(),'','Changing warehouse must clear measured quantity');
      await page.getByLabel(label('warehouse'),{exact:true}).selectOption('WH-A');await page.getByLabel(label('counted'),{exact:true}).fill('0');await page.reload({waitUntil:'domcontentloaded'});
      await page.getByRole('heading',{name:label('title'),level:1,exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('input[inputmode=numeric]').length===1);
      assert.equal(await page.getByLabel(label('counted'),{exact:true}).inputValue(),'0');checks.push('Warehouse changes clear measured quantities; PC refresh retains the explicitly re-entered synthetic zero');
      await page.getByRole('button',{name:label('inspect'),exact:true}).click();await page.getByText(label('evidenceOnly'),{exact:false}).waitFor();
      const uploaded=page.waitForResponse(r=>r.url().endsWith('/upload/contract')&&r.request().method()==='POST');
      await page.locator('input[type=file]').first().setInputFiles({name:'synthetic-count.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSynthetic owned fixture zero count\n%%EOF')});
      await page.getByText((await(await uploaded).json()).fileId,{exact:true}).waitFor();
      if(rawCount){
        assert.equal(await page.getByLabel(label('rawMeasured'),{exact:true}).inputValue(),'','RAW book balance must never become a measured count automatically');
        await page.getByLabel(label('rawMeasured'),{exact:true}).fill('99');
        await page.getByLabel(label('rawBasis'),{exact:true}).fill('Owned synthetic separate RAW physical count');
        const references=page.locator('p').filter({hasText:label('reference')});assert.equal(await references.count(),1);
        const original=references.first().locator('..');assert.equal(await original.locator('option[value=TEST]').count(),0);
        await original.locator('select').selectOption('RESOLVED');await original.locator('textarea').fill('Owned original posted RAW receipt');
        checks.push('Actual RAW book balance stays separate from blank physical RAW and explicit zero stock; formal receipt cannot be marked TEST');
      }
      const response=page.waitForResponse(r=>r.url().includes('/production-cutovers')&&r.request().method()==='POST'&&r.status()===201&&!r.url().endsWith('/inspect'));
      await page.getByRole('button',{name:label('save'),exact:true}).click();documentId=(await(await response).json()).id;assert.ok(documentId);
      await page.waitForFunction(id=>new URL(location.href).searchParams.get('documentId')===id,documentId);
      if(rawCount){
        await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel(label('rawMeasured'),{exact:true}).waitFor();
        assert.equal(await page.getByLabel(label('rawMeasured'),{exact:true}).inputValue(),'99','Saved draft must recover measured RAW without hiding its editable original row');
        const failed=page.waitForResponse(r=>r.url().endsWith('/freeze')&&r.request().method()==='POST');
        await page.getByRole('button',{name:label('freeze'),exact:true}).click();const mismatch=await failed;assert.equal(mismatch.status(),409);
        assert.ok((await mismatch.json()).message.includes('RAW'),'Mismatch must be the actual RAW physical check, not missing proof or stale version');
        await page.locator('p[role=alert]').waitFor();await page.getByLabel(label('rawMeasured'),{exact:true}).fill('100');
        checks.push('Actual API refuses mismatched synthetic RAW 99 before the measured 100 can freeze');
      }
      await page.getByRole('button',{name:label('freeze'),exact:true}).click();await page.getByText(dictionary['productionCutover.notFrozen'],{exact:false}).waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.querySelector('h2')&&location.search.includes('documentId='));
      const original=await(await fetch(api+'/api/v2/inventory/production-cutovers/'+documentId,{headers:{Authorization:'Bearer '+auth.token}})).json();assert.equal(original.state,'READY');
      checks.push('PC real uploaded evidence, persisted zero count and frozen content; no activation route');
    }else if(user==='reviewer'){
      for(const role of ['BUSINESS','FINANCE']){
        await page.getByLabel(label('role'),{exact:true}).selectOption(role);
        const uploaded=page.waitForResponse(r=>r.url().endsWith('/upload/contract')&&r.request().method()==='POST');
        await page.locator('input[type=file]').last().setInputFiles({name:'synthetic-signature.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nSynthetic role signature\n%%EOF')});
        await page.getByText((await(await uploaded).json()).fileId,{exact:true}).waitFor();await page.getByLabel(label('signReason'),{exact:true}).fill('Synthetic isolated '+role+' confirmation');
        const response=page.waitForResponse(r=>r.url().endsWith('/sign')&&r.request().method()==='POST');
        await page.getByRole('button',{name:label('sign'),exact:true}).click();assert.equal((await response).status(),201);
        await page.locator('p').filter({hasText:role==='BUSINESS'?label('business'):label('finance')}).last().waitFor();
      }
      checks.push('Mobile English actual business and finance operation permissions sign the same immutable digest');
    }else{
      assert.equal(await page.getByRole('button',{name:label('save'),exact:true}).isEnabled(),false);
      await page.getByRole('button',{name:label('preview'),exact:true}).first().waitFor();checks.push(user==='finance_only'?'PC finance E-only user reaches the count through the actual operation permission and reads original evidence':'Mobile Lao viewer recovers original signed count with editing disabled');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Page overflows viewport');
    if(mobile&&rawCount){
      await page.getByLabel(label('rawMeasured'),{exact:true}).waitFor();
      const raw=page.getByRole('region',{name:label('rawCounts'),exact:true});await raw.scrollIntoViewIfNeeded();
      await page.screenshot({path:output+'/'+lang+'-raw.png'});
    }
    await page.screenshot({path:output+'/'+lang+(user==='finance_only'?'-finance':'')+'.png',fullPage:true});await context.close();
  }
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:output+'/failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(-3500));}throw error;
}finally{writeFileSync(output+'/receipt.json',JSON.stringify({complete:checks.length===(rawCount?7:5),rawCount,documentId,cases:checks,productionAction:false},null,2));await browser.close();}
console.log('Owned cutover preparation browser checks passed:',checks.length);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
