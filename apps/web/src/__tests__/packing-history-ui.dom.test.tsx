/** @vitest-environment jsdom */
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:{id:'TEST-A'} as any,request:vi.fn(),print:vi.fn()}));
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
