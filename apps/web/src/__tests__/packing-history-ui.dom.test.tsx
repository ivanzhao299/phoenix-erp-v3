/** @vitest-environment jsdom */
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:{id:'TEST-A'} as any,request:vi.fn(),print:vi.fn()}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({t:(_key:string,fallback:string)=>fallback})}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:mocks.user})}));
vi.mock('@/lib/packing-history-api',async importOriginal=>({...await importOriginal<object>(),packingHistoryRequest:mocks.request}));
vi.mock('@/components/packaging/printLabel',()=>({printLabel:mocks.print}));
vi.mock('next/navigation',()=>({usePathname:()=>'/packaging/history/TEST-A'}));
vi.mock('next/link',()=>({default:({href,children}:any)=><a href={href}>{children}</a>}));
import PackingHistoryList from '@/components/packaging/PackingHistoryList';
import PackingRecordDetail from '@/components/packaging/PackingRecordDetail';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
const record=(code:string)=>({record:{id:code,code,productionDate:'2026-01-02',totalEggs:30,totalBoxes:1,recordStatus:'ACTIVE'},shift:{id:'1',code:'TEST-SHIFT',status:'CLOSED'},ownership:{companyCode:'TEST-C',siteCode:'TEST-F'},outputs:[],sources:[],boxes:[{boxId:'TEST-BOX',originalQty:30,labels:[{code:'TEST-LABEL',kind:'CANONICAL',status:'ACTIVE',resolution:'BOUND'}]}],events:[],inventory:{batches:[],ledger:[]},handover:{state:'PENDING',quality:'VERIFIED'},receipt:{state:'NOT_RECORDED'},identityStatus:'REGISTERED',expectedBoxCount:1,revision:'TEST-REVISION',policy:{V:true,encodingVersion:'TEST-NON-BUSINESS-v1'},actions:{registerBoxes:{allowed:true,reasons:[]},print:{allowed:true,reasons:[]},confirm:{allowed:false,reasons:[]}}});
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{mocks.user={id:'TEST-A'};mocks.request.mockReset();mocks.print.mockReset();sessionStorage.clear();window.history.replaceState(null,'','/packaging/history');host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('list account switch clears old rows immediately and discards late responses',async()=>{
 const old=deferred(),next=deferred();mocks.request.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
 await act(async()=>root.render(<PackingHistoryList/>));mocks.user={id:'TEST-B'};await act(async()=>root.render(<PackingHistoryList/>));
 await act(async()=>old.resolve({items:[record('SENSITIVE-A')],totalMatching:1}));expect(host.textContent).not.toContain('SENSITIVE-A');
 await act(async()=>next.resolve({items:[record('VISIBLE-B')],totalMatching:1}));expect(host.textContent).toContain('VISIBLE-B');
});
it('history restores exact filters from URL without current shift state',async()=>{
 window.history.replaceState(null,'','/packaging/history?packingCode=TEST-ORIGINAL&shiftStatus=CLOSED&pageSize=50');mocks.request.mockResolvedValue({items:[],totalMatching:0});
 await act(async()=>root.render(<PackingHistoryList/>));expect(mocks.request.mock.calls[0][0]).toContain('packingCode=TEST-ORIGINAL');expect(mocks.request.mock.calls[0][0]).toContain('pageSize=50');
});
it('late print-request response after account change cannot invoke physical print',async()=>{
 const pending=deferred();mocks.request.mockImplementation((path:string)=>path==='labels/print-requests'?pending.promise:Promise.resolve(path.includes('/candidates')?[]:record('TEST-A')));
 await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 const print=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='请求打印 / 同码补打')!;
 await act(async()=>print.click());mocks.user={id:'TEST-B'};await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-B"/>));
 await act(async()=>pending.resolve({eventId:'TEST-REQUEST',renderPayload:{labelCode:'TEST-LABEL',productionDate:'2026-01-02',qty:30}}));expect(mocks.print).not.toHaveBeenCalled();
});
it('HTTP failure displays no invented pending record and no print/confirm controls',async()=>{
 mocks.request.mockRejectedValue(new Error('READ_UNAVAILABLE'));await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 expect(host.textContent).toContain('READ_UNAVAILABLE');expect(host.textContent).not.toContain('PENDING');expect(host.querySelector('button')).toBeNull();expect(mocks.print).not.toHaveBeenCalled();
});

it('server unknown print state disables reprint even with reason',async()=>{
 const d=record('TEST-A');(d.boxes[0] as any).printBlockedReason='打印结果未知，请先查询并核实原打印请求';
 mocks.request.mockImplementation((path:string)=>Promise.resolve(path.includes('/candidates')?[]:d));
 await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='请求打印 / 同码补打')!;
 expect(button.disabled).toBe(true);expect(host.textContent).toContain('打印结果未知');await act(async()=>button.click());expect(mocks.print).not.toHaveBeenCalled();
});
it('candidate search filters authorized options without accepting arbitrary codes',async()=>{
 mocks.request.mockImplementation((path:string)=>Promise.resolve(path.includes('kind=WAREHOUSE')?[{code:'TEST-W1',label:'北仓'},{code:'TEST-W2',label:'南仓'}].filter(i=>(i.code+i.label).includes(new URL('http://localhost/'+path).searchParams.get('search')||'')):path.includes('/candidates')?[]:record('TEST-A')));
 await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 const input=host.querySelector('input[type="search"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'南仓');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const select=host.querySelector('select')!;expect(select.textContent).toContain('TEST-W2');expect(select.textContent).not.toContain('TEST-W1');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'OUTSIDE');input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(select.options.length).toBe(1);expect(select.value).toBe('');expect(host.textContent).toContain('无匹配的授权候选');
});

it('lost print response blocks immediate new request locally',async()=>{
 mocks.request.mockImplementation((path:string)=>path==='labels/print-requests'?Promise.reject(new Error('UNKNOWN')):Promise.resolve(path.includes('/candidates')?[]:record('TEST-A')));
 await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='请求打印 / 同码补打')!;
 await act(async()=>button.click());expect(button.disabled).toBe(true);await act(async()=>button.click());
 expect(mocks.request.mock.calls.filter(c=>c[0]==='labels/print-requests')).toHaveLength(1);expect(mocks.print).not.toHaveBeenCalled();
});

it.each(['UNKNOWN','empty'])('partial or empty identity blocks all confirm controls %s',async kind=>{
 const d=record('TEST-A');d.actions.confirm.allowed=true;if(kind==='UNKNOWN')d.handover.quality='UNKNOWN';else d.boxes=[];
 mocks.request.mockImplementation((path:string)=>Promise.resolve(path.includes('/candidates')?[]:d));await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='确认本单交接入库')!.disabled).toBe(true);
 if(kind==='UNKNOWN')expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='请求打印 / 同码补打')!.disabled).toBe(true);
});

it.each(['original','account'])('late confirm success cannot pollute a changed %s',async change=>{
 const pending=deferred();vi.spyOn(window,'confirm').mockReturnValue(true);
 mocks.request.mockImplementation((path:string)=>{
  if(path==='warehouse/confirm')return pending.promise;
  if(path.includes('/candidates'))return Promise.resolve([{code:'TEST-CHOICE',label:'TEST choice'}]);
  if(path.includes('/verification-sessions'))return Promise.resolve({eventId:'TEST-SESSION'});
  if(path.startsWith('boxes/resolve'))return Promise.resolve({id:'TEST-BOX'});
  if(path.includes('/box-verifications'))return Promise.resolve({eventId:'TEST-SCAN'});
  const d=record(path.split('/')[1]);d.actions.confirm.allowed=true;return Promise.resolve(d);
 });
 await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
 for(let i=0;i<3;i++)await act(async()=>{const select=host.querySelectorAll('select')[i];select.value='TEST-CHOICE';select.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>button('开始交接核验').click());
 await act(async()=>{const input=host.querySelector('form input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'TEST-LABEL');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(button('确认本单交接入库').disabled).toBe(false);await act(async()=>button('确认本单交接入库').click());
 expect(mocks.request.mock.calls.filter(c=>c[0]==='warehouse/confirm')).toHaveLength(1);
 if(change==='account')mocks.user={id:'TEST-B'};
 await act(async()=>root.render(<PackingRecordDetail packingCode={change==='original'?'TEST-B':'TEST-A'}/>));
 await act(async()=>pending.resolve({receiptState:'RECORDED',handoverCode:'SENSITIVE-A'}));
 expect(host.textContent).not.toContain('SENSITIVE-A');expect(host.textContent).not.toContain('交接入库已提交');expect(host.textContent).not.toContain('查询未知提交结果');
 expect(Array.from(host.querySelectorAll('select')).every(s=>s.value==='')).toBe(true);expect(host.textContent).toContain('本轮已核验 0 箱');vi.restoreAllMocks();
});
it('old physical label declaration has a truthful distinct registration action',async()=>{
 const d=record('TEST-A');d.identityStatus='UNREGISTERED';d.boxes=[];d.outputs=[{outputOrdinal:0,original:{boxes:1,eggs:30}}] as any;
 mocks.request.mockImplementation((path:string)=>Promise.resolve(path.includes('/candidates')?[]:d));await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 await act(async()=>{(host.querySelector('input[type="checkbox"]') as HTMLInputElement).click();});expect(host.textContent).toContain('登记逐箱旧标签实测事实');expect(host.textContent).toContain('产出 1 箱 1 实测旧码');expect(host.textContent).not.toContain('确认未贴标事实并登记');
});
