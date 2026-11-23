const {createRequire}=require('node:module');const {resolve}=require('node:path');const {mkdirSync,writeFileSync}=require('node:fs');const assert=require('node:assert/strict');
const {chromium}=createRequire(resolve('apps/web/package.json'))('@playwright/test');
const base=process.env.INSTALLMENT_WEB_URL||'http://127.0.0.1:3088',api=process.env.INSTALLMENT_HTTP_URL||'http://127.0.0.1:3188';
if(![base,api].every(x=>new URL(x).hostname==='127.0.0.1'))throw Error('Owned loopback browser fixture required');
const out=resolve('artifacts/production-inbound-installments-20261118/browser');mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true});const checks=[];let active;
try{
 async function actor(username,mobile=false){const r=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'owned-fixture'})});
  const auth=await r.json();if(!auth.token)throw Error('Owned fixture login failed');const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
  await context.addCookies([{name:'phoenix_access_token',value:auth.token,url:base}]);
  await context.addInitScript(({user,token})=>{sessionStorage.setItem('phoenix_session_version','v6');for(const storage of [sessionStorage,localStorage]){storage.setItem('phoenix_token',token);storage.setItem('phoenix_user',JSON.stringify(user));}localStorage.setItem('phoenix_lang','zh');}, {user:auth.user_info,token:auth.token});
  const page=await context.newPage();active=page;page.setDefaultTimeout(30000);await page.goto(base+(mobile?'/mobile/production-inbound':'/breeding/production-inbound'),{waitUntil:'domcontentloaded',timeout:90000});
  await page.getByRole('heading',{name:'正式分次生产入库',exact:true,level:1}).waitFor();return {context,page,auth};
 }
 async function choose(page){active=page;await page.getByLabel('鸡舍',{exact:true}).selectOption('HOUSE-A');await page.getByLabel('生产日期',{exact:true}).fill('2026-11-18');
  await page.getByLabel('交库仓库',{exact:true}).selectOption('WH-A');await page.getByLabel('库位',{exact:true}).selectOption('LOC-A');}
 async function fill(page,ref,qty){await page.getByLabel('实物交接编号',{exact:true}).fill(ref);await page.getByRole('button',{name:'增加档位或规格',exact:true}).click();
  await page.getByLabel('档位',{exact:true}).selectOption('GRADE_1');await page.getByLabel('规格',{exact:true}).selectOption('LOOSE');await page.getByLabel('本次枚数',{exact:true}).fill(String(qty));await page.getByLabel('实际日报来源',{exact:true}).selectOption({index:1});
  await page.locator('input[type=file]').first().setInputFiles({name:'physical-evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nOwned browser handover evidence\n%%EOF')});
  await page.getByText(/FILE-LEGACY/).first().waitFor();}
 const maker=await actor('maker');const receiver=await actor('receiver',true);const handover=`BROWSER-${Date.now()}`;
 await choose(maker.page);await fill(maker.page,handover,100);
 await maker.page.reload({waitUntil:'domcontentloaded'});assert.equal(await maker.page.getByLabel('实物交接编号',{exact:true}).inputValue(),handover);assert.equal(await maker.page.getByLabel('本次枚数',{exact:true}).inputValue(),'100');
 checks.push('PC draft identity, source quantity and uploaded evidence survive refresh');
 let registrations=0;maker.page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.endsWith('/production-inbound-documents/handovers'))registrations++;});
 await maker.page.getByRole('button',{name:'登记实物交接',exact:true}).click({trial:true});
 await maker.page.getByRole('button',{name:'登记实物交接',exact:true}).evaluate(button=>{button.click();button.click();});await maker.page.getByText('交接已登记，请由另一名实际接收人核对分段并签认。',{exact:true}).waitFor();
 assert.equal(registrations,1,'Double tap must register one physical handover');
 await choose(receiver.page);await receiver.page.getByRole('button',{name:'核对并实名签收',exact:true}).click();
 await receiver.page.getByText('已双方签认',{exact:false}).first().waitFor();
 assert.ok(await receiver.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1&&document.querySelector('main').getBoundingClientRect().width>=window.innerWidth-32),'Mobile workbench is clipped or squeezed');
 await receiver.page.screenshot({path:out+'/mobile-received.png',fullPage:true});checks.push('Real receiver E-only user signs physical source segments on 390px mobile');
 active=maker.page;await maker.page.getByRole('button',{name:'刷新',exact:true}).first().click();await maker.page.getByRole('button',{name:'保存或找回本意图草稿',exact:true}).click();
 await maker.page.getByRole('button',{name:'核对并冻结本单',exact:true}).waitFor();await maker.page.getByRole('button',{name:'核对并冻结本单',exact:true}).click();
 await maker.page.getByRole('button',{name:'过账本单',exact:true}).waitFor();
 let dropped=false;await maker.page.route('**/production-inbound-documents/*/post',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
 const posted=maker.page.waitForResponse(r=>r.url().endsWith('/post')&&r.request().method()==='POST');await maker.page.getByRole('button',{name:'过账本单',exact:true}).click();const receipt=await (await posted).json();assert.equal(receipt.totalInbound,100);assert.ok(dropped);checks.push('Committed posting response lost once: original key retries to the same receipt');
 await maker.page.getByRole('button',{name:'找回原过账回执',exact:true}).waitFor();
 await maker.page.screenshot({path:out+'/pc-posted.png',fullPage:true});checks.push('C/V/E-only maker selects controlled locations, freezes and posts one actual signed delivery');
 const viewer=await actor('view_only',true);await choose(viewer.page);await viewer.page.getByLabel('实物交接编号',{exact:true}).fill(handover);
 await viewer.page.getByRole('button',{name:'按实物交接号找回（跨设备）',exact:true}).click();
 await viewer.page.getByRole('button',{name:'查看原单',exact:true}).first().click();await viewer.page.getByRole('button',{name:'找回原过账回执',exact:true}).waitFor();
 const retry=viewer.page.waitForResponse(r=>r.url().endsWith('/post')&&r.request().method()==='POST');await viewer.page.getByRole('button',{name:'找回原过账回执',exact:true}).click();assert.deepEqual(await (await retry).json(),receipt);
 await viewer.page.screenshot({path:out+'/mobile-recovered.png',fullPage:true});checks.push('Fresh device with V-only access recovers by physical handover reference and receives the immutable original receipt');
 await maker.page.getByRole('button',{name:'新交接意图',exact:true}).click();await fill(maker.page,`${handover}-NEXT`,900);
 await maker.page.getByRole('button',{name:'登记实物交接',exact:true}).click();await maker.page.getByText('交接已登记，请由另一名实际接收人核对分段并签认。',{exact:true}).waitFor();
 await receiver.page.getByRole('button',{name:'刷新',exact:true}).first().click();await receiver.page.getByRole('button',{name:'核对并实名签收',exact:true}).click();await receiver.page.getByText('已双方签认',{exact:false}).first().waitFor();
 await maker.page.getByRole('button',{name:'刷新',exact:true}).first().click();await maker.page.getByRole('button',{name:'保存或找回本意图草稿',exact:true}).click();await maker.page.getByRole('button',{name:'核对并冻结本单',exact:true}).click();
 await maker.page.getByRole('button',{name:'过账本单',exact:true}).waitFor();const second=maker.page.waitForResponse(r=>r.url().endsWith('/post'));await maker.page.getByRole('button',{name:'过账本单',exact:true}).click();assert.equal((await (await second).json()).totalInbound,900);
 await maker.page.getByRole('button',{name:'找回原过账回执',exact:true}).waitFor();checks.push('Same-day same-grade second installment of 900 posts independently after the first 100');
 await maker.page.screenshot({path:out+'/pc-two-installments.png',fullPage:true});
 await Promise.all([maker.context.close(),receiver.context.close(),viewer.context.close()]);
}catch(e){if(active){await active.screenshot({path:out+'/failure.png',fullPage:true});console.error('Browser failure:',active.url(),(await active.locator('body').innerText()).slice(-5000));}throw e;
}finally{writeFileSync(out+'/receipt.json',JSON.stringify({complete:checks.length===6,cases:checks},null,2));await browser.close();}
console.log('Owned browser scenarios passed:',checks.length);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
