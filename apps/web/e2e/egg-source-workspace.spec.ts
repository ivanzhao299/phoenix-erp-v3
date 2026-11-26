import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

const base='/master-data/egg-sources';
const api='/api/product-master/egg-sources';
const id='9c524a5b-2eaf-44a8-a0c2-d34f0c35a398';
const actor='fixture-egg';
const tomorrow='2026-11-26';
const owner={houseCode:'H1',houseName:'Fixture house',companyCode:'CO',farmCode:'F1',farmName:'Fixture farm',siteCode:'SITE'};
const change={id,state:'SUBMITTED',version:2,effectiveDate:tomorrow,targetClass:'RED',createdBy:actor,createdAt:'2026-11-25T06:00:00Z',
  warehouseCode:'WH-SHARED',warehouseName:'Shared warehouse'};
const workspace={owner,businessDay:'2026-11-25',zone:'Asia/Vientiane',createBlocker:null,pending:{submitted:1,revokeRequested:0},profiles:[]};

async function fixture(page:Page,language='zh') {
  await authenticateMockPage(page,{ username:actor,role:'ROLE_EGG_CLERK',roles:['ROLE_EGG_CLERK'],permissions:['MENU_MD_EGG_SOURCE:V,E'] },language);
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url());
    const path=url.pathname;
    const reply=(data:unknown)=>route.fulfill({json:{code:200,data}});
    if (path===api+'/candidates/houses') return reply([{...owner,houseType:'LAYER',houseStatus:'ACTIVE'}]);
    if (path===api+'/workspace') return reply(workspace);
    if (path===api+'/candidates/warehouses') return reply([{code:'WH-SHARED',name:'Shared warehouse'}]);
    if (path===api+'/candidates/options') return reply({grades:[{code:'GRADE_1',name:'1号蛋'}],specs:[{code:'LOOSE',name:'散装'}]});
    if (path===api+'/flock-plans') return reply([]);
    if (path===api+'/changes') return reply({items:[change],nextCursor:null});
    if (path===api+'/changes/'+id) return reply({...change,owner,zone:'Asia/Vientiane',businessDay:workspace.businessDay,
      reason:'Fixture evidence',requirements:[{gradeCode:'GRADE_1',specCode:'LOOSE'}],linkedPlan:false,originalApproval:null,
      currentProfiles:[],frozenItems:[],events:[],allowedActions:[],canPrecheck:false,planDigest:null,previousClass:null});
    return reply([]);
  });
}

async function fillForm(page:Page) {
  await page.getByLabel('目标仓库').selectOption('WH-SHARED');
  await page.getByLabel('等级',{exact:true}).selectOption('GRADE_1');
  await page.getByLabel('规格',{exact:true}).selectOption('LOOSE');
  await page.getByLabel('依据',{exact:true}).fill('Fixture change');
}

test('retains a request key and allows receipt lookup during a write pause',async({page})=>{
  await fixture(page);
  let opened=0;
  let receiptChecks=0;
  const requestKey='9c524a5b-2eaf-44a8-a0c2-d34f0c35a397';
  await page.addInitScript(({actor,requestKey})=>{
    sessionStorage.setItem('phoenix.egg-source.pending.'+JSON.stringify([[actor,null],'H1']),JSON.stringify({key:requestKey}));
  },{actor,requestKey});
  await page.route(url=>url.pathname===api+'/workspace',route=>route.fulfill({
    json:{code:200,data:{...workspace,createBlocker:'WRITES_PAUSED'}},
  }));
  await page.route(url=>url.pathname===api+'/candidates/options',route=>{
    opened++;
    return route.fulfill({status:403});
  });
  await page.route(url=>url.pathname===api+'/change-requests/'+requestKey,route=>{
    receiptChecks++;
    return route.fulfill({status:404,json:{message:'Fixture not found'}});
  });
  await page.goto(base+'/new?houseCode=H1');
  await expect(page.getByText(requestKey,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查询此次操作回执'}).click();
  await expect.poll(()=>receiptChecks).toBe(1);
  await expect(page.getByText(requestKey,{exact:true})).toBeVisible();
  expect(opened).toBe(0);
});

test('keeps a visible pending request, opens independent details and restores row focus',async({page})=>{
  await fixture(page);
  await page.goto(base+'?houseCode=H1');
  await expect(page.getByRole('heading',{name:'当前无有效档案'})).toBeVisible();
  await page.getByRole('link',{name:'待审核 (1)'}).click();
  await expect(page).toHaveURL(/state=SUBMITTED/);
  await page.getByRole('link',{name:'查看详情'}).click();
  await expect(page).toHaveURL(/changes\/9c524a5b/);
  await expect(page.getByText(id,{exact:true})).toBeVisible();
  await expect(page.getByText('Fixture evidence')).toBeVisible();
  await page.getByRole('link',{name:'返回申请列表'}).click();
  await expect(page.getByRole('link',{name:'查看详情'})).toBeFocused();
  await expect(page).toHaveURL(/state=SUBMITTED/);
});

test('recovers a malformed schedule response without losing the selected house',async({page})=>{
  await fixture(page);
  let healthy=false;
  await page.route(url=>url.pathname===api+'/workspace',route=>route.fulfill({
    json:{code:200,data:healthy ? workspace : {...workspace,profiles:[null]}},
  }));
  await page.goto(base+'?houseCode=H1');
  const retry=page.getByRole('button',{name:'重试',exact:true});
  await expect(retry).toBeVisible();
  await expect(page.getByLabel('鸡舍',{exact:true})).toHaveValue('H1');
  healthy=true;
  await retry.click();
  await expect(page.getByRole('heading',{name:'当前无有效档案'})).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test('does not carry a late precheck into another color or save on lookup retry',async({page})=>{
  await fixture(page);
  let checks=0;
  let drafts=0;
  let plans=0;
  let allowPlan=false;
  let release:()=>void=()=>{};
  const hold=new Promise<void>(resolve=>{release=resolve;});
  await page.addInitScript(()=>localStorage.setItem('phoenix_theme','dark'));
  await page.route(url=>url.pathname===api+'/flock-plans',route=>{
    plans++;
    return !allowPlan ? route.fulfill({status:500,json:{message:'Fixture failure'}})
      : route.fulfill({json:{code:200,data:[]}});
  });
  await page.route('**'+api+'/changes',route=>{drafts++;return route.fulfill({status:500});});
  await page.route('**'+api+'/precheck',async route=>{
    checks++;
    const sent=route.request().postDataJSON();
    if (checks===1) await hold;
    const data={status:'BLOCKED',targetClass:sent.targetClass,effectiveDate:tomorrow,houseCode:'H1',warehouseCode:'WH-SHARED',problems:[],
      rows:[{gradeCode:'GRADE_1',specCode:'LOOSE',status:'BLOCKED',issues:[{layer:'SITE',code:'STOCK_DISABLED'}]}]};
    await route.fulfill({json:{code:200,data}}).catch(()=>{});
  });
  await page.goto(base+'/new?houseCode=H1');
  await fillForm(page);
  const retry=page.getByRole('button',{name:'重试',exact:true});
  await expect(retry).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  const before=plans;
  allowPlan=true;
  await retry.click();
  await expect.poll(()=>plans).toBeGreaterThan(before);
  expect(drafts).toBe(0);
  await page.getByLabel('商品壳色').selectOption('RED');
  await page.getByRole('button',{name:'预检 SKU 与库存范围'}).click();
  await expect.poll(()=>checks).toBe(1);
  await page.getByLabel('商品壳色').selectOption('PINK');
  await page.getByRole('button',{name:'预检 SKU 与库存范围'}).click();
  await expect(page.getByText('场站级',{exact:true})).toBeVisible();
  release();
  await expect(page.getByRole('region',{name:'预检结果'}).getByText('粉壳蛋',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'预检结果'}).getByText('红壳蛋',{exact:true})).toHaveCount(0);
});

test('recovers a lost draft write after reload with a read-only receipt',async({page})=>{
  await fixture(page);
  let key='';
  let writes=0;
  await page.route('**'+api+'/changes',route=>{
    writes++;
    key=route.request().postDataJSON().actionKey;
    return route.abort();
  });
  await page.route('**'+api+'/change-requests/*',route=>{
    expect(new URL(route.request().url()).pathname).toBe(api+'/change-requests/'+key);
    return route.fulfill({json:{code:200,data:{id,state:'DRAFT',version:1}}});
  });
  await page.goto(base+'/new?houseCode=H1');
  await fillForm(page);
  await page.getByRole('button',{name:'保存草稿'}).click();
  await expect(page.getByRole('button',{name:'用原请求重试'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'用原请求重试'})).toHaveCount(0);
  await page.getByRole('button',{name:'查询此次操作回执'}).click();
  await expect(page).toHaveURL(new RegExp('/changes/'+id));
  expect(writes).toBe(1);
});

for (const [width,language,heading] of [[320,'en','Source change requests'],[390,'lo','ລາຍການຄຳຮ້ອງປ່ຽນແຫຼ່ງໄຂ່'],[768,'zh','来源变更申请']] as const) {
  test('keeps usable request cards at '+width+' CSS px in '+language,async({page})=>{
    await page.setViewportSize({width,height:850});
    await fixture(page,language);
    await page.goto(base+'?houseCode=H1&tab=changes');
    if (language==='lo') {
      await expect(page.getByText('Shared warehouse',{exact:true}).filter({visible:true})).toBeVisible();
    } else await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('a[data-change="'+id+'"]:visible')).toBeVisible();
  });
}
