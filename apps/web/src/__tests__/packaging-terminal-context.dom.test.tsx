/** @vitest-environment jsdom */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { PackagingWorkQueueResponse } from '@/lib/packaging-api';
const mocks = vi.hoisted(() => ({ auth: { user: { id: '7' } as {id:string;permissions?:string[]}, loading: false }, exact: vi.fn(), summary: vi.fn(), report: vi.fn(), active: vi.fn(), ready: vi.fn(), submit: vi.fn(), close: vi.fn(), queue: vi.fn<() => Promise<PackagingWorkQueueResponse>>(async()=>({items:[],counts:{},nextCursor:null})), queueSites: vi.fn(async()=>[{siteCode:'SITE-1',siteName:'Site 1'}]), t: (_key: string, text: string) => text }));
vi.mock('@/lib/packing-history-api',async original=>({...await original<object>(),packingHistoryRequest:mocks.report}));
vi.mock('@/contexts/AuthContext', async original => ({...await original<object>(), useAuth: () => ({ ...mocks.auth, hasPermission: () => true, logout: vi.fn() }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: mocks.t, lang: 'zh', setAppLanguage: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/terminal/packaging/shift-close', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/contexts/BrandContext', () => ({ useBrand: () => ({ brand: {} }) }));
vi.mock('@/hooks/usePackagingDicts', async original => ({ ...await original<object>(), usePackagingDicts: () => ({dicts:{}}) }));
vi.mock('@/hooks/useProductGrades', () => ({ useProductGrades: () => ({ grades: [{ grade_code:'GRADE_5', grade_name:'5号蛋' }] }) }));
vi.mock('@/lib/packaging-api', async original => ({ ...await original<object>(), packagingApi: { getExactShift: mocks.exact, getShiftSummary:mocks.summary, getActiveGrading:mocks.active, closeShift:mocks.close, getDicts:vi.fn(async()=>({})), getSites:vi.fn(async()=>[]), getWorkQueue:mocks.queue, getWorkQueueSites:mocks.queueSites, getSupervisors:vi.fn(async()=>[]), getReadyCombinations:mocks.ready, submitPacking:mocks.submit, getPendingGradingSourceBatches:vi.fn(async()=>[]), getTodaySourceBatches:vi.fn(async()=>[]), getTodayExceptions:vi.fn(async()=>[]) } }));
vi.mock('@/components/terminal/TerminalNumPadPanel', () => ({
  default: ({ onChange, disabled }: { onChange: (value:string)=>void; disabled:boolean }) =>
    <button type="button" disabled={disabled} onClick={()=>onChange('1')}>填一箱</button>,
}));
import Layout from '@/app/(terminal)/layout';
import Page from '@/app/(terminal)/terminal/packaging/shift-close/page';
import PackagingWorkQueue from '@/components/packaging/PackagingWorkQueue';
import { TerminalContextProvider, useTerminalContext } from '@/hooks/useTerminalContext';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const contextRef = { current: null as ReturnType<typeof useTerminalContext> | null };
const candidate = {
  id:'56', code:'S56', status:'OPEN' as const, productionDate:'2026-09-10',
  siteId:'SITE-1', lineId:'LINE-1', operatorIds:['operator-1'], terminalId:'terminal-1', openedAt:'2026-09-10T00:00:00Z',
};
const raw = (id='56', status='OPEN') => ({id,shift_code:`S${id}`,status,date_text:'2026-09-10',is_test:false});
function deferred<T=unknown>() { let resolve!: (v: T)=>void, reject!: (v: unknown)=>void; const promise = new Promise<T>((a,b)=>{ resolve=a;reject=b; }); return {promise,resolve,reject}; }
function Probe() {
  const value = useTerminalContext();
  React.useEffect(() => { contextRef.current = value; }, [value]);
  return <span data-testid="shift">{value.ctx.currentShift?.id || 'none'}</span>;
}
function save(value: unknown = candidate) { localStorage.setItem('phoenix_terminal_context:v2:7:real', JSON.stringify({version:2,userId:'7',mode:'real',currentShift:value})); }
async function render(full=true) { await act(async () => { root.render(full ? <Layout><Probe/><Page/></Layout> : <TerminalContextProvider><Probe/><Page/></TerminalContextProvider>); }); }
async function fullscreen(on:boolean) { await act(async()=>{ Object.defineProperty(document,'fullscreenElement',{configurable:true,value:on?document.documentElement:null}); document.dispatchEvent(new Event('fullscreenchange')); }); }
beforeEach(()=>{ localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); mocks.auth.user={id:'7'}; mocks.auth.loading=false;
  mocks.exact.mockImplementation(async id=>raw(id));
  mocks.summary.mockImplementation(async (_d,id)=>({shift:raw(id),receivedQty:30,receivedWeight:1,gradingOutputs:{},shiftPackedBoxes:1,shiftPackedEggs:30,shiftWarehousedBoxes:0,shiftWarehousedPallets:0,openExceptionCount:0,closedExceptionCount:0}));
  mocks.report.mockImplementation(async path=>path.startsWith('history?')?{items:[],totalMatching:0,hasMore:false}:({gradingEggs:0,shiftId:new URLSearchParams(path.split('?')[1]).get('shiftId'),dateFrom:'2026-09-10',totalBoxes:1,totalEggs:30,committedBoxes:0}));
  mocks.active.mockImplementation(async id=>({shiftId:Number(id),productionDate:'2026-09-10',eggDate:'2026-09-10',eggDates:[],outputs:{},remaining:{},packed:{},gradingCodes:[]}));
  mocks.ready.mockResolvedValue([]);
  Object.defineProperty(document,'fullscreenElement',{configurable:true,value:null});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{ await act(async()=>root.unmount());host.remove(); });
it('waits for auth, hydration and exact server identity before any summary/active requests; fullscreen reentry shares selection',async()=>{
  save(); const check=deferred();mocks.exact.mockReturnValueOnce(check.promise);
  await render();await fullscreen(true);expect(mocks.summary).not.toHaveBeenCalled();expect(mocks.active).not.toHaveBeenCalled();
  await act(async()=>check.resolve(raw()));expect(mocks.summary).toHaveBeenCalledWith('2026-09-10','56');expect(mocks.active).not.toHaveBeenCalled();
  expect(host.textContent).toContain('56');await fullscreen(false);await fullscreen(true);
  expect(mocks.exact).toHaveBeenCalledTimes(1);expect(mocks.summary).toHaveBeenCalledTimes(2);
  expect(host.textContent).not.toContain('加载失败');
});
it.each([undefined,null,'',0,-1,1.5,'NaN','SHIFT-56',9007199254740992])('rejects malformed cached id %s without business reads',async(id)=>{
  save({...candidate,id});await render();await fullscreen(true);expect(mocks.exact).not.toHaveBeenCalled();expect(mocks.summary).not.toHaveBeenCalled();expect(host.textContent).toContain('重新选择');
});
it.each(['legacy','json','identity','closed'])('handles %s cache/server state explicitly',async(kind)=>{
  if(kind==='legacy')localStorage.setItem('phoenix_terminal_context',JSON.stringify({currentShift:candidate}));
  else if(kind==='json')localStorage.setItem('phoenix_terminal_context:v2:7:real','{');
  else if(kind==='identity')localStorage.setItem('phoenix_terminal_context:v2:7:real',JSON.stringify({version:2,userId:'8',mode:'real',currentShift:candidate}));
  else {save();mocks.exact.mockResolvedValue(raw('56','CLOSED'));}
  await render();await fullscreen(true);expect(mocks.active).not.toHaveBeenCalled();expect(mocks.summary).not.toHaveBeenCalled();
  expect(host.textContent).toMatch(/重新选择|已交班/);
});
it('ignores old success/error/finally after shift change and clears shared WIP for every consumer',async()=>{
  save();const old=deferred();mocks.summary.mockReturnValueOnce(old.promise);await render();await fullscreen(true);
  await act(async()=>contextRef.current!.setGradingResult('OLD',{GRADE_5:999}));
  await act(async()=>contextRef.current!.setShift({...candidate,id:'57'}));
  expect(contextRef.current!.ctx.gradingOutputs).toBeNull();expect(contextRef.current!.ctx.currentShift?.id).toBe('57');
  await act(async()=>old.reject(new Error('OLD failure')));expect(host.textContent).not.toContain('OLD failure');
  expect(host.querySelector<HTMLButtonElement>('button[disabled]')).toBeNull();
});
it('ignores late authority response after account changes and refuses to inherit previous identity cache',async()=>{
  save();const old=deferred();mocks.exact.mockReturnValueOnce(old.promise);await render();await fullscreen(true);
  mocks.auth.user={id:'8'};await render();await act(async()=>old.resolve(raw()));
  expect(contextRef.current!.ctx.currentShift).toBeNull();expect(mocks.active).not.toHaveBeenCalled();
});
it.each(['network','403','500'])('shows %s failure, no cached output fallback or enabled close action',async(message)=>{
  save();mocks.summary.mockRejectedValue(new Error(message));await render();await fullscreen(true);
  expect(host.textContent).toContain(message);expect(host.textContent).toContain('交班数据加载失败');expect(mocks.close).not.toHaveBeenCalled();
  expect([...host.querySelectorAll('button')].some(b=>b.textContent?.includes('提交交班'))).toBe(false);
});
it('uses authoritative empty grading and actual warehouse fields, without inferred pallets',async()=>{
  save();await render();await fullscreen(true);await act(async()=>contextRef.current!.setGradingResult('OLD',{GRADE_5:999}));
  expect(host.textContent).not.toContain('999');expect(host.textContent).toContain('0 托');expect(host.textContent).toContain('核实入账0 箱');
});
it('unmounted request completion cannot pollute a new fullscreen page',async()=>{
  save();const old=deferred();mocks.summary.mockReturnValueOnce(old.promise);await render();await fullscreen(true);await fullscreen(false);await fullscreen(true);
  await act(async()=>old.reject(new Error('unmounted failure')));expect(host.textContent).not.toContain('unmounted failure');
});

it('has no business request with no saved selection',async()=>{await render();await fullscreen(true);expect(mocks.summary).not.toHaveBeenCalled();expect(mocks.active).not.toHaveBeenCalled();expect(host.textContent).toContain('当前无开放班次');});
it('discards an old pagination response after switching queue bucket',async()=>{
  const oldPage=deferred<PackagingWorkQueueResponse>();
  const row=(code:string)=>({kind:'SOURCE' as const,code,shiftId:'56',productionDate:'2026-09-10',quantity:5,unit:'eggs',action:'GRADE',reason:'Awaiting grading'});
  mocks.queue.mockResolvedValueOnce({items:[row('CURRENT-1')],counts:{SOURCE:2},nextCursor:'cursor-1'});
  mocks.queue.mockReturnValueOnce(oldPage.promise);
  mocks.queue.mockResolvedValueOnce({items:[row('CARRY-1')],counts:{SOURCE:1},nextCursor:null});
  await act(async()=>root.render(<PackagingWorkQueue identityKey="user-7" shiftId="56" defaultSiteCode="SITE-1"/>));
  expect(mocks.queue).toHaveBeenCalledTimes(1);
  const more=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('加载更多'));
  expect(more).toBeDefined();
  await act(async()=>more?.dispatchEvent(new Event('click',{bubbles:true})));
  expect(mocks.queue).toHaveBeenCalledTimes(2);
  const carry=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('跨班待办'));
  await act(async()=>carry?.dispatchEvent(new Event('click',{bubbles:true})));
  expect(mocks.queue).toHaveBeenCalledTimes(3);
  expect(host.textContent).toContain('CARRY-1');
  await act(async()=>oldPage.resolve({items:[row('STALE-PAGE')],counts:{SOURCE:99},nextCursor:null}));
  expect(host.textContent).not.toContain('STALE-PAGE');
  expect(host.textContent).toContain('CARRY-1');
});
it('links only accessible production handoffs and keeps the exact source in the destination URL',async()=>{
  const route='/breeding/production-inbound?queueAction=FORMAL_RAW&companyCode=C1&siteCode=SITE-1&houseCode=H1&eggDate=2026-09-10&sourceBatchCode=SRC-RAW';
  mocks.queue.mockResolvedValueOnce({items:[
    {kind:'SOURCE',code:'SRC-RAW',shiftId:'56',productionDate:'2026-09-10',quantity:30,unit:'eggs',action:'FORMAL_RAW',reason:'',href:route+'&documentId=ignored'},
    {kind:'SOURCE',code:'SRC-TEMP',shiftId:'56',productionDate:'2026-09-10',quantity:30,unit:'eggs',action:'LEGACY_TEMP_INBOUND',reason:'',href:'/breeding/production-inbound?queueAction=LEGACY_TEMP_INBOUND&companyCode=C1&siteCode=SITE-1&houseCode=H1&eggDate=2026-09-10'},
  ],counts:{SOURCE:2},nextCursor:null});
  const renderQueue=()=>act(async()=>root.render(<PackagingWorkQueue identityKey="user-7" shiftId="56" defaultSiteCode="SITE-1"/>));
  await renderQueue();
  expect(host.querySelectorAll('a')).toHaveLength(0);
  mocks.auth.user={id:'7',permissions:['MENU_PROD_INBOUND:V']};
  await renderQueue();
  expect([...host.querySelectorAll('a')].map(link=>link.getAttribute('href'))).toEqual([route]);
});
it.each([{id:'999'}, {date_text:'2026-09-08'}, {is_test:true}])('rejects an authority mismatch %j',async(patch)=>{save();mocks.exact.mockResolvedValue({...raw(),...patch});await render();await fullscreen(true);expect(mocks.active).not.toHaveBeenCalled();expect(host.textContent).toContain('不匹配');});
it('StrictMode effect replay never emits undefined/NaN requests',async()=>{save();await act(async()=>root.render(<React.StrictMode><Layout><Probe/><Page/></Layout></React.StrictMode>));await fullscreen(true);expect(mocks.active.mock.calls.every(([id])=>id===56)).toBe(true);expect(host.textContent).not.toContain('失败');});
it('a late result for the previous summary cannot hide the current failed summary',async()=>{save();const old=deferred();mocks.summary.mockReturnValueOnce(old.promise);await render();await fullscreen(true);mocks.summary.mockRejectedValueOnce(new Error('CURRENT failure'));await fullscreen(false);await fullscreen(true);await act(async()=>old.resolve({shiftId:56,productionDate:'2026-09-10',outputs:{GRADE_5:999}}));expect(host.textContent).toContain('CURRENT failure');expect(host.textContent).not.toContain('999');});

const consumers: Record<string, () => Promise<{ default: React.ComponentType }>> = {
  'dashboard': () => import('@/app/(terminal)/terminal/packaging/dashboard/page'),
  'exceptions': () => import('@/app/(terminal)/terminal/packaging/exceptions/page'),
  'grading': () => import('@/app/(terminal)/terminal/packaging/grading/page'),
  'label-print': () => import('@/app/(terminal)/terminal/packaging/label-print/page'),
  'packing': () => import('@/app/(terminal)/terminal/packaging/packing/page'),
  'qc-inspection': () => import('@/app/(terminal)/terminal/packaging/qc-inspection/page'),
  'shift-close': () => import('@/app/(terminal)/terminal/packaging/shift-close/page'),
  'shift-open': () => import('@/app/(terminal)/terminal/packaging/shift-open/page'),
  'source-receive': () => import('@/app/(terminal)/terminal/packaging/source-receive/page'),
  'warehouse-handover': () => import('@/app/(terminal)/terminal/packaging/warehouse-handover/page'),
};
it('keeps the current work queue and operational entry available when production metrics fail',async()=>{
  const Dashboard=(await consumers.dashboard()).default;
  save();
  mocks.report.mockRejectedValueOnce(new Error('Metrics temporarily unavailable'));
  await act(async()=>root.render(<Layout><Probe/><Dashboard/></Layout>));
  await fullscreen(true);
  expect(host.textContent).toContain('Metrics temporarily unavailable');
  expect(host.textContent).toContain('包装作业队列');
  const receive=[...host.querySelectorAll('button')].find(button=>button.textContent?.includes('集蛋接收'));
  expect(receive?.disabled).toBe(false);
  expect(mocks.queue).toHaveBeenCalledWith({bucket:'CURRENT',siteCode:'SITE-1',shiftId:'56',pageSize:25});
});
it('packing requests combinations only for the authoritative active grading source set',async()=>{
  const Packing=(await consumers.packing()).default;
  mocks.active.mockResolvedValue({shiftId:56,productionDate:'2026-09-10',eggDate:'2026-09-10',eggDates:['2026-09-10'],outputs:{GRADE_5:30},remaining:{GRADE_5:30},packed:{},gradingCodes:['GR-A','GR-B']});
  mocks.ready.mockResolvedValue([{grade:'GRADE_5',productCode:'PRODUCT',skuCode:'SKU',varietyCode:'VAR',specCode:'SPEC',specName:'30 eggs',qtyPerUnit:30}]);
  save();await act(async()=>root.render(<Layout><Probe/><Packing/></Layout>));await fullscreen(true);
  expect(mocks.ready).toHaveBeenCalledWith(56,['GR-A','GR-B']);
  expect(host.textContent).not.toContain('没有可用包装组合');
});
it('pins the draft date and replays the first submitted sources after the shift gains grading rows',async()=>{
  const Packing=(await consumers.packing()).default;
  const later='2026-09-10',earlier='2026-09-09';
  let additionalGrading=false;
  mocks.active.mockImplementation(async (_shift,date)=>{
    const eggDate=date || (additionalGrading ? earlier : later);
    return {shiftId:56,productionDate:later,eggDate,eggDates:additionalGrading ? [earlier,later] : [later],
      outputs:{GRADE_5:90},remaining:{GRADE_5:90},packed:{},
      gradingCodes:eggDate===earlier ? ['EARLIER'] : additionalGrading ? ['ORIGINAL','SAME-DAY-NEW'] : ['ORIGINAL']};
  });
  mocks.ready.mockResolvedValue([{grade:'GRADE_5',productCode:'PRODUCT',skuCode:'SKU',varietyCode:'VAR',specCode:'SPEC',specName:'30 eggs',qtyPerUnit:30}]);
  mocks.submit.mockRejectedValue(new Error('交接网络暂不可用'));
  const click=async(label:string,event='click')=>{
    const button=[...host.querySelectorAll('button')].find(node=>node.textContent?.includes(label));
    expect(button, label).toBeDefined();
    expect(button?.disabled,label).toBe(false);
    if (!button) return;
    await act(async()=>button.dispatchEvent(new Event(event,{bubbles:true})));
  };
  vi.useFakeTimers();
  try {
    save();await act(async()=>root.render(<Layout><Probe/><Packing/></Layout>));await fullscreen(true);
    await click('5号蛋','pointerdown');await click('30 eggs','pointerdown');await click('填一箱');
    await click('添加此批次','pointerdown');
    await click('完成包装');
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({eggDate:later,gradingCodes:['ORIGINAL']}));
    additionalGrading=true;
    await act(async()=>vi.advanceTimersByTimeAsync(5000));
    expect(mocks.active).toHaveBeenLastCalledWith(56,later);
    expect(host.querySelector('select')?.value).toBe(later);
    await click('完成包装');
    expect(mocks.submit.mock.calls[1]?.[0]).toEqual(mocks.submit.mock.calls[0]?.[0]);
    await click('清空本地草稿');
    expect(host.textContent).not.toContain('清空本地草稿');
  } finally {
    vi.useRealTimers();
  }
});

it('packing explains missing provenance and does not request global combinations',async()=>{
  const Packing=(await consumers.packing()).default;
  save();await act(async()=>root.render(<Layout><Probe/><Packing/></Layout>));await fullscreen(true);
  expect(mocks.ready).not.toHaveBeenCalled();
  expect(host.textContent).toContain('本班次缺少分级来源，请先完成来源批次接收与分级');
});

it.each(Object.keys(consumers))('mounts context consumer %s only after hydration, then clears state on account change',async(path)=>{
  const Consumer = (await consumers[path]()).default;
  save();const check=deferred();mocks.exact.mockReturnValueOnce(check.promise);
  const paint=()=>root.render(<Layout><Probe/><Consumer/></Layout>);
  await act(async()=>paint());await fullscreen(true);
  expect(mocks.summary).not.toHaveBeenCalled();expect(mocks.active).not.toHaveBeenCalled();
  await act(async()=>check.resolve(raw()));expect(contextRef.current!.ctx.currentShift?.id).toBe('56');
  await act(async()=>contextRef.current!.setGradingResult('OLD',{GRADE_5:999}));
  mocks.auth.user={id:'8'};await act(async()=>paint());
  expect(contextRef.current!.ctx.currentShift).toBeNull();expect(contextRef.current!.ctx.gradingOutputs).toBeNull();
  expect(host.textContent).not.toContain('999');
});
