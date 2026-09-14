/** @vitest-environment jsdom */
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:{id:'TEST-A'} as any,request:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:mocks.user})}));
vi.mock('@/lib/packing-history-api',async importOriginal=>({...await importOriginal<object>(),packingHistoryRequest:mocks.request}));
import {usePackingRecord} from '@/hooks/usePackingRecord';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
function Probe({code}:{code:string}){const state=usePackingRecord(code);return <div>{state.error||state.data?.marker||state.data?.record.code||'LOADING'}</div>;}
function deferred(){let resolve!:(v:any)=>void;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{mocks.user={id:'TEST-A'};mocks.request.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('A to B to A ignores stale original request even if response arrives last',async()=>{const old=deferred();mocks.request.mockReturnValueOnce(old.promise).mockResolvedValueOnce({record:{code:'B'}}).mockResolvedValueOnce({record:{code:'A'},marker:'A-new'});
 await act(async()=>root.render(<Probe code="A"/>));await act(async()=>root.render(<Probe code="B"/>));expect(host.textContent).toBe('B');await act(async()=>root.render(<Probe code="A"/>));await act(async()=>old.resolve({record:{code:'A-stale'}}));expect(host.textContent).toBe('A-new');});
it('account change immediately discards previous sensitive record and ignores late resolution',async()=>{const old=deferred(),next=deferred();mocks.request.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);await act(async()=>root.render(<Probe code="A"/>));mocks.user={id:'TEST-B'};await act(async()=>root.render(<Probe code="A"/>));await act(async()=>old.resolve({record:{code:'SENSITIVE-A'}}));expect(host.textContent).toBe('LOADING');await act(async()=>next.resolve({record:{code:'A'},marker:'VISIBLE-B'}));expect(host.textContent).toBe('VISIBLE-B');});
it('reports GET failure without inventing pending status or emitting any write',async()=>{mocks.request.mockRejectedValue(new Error('READ_UNAVAILABLE'));await act(async()=>root.render(<Probe code="TEST"/>));expect(host.textContent).toBe('READ_UNAVAILABLE');expect(mocks.request.mock.calls[0][1].body).toBeUndefined();});
it('remount restores original code with GET and no current-shift dependency',async()=>{mocks.request.mockResolvedValue({record:{code:'ORIGINAL'}});await act(async()=>root.render(<Probe code="ORIGINAL"/>));await act(async()=>root.render(null));await act(async()=>root.render(<Probe code="ORIGINAL"/>));expect(mocks.request).toHaveBeenCalledTimes(2);expect(mocks.request.mock.calls.every(c=>c[0]==='history/ORIGINAL'&&c[1].body===undefined)).toBe(true);});

it.each([null,{}, {record:{code:'OTHER'}}])('rejects null/incomplete/mismatched original response %j',async data=>{mocks.request.mockResolvedValue(data);await act(async()=>root.render(<Probe code="TEST"/>));expect(host.textContent).toContain('原单响应不完整');});
