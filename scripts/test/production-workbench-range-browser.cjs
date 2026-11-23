// Run against the owned installment HTTP fixture and an isolated local Web process.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { chromium, expect } = createRequire(resolve('apps/web/package.json'))('@playwright/test');
const base = process.env.INSTALLMENT_WEB_URL;
const api = process.env.INSTALLMENT_HTTP_URL;
if (![base, api].every(url => url && new URL(url).hostname === '127.0.0.1')) throw Error('Owned loopback URLs required');
async function login(username) {
  const response = await fetch(api + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password:'owned-fixture'}) });
  const auth = await response.json();
  if (!auth.token) throw Error('Fixture login failed');
  return { user:auth.user_info, token:auth.token };
}
async function scenario(browser, mobile) {
  const context = await browser.newContext({viewport:{width:mobile?390:1360,height:900},isMobile:mobile});
  try {
    const auth = await login('maker');
    await context.addCookies([{name:'phoenix_access_token',value:auth.token,url:base}]);
    const page = await context.newPage();
    await page.goto(base+'/favicon.ico');
    function install({user,token}) {
      sessionStorage.setItem('phoenix_session_version','v6');
      for(const storage of [localStorage,sessionStorage]) {
        storage.setItem('phoenix_token',token);storage.setItem('phoenix_user',JSON.stringify(user));
      }
      localStorage.setItem('phoenix_lang','zh');
    }
    await page.evaluate(install,auth);
    const stem='**/production-inbound-documents';
    let state='ACTIVE',held,hold=false;
    await page.route(stem+'/context?**', async route=>{
      const house=new URL(route.request().url()).searchParams.get('houseCode');
      if (house==='HOUSE-A2') return route.fulfill({status:403,json:{message:'Fixture restricted'}});
      if(hold){hold=false;await new Promise(done=>{held=done;});}
      await route.fulfill({json:{state,firstProductionDate:'2026-11-18'}});
    });
    await page.route(stem+'?**', route=>route.fulfill({json:[]}));
    await page.route(stem+'/handovers?**', route=>route.fulfill({json:[]}));
    await page.route(stem+'/balance?**', route=>route.fulfill({json:{scopeState:state,stockBasisVersion:2,grades:{T12:{reported:0,posted:0,remaining:0}},stockByGrade:{T12:{attributableQty:null,warehouseQty:7,mixedBatchCount:1}},reports:[]}}));
    await page.route('**/raw-collection-receipts/fixture-raw', route=>route.fulfill({json:{state:'POSTED',payload:{source:{batch_code:'ORIGIN-T12'}},receipt:{quantity:7,postingDate:'2026-11-18'}}}));
    let queriedTrace;
    await page.route(stem+'/stock-batches?**', route=>{
      queriedTrace=new URL(route.request().url()).searchParams;
      return route.fulfill({json:{items:[{batchNo:'TRACE-T12',warehouseCode:'WH-A',locationCode:'LOC-A',skuCode:'TEST-EGG',unit:'EA',status:'AVAILABLE',batchQty:7,availableQty:7,attributableQty:null,attribution:'MIXED',sources:[{kind:'RAW',documentId:'fixture-raw',documentNo:'RAW-T12',handoverRef:'HAND-T12',dailyLogId:'21',occupancyId:'OCC-T12',houseCode:'HOUSE-A',gradeCode:'T12',productionDate:'2026-11-18',flockNo:'FLOCK-T12'}]}],nextCursor:null}});
    });
    await page.goto(base+(mobile?'/mobile':'/breeding')+'/production-inbound');
    const house=page.getByLabel('鸡舍',{exact:true}),date=page.getByLabel('生产日期',{exact:true}),warehouse=page.getByLabel('交库仓库',{exact:true});
    const add=page.getByRole('button',{name:'增加档位或规格',exact:true});
    await house.selectOption('HOUSE-A');await date.fill('2026-11-18');await warehouse.selectOption('WH-A');
    await expect(add).toBeEnabled();await expect(page.locator('#history')).toContainText('此范围暂无匹配记录');
    await page.getByRole('button',{name:'T12',exact:true}).click();await expect(page.locator('#stock-trace')).toContainText('OCC-T12');
    await expect(page.locator('#stock-trace')).toContainText('混合来源');expect(queriedTrace.get('gradeCode')).toBe('T12');
    expect(queriedTrace.get('view')).toBe('source');expect(queriedTrace.get('warehouseCode')).toBe('WH-A');
    await page.getByRole('button',{name:'RAW-T12',exact:true}).click();
    await expect(page.locator('#stock-trace')).toContainText('ORIGIN-T12');
    hold=true;await date.fill('2026-11-19');await expect.poll(()=>typeof held).toBe('function');
    await house.selectOption('HOUSE-A2');await expect(page.getByText('范围尚未核实，请刷新。')).toBeVisible();held();
    await expect(add).toBeDisabled();await expect(page.getByText('TRACE-T12')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'T12',exact:true})).toHaveCount(0);
    await house.selectOption('HOUSE-A');await date.fill('2026-11-17');
    await expect(page.getByText('所选日期早于正式首日，仅可查历史记录。')).toBeVisible();await expect(add).toBeDisabled();
    state='SUSPENDED';await date.fill('2026-11-18');await warehouse.selectOption('WH-A');
    await expect(page.getByText('该范围暂停新写入，历史回执仍可查看。')).toBeVisible();await expect(add).toBeDisabled();
    const conversions=page.getByRole('region',{name:'实际分级、包装与在制品',exact:true});
    await expect(conversions).toBeVisible();
    await expect(conversions.getByRole('button',{name:'保存实际作业草稿',exact:true})).toBeDisabled();
    await page.getByLabel('实物交接编号',{exact:true}).fill('PRIVATE-MAKER-T12');
    await page.reload();await expect(page.getByLabel('实物交接编号',{exact:true})).toHaveValue('PRIVATE-MAKER-T12');
    const viewer=await login('view_only');await page.evaluate(install,viewer);
    await context.addCookies([{name:'phoenix_access_token',value:viewer.token,url:base}]);await page.reload();
    await expect(page.getByLabel('实物交接编号',{exact:true})).toHaveValue('');await expect(add).toHaveCount(0);await expect(house).toHaveValue('');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  } finally {await context.close();}
}
(async()=>{const browser=await chromium.launch();try{for(const mobile of [false,true])await scenario(browser,mobile);console.log('T12 PC and 390px mobile range, trace, account isolation passed');}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
