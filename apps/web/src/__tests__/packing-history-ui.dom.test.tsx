/** @vitest-environment jsdom */
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
type MockLinkProps = { href: string; children?: React.ReactNode };
const mocks=vi.hoisted(()=>({user:{id:'TEST-A'},request:vi.fn(),print:vi.fn()}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({t:(_key:string,fallback:string)=>fallback})}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:mocks.user})}));
vi.mock('@/lib/packing-history-api',async importOriginal=>({...await importOriginal<object>(),packingHistoryRequest:mocks.request}));
vi.mock('@/components/packaging/printLabel',()=>({printLabel:mocks.print}));
vi.mock('next/navigation',()=>({usePathname:()=>'/packaging/history/TEST-A'}));
vi.mock('next/link',()=>({default:({href,children}:MockLinkProps)=><a href={href}>{children}</a>}));
import PackingHistoryList from '@/components/packaging/PackingHistoryList';
import PackingRecordDetail from '@/components/packaging/PackingRecordDetail';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
const record=(code:string)=>({record:{id:code,code,productionDate:'2026-01-02',totalEggs:30,totalBoxes:1,recordStatus:'ACTIVE'},shift:{id:'1',code:'TEST-SHIFT',status:'CLOSED'},ownership:{companyCode:'TEST-C',siteCode:'TEST-F'},outputs:[],sources:[],boxes:[{boxId:'TEST-BOX',originalQty:30,labels:[{code:'TEST-LABEL',kind:'CANONICAL',status:'ACTIVE',resolution:'BOUND'}]}],events:[],inventory:{batches:[],ledger:[]},handover:{state:'PENDING',quality:'VERIFIED'},receipt:{state:'NOT_RECORDED'},identityStatus:'REGISTERED',expectedBoxCount:1,revision:'TEST-REVISION',policy:{V:true,encodingVersion:'TEST-NON-BUSINESS-v1'},actions:{registerBoxes:{allowed:true,reasons:[]},print:{allowed:true,reasons:[]},confirm:{allowed:false,reasons:[]}}});
function deferred(){let resolve!:(v:unknown)=>void;const promise=new Promise<unknown>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{mocks.user={id:'TEST-A'};mocks.request.mockReset();mocks.print.mockReset();sessionStorage.clear();localStorage.clear();window.history.replaceState(null,'','/packaging/history');host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers();});
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
 const d=record('TEST-A');Object.assign(d.boxes[0], { printBlockedReason: '打印结果未知，请先查询并核实原打印请求' });
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

it('restores an interrupted print request after reload and retries the exact key without dispatching',async()=>{
 const d=record('TEST-A');let writes=0;
 mocks.request.mockImplementation((path:string)=>{
   if(path==='labels/print-requests'){
     if(++writes===1)return Promise.reject(new Error('response dropped'));
     Object.assign(d,{events:[{id:'TEST-REQUEST',event_type:'PRINT_REQUEST',box_id:'TEST-BOX',payload:{}}]});
     return Promise.resolve({eventId:'TEST-REQUEST'});
   }
   if(path.startsWith('operations/'))return Promise.resolve({state:'NOT_FOUND'});
   if(path.includes('/candidates'))return Promise.resolve([]);
   return Promise.resolve(d);
 });
 const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
 await act(async()=>root.render(<PackingRecordDetail key="one" packingCode="TEST-A"/>));
 await act(async()=>button('请求打印 / 同码补打').click());
 await act(async()=>root.render(<PackingRecordDetail key="reloaded" packingCode="TEST-A"/>));
 expect(button('请求打印 / 同码补打').disabled).toBe(true);
 await act(async()=>button('查询本人原打印请求').click());
 await act(async()=>button('按原键重试打印请求').click());
 const calls=mocks.request.mock.calls.filter(([path])=>path==='labels/print-requests');
 expect(calls).toHaveLength(2);
 expect(calls[0]).toEqual(calls[1]);
 expect(mocks.print).not.toHaveBeenCalled();
 expect(host.textContent).toContain('TEST-REQUEST');
});

it('retries a dropped print result with the original key after reload and leaves the physical printer alone',async()=>{
 const d=record('TEST-A');let writes=0;
 mocks.print.mockResolvedValue(undefined);
 mocks.request.mockImplementation((path:string)=>{
   if(path==='labels/print-requests'){
     Object.assign(d,{events:[{id:'TEST-REQUEST',event_type:'PRINT_REQUEST',box_id:'TEST-BOX',payload:{}}]});
     return Promise.resolve({eventId:'TEST-REQUEST',renderPayload:{labelCode:'TEST-LABEL',productionDate:'2026-01-02',qty:30}});
   }
   if(path==='labels/print-requests/TEST-REQUEST/events'){
     if(++writes===1)return Promise.reject(new Error('result response dropped'));
     return Promise.resolve({eventId:'TEST-RESULT',requestId:'TEST-REQUEST',type:'UNKNOWN'});
   }
   if(path.startsWith('operations/'))return Promise.resolve({state:'NOT_FOUND'});
   if(path.includes('/candidates'))return Promise.resolve([]);
   return Promise.resolve(d);
 });
 Object.assign(d.actions,{printResult:{allowed:true}});
 const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
 await act(async()=>root.render(<PackingRecordDetail key="one" packingCode="TEST-A"/>));
 await act(async()=>button('请求打印 / 同码补打').click());
 expect(mocks.print).toHaveBeenCalledTimes(1);
 await act(async()=>root.render(<PackingRecordDetail key="reloaded" packingCode="TEST-A"/>));
 await act(async()=>button('查看原打印结果').click());
 await act(async()=>button('按原键重试记录结果').click());
 const calls=mocks.request.mock.calls.filter(([path])=>path==='labels/print-requests/TEST-REQUEST/events');
 expect(calls).toHaveLength(2);
 expect(calls[0]).toEqual(calls[1]);
 expect(calls[0][1].body.type).toBe('UNKNOWN');
 expect(mocks.print).toHaveBeenCalledTimes(1);
});

it('recovers own live box evidence from the server on a clean device and drops mismatched identity or revision',async()=>{
 const d=record('TEST-A');
 const now=Date.now(),expiry=new Date(now+1800000).toISOString();
 const round=(purpose:string)=>({sessionId:purpose,expiresAt:expiry,scans:{'TEST-BOX':{eventId:purpose+'-BOX',sessionId:purpose,expiresAt:expiry}}});
 Object.assign(d,{verificationRecovery:{actorId:'TEST-A',revision:d.revision,serverNow:new Date(now).toISOString(),rounds:{
   LABEL_CHECK:round('LABEL_CHECK'),HANDOVER:round('HANDOVER'),
 }}});
 mocks.request.mockImplementation((path:string)=>Promise.resolve(path.includes('/candidates')?[]:d));
 await act(async()=>root.render(<PackingRecordDetail key="device-one" packingCode="TEST-A"/>));
 expect(host.textContent).toContain('标签核验 1 / 1');
 expect(host.textContent).toContain('交接核验 1 / 1');
 sessionStorage.clear();localStorage.clear();
 await act(async()=>root.render(<PackingRecordDetail key="device-two" packingCode="TEST-A"/>));
 expect(host.textContent).toContain('标签核验 1 / 1');
 expect(host.textContent).toContain('交接核验 1 / 1');
 expect(mocks.request.mock.calls.filter(([,options])=>options?.body)).toHaveLength(0);
 mocks.user={id:'TEST-B'};
 await act(async()=>root.render(<PackingRecordDetail key="device-two" packingCode="TEST-A"/>));
 expect(host.textContent).toContain('标签核验 0 / 1');
 expect(host.textContent).toContain('交接核验 0 / 1');
 mocks.user={id:'TEST-A'};d.revision='NEW-REVISION';
 await act(async()=>root.render(<PackingRecordDetail key="device-three" packingCode="TEST-A"/>));
 expect(host.textContent).toContain('标签核验 0 / 1');
 expect(host.textContent).toContain('交接核验 0 / 1');
});
it('looks up a lost confirmation, rechecks visibility, and retries only the saved key and body',async()=>{
 const d=record('TEST-A');
 const body={contractVersion:2,packingCode:'TEST-A',productionDate:'2026-01-02',shiftId:'1',
  boxIds:['TEST-BOX'],verificationIds:['TEST-VERIFICATION'],warehouseCode:'TEST-WH',locationCode:'TEST-LOCATION',receiverUserId:'TEST-USER',expectedRevision:d.revision};
 sessionStorage.setItem(`packing-confirm:v2:${JSON.stringify(['TEST-A','TEST-A'])}`,JSON.stringify({key:'ORIGINAL-KEY',body}));
 const receipt={receiptState:'RECORDED',handoverCode:'ORIGINAL-RECEIPT',recordedBy:'TEST-A',receiverNameSnapshot:'Recorded Receiver',
  groups:[{batchNo:'ORIGINAL-BATCH',ledgerId:'ORIGINAL-LEDGER',qty:30,warehouseCode:'TEST-WH',locationCode:'TEST-LOCATION'}]};
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 mocks.request.mockImplementation((path:string)=>{
  if(path.startsWith('operations/'))return Promise.resolve({state:'NOT_FOUND'});
  if(path==='warehouse/confirm'){
   Object.assign(d,{handover:{state:'COMMITTED',quality:'VERIFIED'},receipt:{state:'RECORDED',evidence:[{event_type:'COMMIT_RECEIPT',payload:receipt}]}});
   return Promise.resolve(receipt);
  }
  return Promise.resolve(path.includes('/candidates')?[]:d);
 });
 const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
 try {
  await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
  expect(button('确认本单交接入库').disabled).toBe(true);
  await act(async()=>button('查询未知提交结果').click());
  await act(async()=>button('用原操作键重试').click());
  expect(mocks.request.mock.calls.filter(([path])=>path.startsWith('operations/'))).toEqual([
   ['operations/ORIGINAL-KEY?action=CONFIRM&packingCode=TEST-A'],
   ['operations/ORIGINAL-KEY?action=CONFIRM&packingCode=TEST-A'],
  ]);
  expect(mocks.request.mock.calls.filter(([path])=>path==='warehouse/confirm')).toEqual([['warehouse/confirm',{key:'ORIGINAL-KEY',body}]]);
  expect(host.textContent).toContain('ORIGINAL-RECEIPT');
  expect(host.textContent).toContain('ORIGINAL-LEDGER');
  expect(host.textContent).toContain('登记接收人 Recorded Receiver');
 } finally {confirm.mockRestore();}
});

it('device without a key finds its own original receipt through a read-only lookup',async()=>{
 const d=record('TEST-A');
 const receipt={receiptState:'RECORDED',handoverCode:'FROM-SERVER',groups:[]};
 mocks.request.mockImplementation((path:string)=>{
  if(path.endsWith('/my-operation?action=CONFIRM')){
   Object.assign(d,{handover:{state:'COMMITTED',quality:'VERIFIED'},receipt:{state:'RECORDED',evidence:[{event_type:'COMMIT_RECEIPT',payload:receipt}]}});
   return Promise.resolve({state:'COMMITTED',payload:receipt});
  }
  return Promise.resolve(path.includes('/candidates')?[]:d);
 });
 await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 const lookup=[...host.querySelectorAll('button')].find(b=>b.textContent==='查询本人原交库操作')!;
 await act(async()=>lookup.click());
 expect(host.textContent).toContain('FROM-SERVER');
 expect(mocks.request.mock.calls.some(([,options])=>options?.body)).toBe(false);
});
it('requires old-label disposal evidence and drops verification for the replacement revision',async()=>{
 const d=record('TEST-A');
 Object.assign(d.actions,{voidLabel:{allowed:true}});
 const now=Date.now(),expiry=new Date(now+1800000).toISOString();
 Object.assign(d,{verificationRecovery:{actorId:'TEST-A',revision:d.revision,serverNow:new Date(now).toISOString(),rounds:{
   LABEL_CHECK:{sessionId:'OLD-SESSION',expiresAt:expiry,scans:{'TEST-BOX':{eventId:'OLD-SCAN',sessionId:'OLD-SESSION',expiresAt:expiry}}},
 }}});
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 mocks.request.mockImplementation((path:string)=>{
  if(path.endsWith('/void')){
   d.revision='REPLACED';d.boxes[0].labels[0].code='REPLACEMENT-LABEL';
   return Promise.resolve({eventId:'VOID-EVENT'});
  }
  return Promise.resolve(path.includes('/candidates')?[]:d);
 });
 const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
 const fill=async(label:string,value:string)=>{
  const field=[...host.querySelectorAll('label')].find(element=>element.textContent?.includes(label))!.querySelector('input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});
 };
 try {
  await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
  expect(host.textContent).toContain('标签核验 1 / 1');
  await act(async()=>button('作废旧标并换码').click());
  await fill('补打原因','Label unreadable');
  expect(button('确认作废并换码').disabled).toBe(true);
  await fill('旧标处置说明','Old label removed');
  await act(async()=>button('确认作废并换码').click());
  expect(mocks.request.mock.calls.find(([path])=>path.endsWith('/void'))).toEqual([
   'history/TEST-A/labels/TEST-LABEL/void',expect.objectContaining({body:{expectedRevision:'TEST-REVISION',reason:'Label unreadable',dispositionDeclaration:'Old label removed'}}),
  ]);
  expect(host.textContent).toContain('REPLACEMENT-LABEL');
  expect(host.textContent).toContain('标签核验 0 / 1');
 } finally {confirm.mockRestore();}
});

it.each(['UNKNOWN','empty'])('partial or empty identity blocks all confirm controls %s',async kind=>{
 const d=record('TEST-A');d.actions.confirm.allowed=true;if(kind==='UNKNOWN')d.handover.quality='UNKNOWN';else d.boxes=[];
 mocks.request.mockImplementation((path:string)=>Promise.resolve(path.includes('/candidates')?[]:d));await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='确认本单交接入库')!.disabled).toBe(true);
 if(kind==='UNKNOWN')expect(Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='请求打印 / 同码补打')!.disabled).toBe(true);
});

it.each(['original','account'])('late confirm success cannot pollute a changed %s',async change=>{
 const pending=deferred();vi.spyOn(window,'confirm').mockReturnValue(true);
 mocks.request.mockImplementation((path:string,options?:{body?:{purpose?:string}})=>{
  if(path==='warehouse/confirm')return pending.promise;
  if(path.includes('/candidates'))return Promise.resolve([{code:'TEST-CHOICE',label:'TEST choice'}]);
  if(path.includes('/verification-sessions'))return Promise.resolve({
   eventId:`TEST-SESSION-${options?.body?.purpose}`,purpose:options?.body?.purpose,targetRevision:'TEST-REVISION',expiresAt:new Date(Date.now()+1800000).toISOString(),
  });
  if(path.startsWith('boxes/resolve'))return Promise.resolve({id:'TEST-BOX'});
  if(path.includes('/box-verifications'))return Promise.resolve({eventId:'TEST-SCAN'});
  const d=record(path.split('/')[1]);d.actions.confirm.allowed=true;return Promise.resolve(d);
 });
 await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
 for(let i=0;i<3;i++)await act(async()=>{const select=host.querySelectorAll('select')[i];select.value='TEST-CHOICE';select.dispatchEvent(new Event('change',{bubbles:true}));});
 for(const purpose of ['开始交接核验','开始标签核验']){
  await act(async()=>button(purpose).click());
  await act(async()=>{const input=host.querySelector('form input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'TEST-LABEL');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  if(purpose==='开始交接核验')expect(button('确认本单交接入库').disabled).toBe(true);
 }
 expect(button('确认本单交接入库').disabled).toBe(false);await act(async()=>button('确认本单交接入库').click());
 expect(mocks.request.mock.calls.filter(c=>c[0]==='warehouse/confirm')).toHaveLength(1);
 if(change==='account')mocks.user={id:'TEST-B'};
 await act(async()=>root.render(<PackingRecordDetail packingCode={change==='original'?'TEST-B':'TEST-A'}/>));
 await act(async()=>pending.resolve({receiptState:'RECORDED',handoverCode:'SENSITIVE-A'}));
 expect(host.textContent).not.toContain('SENSITIVE-A');expect(host.textContent).not.toContain('交接入库已提交');expect(host.textContent).not.toContain('查询未知提交结果');
 expect(Array.from(host.querySelectorAll('select')).every(s=>s.value==='')).toBe(true);expect(host.textContent).toContain('标签核验 0 / 1');vi.restoreAllMocks();
});
it('shows each checked purpose and expires label checks independently',async()=>{
 vi.useFakeTimers();
 mocks.request.mockImplementation((path:string,options?:{body?:{purpose?:string}})=>{
  if(path.includes('/candidates'))return Promise.resolve([]);
  if(path.includes('/verification-sessions')){
   const purpose=options?.body?.purpose;
   return Promise.resolve({eventId:`TEST-${purpose}`,purpose,targetRevision:'TEST-REVISION',
    expiresAt:new Date(Date.now()+(purpose==='LABEL_CHECK'?1000:3000)).toISOString()});
  }
  if(path.startsWith('boxes/resolve'))return Promise.resolve({id:'TEST-BOX'});
  if(path.includes('/box-verifications'))return Promise.resolve({eventId:'TEST-SCAN'});
  return Promise.resolve(record('TEST-A'));
 });
 await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 for(const purpose of ['开始标签核验','开始交接核验']){
  const start=[...host.querySelectorAll('button')].find(b=>b.textContent===purpose)!;
  await act(async()=>start.click());
  const input=host.querySelector('form input')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'TEST-LABEL');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 }
 expect(host.textContent).toContain('标签核验 1 / 1');
 expect(host.textContent).toContain('交接核验 1 / 1');
 await act(async()=>vi.advanceTimersByTimeAsync(1000));
 expect(host.textContent).toContain('标签核验 0 / 1 · 已过期，请重新核验');
 expect(host.textContent).toContain('交接核验 1 / 1');
});
it('old physical label declaration has a truthful distinct registration action',async()=>{
 const d=record('TEST-A');d.identityStatus='UNREGISTERED';d.boxes=[];Object.assign(d, { outputs: [{ outputOrdinal: 0, original: { boxes: 1, eggs: 30 } }] });
 mocks.request.mockImplementation((path:string)=>Promise.resolve(path.includes('/candidates')?[]:d));await act(async()=>root.render(<PackingRecordDetail packingCode="TEST-A"/>));
 await act(async()=>{(host.querySelector('input[type="checkbox"]') as HTMLInputElement).click();});expect(host.textContent).toContain('登记逐箱旧标签实测事实');expect(host.textContent).toContain('产出 1 箱 1 实测旧码');expect(host.textContent).not.toContain('确认未贴标事实并登记');
});
