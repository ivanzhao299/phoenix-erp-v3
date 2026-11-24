/** @vitest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ImmunePage from '@/app/(admin)/breeding/immune/page';
import MedicinePage from '@/app/(admin)/breeding/medicine/page';

const api = vi.hoisted(() => ({
  listVetFlocks: vi.fn(), listImmunePlans: vi.fn(), listImmuneVaccines: vi.fn(),
  listImmuneInventoryBatches: vi.fn(), createImmunePlan: vi.fn(), executeImmunePlan: vi.fn(),
  listMedicationRecords: vi.fn(), listVetMedications: vi.fn(), listMedicineLots: vi.fn(), createMedicationRecord: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ farmProductionApi:api }));
vi.mock('@/hooks/usePermission', () => ({usePermission:()=>({canCreate:true,canEdit:true})}));
vi.mock('@/contexts/ToastContext', () => ({useToast:()=>({success:vi.fn(),error:vi.fn()})}));
vi.mock('@/contexts/LanguageContext', () => {
  const t = (_key:string,label:string)=>label;
  return {useLanguage:()=>({t,lang:'zh'})};
});
vi.mock('@/components/PageHeader', () => ({default:({actions}:{actions:React.ReactNode})=><header>{actions}</header>}));
vi.mock('@/components/shared-selectors/DictSelect', () => ({default:()=>null}));
type TestRow = {id:number;status:string};
type TestColumn = {key:string;render:(value:unknown,row:TestRow)=>React.ReactNode};
vi.mock('@/components/DataTable', () => ({default:({columns,data}:{columns:TestColumn[];data:TestRow[]})=><div>
  {data.map(row=><div key={row.id}>{columns.find(c=>c.key==='actions')?.render(null,row)}</div>)}
</div>}));
let root:Root;
let host:HTMLDivElement;
beforeEach(()=>{
  vi.stubGlobal('React',React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  api.listVetFlocks.mockResolvedValue({data:[{flock_no:'F',house_code:'H',farm_code:'FARM',site_code:'SITE',company_code:'CO',current_qty:70}]});
  const medications = {data:[{material_code:'MAT',material_name:'测试疫苗',unit:'瓶'}]};
  const lots = {data:[{batch_no:'LOT',warehouse_code:'WH',unit:'瓶',qty_available:15}]};
  api.listImmuneVaccines.mockResolvedValue(medications); api.listVetMedications.mockResolvedValue({data:[{material_code:'MAT-RX',material_name:'测试兽药',unit:'瓶',default_withdraw_days:2}]});
  api.listImmuneInventoryBatches.mockResolvedValue(lots); api.listMedicineLots.mockResolvedValue(lots);
  api.listImmunePlans.mockResolvedValue({data:[]});api.listMedicationRecords.mockResolvedValue({data:[]});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks();vi.unstubAllGlobals();});
async function click(label:string) {
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);
  expect(button).toBeDefined();await act(async()=>button!.click());
}
async function change(selector:string,value:string) {
  const element=document.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  expect(element).toBeTruthy();
  await act(async()=>{
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value')!.set!.call(element,value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
  });
}
it('plans for the selected flock then records different actual birds and bottles',async()=>{
  api.createImmunePlan.mockImplementation(async body=>{
    api.listImmunePlans.mockResolvedValue({data:[{...body,id:1,status:'PLANNED',planned_issue_lines:body.issue_lines}]});
  });
  await act(async()=>root.render(<ImmunePage/>));
  await click('新增免疫计划');
  await change('[aria-label="鸡群批次"]','F');
  expect(document.querySelector<HTMLInputElement>('[aria-label="计划免疫羽数"]')?.value).toBe('70');
  await change('[aria-label="疫苗"]','MAT');
  await change('[aria-label="计划免疫日期"]','2026-11-17');
  await change('[aria-label="ERP库存批次"]','LOT');
  await change('[aria-label="计划耗用数量"]','3');
  await click('建立计划');
  expect(api.createImmunePlan).toHaveBeenCalledWith(expect.objectContaining({flock_no:'F',site_code:'SITE',material_code:'MAT',planned_heads:70,
    issue_lines:[{inventory_batch_no:'LOT',qty:3,unit_code:'瓶'}]}));
  await click('执行');
  await change('[aria-label="实际免疫羽数"]','49');
  await change('[aria-label="实际耗用数量"]','2');
  await click('确认实际耗用并执行');
  expect(api.executeImmunePlan).toHaveBeenCalledWith(1,expect.objectContaining({actual_heads:49,
    issue_lines:[{inventory_batch_no:'LOT',qty:2,unit_code:'瓶'}]}));
});
it('registers a medicine lot in its stock unit for the selected flock',async()=>{
  await act(async()=>root.render(<MedicinePage/>));
  await click('新增用药记录');
  await change('[aria-label="鸡群批次"]','F');
  await change('[aria-label="药品"]','MAT-RX');
  await change('[aria-label="实际用药羽数"]','21');
  await change('[aria-label="ERP库存批次"]','LOT');
  await change('[aria-label="实际用量"]','1');
  await change('input[type=date]','2026-11-17');
  await change('[aria-label="用药途径"]','测试');
  api.createMedicationRecord.mockRejectedValueOnce(new Error('所选批次可用库存不足'));
  await click('新增用药');
  expect(document.querySelector('[role=alert]')?.textContent).toContain('所选批次可用库存不足');
  await click('新增用药');
  expect(api.createMedicationRecord).toHaveBeenCalledWith(expect.objectContaining({flock_no:'F',house_code:'H',site_code:'SITE',
    material_code:'MAT-RX',actual_heads:21,actual_qty:1,qty_unit:'瓶',inventory_batch_no:'LOT'}));
});
