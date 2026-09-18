/** @vitest-environment jsdom */
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: { user: { id: '7' } as any, loading: false }, exact: vi.fn(), summary: vi.fn(), report: vi.fn(), active: vi.fn(), close: vi.fn(), t: (_key: string, text: string) => text }));
vi.mock('@/lib/packing-history-api',async original=>({...await original<object>(),packingHistoryRequest:mocks.report}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ ...mocks.auth, hasPermission: () => true, logout: vi.fn() }) }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: mocks.t, lang: 'zh', setAppLanguage: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/terminal/packaging/shift-close', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/contexts/BrandContext', () => ({ useBrand: () => ({ brand: {} }) }));
vi.mock('@/hooks/usePackagingDicts', async original => ({ ...await original<any>(), usePackagingDicts: () => ({dicts:{}}) }));
vi.mock('@/hooks/useProductGrades', () => ({ useProductGrades: () => ({ grades: [{ grade_code:'GRADE_5', grade_name:'5号蛋' }] }) }));
vi.mock('@/lib/packaging-api', async original => ({ ...await original<any>(), packagingApi: { getExactShift: mocks.exact, getShiftSummary:mocks.summary, getActiveGrading:mocks.active, closeShift:mocks.close, getDicts:vi.fn(async()=>({})), getSites:vi.fn(async()=>[]), getSupervisors:vi.fn(async()=>[]), getReadyCombinations:vi.fn(async()=>[]), getPendingGradingSourceBatches:vi.fn(async()=>[]), getTodaySourceBatches:vi.fn(async()=>[]), getTodayExceptions:vi.fn(async()=>[]) } }));
import Layout from '@/app/(terminal)/layout';
import Page from '@/app/(terminal)/terminal/packaging/shift-close/page';
import { TerminalContextProvider, useTerminalContext } from '@/hooks/useTerminalContext';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const contextRef = { current: null as ReturnType<typeof useTerminalContext> | null };
const candidate = { id:'56', code:'S56', status:'OPEN', productionDate:'2026-09-10' };
const raw = (id='56', status='OPEN') => ({id,shift_code:`S${id}`,status,date_text:'2026-09-10',is_test:false});
function deferred() { let resolve!: (v:any)=>void, reject!: (v:any)=>void; const promise = new Promise((a,b)=>{ resolve=a;reject=b; }); return {promise,resolve,reject}; }
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
  mocks.summary.mockImplementation(async (_d,id)=>({shift:raw(id),receivedQty:30,receivedWeight:1,shiftPackedBoxes:1,shiftPackedEggs:30,shiftWarehousedBoxes:0,shiftWarehousedPallets:0,openExceptionCount:0,closedExceptionCount:0}));
  mocks.report.mockImplementation(async path=>path.startsWith('history?')?{items:[],totalMatching:0,hasMore:false}:({gradingEggs:0,shiftId:new URLSearchParams(path.split('?')[1]).get('shiftId'),dateFrom:'2026-09-10',totalBoxes:1,totalEggs:30,committedBoxes:0}));
  mocks.active.mockImplementation(async id=>({shiftId:Number(id),productionDate:'2026-09-10',outputs:{},remaining:{},packed:{},gradingCodes:[]}));
  Object.defineProperty(document,'fullscreenElement',{configurable:true,value:null});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{ await act(async()=>root.unmount());host.remove(); });
it('waits for auth, hydration and exact server identity before any summary/active requests; fullscreen reentry shares selection',async()=>{
  save(); const check=deferred();mocks.exact.mockReturnValueOnce(check.promise);
  await render();await fullscreen(true);expect(mocks.summary).not.toHaveBeenCalled();expect(mocks.active).not.toHaveBeenCalled();
  await act(async()=>check.resolve(raw()));expect(mocks.summary).toHaveBeenCalledWith('2026-09-10','56');expect(mocks.active).toHaveBeenCalledWith(56);
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
  await act(async()=>contextRef.current!.setShift({...candidate,id:'57'} as any));
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
  save();mocks.active.mockRejectedValue(new Error(message));await render();await fullscreen(true);
  expect(host.textContent).toContain(message);expect(host.textContent).toContain('交班数据加载失败');expect(mocks.close).not.toHaveBeenCalled();
  expect([...host.querySelectorAll('button')].some(b=>b.textContent?.includes('提交交班'))).toBe(false);
});
it('uses authoritative empty grading and actual warehouse fields, without inferred pallets',async()=>{
  save();await render();await fullscreen(true);await act(async()=>contextRef.current!.setGradingResult('OLD',{GRADE_5:999}));
  expect(host.textContent).not.toContain('999');expect(host.textContent).toContain('0 托');expect(host.textContent).toContain('核实入账0 箱');
});
it('unmounted request completion cannot pollute a new fullscreen page',async()=>{
  save();const old=deferred();mocks.active.mockReturnValueOnce(old.promise);await render();await fullscreen(true);await fullscreen(false);await fullscreen(true);
  await act(async()=>old.reject(new Error('unmounted failure')));expect(host.textContent).not.toContain('unmounted failure');
});

it('has no business request with no saved selection',async()=>{await render();await fullscreen(true);expect(mocks.summary).not.toHaveBeenCalled();expect(mocks.active).not.toHaveBeenCalled();expect(host.textContent).toContain('当前无开放班次');});
it.each([{id:'999'}, {date_text:'2026-09-08'}, {is_test:true}])('rejects an authority mismatch %j',async(patch)=>{save();mocks.exact.mockResolvedValue({...raw(),...patch});await render();await fullscreen(true);expect(mocks.active).not.toHaveBeenCalled();expect(host.textContent).toContain('不匹配');});
it('StrictMode effect replay never emits undefined/NaN requests',async()=>{save();await act(async()=>root.render(<React.StrictMode><Layout><Probe/><Page/></Layout></React.StrictMode>));await fullscreen(true);expect(mocks.active.mock.calls.every(([id])=>id===56)).toBe(true);expect(host.textContent).not.toContain('失败');});
it('late failed grading request cannot hide a current failed summary',async()=>{save();const old=deferred();mocks.active.mockReturnValueOnce(old.promise);await render();await fullscreen(true);mocks.summary.mockRejectedValueOnce(new Error('CURRENT failure'));await fullscreen(false);await fullscreen(true);await act(async()=>old.resolve({shiftId:56,productionDate:'2026-09-10',outputs:{GRADE_5:999}}));expect(host.textContent).toContain('CURRENT failure');expect(host.textContent).not.toContain('999');});

const consumers: Record<string, () => Promise<any>> = {
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
it.each(Object.keys(consumers))('mounts context consumer %s only after hydration, then clears state on account change',async(path)=>{
  const Consumer = (await consumers[path]() as any).default;
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
