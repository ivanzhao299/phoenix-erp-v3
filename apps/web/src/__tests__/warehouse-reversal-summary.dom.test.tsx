/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import zh from '@/locales/zh.json';
import en from '@/locales/en.json';
import lo from '@/locales/lo.json';
const context=vi.hoisted(()=>({lang:'zh',rows:[] as Record<string,unknown>[]}));
vi.mock('@/lib/api-client',()=>({crudApi:{list:vi.fn(async()=>({data:context.rows,total:context.rows.length}))}}));
vi.mock('@/contexts/LanguageContext',()=>({useLanguage:()=>({lang:context.lang,t:(key:string,fallback:string)=>
  (context.lang==='en'?en:context.lang==='lo'?lo:zh)[key as keyof typeof zh]||fallback})}));
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
async function render(inbound:number,outbound:number,correction?:number){
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({code:200,data:{inbound_qty:inbound,outbound_qty:outbound,
    ...(correction===undefined?{}:{correction_net_qty:correction}),current_stock:100,closed_today:null,last_stocktake:null}})})));
  await act(async()=>root.render(<DailyClosePage/>));
}
it.each(['zh','en','lo'])('separates signed erroneous-inbound correction from normal outbound (%s)',async lang=>{
  context.lang=lang;await render(0,0,-60);
  const dictionary=lang==='en'?en:lang==='lo'?lo:zh;
  const label=dictionary['warehouse.change_type.temp_production_reversal'];
  const span=Array.from(host.querySelectorAll('span')).find(node=>node.textContent===label);
  expect(span?.parentElement?.textContent).toContain('-60');
  const net=dictionary['ui.净变化'];
  expect(Array.from(host.querySelectorAll('span')).some(node=>node.textContent===net&&node.parentElement?.textContent?.includes('-60'))).toBe(true);
  expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init || !init.method || init.method==='GET')).toBe(true);
});
it('counts the signed correction once and retains the old API fallback',async()=>{
  await render(100,40,-60);
  expect(Array.from(host.querySelectorAll('span')).some(node=>node.textContent==='净变化'&&node.parentElement?.textContent?.endsWith('+0'))).toBe(true);
  await act(async()=>root.unmount());root=createRoot(host);
  await render(100,40);
  expect(Array.from(host.querySelectorAll('span')).some(node=>node.textContent==='净变化'&&node.parentElement?.textContent?.endsWith('+60'))).toBe(true);
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
