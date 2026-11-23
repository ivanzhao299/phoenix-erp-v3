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
    let state='ACTIVE',held,hold=false,quota='verified',am=6,pm=10,rawUsed=0,showReceipt=false;
    const reports=[{id:21,shift:'AM',grades:{GRADE_1:6}},{id:22,shift:'PM',grades:{GRADE_1:10}},
      {id:23,shift:'PM',grades:{GRADE_1:4}}];
    await page.route(stem+'/context?**', async route=>{
      const house=new URL(route.request().url()).searchParams.get('houseCode');
      if (house==='HOUSE-A2') return route.fulfill({status:403,json:{message:'Fixture restricted'}});
      if(hold){hold=false;await new Promise(done=>{held=done;});}
      await route.fulfill({json:{state,firstProductionDate:'2026-11-18'}});
    });
    const receipt={totalInbound:6,postingDate:'2026-11-18'};
    const posted={id:'prior-inbound',document_no:'ORIGINAL-POSTED',state:'POSTED',kind:'INBOUND',version:3,created_by:'1',
      handover_ref:'ORIGINAL-SIGNED',company_code:'COMP-A',house_code:'HOUSE-A',production_date:'2026-11-18',
      expected_posting_date:'2026-11-18',intent_key:'fixture-intent',submit_key:'fixture-submit',content_hash:'fixture-hash',
      payload:{warehouseCode:'WH-A',locationCode:'LOC-A',items:[{gradeCode:'GRADE_1',specCode:'LOOSE',quantity:6,allocations:[{dailyLogId:21,quantity:6}]}]},receipt};
    await page.route(stem+'?**', route=>route.fulfill({json:showReceipt?[posted]:[]}));
    await page.route(stem+'/prior-inbound', route=>route.fulfill({json:posted}));
    await page.route(stem+'/prior-inbound/post', route=>{
      expect(route.request().postDataJSON()).toEqual({submitKey:'fixture-submit',contentHash:'fixture-hash'});
      return route.fulfill({json:receipt});
    });
    await page.route(stem+'/handovers?**', route=>route.fulfill({json:[{
      id:'prior-handover',state:'CONFIRMED',handover_ref:'ORIGINAL-SIGNED',created_by:'1',confirmed_by:'3',
      payload:{warehouseCode:'WH-A',sources:[{id:'prior-segment',dailyLogId:21,gradeCode:'GRADE_1',shift:'AM',quantity:6}]}
    }]}));
    await page.route('**/raw-collection-receipts/sources?**', route=>route.fulfill({json:[{id:'raw-option',batch_code:'RAW-T12-SCAN',received_qty:'10'}]}));
    await page.route(stem+'/balance?**', route=>{
      if(quota==='failed')return route.fulfill({status:409,json:{code:'PRODUCTION_SOURCE_QUOTA_REVIEW_REQUIRED',message:'Fixture allowance needs review'}});
      const sourceBalances=[
        {dailyLogId:21,shift:'AM',productionDate:'2026-11-18',gradeCode:'GRADE_1',confirmedQty:6,ordinaryNet:6-am,rawUsedQty:0,remaining:am},
        {dailyLogId:22,shift:'PM',productionDate:'2026-11-18',gradeCode:'GRADE_1',confirmedQty:10,ordinaryNet:10-pm-rawUsed,rawUsedQty:rawUsed,remaining:pm},
        {dailyLogId:23,shift:'PM',productionDate:'2026-11-18',gradeCode:'GRADE_1',confirmedQty:4,ordinaryNet:null,rawUsedQty:null,remaining:null}
      ];
      return route.fulfill({json:{scopeState:state,stockBasisVersion:2,
        grades:{T12:{reported:0,posted:0,remaining:0},GRADE_1:{reported:20,posted:16-am-pm,remaining:am+pm}},
        stockByGrade:{T12:{attributableQty:null,warehouseQty:7,mixedBatchCount:1}},reports,
        ...(quota==='legacy'?{}:{sourceBalances})}});
    });
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
    const capacity=page.getByRole('region',{name:'班次日报可交额度',exact:true});
    const capRow=id=>capacity.getByRole('row').filter({hasText:new RegExp('#'+id+'(?![0-9])')});
    const source=page.getByLabel('实际日报来源',{exact:true});
    const quantity=page.getByLabel('本次枚数',{exact:true});
    const register=page.getByRole('button',{name:'登记实物交接',exact:true});
    const refresh=page.getByRole('button',{name:'刷新',exact:true}).first();
    await expect(capRow(21)).toContainText('2026-11-18');
    await expect(capRow(21)).toContainText('可交枚数 6');
    await expect(capRow(22)).toContainText('可交枚数 10');
    await expect(capRow(23)).toContainText('待核');
    await add.click();
    await page.getByLabel('档位',{exact:true}).selectOption('GRADE_1');
    await expect(source.locator('option[value="23"]')).toHaveAttribute('disabled','');
    await source.selectOption('21');
    await quantity.fill('7');await expect(register).toBeDisabled();
    await quantity.fill('6');await expect(register).toBeEnabled();
    await add.click();
    await page.getByLabel('档位',{exact:true}).last().selectOption('GRADE_1');
    await source.last().selectOption('21');
    await quantity.last().fill('1');
    await expect(register).toBeDisabled();
    await page.getByRole('button',{name:'移除',exact:true}).last().click();
    am=0;await refresh.click();
    await expect(capRow(21)).toContainText('额度已用尽');
    await expect(source.locator('option[value="21"]')).toHaveAttribute('disabled','');
    await expect(source).toHaveValue('21');
    await expect(register).toBeDisabled();
    await source.selectOption('22');await quantity.fill('10');
    await page.getByLabel('原始采集原行（包装路径）',{exact:true}).selectOption('raw-option');
    await expect(register).toBeEnabled();
    await expect(page.getByRole('button',{name:'保存或找回本意图草稿',exact:true})).toBeDisabled();
    pm=0;rawUsed=10;await refresh.click();
    await expect(capRow(22)).toContainText('额度已用尽');
    await expect(capRow(22).getByRole('cell').nth(5)).toHaveText('10');
    await expect(source.locator('option[value="22"]')).toHaveAttribute('disabled','');
    await expect(register).toBeDisabled();await expect(add).toBeDisabled();
    quota='legacy';await refresh.click();
    await expect(capacity).toContainText('班次额度待核');
    await expect(capRow(21)).toContainText('待核');
    await expect(source).toBeDisabled();await expect(register).toBeDisabled();
    quota='failed';showReceipt=true;await refresh.click();
    await expect(capRow(21)).toHaveCount(0);
    await expect(capacity).toContainText('班次额度待核');
    await expect(page.locator('#handover').getByText(/ORIGINAL-SIGNED/)).toBeVisible();
    await expect(source).toBeDisabled();await expect(register).toBeDisabled();
    await page.getByRole('button',{name:'查看原单',exact:true}).click();
    const recovered=page.waitForResponse(response=>response.url().endsWith('/prior-inbound/post'));
    await page.getByRole('button',{name:'找回原过账回执',exact:true}).click();
    expect(await (await recovered).json()).toEqual(receipt);
    await expect(date).toBeEnabled();
    quota='verified';am=6;pm=10;rawUsed=0;showReceipt=false;
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
(async()=>{const browser=await chromium.launch();try{for(const mobile of [false,true])await scenario(browser,mobile);console.log('T12 PC and 390px mobile range, shift quotas, RAW and account isolation passed');}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
