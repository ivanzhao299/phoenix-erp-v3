const {createRequire}=require('node:module');
const {resolve}=require('node:path');
const {mkdirSync,readFileSync,writeFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=createRequire(resolve('apps/web/package.json'))('@playwright/test');
const web=process.env.INSTALLMENT_WEB_URL||'http://127.0.0.1:3088',api=process.env.INSTALLMENT_HTTP_URL||'http://127.0.0.1:3188';
if(![web,api].every(x=>new URL(x).hostname==='127.0.0.1'))throw Error('Owned loopback fixture required');
const output=resolve('artifacts/production-inbound-installments-20261118/browser-cross-company');mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true}),checks=[];let page;
  try{
    for(const [lang,username,mobile] of [['zh','foreign',false],['en','company_b_reviewer',true],['lo','foreign',true]]){
      const dictionary=JSON.parse(readFileSync(resolve(`apps/web/src/locales/${lang}.json`),'utf8')),label=k=>dictionary['productionCutover.'+k];
      const auth=await(await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'owned-fixture'})})).json();assert.ok(auth.token);
      const headers={Authorization:'Bearer '+auth.token},endpoint=api+'/api/v2/inventory/production-cutovers';
      const documents=await(await fetch(endpoint+'?companyCode=COMP-B&warehouseCode=WH-B',{headers})).json();assert.equal(documents.length,1);
      const d=await(await fetch(endpoint+'/'+documents[0].id,{headers})).json();assert.equal(d.state,'READY');
      assert.equal(d.activationAuthorized,false);assert.equal(d.payload.openingLines.length,0);
      assert.deepEqual(d.payload.physicalTotals,[{productCode:'PRD-EGG-RAW',quantity:20}]);
      const [proof]=d.snapshot.crossCompanyProofs;assert.match(proof.batchNo,/^XFR-[a-f0-9]{32}$/);assert.equal(proof.quantity,20);
      const serialized=JSON.stringify(d);for(const privateToken of ['HOUSE-A','source_snapshot','evidence_sha256','COMP-A'])assert.ok(!serialized.includes(privateToken),'Foreign source data exposed: '+privateToken);
      const forbidden=await fetch(endpoint+'/inspect',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({companyCode:'COMP-A',warehouseCode:'WH-A',productCodes:['PRD-EGG-RAW'],houses:[{houseCode:'HOUSE-A',firstProductionDate:'2026-11-19'}]})});assert.equal(forbidden.status,403);
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
      await context.addCookies([{name:'phoenix_access_token',value:auth.token,url:web}]);
      await context.addInitScript(({user,token,lang})=>{sessionStorage.setItem('phoenix_session_version','v6');for(const s of [sessionStorage,localStorage]){s.setItem('phoenix_token',token);s.setItem('phoenix_user',JSON.stringify(user));}localStorage.setItem('phoenix_lang',lang);},{user:auth.user_info,token:auth.token,lang});
      page=await context.newPage();page.setDefaultTimeout(30000);
      await page.goto(web+(mobile?'/mobile/production-cutovers':'/breeding/production-cutovers')+'?documentId='+d.id,{waitUntil:'domcontentloaded',timeout:90000});
      await page.getByRole('heading',{name:label('title'),level:1,exact:true}).waitFor();
      const section=page.getByRole('region',{name:label('transferProofs'),exact:true});await section.waitFor();
      await section.getByText(proof.batchNo,{exact:false}).waitFor();await section.getByText(proof.transferNo,{exact:false}).waitFor();
      assert.ok((await section.innerText()).includes('20'));assert.ok(!(await page.locator('main[data-i18n-skip]').innerText()).includes('HOUSE-A'));
      assert.equal(await page.getByRole('button',{name:label('save'),exact:true}).isEnabled(),false);
      assert.equal(await page.getByLabel(label('counted'),{exact:true}).inputValue(),'20');
      await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('region',{name:label('transferProofs'),exact:true}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Page overflows viewport');
      await page.screenshot({path:output+'/'+lang+'.png',fullPage:true});
      checks.push({lang,mobile,company:'COMP-B',verifiedReceived:20,newOpening:0,refreshReadOnly:true,foreignInspectionStatus:403});await context.close();
    }
  }catch(error){if(page&&!page.isClosed())await page.screenshot({path:output+'/failure.png',fullPage:true});throw error;}
  finally{writeFileSync(output+'/receipt.json',JSON.stringify({complete:checks.length===3,cases:checks,productionAction:false},null,2));await browser.close();}
  console.log('Owned B-only cross-company browser checks passed:',checks.length);
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
