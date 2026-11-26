/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import zh from '@/locales/zh.json';
import en from '@/locales/en.json';
import lo from '@/locales/lo.json';
const context=vi.hoisted(()=>({lang:'zh',rows:[] as Record<string,unknown>[]}));
const closeRequests=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/api-client',()=>({default:closeRequests,crudApi:{list:vi.fn(async()=>({data:context.rows,total:context.rows.length}))}}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({lang:context.lang,t:(key:string,fallback:string)=>
  (context.lang==='en'?en:context.lang==='lo'?lo:zh)[key as keyof typeof zh]||fallback})}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({canApprove:()=>false})}));
vi.mock('@/components/PageHeader',()=>({default:()=> <header>Warehouse close</header>}));
import DailyClosePage from '@/app/(admin)/warehouse/daily-close/page';
import LedgerPage from '@/app/(admin)/warehouse/ledger/page';
import { formatWarehouseLedgerChangeType, getWarehouseLedgerChangeTone } from '@/lib/warehouse-ledger-change-type';

let host:HTMLDivElement,root:Root;
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);context.lang='zh';context.rows=[];
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function render(inbound:number,outbound:number,correction:number){
  closeRequests.mockReset();
  closeRequests.mockImplementation(async (path:string) => path.endsWith('/warehouses')
    ? {data:[{warehouse_code:'WH-A',warehouse_name:'Warehouse A'}]}
    : {data:{company:'C',totals:{units:[{
          unit:'枚',opening:'100',inbound:String(inbound),outbound:String(outbound),
          adjustment:'0',correction:String(correction),reserved:'10',released:'0',
          closing:String(100+inbound-outbound+correction),
        }],unresolved:0,late_events:0}}});
  await act(async()=>root.render(<DailyClosePage/>));
}
it.each(['zh','en','lo'])('separates signed correction from physical outbound on a scoped warehouse day (%s)',async lang=>{
  context.lang=lang;
  await render(100,40,-60);
  const cells=[...host.querySelectorAll('tbody td')].map(cell=>cell.textContent);
  expect(cells).toEqual(['枚','100','100','40','0','-60','10','0','100']);
  expect(closeRequests.mock.calls[1][0]).toContain('warehouse_code=WH-A');
  expect(closeRequests.mock.calls.every(([,options])=>!options?.method || options.method==='GET')).toBe(true);
});
it('gives the dedicated ledger type its own correction name and tone',()=>{
  expect(formatWarehouseLedgerChangeType('TEMP_PRODUCTION_REVERSAL')).toBe('误入库冲销');
  expect(getWarehouseLedgerChangeTone('TEMP_PRODUCTION_REVERSAL')).toBe('warning');
});
it.each(['zh','en','lo'])('shows business notes in the real ledger table without exposing the reversal trace (%s)',async lang=>{
  context.lang=lang;
  const trace=JSON.stringify({case_id:'MENGSAI-TEST-INBOUND-20261117',version:1,original_ledger_id:649,
    plan_sha256:'private-plan-digest',technical_actor:'private-execution-actor'});
  const invalid=['{broken-private-receipt','null','[]','{}','{"version":1,"case_id":"x","original_ledger_id":0}'];
  const ordinary='{"customer":"ordinary note remains unchanged"}';
  context.rows=[{id:1,change_type:'TEMP_PRODUCTION_REVERSAL',note:trace},
    ...invalid.map((note,index)=>({id:index+2,change_type:'TEMP_PRODUCTION_REVERSAL',note})),
    {id:100,change_type:'TEMP_PRODUCTION_INBOUND',note:ordinary}];
  await act(async()=>root.render(<LedgerPage/>));
  const dictionary=lang==='en'?en:lang==='lo'?lo:zh;
  const cells=Array.from(host.querySelectorAll('td')).map(cell=>cell.textContent);
  expect(cells).toContain(dictionary['warehouse.note.temp_production_reversal'].replace('{id}','649'));
  expect(cells.filter(text=>text===dictionary['warehouse.note.temp_production_reversal_pending'])).toHaveLength(invalid.length);
  expect(cells).toContain(ordinary);
  expect(host.textContent).not.toMatch(/private-plan-digest|private-execution-actor|broken-private-receipt|plan_sha256|technical_actor/);
  expect(context.rows[0].note).toBe(trace);
});
